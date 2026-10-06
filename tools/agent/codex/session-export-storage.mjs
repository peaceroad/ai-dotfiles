// @ai-dotfiles agent-dev-runtime managed
// Shared file-only storage contract. No Codex process or source database is opened here.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { rolloutChunks, rolloutCodec, ROLLOUT_POLICY, chargeRolloutBytes, regularFile, filesystemPath, reject, ExportError } from './session-rollout-io.mjs';

export { regularFile, filesystemPath, reject, ExportError };

export const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const ROLLOUT_FILENAME = /([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?:_([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}))?\.jsonl(?:\.zst)?$/i;
export function rolloutIdentity(path) {
  const match = ROLLOUT_FILENAME.exec(basename(path));
  return match ? { thread: match[1].toLowerCase(), rollout: (match[2] ?? match[1]).toLowerCase() } : null;
}
export const FORMAT = 'ai-dotfiles/codex-session-export';
export const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const MAX_CONFIG_BYTES = 64 * 1024;
export function exists(path) { try { lstatSync(path); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function snapshotDigest(manifest) {
  const { session, files, warnings, attachments, spawnEdges, sources, coverage } = manifest;
  if (manifest.schemaVersion === 3) return fingerprint({ format: manifest.format, schemaVersion: 3,
    session, files, warnings, attachments, spawnEdges, sources, coverage,
    sourceArtifacts: manifest.sourceArtifacts, artifactSetDigest: manifest.artifactSetDigest, validation: manifest.validation });
  return fingerprint({ session, files, warnings, attachments, spawnEdges, sources, coverage });
}
export const HISTORY_TABLES = ['thread_turns', 'thread_items', 'thread_realtime_items', 'thread_history_projection_state'];
export function indexedHistoryCoverage(ids, present) {
  return { policy: 'owned-rollout-ids-v1', ids, tables: HISTORY_TABLES, present, member: present ? 'history.jsonl' : null };
}

export function verifyIndexedHistory(manifest) {
  const coverage = manifest.coverage?.indexedHistory;
  // Older v2 snapshots remain readable, but cannot authorize exported deletion.
  if (coverage === undefined) return;
  const history = manifest.files.find(file => file.file === 'history.jsonl');
  const ownedFiles = manifest.files.filter(file => /^rollout\.jsonl(?:\.zst)?$/.test(file.file) || file.file.startsWith('rollouts/'));
  const ids = new Set([manifest.session.id.toLowerCase()]);
  if (!Array.isArray(manifest.sources)) reject('Invalid indexed history coverage.');
  const sources = new Map();
  for (const source of manifest.sources) {
    if (!source || typeof source.file !== 'string' || sources.has(source.file)) reject('Invalid indexed history rollout inventory.');
    sources.set(source.file, source);
  }
  for (const file of ownedFiles) {
    const source = sources.get(file.file);
    if (!UUID.test(source?.id ?? '')
      || ![ 'rollout.jsonl', 'rollout.jsonl.zst', `rollouts/${source.id}.jsonl`, `rollouts/${source.id}.jsonl.zst` ].includes(file.file)) reject('Invalid indexed history rollout inventory.');
    ids.add(source.id.toLowerCase());
  }
  if (fingerprint(coverage) !== fingerprint(indexedHistoryCoverage([...ids].sort(), !!history))
    || (history && (!Number.isSafeInteger(history.records) || history.records < 0))) reject('Invalid indexed history coverage; export again before deletion.');
}
export const configPath = () => resolve(process.env.AGENT_CODEX_EXPORT_CONFIG || join(homedir(), '.agents', 'ai-dotfiles', 'codex-session-export.json'));
export function safeText(value) {
  return String(value).replaceAll(homedir(), '~').replaceAll(homedir().replaceAll('\\', '/'), '~')
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ');
}
export function readExportSettings(path = configPath()) {
  if (!exists(path)) return { directory: null, previousDirectories: [] };
  if (regularFile(path).size > MAX_CONFIG_BYTES) reject('Export configuration exceeds the supported size.');
  const config = JSON.parse(readFileSync(path, 'utf8'));
  if (!config || config.schemaVersion !== 1 || typeof config.directory !== 'string' || !isAbsolute(config.directory) ||
      Object.keys(config).some(key => !['schemaVersion', 'directory', 'previousDirectories'].includes(key)) ||
      (config.previousDirectories !== undefined && (!Array.isArray(config.previousDirectories) || config.previousDirectories.some(p => typeof p !== 'string' || !isAbsolute(p))))) reject('Unsupported codex-session-export.json configuration.');
  return { directory: config.directory, previousDirectories: config.previousDirectories ?? [] };
}
export const readExportDirectory = (path = configPath()) => readExportSettings(path).directory;
export const pathIdentity = path => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
export function writeExportDirectory(directory, path = configPath(), expected) {
  directory = realpathSync(directory);
  if (!lstatSync(directory).isDirectory()) reject('Export destination must be an existing directory.');
  // Never replace an unrelated config or follow redirected parent directories.
  const current = readExportSettings(path);
  if (expected !== undefined && fingerprint(current) !== expected) reject('Export settings changed; review the new configuration.');
  const previousDirectories = [...new Map([current.directory, ...current.previousDirectories].filter(p => p && pathIdentity(p) !== pathIdentity(directory)).map(p => [pathIdentity(p), p])).values()];
  for (let parent = dirname(path); ; parent = dirname(parent)) {
    if (exists(parent) && (!lstatSync(parent).isDirectory() || lstatSync(parent).isSymbolicLink())) reject('Configuration parent is not a regular directory.');
    if (dirname(parent) === parent) break;
  }
  if (current.directory === directory && JSON.stringify(current.previousDirectories) === JSON.stringify(previousDirectories)) return false;
  const text = `${JSON.stringify({ schemaVersion: 1, directory, ...(previousDirectories.length ? { previousDirectories } : {}) }, null, 2)}\n`;
  if (Buffer.byteLength(text) > MAX_CONFIG_BYTES) reject('Export configuration exceeds the supported size.');
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, text, { flag: 'wx', mode: 0o600 });
  renameSync(temp, path);
  return true;
}
function bundleMember(folder, name) {
  if (typeof name !== 'string' || !/^[a-zA-Z0-9_.\/-]+$/.test(name) || name.split('/').some(p => !p || p === '.' || p === '..')) reject('Unsafe bundle member name.');
  const path = resolve(folder, name);
  return { path, stat: regularFile(path, folder) };
}
export const bundleFile = (folder, name) => bundleMember(folder, name).path;
export async function digestFile(path, progress) {
  return digestChunks(createReadStream(path), progress);
}
export async function digestChunks(chunks, progress) {
  const digest = createHash('sha256');
  let bytes = 0;
  for await (const chunk of chunks) {
    digest.update(chunk); bytes += Buffer.byteLength(chunk); progress?.(bytes);
  }
  return digest.digest('hex');
}
export async function writeVerifiedFile(source, path, progress) {
  const digest = createHash('sha256'); let bytes = 0;
  await pipeline(source, new Transform({ transform(chunk, encoding, callback) {
    try {
      chargeRolloutBytes('written', chunk.length);
      digest.update(chunk); bytes += chunk.length; progress?.(bytes); callback(null, chunk);
    } catch (error) { callback(error); }
  } }), createWriteStream(path, { flags: 'wx', mode: 0o600 }));
  const sha256 = digest.digest('hex');
  if (await digestFile(path, progress) !== sha256) reject('Export copy verification failed.');
  return { file: basename(path), bytes, sha256 };
}
// Bounded line parsing preserves byte offsets; never silently drop malformed records.
export async function* jsonLines(path, { maxLine = 128 * 1024 * 1024, progress, endByte, numberTokens = false, onChunk, ...io } = {}) {
  let pieces = [], length = 0, offset = 0, line = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let read = 0;
  for await (const chunk of rolloutChunks(path, { ...io, endByte })) {
    onChunk?.(chunk);
    read += chunk.length; progress?.(read);
    let start = 0, end;
    while ((end = chunk.indexOf(10, start)) !== -1) {
      if (length + end - start > maxLine) reject(`A history record exceeds the supported size at line ${line + 1}.`);
      const tail = chunk.subarray(start, end + 1);
      const bytes = pieces.length ? Buffer.concat([...pieces, tail], length + tail.length) : tail;
      offset += bytes.length; line++;
      let text, value;
      try { text = decoder.decode(bytes).trim(); }
      catch { reject(`Invalid UTF-8 in history record at line ${line}.`); }
      if (text) {
        // JSON.parse diagnostics can quote private record contents. Report only the location.
        const tokens = numberTokens ? new WeakMap() : null;
        try { value = JSON.parse(text, tokens ? function(key, value, context) {
          if (typeof value === 'number') {
            let fields = tokens.get(this);
            if (!fields) tokens.set(this, fields = {});
            fields[key] = context?.source;
          }
          return value;
        } : undefined); }
        catch { reject(`Invalid JSON in history record at line ${line}.`); }
        yield { value, line, end: offset, ...(tokens ? { numberTokens: tokens } : {}) };
      }
      pieces = []; length = 0;
      start = end + 1;
    }
    if (start < chunk.length) { pieces.push(chunk.subarray(start)); length += chunk.length - start; }
    if (length > maxLine) reject(`A history record exceeds the supported size at line ${line + 1}.`);
  }
  if (length) reject(`History ends in an incomplete record at line ${line + 1}; close writers and retry.`);
}
export function readBundle(directory, key) {
  return readBundleAtRoot(realpathSync(directory), key);
}
function readBundleAtRoot(root, key, manifestPresent = false) {
  if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(key ?? '')) reject('Use a snapshot key, not a file path.');
  const folder = join(root, key), path = join(folder, 'manifest.json');
  if (!manifestPresent && !exists(path)) return null;
  if (regularFile(path, root).size > MAX_MANIFEST_BYTES) reject('Export manifest exceeds the supported size.');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  if (manifest.format === FORMAT && Number.isInteger(manifest.schemaVersion) && manifest.schemaVersion > 3) reject('Unsupported export schema; update agent before reading this snapshot.');
  if (manifest.format !== FORMAT || ![2, 3].includes(manifest.schemaVersion) || manifest.complete !== true) return null;
  if (!UUID.test(manifest.session?.id ?? '') || !Array.isArray(manifest.files) || !Number.isFinite(Date.parse(manifest.exportedAt))) reject('Invalid session export manifest.');
  return { folder, key, manifest };
}
export function listBundles(directory) {
  const root = realpathSync(directory), bundles = [];
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
    if (!exists(join(root, entry.name, 'manifest.json'))) continue;
    const bundle = readBundleAtRoot(root, entry.name, true);
    if (bundle) bundles.push(bundle);
  }
  return bundles;
}
export async function verifyBundle(bundle, progress) {
  if (snapshotDigest(bundle.manifest) !== bundle.manifest.contentDigest) reject('Saved export metadata failed integrity verification.');
  const names = new Set();
  const members = [];
  for (const file of bundle.manifest.files) {
    if (!file || !/^[0-9a-f]{64}$/.test(file.sha256 ?? '') || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || names.has(file.file)) reject('Invalid export file inventory.');
    names.add(file.file);
    const { path, stat } = bundleMember(bundle.folder, file.file);
    if (stat.size !== file.bytes) reject('Saved export failed integrity verification.');
    members.push({ path, file });
  }
  if (!names.has('conversation.md') || !(names.has('rollout.jsonl') !== names.has('rollout.jsonl.zst'))) reject('Required export files are missing or ambiguous.');
  if (bundle.manifest.schemaVersion === 2 && [...names].some(name => name.endsWith('.zst'))) reject('Compressed history requires export schema v3.');
  verifyIndexedHistory(bundle.manifest);
  const verified = bundle.manifest.schemaVersion === 3 ? await verifyArtifacts(bundle, progress) : new Set();
  // Bound disk pressure and await both workers even if one fails. No background
  // verification can continue after this function returns or throws.
  let next = 0, failed = false;
  const worker = async () => {
    while (!failed && next < members.length) {
      const { path, file } = members[next++];
      if (verified.has(file.file)) continue; // Decoder pass already verified physical SHA as well.
      try {
        if (await digestFile(path, read => progress?.(read, file.bytes)) !== file.sha256) reject('Saved export failed integrity verification.');
      } catch (error) { failed = true; throw error; }
    }
  };
  const results = await Promise.allSettled(Array.from({ length: Math.min(2, members.length) }, worker));
  const error = results.find(result => result.status === 'rejected');
  if (error) throw error.reason;
}

export async function inspectRollout(path, root, progress, expectedOwner) {
  const info = {};
  let first = true;
  for await (const { value } of jsonLines(path, { root, info, progress })) {
    if (!first) continue;
    first = false;
    if (rolloutCodec(path) === 'zstd' && (value?.type !== 'session_meta' || !UUID.test(value.payload?.id ?? ''))) reject('Compressed history has no valid session metadata.');
    if (expectedOwner && value?.type === 'session_meta' && value.payload?.id?.toLowerCase() !== expectedOwner.toLowerCase()) reject('Rollout metadata does not match its owner.');
  }
  if (first && rolloutCodec(path) === 'zstd') reject('Compressed history has no session metadata.');
  return info;
}

export async function verifyArtifacts(bundle, progress) {
  const m = bundle.manifest, artifacts = m.sourceArtifacts;
  if (m.validation?.policy !== ROLLOUT_POLICY || m.validation.decoder !== 'node-zstd-strict'
    || typeof m.validation.node !== 'string' || Object.keys(m.validation).some(key => !['policy', 'decoder', 'node'].includes(key))
    || !Array.isArray(artifacts) || !artifacts.length || !Array.isArray(m.sources)
    || m.artifactSetDigest !== fingerprint(artifacts)) reject('Invalid physical rollout coverage.');
  const seen = new Set(), paths = new Set();
  const members = new Map(m.files.map(file => [file.file, file]));
  const sources = new Map();
  for (const source of m.sources) {
    if (!source || typeof source.file !== 'string' || sources.has(source.file)) reject('Invalid physical rollout source inventory.');
    sources.set(source.file, source);
  }
  for (const artifact of artifacts) {
    if (!artifact || typeof artifact !== 'object') reject('Invalid physical rollout inventory.');
    const { retainedFile, retention, codec, storedBytes, storedSha256, decodedBytes, decodedSha256 } = artifact;
    const member = members.get(retainedFile);
    const source = sources.get(retainedFile);
    if (seen.has(retainedFile) || !member || retention !== 'full-physical' || !UUID.test(artifact.rolloutId ?? '') || source?.id !== artifact.rolloutId
      || artifact.threadId !== m.session.id || typeof artifact.sourcePath !== 'string'
      || /[\\:\u0000-\u001f]/.test(artifact.sourcePath) || artifact.sourcePath.split('/').some(p => !p || p === '..' || p === '.')
      || !/^(sessions|archived_sessions)\//i.test(artifact.sourcePath)
      || !['identity', 'zstd'].includes(codec) || codec !== rolloutCodec(retainedFile)
      || storedBytes !== member.bytes || storedSha256 !== member.sha256
      || !Number.isSafeInteger(decodedBytes) || decodedBytes < 0 || !/^[0-9a-f]{64}$/.test(decodedSha256 ?? '')) reject('Invalid physical rollout inventory.');
    const sourceId = rolloutIdentity(artifact.sourcePath);
    if (sourceId?.thread !== artifact.threadId || sourceId?.rollout !== artifact.rolloutId
      || rolloutCodec(artifact.sourcePath) !== codec || paths.has(artifact.sourcePath.toLowerCase())) reject('Invalid physical rollout identity.');
    seen.add(retainedFile); paths.add(artifact.sourcePath.toLowerCase());
    const decoded = await inspectRollout(bundleFile(bundle.folder, retainedFile), bundle.folder, read => progress?.(read, decodedBytes), artifact.threadId);
    if (decoded.storedBytes !== storedBytes || decoded.storedSha256 !== storedSha256
      || decoded.decodedBytes !== decodedBytes || decoded.decodedSha256 !== decodedSha256) reject('Saved decoded history failed integrity verification.');
  }
  const owned = m.files.filter(f => /^rollout\.jsonl(?:\.zst)?$/.test(f.file) || f.file.startsWith('rollouts/'));
  if (owned.length !== seen.size || owned.some(f => !seen.has(f.file))) reject('Incomplete physical rollout inventory.');
  return seen;
}
