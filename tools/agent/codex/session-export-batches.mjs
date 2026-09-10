// @ai-dotfiles agent-dev-runtime managed
// Receipts are portable file references, not a source database or deletion authority.
import { mkdirSync, lstatSync, readdirSync, readFileSync, realpathSync, writeFileSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { exists, regularFile, fingerprint, pathIdentity, UUID, MAX_MANIFEST_BYTES, reject } from './session-export-storage.mjs';

const FORMAT = 'ai-dotfiles/codex-export-batch';
const HEX = /^[0-9a-f]{64}$/;
const KEY = /^[a-zA-Z0-9_-]+$/;
export const sourceIdentity = home => fingerprint(pathIdentity(realpathSync(home)));
export function writeBatch(directory, snapshot, plan, entries, selection) {
  const folder = join(directory, 'batches');
  if (exists(folder) && (!lstatSync(folder).isDirectory() || lstatSync(folder).isSymbolicLink())) reject('Batch directory must be a real directory.');
  mkdirSync(folder, { recursive: true });
  const createdAt = new Date().toISOString(), id = `${createdAt.replace(/[:.]/g, '-')}_${randomUUID()}`;
  const receipt = { format: FORMAT, schemaVersion: 1, complete: true, id, createdAt,
    source: sourceIdentity(snapshot.home), selection: selection ?? null,
    groups: plan.groups.map(group => ({ root: group.root, ids: group.sessions.map(row => row.id), fingerprint: group.fingerprint })), entries };
  receipt.digest = fingerprint(receipt);
  const text = `${JSON.stringify(receipt, null, 2)}\n`;
  if (Buffer.byteLength(text) > MAX_MANIFEST_BYTES) reject('Export batch exceeds the supported size.');
  const temp = join(folder, `.${id}.tmp`);
  writeFileSync(temp, text, { flag: 'wx', mode: 0o600 });
  renameSync(temp, join(folder, `${id}.json`));
  return receipt;
}
export function readBatch(directory, id) {
  if (!KEY.test(id ?? '')) reject('Use an export batch ID, not a path.');
  const root = realpathSync(directory), path = join(root, 'batches', `${id}.json`);
  if (regularFile(path, root).size > MAX_MANIFEST_BYTES) reject('Export batch exceeds the supported size.');
  const value = JSON.parse(readFileSync(path, 'utf8'));
  const { digest, ...body } = value;
  if (body.format !== FORMAT || body.schemaVersion !== 1 || body.complete !== true || body.id !== id ||
      !Number.isFinite(Date.parse(body.createdAt)) || !HEX.test(body.source ?? '') || fingerprint(body) !== digest ||
      !Array.isArray(body.entries) || !body.entries.length || !Array.isArray(body.groups) || !body.groups.length) reject('Invalid or incomplete export batch.');
  const ids = new Set(), members = new Set();
  for (const entry of body.entries) {
    if (!UUID.test(entry.id ?? '') || ids.has(entry.id) || !KEY.test(entry.key ?? '') || !HEX.test(entry.digest ?? '')) reject('Invalid export batch entry.');
    ids.add(entry.id);
  }
  for (const group of body.groups) {
    if (!UUID.test(group.root ?? '') || !HEX.test(group.fingerprint ?? '') || !Array.isArray(group.ids) || !group.ids.includes(group.root)) reject('Invalid export batch group.');
    for (const id of group.ids) {
      if (!ids.has(id) || members.has(id)) reject('Overlapping or missing export batch members.');
      members.add(id);
    }
  }
  if (members.size !== ids.size) reject('Unassigned export batch members.');
  return value;
}
export function listBatches(directory) {
  const root = realpathSync(directory), folder = join(root, 'batches');
  if (!exists(folder)) return [];
  if (!lstatSync(folder).isDirectory() || lstatSync(folder).isSymbolicLink()) reject('Batch directory must be a real directory.');
  return readdirSync(folder).filter(name => !name.startsWith('.') && name.endsWith('.json'))
    .map(name => readBatch(root, name.slice(0, -5))).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

const historyTables = ['thread_turns', 'thread_items', 'thread_realtime_items', 'thread_history_projection_state'];
export async function openHistoryReader(home, sessions) {
  if (readdirSync(home).some(name => /^thread_history_\d+\.sqlite$/.test(name) && name !== 'thread_history_1.sqlite')) reject('Unknown indexed history database version.');
  const path = join(home, 'thread_history_1.sqlite');
  let db;
  try {
    let version, queries = [];
    if (exists(path)) {
      regularFile(path, home);
      const { DatabaseSync } = await import('node:sqlite');
      db = new DatabaseSync(path, { readOnly: true });
      version = db.prepare('PRAGMA data_version').get().data_version;
      db.exec('BEGIN');
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);
      if (tables.some(name => name.startsWith('thread_') && !historyTables.includes(name)) || historyTables.some(name => !tables.includes(name))) reject('Unsupported indexed history schema.');
      queries = historyTables.map(table => [table, db.prepare(`SELECT * FROM ${table} WHERE thread_id = ? ORDER BY ${table === 'thread_history_projection_state' ? 'thread_id' : 'rollout_ordinal'}`)]);
    }
    if (sessions.some(row => !['legacy', 'paginated'].includes(row.historyMode) || (row.historyMode === 'paginated' && !db))) reject('Indexed history is required for paginated sessions; operation stopped.');
    return { present: !!db,
      *lines(id) { for (const [table, query] of queries) for (const row of query.iterate(id)) yield `${JSON.stringify({ table, row })}\n`; },
      check() {
        if (db) {
          db.exec('COMMIT');
          if (db.prepare('PRAGMA data_version').get().data_version !== version) reject('Indexed history changed during operation.');
        } else if (exists(path)) reject('Indexed history appeared during operation.');
      },
      close() { db?.close(); },
    };
  } catch (error) { db?.close(); throw error; }
}
