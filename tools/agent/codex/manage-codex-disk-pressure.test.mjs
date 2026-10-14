import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectAclState, inspectSetupError, repairAclState } from './manage-codex-disk-pressure.mjs';
import { assertTasklistClientsClosed } from './manage-codex-processes.mjs';

const freeBytes = 6 * 1024 ** 3;
const systemRow = '"System","4","Services","0","0 K"';
const empty = { status: 0, stdout: `${systemRow}\r\n` };
const response = name => ({ status: 0, stdout: `${systemRow}\r\n"${name}","123","Console","1","1,234 K"\r\n` });
const guard = (result, windowsRoot) => () => assertTasklistClientsClosed({ platform: 'win32', windowsRoot, spawn: () => result });

function fixture(t, contents = '{') {
  const home = fs.mkdtempSync(join(tmpdir(), 'disk-pressure-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(join(home, 'System32'));
  fs.writeFileSync(join(home, 'System32', 'tasklist.exe'), 'synthetic executable; never run');
  const sandbox = join(home, '.sandbox');
  fs.mkdirSync(sandbox);
  const path = join(sandbox, 'deny_read_acl_state.json');
  if (contents !== null) fs.writeFileSync(path, contents);
  const options = { home, diskSpace: () => ({ freeBytes }), closed: guard(empty, home), confirm: async () => true };
  const read = () => fs.readFileSync(path, 'utf8');
  const entries = () => fs.readdirSync(sandbox).sort();
  return { home, sandbox, path, options, read, entries };
}

for (const value of ['synthetic-private-token', '\u001b[31msynthetic-private-token', '{"key":"synthetic-private-token", bad}', '"synthetic-private-token']) {
  test('malformed JSON diagnostics never quote input contents', async t => {
    const f = fixture(t, value);
    const acl = await inspectAclState(f.path);
    const setup = await inspectSetupError(f.path);
    assert.equal(acl.kind, 'invalid');
    assert.equal(acl.description, 'INVALID JSON: syntax error');
    assert.equal(setup.kind, 'invalid');
    assert.match(setup.description, /^invalid JSON: syntax error; \d+ bytes; modified /);
    assert.doesNotMatch(JSON.stringify({ acl, setup }), /synthetic-private-token|\\u001b/);
    assert.equal(f.read(), value);
  });
}

test('state inspection distinguishes missing, empty, non-object, and valid object JSON', async t => {
  const f = fixture(t, null);
  assert.equal((await inspectAclState(f.path)).kind, 'missing');
  for (const [text, kind, description] of [
    ['', 'invalid', 'INVALID: empty file'],
    ['null', 'invalid', 'INVALID: JSON root is not an object'],
    ['[]', 'invalid', 'INVALID: JSON root is not an object'],
    ['{}', 'valid', 'valid JSON object'],
  ]) {
    fs.writeFileSync(f.path, text);
    const state = await inspectAclState(f.path);
    assert.equal(state.kind, kind);
    assert.equal(state.description, description);
  }
});

for (const [name, result] of [
  ['empty stdout', { status: 0, stdout: '' }],
  ['localized diagnostic', { status: 0, stdout: '一覧を取得できませんでした' }],
  ['malformed CSV', { status: 0, stdout: '"System","4",broken' }],
  ['undefined stdout', { status: 0 }],
  ['partial valid inventory', { status: 0, stdout: `${systemRow}\r\nERROR: unavailable` }],
  ['invalid PID', { status: 0, stdout: '"System","invalid","Services","0","0 K"' }],
  ['duplicate PID', { status: 0, stdout: `${systemRow}\r\n${systemRow}` }],
  ['timeout', { status: null, error: { code: 'ETIMEDOUT' } }],
  ['exit failure', { status: 1, stdout: '' }],
  ['partial stderr diagnostic', { ...empty, stderr: 'ERROR: partial inventory unavailable' }],
  ['access denied', { status: 0, stdout: '{"failure":"access-denied"}' }],
]) {
  test(`${name} refuses repair without moving the state`, async t => {
    const f = fixture(t);
    let asked = false;
    await assert.rejects(repairAclState({ ...f.options, closed: guard(result, f.home), confirm: async () => { asked = true; return true; } }));
    assert.equal(asked, false);
    assert.equal(f.read(), '{');
    assert.deepEqual(f.entries(), ['deny_read_acl_state.json']);
  });
}

for (const name of ['codex.exe', 'chatgpt.exe', 'codex-background-writer.exe', 'codex-windows-sandbox-service.exe']) {
  test(`${name} remains a blocker for non-session maintenance`, async t => {
    const f = fixture(t);
    await assert.rejects(repairAclState({ ...f.options, closed: guard(response(name), f.home) }), /still running/);
    assert.equal(f.read(), '{');
    assert.deepEqual(f.entries(), ['deny_read_acl_state.json']);
  });
}

test('node.exe alone cannot be identified as a Codex client by tasklist', t => {
  const f = fixture(t);
  assert.doesNotThrow(guard(response('node.exe'), f.home));
});

test('process inventory is bounded and read-only', t => {
  const f = fixture(t);
  let calls = 0;
  assertTasklistClientsClosed({ platform: 'win32', windowsRoot: f.home, spawn(command, args, options) {
    calls++;
    assert.equal(command, join(f.home, 'System32', 'tasklist.exe'));
    assert.deepEqual(args, ['/FO', 'CSV', '/NH']);
    assert.equal(options.timeout, 15000);
    return empty;
  } });
  assert.equal(calls, 1);
});

test('invalid state is moved to one verified backup after two process checks', async t => {
  const f = fixture(t, '');
  let checks = 0;
  await repairAclState({ ...f.options, closed: () => { checks++; guard(empty, f.home)(); } });
  assert.equal(checks, 2);
  assert.equal(fs.existsSync(f.path), false);
  assert.equal(f.entries().length, 1);
  assert.match(f.entries()[0], /^deny_read_acl_state\.json\.corrupt-/);
  assert.equal(fs.readFileSync(join(f.sandbox, f.entries()[0]), 'utf8'), '');
});

for (const contents of [null, '{}']) {
  test('missing or valid state needs no confirmation or process check', async t => {
    const f = fixture(t, contents);
    await repairAclState({ ...f.options,
      closed: () => { throw new Error('must not inspect processes'); },
      confirm: () => { throw new Error('must not confirm'); },
    });
    assert.deepEqual(f.entries(), contents === null ? [] : ['deny_read_acl_state.json']);
  });
}

test('cancel preserves the state and does not recheck processes', async t => {
  const f = fixture(t);
  let checks = 0;
  await repairAclState({ ...f.options, closed: () => { checks++; }, confirm: async () => false });
  assert.equal(checks, 1);
  assert.equal(f.read(), '{');
  assert.deepEqual(f.entries(), ['deny_read_acl_state.json']);
});

test('client restart after confirmation prevents the move', async t => {
  const f = fixture(t);
  let confirmed = false;
  await assert.rejects(repairAclState({ ...f.options,
    closed: () => guard(confirmed ? response('codex.exe') : empty, f.home)(),
    confirm: async () => { confirmed = true; return true; },
  }), /still running/);
  assert.equal(f.read(), '{');
  assert.deepEqual(f.entries(), ['deny_read_acl_state.json']);
});

test('changed state after confirmation is preserved', async t => {
  const f = fixture(t);
  await assert.rejects(repairAclState({ ...f.options, confirm: async () => {
    fs.writeFileSync(f.path, '{}');
    return true;
  } }), /changed after confirmation/);
  assert.equal(f.read(), '{}');
  assert.deepEqual(f.entries(), ['deny_read_acl_state.json']);
});

test('free-space threshold is rechecked after confirmation', async t => {
  const f = fixture(t);
  let confirmed = false;
  await assert.rejects(repairAclState({ ...f.options,
    diskSpace: () => ({ freeBytes: confirmed ? 1 : freeBytes }),
    confirm: async () => { confirmed = true; return true; },
  }), /Free space fell below/);
  assert.equal(f.read(), '{');
  assert.deepEqual(f.entries(), ['deny_read_acl_state.json']);
});
