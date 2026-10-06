import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateHistoryPrefix, validateSavedLineage } from './session-lineage.mjs';

const id = '00000000-0000-4000-8000-000000000001';
const ancestor = '00000000-0000-4000-8000-000000000002';
const stamp = '2000-01-01T00:00:00Z';
const meta = (base, owner = id) => ({ timestamp: stamp, ordinal: base?.end_ordinal_exclusive ?? 0, type: 'session_meta',
  payload: { id: owner, timestamp: stamp, cwd: 'fixture', originator: 'fixture', cli_version: '0.159.2', history_mode: 'paginated', ...(base ? { history_base: base } : {}) } });
const msg = ordinal => ({ timestamp: stamp, ordinal, type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '日本語🙂' }] } });
const lines = values => values.map(value => JSON.stringify(value) + '\n').join('');
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'agent-lineage-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, 'rollout.jsonl');
  return { root, path, check: async (raw, endOrdinal, endByte = Buffer.byteLength(raw)) => {
    writeFileSync(path, raw);
    return validateHistoryPrefix(path, { owner: id, endByte, ...(endOrdinal === undefined ? {} : { endOrdinal }) });
  } };
}

test('plain prefixes bind exact bytes to metadata and contiguous ordinals', async t => {
  const f = fixture(t), raw = lines([meta(), msg(1), msg(2)]);
  const result = await f.check(raw, 3);
  assert.equal(result.status, 'verified');
  assert.equal(result.sha256, createHash('sha256').update(raw).digest('hex'));
  assert.equal(result.baseOrdinal, 0);
  for (const end of [2, 4]) await assert.rejects(f.check(raw, end), /disagree/);
  assert.equal((await f.check(lines([meta()]), 1)).status, 'verified');
  const base = { thread_id: ancestor, end_byte_offset: 100, end_ordinal_exclusive: 4 };
  assert.equal((await f.check(lines([meta(base), msg(5)]), 6)).status, 'verified');
  assert.equal((await f.check(lines([meta(base)]), 5)).status, 'verified');
  for (const end of [3, 4]) await assert.rejects(f.check(lines([meta(base)]), end), /ordinals/);
});

test('prefix validation handles CRLF and whitespace without counting characters or later records', async t => {
  const f = fixture(t), raw = lines([meta(), msg(1)]).replaceAll('\n', '\r\n') + ' \t\r\n';
  const result = await f.check(raw + 'invalid later data', 2, Buffer.byteLength(raw));
  assert.equal(result.status, 'verified');
  assert.equal(result.endByte, Buffer.byteLength(raw));
  for (const end of [0, raw.length, Buffer.byteLength(raw) + 100, Buffer.byteLength(lines([meta()])) - 1]) {
    await assert.rejects(f.check(raw, 2, end));
  }
  const utf8 = Buffer.from(lines([meta(), msg(1)]));
  const split = utf8.indexOf(Buffer.from('日本語')) + 1;
  await assert.rejects(f.check(utf8, 2, split), /incomplete/);
  await assert.rejects(f.check(Buffer.concat([Buffer.from(lines([meta()])), Buffer.from([0xc3, 0x28, 10])]), 2), /UTF-8/);
});

test('unknown schemas and noncontiguous ordinals remain unverified without inventing a count', async t => {
  const f = fixture(t);
  const unknown = { timestamp: stamp, ordinal: 1, type: 'future', payload: {} };
  for (const body of [[unknown, msg(1)], [unknown, msg(4)], [msg(1), msg(3)], [msg(1), msg(1)], [msg(2), msg(1)],
    [{ ...msg(1), ordinal: undefined }], [{ ...msg(1), payload: { type: 'message', role: 'user', content: [{ type: 'future' }] } }],
    [{ ...msg(1), metadata: { future: true } }]]) {
    assert.equal((await f.check(lines([meta(), ...body]), 100)).status, 'unverified');
  }
  assert.equal((await f.check(lines([{ ...meta(), ordinal: undefined }, msg(1)]), 2)).status, 'unverified');
  await assert.rejects(f.check(lines([meta(), unknown]) + 'bad JSON\n', 2), /JSON/);
});

test('numeric lexemes reject rounding, exponent notation, negatives, strings and overflow', async t => {
  const f = fixture(t);
  for (const token of ['1.00000000000000001', '1e0', '-0', '-1', '9007199254740992', '"1"']) {
    const raw = lines([meta(), msg(1)]).replace('"ordinal":1,', `"ordinal":${token},`);
    await assert.rejects(f.check(raw, 2), /integer/);
  }
  const base = { thread_id: ancestor, end_byte_offset: 100, end_ordinal_exclusive: 4 };
  for (const key of ['end_byte_offset', 'end_ordinal_exclusive']) {
    const raw = lines([meta(base)]).replace(new RegExp(`"${key}":\\d+`), `"${key}":4.0000000000000001`);
    await assert.rejects(f.check(raw, 5), /integer/);
  }
  await assert.rejects(f.check(lines([meta({ ...base, end_ordinal_exclusive: Number.MAX_SAFE_INTEGER })])), /ordinals/);
  await assert.rejects(f.check(lines([{ ...meta(), ordinal: 1 }])), /metadata ordinal/);
});

test('saved lineage applies the same checks to extra owned rollouts and missing or cyclic ancestors', async t => {
  const f = fixture(t), raw = lines([meta()]);
  writeFileSync(f.path, raw);
  mkdirSync(join(f.root, 'rollouts'));
  const extra = '00000000-0000-4000-8000-000000000003';
  const file = `rollouts/${extra}.jsonl`;
  const sources = [{ id, file: 'rollout.jsonl' }, { id: extra, file }];
  const base = { thread_id: id, end_byte_offset: Buffer.byteLength(raw), end_ordinal_exclusive: 1 };
  writeFileSync(join(f.root, file), lines([meta(base), msg(2)]));
  assert.equal((await validateSavedLineage(f.root, sources, id)).status, 'verified');
  writeFileSync(join(f.root, file), lines([meta({ ...base, end_ordinal_exclusive: 2 })]));
  await assert.rejects(validateSavedLineage(f.root, sources, id), /disagree/);
  writeFileSync(join(f.root, file), lines([meta({ ...base, thread_id: ancestor })]));
  assert.equal((await validateSavedLineage(f.root, sources, id)).status, 'unverified');
  writeFileSync(join(f.root, file), lines([meta({ ...base, thread_id: extra })]));
  await assert.rejects(validateSavedLineage(f.root, sources, id), /cyclic/);
  writeFileSync(join(f.root, file), lines([meta(undefined, ancestor)]));
  await assert.rejects(validateSavedLineage(f.root, sources, id), /owner/);
});

test('only legacy histories without a base are exempt from ordinal verification', async t => {
  const f = fixture(t), sources = [{ id, file: 'rollout.jsonl' }];
  writeFileSync(f.path, lines([{ type: 'session_meta', payload: { id, history_mode: 'legacy' } }, msg(undefined)]));
  assert.equal((await validateSavedLineage(f.root, sources, id)).status, 'verified');
  writeFileSync(f.path, lines([{ type: 'session_meta', payload: { id, history_mode: 'paginated' } }, msg(undefined)]));
  assert.equal((await validateSavedLineage(f.root, sources, id)).status, 'unverified');
  writeFileSync(f.path, lines([{ type: 'session_meta', payload: { id, history_mode: 'future' } }]));
  await assert.rejects(validateSavedLineage(f.root, sources, id), /mode/);
});
