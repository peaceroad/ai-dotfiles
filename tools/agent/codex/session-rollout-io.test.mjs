import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, renameSync, appendFileSync, statfsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync, constants } from 'node:zlib';
import { createHash } from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { supportsZstdRuntime, rolloutChunks, digestRollout, assertZstdRuntime, ROLLOUT_LIMITS, withRolloutBudget, chargeRolloutBytes } from './session-rollout-io.mjs';
import { jsonLines } from './session-export-storage.mjs';
const supported = supportsZstdRuntime();
const hash = value => createHash('sha256').update(value).digest('hex');
const raw = Buffer.from('{"text":"日本語"}\n');

test('default record limit accepts 128 MiB and rejects one extra byte in plain and zstd', {
  skip: process.env.AGENT_TEST_LARGE_ROLLOUT !== '1' || !supported,
}, async t => {
  const limit = 128 * 1024 * 1024;
  const space = statfsSync(tmpdir(), { bigint: true });
  if (space.bavail * space.bsize < BigInt(limit + 64 * 1024 * 1024)) return t.skip('Temporary storage needs 192 MiB free for this opt-in test.');
  // One scalar JSON record; expected length is independent of the decoder.
  for (const extra of [0, 1]) {
    const bytes = Buffer.alloc(limit + extra + 1, 0x61);
    bytes[0] = 0x22; bytes[bytes.length - 2] = 0x22; bytes[bytes.length - 1] = 0x0a;
    for (const compressed of [false, true]) {
      const path = fixture(t, compressed ? zstdCompressSync(bytes) : bytes, compressed ? '.jsonl.zst' : '.jsonl');
      const read = async () => {
        let count = 0;
        for await (const record of jsonLines(path)) { count++; assert.equal(record.value.length, limit - 2); }
        assert.equal(count, 1);
      };
      try {
        if (extra) await assert.rejects(read(), /record exceeds the supported size/);
        else await read();
      } finally { rmSync(path); }
    }
  }
});

test('default decoded limit accepts 32 GiB and rejects one extra byte with bounded memory', {
  skip: process.env.AGENT_TEST_LARGE_ROLLOUT !== '1' || !supported,
}, async t => {
  const block = Buffer.alloc(64 * 1024 * 1024);
  const frame = zstdCompressSync(block);
  const bytes = Buffer.concat(Array(ROLLOUT_LIMITS.decoded / block.length).fill(frame));
  const path = fixture(t, bytes), info = {};
  let delivered = 0;
  for await (const chunk of rolloutChunks(path, { info })) {
    assert.ok(chunk.equals(block.subarray(0, chunk.length)));
    delivered += chunk.length;
  }
  assert.equal(delivered, ROLLOUT_LIMITS.decoded);
  assert.equal(info.decodedBytes, delivered);
  assert.equal(info.storedSha256, hash(bytes));
  appendFileSync(path, zstdCompressSync(Buffer.from([0])));
  const incomplete = {};
  await assert.rejects(async () => {
    for await (const chunk of rolloutChunks(path, { info: incomplete })) void chunk;
  }, /DECODED_LIMIT_EXCEEDED/);
  assert.deepEqual(incomplete, {});
  // A large source must still respect cancellation/time limits and release handles.
  await assert.rejects(async () => {
    for await (const chunk of rolloutChunks(path, { limits: { ...ROLLOUT_LIMITS, timeout: 1 } })) {
      void chunk; await delay(20);
    }
  }, /ROLLOUT_CANCELLED/);
  renameSync(path, `${path}.closed`);
});

test('default stored limit accepts 8 GiB and rejects one extra byte', {
  skip: process.env.AGENT_TEST_LARGE_ROLLOUT !== '1',
}, async t => {
  const space = statfsSync(tmpdir(), { bigint: true });
  if (space.bavail * space.bsize < BigInt(ROLLOUT_LIMITS.stored + 512 * 1024 * 1024)) {
    return t.skip('Temporary storage needs 8.5 GiB free; select a disposable volume with TEMP/TMP or TMPDIR.');
  }
  const path = fixture(t, '', '.jsonl');
  const block = Buffer.alloc(64 * 1024 * 1024), expected = createHash('sha256');
  for (let size = 0; size < ROLLOUT_LIMITS.stored; size += block.length) {
    appendFileSync(path, block); expected.update(block);
  }
  const info = {};
  for await (const chunk of rolloutChunks(path, { info })) void chunk;
  assert.equal(info.storedBytes, ROLLOUT_LIMITS.stored);
  assert.equal(info.storedSha256, expected.digest('hex'));
  appendFileSync(path, Buffer.from([0]));
  await assert.rejects(async () => {
    for await (const chunk of rolloutChunks(path)) void chunk;
  }, /STORED_LIMIT_EXCEEDED/);
});

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
test('compression requires a stable runtime at or above the decoder fix, not merely a zstd API', () => {
  for (const version of ['24.21.0', '25.99.0', '26.9.99', '26.10.0-rc.1', '27.0.0-nightly', '26.10', 'v26.10.0', '26.10.0junk', '026.10.0', '9007199254740992.0.0', '', null]) {
    assert.equal(supportsZstdRuntime(version), false);
    assert.throws(() => assertZstdRuntime(version), /ZSTD_RUNTIME_UNSUPPORTED/);
  }
  for (const version of ['26.10.0', '26.10.1', '26.11.0', '27.0.0', '28.0.0']) {
    assert.equal(supportsZstdRuntime(version), true);
    assert.doesNotThrow(() => assertZstdRuntime(version));
  }
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
