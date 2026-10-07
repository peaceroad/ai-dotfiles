// @ai-dotfiles agent-dev-runtime managed
// Read-only preservation of openai/codex rust-v0.159.2 root-owned boards.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BOARD_TABLES, UUID, exists, regularFile, reject } from './session-export-storage.mjs';

const FILE = 'agent_message_board_1.sqlite';
const columns = {
  channels: ['board', 'name', 'name_search', 'created_at', 'timestamp', 'author'],
  posts: ['seq', 'board', 'id', 'channel', 'root', 'author', 'timestamp', 'body_search', 'payload', 'request_id', 'request'],
  subscriptions: ['board', 'target', 'agent'],
  subscription_opt_outs: ['board', 'target', 'agent'],
  deleted_boards: ['board'],
};
const keys = { channels: ['board', 'name'], posts: ['seq'], subscriptions: ['board', 'target', 'agent'],
  subscription_opt_outs: ['board', 'target', 'agent'], deleted_boards: ['board'] };
const integer = name => name === 'seq' || name === 'timestamp';
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const identity = stat => `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
const checkVersions = home => {
  if (readdirSync(home).some(name => /^agent_message_board_\d+\.sqlite$/i.test(name) && name !== FILE)) reject('Unknown agent message-board database version.');
};
export async function openBoardReader(home) {
  checkVersions(home);
  const path = join(home, FILE), before = exists(path) ? regularFile(path, home) : null;
  let db;
  try {
    let version;
    const queries = new Map();
    if (before) {
      const { DatabaseSync } = await import('node:sqlite');
      db = new DatabaseSync(path, { readOnly: true });
      version = db.prepare('PRAGMA data_version').get().data_version;
      db.exec('BEGIN');
      if (db.prepare('PRAGMA encoding').get().encoding !== 'UTF-8') reject('Unsupported agent message-board text encoding.');
      const integrity = db.prepare('PRAGMA quick_check').all();
      if (integrity.length !== 1 || integrity[0].quick_check !== 'ok') reject('Agent message-board integrity could not be verified.');
      const schema = db.prepare("SELECT type, name FROM sqlite_master WHERE type IN ('table', 'view', 'trigger')").all();
      if (schema.some(row => row.type !== 'table' || ![...BOARD_TABLES, 'sqlite_sequence'].includes(row.name))
        || BOARD_TABLES.some(table => !schema.some(row => row.name === table))) reject('Unsupported agent message-board schema.');
      for (const table of BOARD_TABLES) {
        const info = db.prepare(`PRAGMA table_xinfo(${table})`).all();
        if (info.length !== columns[table].length || info.some((col, i) => col.name !== columns[table][i]
          || col.type.toUpperCase() !== (integer(col.name) ? 'INTEGER' : 'TEXT') || col.hidden
          || (!col.notnull && !(table === 'posts' && col.name === 'seq'))
          || col.pk !== Math.max(0, keys[table].indexOf(col.name) + 1))
          || db.prepare(`PRAGMA foreign_key_list(${table})`).all().length) reject('Unsupported agent message-board columns or references.');
        // Decode text strictly rather than letting SQLite bindings replace bad bytes.
        const select = columns[table].map(name => integer(name) ? name
          : `CASE WHEN typeof(${name})='text' THEN CAST(${name} AS BLOB) END AS ${name}`).join(', ');
        const query = db.prepare(`SELECT ${select} FROM ${table} WHERE board = ? COLLATE BINARY ORDER BY ${keys[table].map(key => `${key} COLLATE BINARY`).join(', ')}`);
        query.setReadBigInts(true);
        queries.set(table, query);
      }
    }
    return { present: !!db,
      owners() {
        const owners = new Set();
        if (db) for (const table of BOARD_TABLES.filter(table => table !== 'deleted_boards')) {
          for (const { board } of db.prepare(`SELECT DISTINCT board FROM ${table}`).iterate()) {
            if (typeof board !== 'string' || !UUID.test(board) || board !== board.toLowerCase()) reject('Invalid agent message-board owner.');
            owners.add(board);
          }
        }
        return owners;
      },
      *lines(id) {
        if (!UUID.test(id) || id !== id.toLowerCase()) reject('Invalid agent message-board owner.');
        for (const [table, query] of queries) for (const row of query.iterate(id)) {
          for (const name of columns[table]) {
            if (integer(name)) {
              if (typeof row[name] !== 'bigint') reject('Unsupported agent message-board value type.');
            } else {
              if (!(row[name] instanceof Uint8Array)) reject('Unsupported agent message-board value type.');
              try { row[name] = decoder.decode(row[name]); }
              catch { reject('Invalid UTF-8 in agent message-board text.'); }
            }
          }
          // Explicit tags retain all SQLite signed 64-bit integers without rounding.
          yield `${JSON.stringify({ table, row }, (_, value) => typeof value === 'bigint' ? { $integer: String(value) } : value)}\n`;
        }
      },
      check() {
        checkVersions(home);
        if (db) {
          db.exec('COMMIT');
          if (identity(regularFile(path, home)) !== identity(before)
            || db.prepare('PRAGMA data_version').get().data_version !== version) reject('Agent message-board changed during operation.');
        } else if (exists(path)) reject('Agent message-board appeared during operation.');
      },
      close() { db?.close(); },
    };
  } catch (error) { db?.close(); throw error; }
}
