// Synthetic storage using the public rust-v0.159.2 board schema.
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

export function boardFixture(home) {
  const path = join(home, 'agent_message_board_1.sqlite');
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE deleted_boards (board TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE channels (board TEXT NOT NULL, name TEXT NOT NULL, name_search TEXT NOT NULL,
      created_at TEXT NOT NULL, timestamp INTEGER NOT NULL, author TEXT NOT NULL, PRIMARY KEY(board,name));
    CREATE TABLE posts (seq INTEGER PRIMARY KEY AUTOINCREMENT, board TEXT NOT NULL, id TEXT NOT NULL,
      channel TEXT NOT NULL, root TEXT NOT NULL, author TEXT NOT NULL, timestamp INTEGER NOT NULL,
      body_search TEXT NOT NULL, payload TEXT NOT NULL, request_id TEXT NOT NULL, request TEXT NOT NULL,
      UNIQUE(board,id), UNIQUE(board,request_id));
    CREATE TABLE subscriptions (board TEXT NOT NULL, target TEXT NOT NULL, agent TEXT NOT NULL, PRIMARY KEY(board,target,agent));
    CREATE TABLE subscription_opt_outs (board TEXT NOT NULL, target TEXT NOT NULL, agent TEXT NOT NULL, PRIMARY KEY(board,target,agent));
  `);
  db.close();
  const run = (sql, ...args) => {
    const db = new DatabaseSync(path);
    try { db.prepare(sql).run(...args); } finally { db.close(); }
  };
  return { path, run, put(table, id, body = 'Synthetic board data') {
    if (table === 'channels') run("INSERT INTO channels VALUES (?, 'general', 'general', '2000-01-01T00:00:00Z', 1, '/root')", id);
    else if (table === 'posts') run("INSERT INTO posts (board,id,channel,root,author,timestamp,body_search,payload,request_id,request) VALUES (?, 'post-1', 'general', 'post-1', '/root', 1, ?, ?, 'request-1', '{}')", id, body, JSON.stringify({ text: body }));
    else if (table === 'deleted_boards') run('INSERT INTO deleted_boards VALUES (?)', id);
    else if (['subscriptions', 'subscription_opt_outs'].includes(table)) run(`INSERT INTO ${table} VALUES (?, 'general', '/root')`, id);
    else throw new Error('Unknown fixture table');
  } };
}
