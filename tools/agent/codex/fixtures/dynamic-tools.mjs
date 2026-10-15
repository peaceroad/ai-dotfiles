// Synthetic schema from official state migrations 0004, 0019 and 0026.
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
export function dynamicToolsFixture(home) {
  const path = join(home, 'state_5.sqlite');
  const run = (sql, ...args) => {
    const db = new DatabaseSync(path);
    try { return db.prepare(sql).run(...args); } finally { db.close(); }
  };
  run(`CREATE TABLE IF NOT EXISTS thread_dynamic_tools (thread_id TEXT NOT NULL,
    position INTEGER NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL, input_schema TEXT NOT NULL,
    defer_loading INTEGER NOT NULL DEFAULT 0, namespace TEXT,
    PRIMARY KEY(thread_id, position), FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE)`);
  return { run, put(id) { run('INSERT INTO thread_dynamic_tools VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, 0, 'synthetic_tool', 'Synthetic tool', '\ufeffopaque schema\0', 1, null); } };
}
