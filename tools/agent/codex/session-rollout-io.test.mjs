import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, renameSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync, constants } from 'node:zlib';
import { createHash } from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { rolloutChunks, digestRollout, assertZstdRuntime, ROLLOUT_LIMITS, withRolloutBudget, chargeRolloutBytes } from './session-rollout-io.mjs';
import { jsonLines } from './session-export-storage.mjs';
const supported = process.versions.node === '26.10.0';
const hash = value => createHash('sha256').update(value).digest('hex');
const raw = Buffer.from('{"text":"日本語"}\n');
function fixture(t, bytes, suffix = '.jsonl.zst') {
  const root = mkdtempSync(join(tmpdir(), 'rollout-reader-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, `fixture${suffix}`); writeFileSync(path, bytes);
  return path;
}
async function collect(path, options) {
  const result = [];
  for await (const chunk of rolloutChunks(path, options)) result.push(chunk);
  return Buffer.concat(result);
}
test('compression requires the reviewed runtime, not merely an available zstd API', () => {
  for (const version of ['24.21.0', '26.9.0', '26.10.1', '27.0.0']) assert.throws(() => assertZstdRuntime(version), /ZSTD_RUNTIME_UNSUPPORTED/);
  assert.doesNotThrow(() => assertZstdRuntime('26.10.0'));
});
test('fixed independent raw-block frame and streamed zstd variants preserve exact bytes and hashes', { skip: !supported }, async t => {
  // Zstandard format: single segment, one last raw block containing "{}\n".
  // Fixed bytes from the frame format, not expected output from this decoder.
  const fixed = Buffer.from('28b52ffd20031900007b7d0a', 'hex');
  assert.deepEqual(await collect(fixture(t, fixed)), Buffer.from('{}\n'));
  const skip = Buffer.from('502a4d18040000006d657461', 'hex');
  for (const checksum of [0, 1]) for (const size of [0, 1]) {
    const frame = zstdCompressSync(raw, { params: { [constants.ZSTD_c_checksumFlag]: checksum, [constants.ZSTD_c_contentSizeFlag]: size } });
    const bytes = Buffer.concat([frame, skip, frame]);
    const path = fixture(t, bytes);
    for (let highWaterMark = 1; highWaterMark <= bytes.length + 1; highWaterMark++) {
      const info = {};
      assert.deepEqual(await collect(path, { highWaterMark, info }), Buffer.concat([raw, raw]));
      assert.equal(info.storedSha256, hash(bytes));
      assert.equal(info.decodedSha256, hash(Buffer.concat([raw, raw])));
    }
  }
});
test('all truncations, corrupt checksums, wrong codecs, garbage and incomplete subsequent frames fail', { skip: !supported }, async t => {
  const frame = zstdCompressSync(raw, { params: { [constants.ZSTD_c_checksumFlag]: 1 } });
  for (let end = 0; end < frame.length; end++) {
    await assert.rejects(collect(fixture(t, frame.subarray(0, end))), /ZSTD_INVALID/);
  }
  const corrupt = Buffer.from(frame); corrupt[corrupt.length - 1] ^= 1;
  for (const tail of [Buffer.from('junk'), ...[1, 2, 3].map(n => frame.subarray(0, n)), corrupt, Buffer.from('502a4d1808000000aa', 'hex')]) {
    for (const highWaterMark of [1, frame.length, 65536]) {
      await assert.rejects(collect(fixture(t, Buffer.concat([frame, tail])), { highWaterMark, endByte: raw.length }), /ZSTD_INVALID/);
    }
  }
  await assert.rejects(collect(fixture(t, raw)), /ZSTD_INVALID/);
  // Frames with a nonzero dictionary ID and a window above the configured cap.
  for (const hex of ['28b52ffd2101031900007b7d0a', '28b52ffd0098010000']) {
    await assert.rejects(collect(fixture(t, Buffer.from(hex, 'hex'))), /ZSTD_INVALID/);
  }
});
test('operation budgets count repeated passes and nested work shares the same budget', async () => {
  for (const [kind, max] of [['stored', 64], ['decoded', 256], ['written', 64]]) {
    await assert.rejects(withRolloutBudget(async () => {
      chargeRolloutBytes(kind, max * 1024 ** 3);
      await withRolloutBudget(async () => chargeRolloutBytes(kind, 1));
    }), /OPERATION_LIMIT_EXCEEDED/);
    await withRolloutBudget(async () => chargeRolloutBytes(kind, 1));
  }
});
test('limits, cancellation, early consumers and invalid JSON close every descriptor', { skip: !supported }, async t => {
  const path = fixture(t, zstdCompressSync(raw));
  await assert.rejects(collect(path, { limits: { ...ROLLOUT_LIMITS, decoded: 1 } }), /DECODED_LIMIT_EXCEEDED/);
  await assert.rejects(collect(path, { limits: { ...ROLLOUT_LIMITS, stored: 1 } }), /STORED_LIMIT_EXCEEDED/);
  await assert.rejects(collect(path, { signal: AbortSignal.abort() }), /ROLLOUT_CANCELLED/);
  for await (const chunk of rolloutChunks(path)) { assert.ok(chunk.length); break; }
  const renamed = `${path}.renamed`; renameSync(path, renamed); renameSync(renamed, path);
  const invalid = fixture(t, zstdCompressSync(Buffer.from('{private invalid text}\n')));
  await assert.rejects(async () => { for await (const record of jsonLines(invalid)) void record; }, /Invalid JSON.*line 1/);
  renameSync(invalid, `${invalid}.closed`);
});
test('decoded prefix excludes later data while checking the complete container', { skip: !supported }, async t => {
  const frame = zstdCompressSync(Buffer.concat([raw, Buffer.from('{"private":"suffix"}\n')]));
  const path = fixture(t, frame), info = {};
  assert.deepEqual(await collect(path, { endByte: raw.length, info }), raw);
  assert.ok(info.decodedBytes > raw.length);
  await assert.rejects(collect(path, { endByte: info.decodedBytes + 1 }), /boundary exceeds/);
});

test('physical digests reuse the guarded reader and detect source changes', async t => {
  for (const suffix of ['.jsonl', '.jsonl.zst']) {
    // A physical digest must not decode even when the suffix says zstd.
    const path = fixture(t, raw, suffix), progress = [];
    assert.equal(await digestRollout(path, undefined, read => progress.push(read)), hash(raw));
    assert.equal(progress.at(-1), raw.length);
    let changed = false;
    await assert.rejects(digestRollout(path, undefined, () => {
      if (!changed) { changed = true; appendFileSync(path, '\n'); }
    }), /SOURCE_CHANGED/);
  }
  const path = fixture(t, raw, '.jsonl');
  let swapped = false;
  await assert.rejects(digestRollout(path, undefined, () => {
    if (!swapped) {
      swapped = true; renameSync(path, `${path}.old`); writeFileSync(path, raw);
    }
  }), /SOURCE_CHANGED/);
});

test('slow and failed sinks close the compressed reader and never publish digest evidence early', { skip: !supported }, async t => {
  const bytes = Buffer.from('fixture\n'.repeat(32768));
  const path = fixture(t, zstdCompressSync(bytes)), info = {};
  let delivered = 0;
  await pipeline(Readable.from(rolloutChunks(path, { info })), new Writable({ highWaterMark: 1,
    write(chunk, encoding, callback) {
      delivered += chunk.length; delay(1).then(() => callback(), callback);
    }
  }));
  assert.equal(delivered, bytes.length);
  assert.equal(info.decodedSha256, hash(bytes));
  for (let attempt = 0; attempt < 3; attempt++) {
    const partial = {};
    await assert.rejects(pipeline(Readable.from(rolloutChunks(path, { info: partial })), new Writable({
      write(chunk, encoding, callback) { callback(Object.assign(new Error('synthetic full sink'), { code: 'ENOSPC' })); }
    })), /synthetic full sink/);
    assert.deepEqual(partial, {});
    renameSync(path, `${path}.closed`); renameSync(`${path}.closed`, path);
  }
});
