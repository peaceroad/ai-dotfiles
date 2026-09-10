// @ai-dotfiles agent-dev-runtime managed
// Shared file-only storage contract. No Codex process or source database is opened here.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const FORMAT = 'ai-dotfiles/codex-session-export';
export const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const MAX_CONFIG_BYTES = 64 * 1024;
export class ExportError extends Error {}
export const reject = message => { throw new ExportError(message); };
export function exists(path) { try { lstatSync(path); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function snapshotDigest({ session, files, warnings, attachments, spawnEdges, sources, coverage }) {
  return fingerprint({ session, files, warnings, attachments, spawnEdges, sources, coverage });
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
export function regularFile(path, root) {
  if (root) {
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
export function bundleFile(folder, name) {
  if (typeof name !== 'string' || !/^[a-zA-Z0-9_.\/-]+$/.test(name) || name.split('/').some(p => !p || p === '.' || p === '..')) reject('Unsafe bundle member name.');
  const path = resolve(folder, name);
  regularFile(path, folder);
  return path;
}
export async function digestFile(path) {
  return digestChunks(createReadStream(path));
}
export async function digestChunks(chunks) {
  const digest = createHash('sha256');
  for await (const chunk of chunks) digest.update(chunk);
  return digest.digest('hex');
}
export async function writeVerifiedFile(source, path) {
  const digest = createHash('sha256'); let bytes = 0;
  await pipeline(source, new Transform({ transform(chunk, encoding, callback) {
    digest.update(chunk); bytes += chunk.length; callback(null, chunk);
  } }), createWriteStream(path, { flags: 'wx', mode: 0o600 }));
  const sha256 = digest.digest('hex');
  if (await digestFile(path) !== sha256) reject('Export copy verification failed.');
  return { file: basename(path), bytes, sha256 };
}
// Bounded line parsing preserves byte offsets; never silently drop malformed records.
export async function* jsonLines(path, { maxLine = 128 * 1024 * 1024 } = {}) {
  let pieces = [], length = 0, offset = 0, line = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for await (const chunk of createReadStream(path)) {
    let start = 0, end;
    while ((end = chunk.indexOf(10, start)) !== -1) {
      if (length + end - start > maxLine) reject('A history record exceeds the supported size.');
      const tail = chunk.subarray(start, end + 1);
      const bytes = pieces.length ? Buffer.concat([...pieces, tail], length + tail.length) : tail;
      offset += bytes.length; line++;
      const text = decoder.decode(bytes).trim();
      if (text) yield { value: JSON.parse(text), line, end: offset };
      pieces = []; length = 0;
      start = end + 1;
    }
    if (start < chunk.length) { pieces.push(chunk.subarray(start)); length += chunk.length - start; }
    if (length > maxLine) reject('A history record exceeds the supported size.');
  }
  if (length) reject('History ends in an incomplete record; close writers and retry.');
}
export function readBundle(directory, key) {
  if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(key ?? '')) reject('Use a snapshot key, not a file path.');
  const root = realpathSync(directory), folder = join(root, key), path = join(folder, 'manifest.json');
  if (!exists(path)) return null;
  if (regularFile(path, root).size > MAX_MANIFEST_BYTES) reject('Export manifest exceeds the supported size.');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  if (manifest.format !== FORMAT || manifest.schemaVersion !== 2 || manifest.complete !== true) return null;
  if (!UUID.test(manifest.session?.id ?? '') || !Array.isArray(manifest.files) || !Number.isFinite(Date.parse(manifest.exportedAt))) reject('Invalid session export manifest.');
  return { folder, key, manifest };
}
export function listBundles(directory) {
  const root = realpathSync(directory), bundles = [];
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
    if (!exists(join(root, entry.name, 'manifest.json'))) continue;
    const bundle = readBundle(root, entry.name);
    if (bundle) bundles.push(bundle);
  }
  return bundles;
}
export async function verifyBundle(bundle) {
  if (snapshotDigest(bundle.manifest) !== bundle.manifest.contentDigest) reject('Saved export metadata failed integrity verification.');
  const names = new Set();
  for (const file of bundle.manifest.files) {
    if (!file || !/^[0-9a-f]{64}$/.test(file.sha256 ?? '') || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || names.has(file.file)) reject('Invalid export file inventory.');
    names.add(file.file);
    const path = bundleFile(bundle.folder, file.file);
    if (lstatSync(path).size !== file.bytes || await digestFile(path) !== file.sha256) reject('Saved export failed integrity verification.');
  }
  if (!names.has('conversation.md') || !names.has('rollout.jsonl')) reject('Required export files are missing.');
}
