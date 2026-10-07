// @ai-dotfiles agent-dev-runtime managed
// Thread-owned attachment membership; payload paths are opaque, never followed.
import { join } from 'node:path';
import { regularFile, UUID, reject } from './session-export-storage.mjs';

const columns = ['id', 'thread_id', 'attachment_type', 'identity_key', 'payload', 'created_at'];
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const identity = stat => `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
export async function openAttachmentMetadataReader(home) {
  const path = join(home, 'state_5.sqlite'), before = regularFile(path, home);
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const version = db.prepare('PRAGMA data_version').get().data_version;
    db.exec('BEGIN');
    const schema = db.prepare("SELECT type, name, tbl_name FROM sqlite_master").all();
    if (schema.some(row => row.name === 'thread_artifacts')) reject('Legacy attachment metadata needs a supported Codex migration before export or deletion.');
    const present = schema.some(row => row.name === 'thread_attachments' && row.type === 'table');
    let query;
    if (schema.some(row => row.tbl_name === 'thread_attachments' && !['table', 'index'].includes(row.type))) reject('Unsupported attachment metadata schema.');
    if (present) {
      if (db.prepare('PRAGMA encoding').get().encoding !== 'UTF-8') reject('Unsupported attachment metadata text encoding.');
      const info = db.prepare('PRAGMA table_xinfo(thread_attachments)').all();
      if (info.length !== columns.length || info.some((col, i) => col.name !== columns[i] || col.hidden
        || col.type.toUpperCase() !== (col.name === 'created_at' ? 'INTEGER' : 'TEXT')
        || col.pk !== (col.name === 'id' ? 1 : 0) || (!col.notnull && col.name !== 'id'))) reject('Unsupported attachment metadata columns.');
      const refs = db.prepare('PRAGMA foreign_key_list(thread_attachments)').all();
      if (refs.length !== 1 || refs[0].table !== 'threads' || refs[0].from !== 'thread_id'
        || refs[0].to !== 'id' || refs[0].on_delete !== 'CASCADE') reject('Unsupported attachment metadata ownership.');
      const select = columns.map(name => name === 'created_at' ? name
        : `CASE WHEN typeof(${name})='text' THEN CAST(${name} AS BLOB) END AS ${name}`).join(', ');
      query = db.prepare(`SELECT ${select} FROM thread_attachments WHERE thread_id = ? COLLATE BINARY ORDER BY id COLLATE BINARY`);
      query.setReadBigInts(true);
    }
    return { present,
      owners() {
        const ids = new Set();
        if (present) for (const { thread_id } of db.prepare('SELECT DISTINCT thread_id FROM thread_attachments').iterate()) {
          if (typeof thread_id !== 'string' || !UUID.test(thread_id) || thread_id !== thread_id.toLowerCase()) reject('Invalid attachment metadata owner.');
          ids.add(thread_id);
        }
        return ids;
      },
      *lines(id) {
        if (!UUID.test(id) || id !== id.toLowerCase()) reject('Invalid attachment metadata owner.');
        if (!query) return;
        for (const row of query.iterate(id)) {
          for (const name of columns) {
            if (name === 'created_at') {
              if (typeof row[name] !== 'bigint') reject('Unsupported attachment metadata value type.');
              row[name] = { $integer: String(row[name]) };
            } else {
              if (!(row[name] instanceof Uint8Array)) reject('Unsupported attachment metadata value type.');
              try { row[name] = decoder.decode(row[name]); }
              catch { reject('Invalid UTF-8 in attachment metadata.'); }
            }
          }
          yield `${JSON.stringify({ table: 'thread_attachments', row })}\n`;
        }
      },
      check() {
        db.exec('COMMIT');
        if (identity(regularFile(path, home)) !== identity(before)
          || db.prepare('PRAGMA data_version').get().data_version !== version) reject('Attachment metadata changed during operation.');
      },
      close() { db.close(); },
    };
  } catch (error) { db.close(); throw error; }
}
