// Synthetic schema from Codex 0.159.2 migrations 0051 and 0055.
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
export function attachmentMetadataFixture(home) {
  const path = join(home, 'state_5.sqlite');
  const run = (sql, ...args) => {
    const db = new DatabaseSync(path);
    try { return db.prepare(sql).run(...args); } finally { db.close(); }
  };
  run(`CREATE TABLE IF NOT EXISTS thread_attachments (id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    attachment_type TEXT NOT NULL, identity_key TEXT NOT NULL, payload TEXT NOT NULL,
    created_at INTEGER NOT NULL, UNIQUE(thread_id, attachment_type, identity_key))`);
  return { run, put(id) { run('INSERT INTO thread_attachments VALUES (?, ?, ?, ?, ?, ?)',
    `attachment-${id}`, id, 'worktree', 'synthetic-key', '\ufeffopaque synthetic payload\0', 9223372036854775807n); } };
}
