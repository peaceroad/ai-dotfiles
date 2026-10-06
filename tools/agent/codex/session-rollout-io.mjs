// @ai-dotfiles agent-dev-runtime managed
// Bounded, original-byte rollout I/O. No writes to Codex storage.
import { constants, openSync, fstatSync, closeSync, createReadStream, read, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Transform, PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createZstdDecompress, constants as zstd } from 'node:zlib';
import { relative, isAbsolute, sep, join } from 'node:path';

export class ExportError extends Error {}
export const reject = message => { throw new ExportError(message); };
// Rust canonical paths on Windows may use the extended-length namespace.
// Normalize only filesystem drive/UNC paths, never device namespaces.
export function filesystemPath(path) {
  if (process.platform !== 'win32' || typeof path !== 'string') return path;
  if (/^\\\\\?\\[a-z]:\\/i.test(path)) return path.slice(4);
  if (/^\\\\\?\\UNC\\/i.test(path)) return `\\\\${path.slice(8)}`;
  return path;
}
export function regularFile(path, root) {
  path = filesystemPath(path); root = filesystemPath(root);
  if (root) {
    const rootStat = lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) reject('Linked directory is unsupported.');
    const rel = relative(root, path);
    if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) reject('File escapes the expected directory.');
    let part = root;
    for (const name of rel.split(sep).slice(0, -1)) {
      part = join(part, name);
      const stat = lstatSync(part);
      if (!stat.isDirectory() || stat.isSymbolicLink()) reject('Linked directory is unsupported.');
    }
  }
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) reject('Linked or non-regular file is unsupported.');
  return stat;
}


export const ROLLOUT_POLICY = 'physical-rollout-v1';
export const ZSTD_NODE_VERSIONS = ['26.10.0'];
export const ROLLOUT_LIMITS = Object.freeze({ stored: 8 * 1024 ** 3, decoded: 32 * 1024 ** 3, timeout: 600_000 });
const operationBudget = new AsyncLocalStorage();
const totals = Object.freeze({ stored: 64 * 1024 ** 3, decoded: 256 * 1024 ** 3, written: 64 * 1024 ** 3 });
export const withRolloutBudget = operation => operationBudget.getStore() ? operation()
  : operationBudget.run({ stored: 0, decoded: 0, written: 0 }, operation);
export function chargeRolloutBytes(kind, bytes) {
  const budget = operationBudget.getStore();
  if (budget && (budget[kind] += bytes) > totals[kind]) reject(`OPERATION_LIMIT_EXCEEDED: cumulative ${kind} bytes exceed the supported operation limit.`);
}
export const rolloutCodec = path => /\.jsonl\.zst$/i.test(path) ? 'zstd' : 'identity';
export function assertZstdRuntime(version = process.versions.node) {
  if (!ZSTD_NODE_VERSIONS.includes(version)) reject('ZSTD_RUNTIME_UNSUPPORTED: compressed history requires reviewed Node.js 26.10.0.');
}
const identity = stat => [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, stat.nlink].join(':');

// Reuse the guarded reader's physical hash instead of hashing each chunk twice.
export async function digestRollout(path, root, progress) {
  const info = {};
  let read = 0;
  for await (const chunk of rolloutChunks(path, { root, physical: true, info })) {
    read += chunk.length; progress?.(read);
  }
  return info.storedSha256;
}

// endByte always refers to decoded bytes. Drain the container even after a prefix
// is delivered; a valid prefix must never conceal a truncated final frame.
export async function* rolloutChunks(path, { root, endByte, physical = false, info = {}, signal,
  limits = ROLLOUT_LIMITS, highWaterMark = 64 * 1024 } = {}) {
  const codec = rolloutCodec(path);
  if (!physical && codec === 'zstd') assertZstdRuntime();
  if (endByte !== undefined && (!Number.isSafeInteger(endByte) || endByte <= 0)) reject('Invalid decoded history boundary.');
  const before = regularFile(path, root);
  if (!physical && codec === 'zstd' && before.size < 4) reject('ZSTD_INVALID: compressed history has no complete frame.');
  if (before.size > limits.stored) reject('STORED_LIMIT_EXCEEDED: history input exceeds the supported limit.');
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let source, output, completion;
  let storedBytes = 0, decodedBytes = 0;
  const storedHash = createHash('sha256');
  const decodedHash = !physical && codec === 'zstd' ? createHash('sha256') : null;
  try {
    if (identity(before) !== identity(fstatSync(fd))) reject('SOURCE_CHANGED: history changed while opening.');
    // Keep descriptor ownership here even when pipeline destroys a stream early.
    source = createReadStream(path, { fd, autoClose: true, highWaterMark,
      fs: { read, close(_fd, callback) { callback(null); } } });
    output = new PassThrough();
    const count = new Transform({ transform(chunk, encoding, callback) {
      try {
        storedBytes += chunk.length;
        chargeRolloutBytes('stored', chunk.length);
        if (storedBytes > limits.stored) reject('STORED_LIMIT_EXCEEDED: history input exceeds the supported limit.');
        storedHash.update(chunk); callback(null, chunk);
      } catch (error) { callback(error); }
    } });
    const stages = [source, count];
    if (!physical && codec === 'zstd') stages.push(createZstdDecompress({ rejectGarbageAfterEnd: true,
      params: { [zstd.ZSTD_d_windowLogMax]: 27 } }));
    stages.push(output);
    const timeout = AbortSignal.timeout(limits.timeout);
    // Handle the rejection immediately, including when the consumer stops early.
    completion = pipeline(stages, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout }).then(() => null, error => error);
    for await (const chunk of output) {
      const start = decodedBytes;
      decodedBytes += chunk.length;
      if (!physical) chargeRolloutBytes('decoded', chunk.length);
      if (decodedBytes > limits.decoded) reject('DECODED_LIMIT_EXCEEDED: expanded history exceeds the supported limit.');
      decodedHash?.update(chunk);
      if (endByte === undefined) yield chunk;
      else if (start < endByte) yield chunk.subarray(0, Math.min(chunk.length, endByte - start));
    }
    const error = await completion;
    if (error) throw error;
    if (storedBytes !== before.size || identity(before) !== identity(fstatSync(fd))
      || identity(before) !== identity(regularFile(path, root))) reject('SOURCE_CHANGED: history changed while reading.');
    if (endByte !== undefined && decodedBytes < endByte) reject('Inherited history boundary exceeds the decoded source.');
    const storedSha256 = storedHash.digest('hex');
    Object.assign(info, { codec, storedBytes, storedSha256,
      ...(!physical || codec === 'identity' ? { decodedBytes, decodedSha256: decodedHash ? decodedHash.digest('hex') : storedSha256 } : {}) });
  } catch (error) {
    if (error instanceof ExportError) throw error;
    // Native errors can expose paths. Never forward decompressor messages or data.
    if (error?.name === 'AbortError') reject('ROLLOUT_CANCELLED: history reading was cancelled or exceeded its time limit.');
    if (String(error?.code).startsWith('ZSTD') || String(error?.code).startsWith('ERR_ZSTD')
      || ['Z_BUF_ERROR', 'ERR_TRAILING_JUNK_AFTER_STREAM_END'].includes(error?.code)) {
      reject('ZSTD_INVALID: compressed history is incomplete, corrupt, has trailing data, or uses unsupported parameters.');
    }
    reject('ROLLOUT_IO_FAILED: history could not be read safely.');
  } finally {
    output?.destroy(); source?.destroy();
    if (completion) await completion;
    closeSync(fd);
  }
}
