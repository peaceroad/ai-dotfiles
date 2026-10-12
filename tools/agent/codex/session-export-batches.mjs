// @ai-dotfiles agent-dev-runtime managed
// Receipts are portable file references, not a source database or deletion authority.
import { mkdirSync, lstatSync, readdirSync, readFileSync, realpathSync, writeFileSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { exists, regularFile, fingerprint, pathIdentity, UUID, MAX_MANIFEST_BYTES, HISTORY_TABLES, reject, syncExportDirectory } from './session-export-storage.mjs';
import { ROLLOUT_POLICY } from './session-rollout-io.mjs';

const FORMAT = 'ai-dotfiles/codex-export-batch';
const HEX = /^[0-9a-f]{64}$/;
const KEY = /^[a-zA-Z0-9_-]+$/;
const HISTORY_FILE = 'thread_history_1.sqlite';
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const identity = stat => `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
const checkHistoryVersions = home => {
  if (readdirSync(home).some(name => /^thread_history_\d+\.sqlite$/i.test(name) && name !== HISTORY_FILE)) reject('Unknown indexed history database version.');
};
export const sourceIdentity = home => fingerprint(pathIdentity(realpathSync(home)));
export function writeBatch(directory, snapshot, plan, entries, selection) {
  const folder = join(directory, 'batches');
  if (exists(folder) && (!lstatSync(folder).isDirectory() || lstatSync(folder).isSymbolicLink())) reject('Batch directory must be a real directory.');
  mkdirSync(folder, { recursive: true });
  const createdAt = new Date().toISOString(), id = `${createdAt.replace(/[:.]/g, '-')}_${randomUUID()}`;
  const receipt = { format: FORMAT, schemaVersion: entries.every(entry => entry.artifactSetDigest) ? 2 : 1, complete: true, id, createdAt,
    source: sourceIdentity(snapshot.home), selection: selection ?? null,
    groups: plan.groups.map(group => ({ root: group.root, ids: group.sessions.map(row => row.id), fingerprint: group.fingerprint })), entries };
  receipt.digest = fingerprint(receipt);
  const text = `${JSON.stringify(receipt, null, 2)}\n`;
  if (Buffer.byteLength(text) > MAX_MANIFEST_BYTES) reject('Export batch exceeds the supported size.');
  const temp = join(folder, `.${id}.tmp`);
  writeFileSync(temp, text, { flag: 'wx', mode: 0o600, flush: true });
  renameSync(temp, join(folder, `${id}.json`));
  syncExportDirectory(folder); syncExportDirectory(directory);
  return receipt;
}
export function readBatch(directory, id) {
  return readBatchAtRoot(realpathSync(directory), id);
}
function readBatchAtRoot(root, id) {
  if (!KEY.test(id ?? '')) reject('Use an export batch ID, not a path.');
  const path = join(root, 'batches', `${id}.json`);
  if (regularFile(path, root).size > MAX_MANIFEST_BYTES) reject('Export batch exceeds the supported size.');
  const value = JSON.parse(readFileSync(path, 'utf8'));
  const { digest, ...body } = value;
  if (body.format !== FORMAT || ![1, 2].includes(body.schemaVersion) || body.complete !== true || body.id !== id ||
      !Number.isFinite(Date.parse(body.createdAt)) || !HEX.test(body.source ?? '') || fingerprint(body) !== digest ||
      !Array.isArray(body.entries) || !body.entries.length || !Array.isArray(body.groups) || !body.groups.length) reject('Invalid or incomplete export batch.');
  const ids = new Set(), members = new Set();
  for (const entry of body.entries) {
    if (!UUID.test(entry.id ?? '') || ids.has(entry.id) || !KEY.test(entry.key ?? '') || !HEX.test(entry.digest ?? '')) reject('Invalid export batch entry.');
    if (body.schemaVersion === 2 && (!HEX.test(entry.artifactSetDigest ?? '') || entry.policy !== ROLLOUT_POLICY)) reject('Invalid physical export batch coverage.');
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
    .map(name => readBatchAtRoot(root, name.slice(0, -5))).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

export async function openHistoryReader(home, sessions) {
  checkHistoryVersions(home);
  const path = join(home, HISTORY_FILE), before = exists(path) ? regularFile(path, home) : null;
  let db;
  try {
    let version, queries = [], rowQueries;
    if (before) {
      const { DatabaseSync } = await import('node:sqlite');
      db = new DatabaseSync(path, { readOnly: true });
      version = db.prepare('PRAGMA data_version').get().data_version;
      db.exec('BEGIN');
      if (db.prepare('PRAGMA encoding').get().encoding !== 'UTF-8') reject('Unsupported indexed history text encoding.');
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);
      if (tables.some(name => name.startsWith('thread_') && !HISTORY_TABLES.includes(name)) || HISTORY_TABLES.some(name => !tables.includes(name))) reject('Unsupported indexed history schema.');
      queries = HISTORY_TABLES.map(table => {
        const first = table === 'thread_history_projection_state' ? 'thread_id' : 'rollout_ordinal';
        const info = db.prepare(`PRAGMA table_xinfo(${table})`).all();
        const columns = info.map(column => column.name);
        if (info.some(column => column.hidden) || !columns.includes('thread_id') || !columns.includes(first)) reject('Unsupported indexed history columns.');
        // A non-null primary key resolves ordinal ties without sorting payloads.
        // SQLite permits nullable keys in some schemas; retain full-row ordering there.
        const key = info.filter(column => column.pk).sort((a, b) => a.pk - b.pk);
        const ties = key.length && key.every(column => column.notnull) ? key.map(column => column.name) : columns;
        const order = [first, ...ties.filter(column => column !== first)].map(column => `"${column.replaceAll('"', '""')}" COLLATE BINARY`).join(', ');
        // Read TEXT as bytes before the binding can replace invalid UTF-8. Keep
        // storage types separate so a BLOB is never mistaken for valid text.
        const select = columns.map((column, i) => {
          const name = `"${column.replaceAll('"', '""')}"`;
          return `typeof(${name}) AS t${i}, CASE WHEN typeof(${name})='text' THEN CAST(${name} AS BLOB) ELSE ${name} END AS v${i}`;
        }).join(', ');
        const query = db.prepare(`SELECT ${select} FROM ${table} WHERE thread_id = ? ORDER BY ${order}`);
        query.setReadBigInts(true);
        return [table, query, columns];
      });
    }
    if (sessions.some(row => !['legacy', 'paginated'].includes(row.historyMode) || (row.historyMode === 'paginated' && !db))) reject('Indexed history is required for paginated sessions; operation stopped.');
    const selectedIds = ids => {
      if (!Array.isArray(ids) || !ids.length || ids.some(id => !UUID.test(id))) reject('Invalid indexed history ID set.');
      return [...new Set(ids.map(id => id.toLowerCase()))].sort();
    };
    return { present: !!db,
      *lines(ids) {
        const selected = selectedIds(ids);
        for (const [table, query, columns] of queries) for (const id of selected) {
          for (const values of query.iterate(id)) {
            const row = Object.create(null);
            for (const [i, column] of columns.entries()) {
              const type = values[`t${i}`];
              let value = values[`v${i}`];
              if (type === 'text') {
                try { value = decoder.decode(value); }
                catch { reject('Invalid UTF-8 in indexed history text.'); }
              } else if (type === 'integer' && typeof value === 'bigint' && Number.isSafeInteger(Number(value))) value = Number(value);
              else if (!((type === 'null' && value === null) || (type === 'real' && Number.isFinite(value)))) reject('Unsupported indexed history value type or range.');
              row[column] = value;
            }
            yield `${JSON.stringify({ table, row })}\n`;
          }
        }
      },
      hasRows(ids) {
        const selected = selectedIds(ids);
        // Absence checks need neither payload decoding nor export ordering.
        rowQueries ??= queries.map(([table]) => db.prepare(`SELECT 1 FROM ${table} WHERE thread_id = ? LIMIT 1`));
        return rowQueries.some(query => selected.some(id => query.get(id) !== undefined));
      },
      check() {
        checkHistoryVersions(home);
        if (db) {
          db.exec('COMMIT');
          if (identity(regularFile(path, home)) !== identity(before)
            || db.prepare('PRAGMA data_version').get().data_version !== version) reject('Indexed history changed during operation.');
        } else if (exists(path)) reject('Indexed history appeared during operation.');
      },
      close() { db?.close(); },
    };
  } catch (error) { db?.close(); throw error; }
}
