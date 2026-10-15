// @ai-dotfiles agent-dev-runtime managed
// rust-v0.162.1 state migrations 0004/0019/0026. Tool schemas remain opaque text.
import { join } from 'node:path';
import { regularFile, UUID, reject } from './session-export-storage.mjs';

const columns = ['thread_id', 'position', 'name', 'description', 'input_schema', 'defer_loading', 'namespace'];
const integerColumns = new Set(['position', 'defer_loading']);
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const identity = stat => `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;

// Read/export remain available; unclassified ownership must block mutation.
export function stateDeletionIssues(db) {
  const schema = db.prepare('SELECT type, name, tbl_name FROM sqlite_master').all();
  const tables = schema.filter(r => r.type === 'table').map(r => r.name);
  const quoted = name => '"' + name.replaceAll('"', '""') + '"';
  const linked = new Set(['threads']);
  const refs = new Map(tables.map(name => [name, db.prepare(`PRAGMA foreign_key_list(${quoted(name)})`).all()]));
  for (let before = -1; before !== linked.size;) {
    before = linked.size;
    for (const [name, rows] of refs) if (rows.some(row => linked.has(row.table))) linked.add(name);
  }
  const reviewed = new Set(['threads', 'thread_spawn_edges', 'thread_attachments', 'thread_dynamic_tools']);
  const issues = [];
  for (const name of tables) {
    if (reviewed.has(name)) continue;
    const owned = linked.has(name) || db.prepare(`PRAGMA table_info(${quoted(name)})`).all().some(c => ['thread_id', 'parent_thread_id', 'child_thread_id'].includes(c.name));
    if (owned && db.prepare(`SELECT 1 FROM ${quoted(name)} LIMIT 1`).get()) issues.push('Unreviewed thread-owned state rows require preservation review before deletion.');
  }
  const triggers = new Set(['threads_created_at_ms_after_insert', 'threads_created_at_ms_after_update',
    'threads_updated_at_ms_after_insert', 'threads_updated_at_ms_after_update', 'threads_recency_at_after_insert']);
  if (schema.some(r => r.type === 'trigger' && (linked.has(r.tbl_name) || reviewed.has(r.tbl_name)) && !triggers.has(r.name))) issues.push('Unreviewed thread-owned state trigger blocks deletion.');
  return [...new Set(issues)];
}

export async function openDynamicToolsReader(home) {
  const path = join(home, 'state_5.sqlite'), before = regularFile(path, home);
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const version = db.prepare('PRAGMA data_version').get().data_version;
    db.exec('BEGIN');
    const schema = db.prepare('SELECT type, name, tbl_name FROM sqlite_master').all();
    if (schema.some(r => r.tbl_name === 'thread_dynamic_tools' && !['table', 'index'].includes(r.type))) reject('Unsupported dynamic tool schema.');
    const present = schema.some(r => r.name === 'thread_dynamic_tools' && r.type === 'table');
    let query;
    if (present) {
      if (db.prepare('PRAGMA encoding').get().encoding !== 'UTF-8') reject('Unsupported dynamic tool text encoding.');
      const info = db.prepare('PRAGMA table_xinfo(thread_dynamic_tools)').all();
      if (info.length !== columns.length || info.some((c, i) => c.name !== columns[i] || c.hidden
        || c.type.toUpperCase() !== (integerColumns.has(c.name) ? 'INTEGER' : 'TEXT')
        || c.pk !== (c.name === 'thread_id' ? 1 : c.name === 'position' ? 2 : 0)
        || c.notnull !== (c.name === 'namespace' ? 0 : 1))) reject('Unsupported dynamic tool columns.');
      const refs = db.prepare('PRAGMA foreign_key_list(thread_dynamic_tools)').all();
      if (refs.length !== 1 || refs[0].table !== 'threads' || refs[0].from !== 'thread_id' || refs[0].to !== 'id' || refs[0].on_delete !== 'CASCADE') reject('Unsupported dynamic tool ownership.');
      const select = columns.map(name => integerColumns.has(name) ? name : name === 'namespace'
        ? "CASE WHEN namespace IS NULL THEN NULL WHEN typeof(namespace)='text' THEN CAST(namespace AS BLOB) ELSE 0 END AS namespace"
        : `CASE WHEN typeof(${name})='text' THEN CAST(${name} AS BLOB) END AS ${name}`).join(', ');
      query = db.prepare(`SELECT ${select} FROM thread_dynamic_tools WHERE thread_id = ? COLLATE BINARY ORDER BY position`);
      query.setReadBigInts(true);
    }
    return { present,
      owners() {
        const ids = new Set();
        if (present) for (const { thread_id } of db.prepare('SELECT DISTINCT thread_id FROM thread_dynamic_tools').iterate()) {
          if (typeof thread_id !== 'string' || !UUID.test(thread_id) || thread_id !== thread_id.toLowerCase()) reject('Invalid dynamic tool owner.');
          ids.add(thread_id);
        }
        return ids;
      },
      *lines(id) {
        if (!UUID.test(id) || id !== id.toLowerCase()) reject('Invalid dynamic tool owner.');
        if (!query) return;
        for (const row of query.iterate(id)) {
          for (const name of columns) {
            if (integerColumns.has(name)) {
              if (typeof row[name] !== 'bigint') reject('Unsupported dynamic tool value type.');
              row[name] = { $integer: String(row[name]) };
            } else if (name !== 'namespace' || row[name] !== null) {
              if (!(row[name] instanceof Uint8Array)) reject('Unsupported dynamic tool value type.');
              try { row[name] = decoder.decode(row[name]); } catch { reject('Invalid UTF-8 in dynamic tools.'); }
            }
          }
          yield `${JSON.stringify({ table: 'thread_dynamic_tools', row })}\n`;
        }
      },
      check() {
        db.exec('COMMIT');
        if (identity(regularFile(path, home)) !== identity(before) || db.prepare('PRAGMA data_version').get().data_version !== version) reject('Dynamic tools changed during operation.');
      },
      close() { db.close(); },
    };
  } catch (error) { db.close(); throw error; }
}
