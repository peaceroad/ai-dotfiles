// @ai-dotfiles agent-dev-runtime managed

import { lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fingerprint } from './session-export-storage.mjs';
import { ProcessError } from './manage-codex-processes.mjs';

export class SidebarCacheError extends Error {}
const fail = message => { throw new SidebarCacheError(message); };
const required = {
  local_thread_catalog_hosts: ['host_id', 'host_kind'],
  local_thread_catalog_sync_state: ['host_id', 'watermark_updated_at', 'initial_build_complete', 'observation_sequence', 'last_full_reconciled_at'],
  local_thread_catalog_scan_checkpoints: ['host_id', 'checkpoint', 'failed_at'],
};
const mutable = ['local_thread_catalog_sync_state', 'local_thread_catalog_scan_checkpoints'];

function cachePath(home) {
  home = realpathSync(home);
  for (const name of ['sqlite', 'sqlite/codex-dev.db']) {
    let stat;
    try { stat = lstatSync(join(home, name)); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (stat.isSymbolicLink() || (name === 'sqlite' ? !stat.isDirectory() : !stat.isFile())) {
      fail('Sidebar cache must be a regular file in the supported Codex home layout.');
    }
  }
  return join(home, 'sqlite', 'codex-dev.db');
}

function readState(db) {
  for (const [table, columns] of Object.entries(required)) {
    const found = db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name);
    if (found.length !== columns.length || columns.some(column => !found.includes(column))) fail('Unsupported sidebar cache schema; no refresh was scheduled.');
  }
  const trigger = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND lower(tbl_name) IN (?, ?) LIMIT 1").get(...mutable);
  const foreignKey = !trigger && db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().some(({ name }) => {
    const keys = db.prepare(`PRAGMA foreign_key_list("${name.replaceAll('"', '""')}")`).all();
    return (mutable.includes(name.toLowerCase()) && keys.length > 0) || keys.some(row => mutable.includes(row.table.toLowerCase()));
  });
  if (trigger || foreignKey) {
    fail('Unsupported sidebar cache triggers or foreign keys; no refresh was scheduled.');
  }
  const host = db.prepare('SELECT host_kind FROM local_thread_catalog_hosts WHERE host_id = ?').get('local');
  if (!host) return null;
  if (host.host_kind !== 'local') fail('Sidebar cache local host has an unsupported kind.');
  const sync = db.prepare('SELECT * FROM local_thread_catalog_sync_state WHERE host_id = ?').get('local');
  if (!sync || ![0, 1].includes(sync.initial_build_complete)
    || !Number.isSafeInteger(sync.observation_sequence) || sync.observation_sequence < 0
    || (sync.last_full_reconciled_at !== null && !Number.isSafeInteger(sync.last_full_reconciled_at))) {
    fail('Unsupported sidebar cache sync state; no refresh was scheduled.');
  }
  const checkpoint = db.prepare('SELECT * FROM local_thread_catalog_scan_checkpoints WHERE host_id = ?').get('local') ?? null;
  const schema = db.prepare("SELECT type, name, sql FROM sqlite_master WHERE name IN (?, ?, ?) ORDER BY name").all(...Object.keys(required));
  const state = { schema, sync, checkpoint };
  if (Buffer.byteLength(JSON.stringify(state)) > 4 * 1024 * 1024) fail('Sidebar cache refresh state exceeds the supported size.');
  return state;
}

export async function inspectSidebarRefresh(home) {
  const path = cachePath(home);
  if (!path) return { available: false };
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const state = readState(db);
    if (!state) return { available: false };
    return { available: true, path, state, pending: state.sync.last_full_reconciled_at === null && state.checkpoint === null,
      token: fingerprint({ operation: 'refresh-sidebar', home: realpathSync(home), state }) };
  } finally { db.close(); }
}

export async function requestSidebarRefresh(home, { closed, expectedToken } = {}) {
  const plan = await inspectSidebarRefresh(home);
  if (expectedToken && plan.token !== expectedToken) fail('Sidebar refresh plan changed; review a new dry run.');
  if (!plan.available || plan.pending) return { ...plan, changed: false };
  const { DatabaseSync } = await import('node:sqlite');
  closed();
  // Never create a missing cache, or follow a replaced path after preflight.
  if (cachePath(home) !== plan.path) fail('Sidebar cache path changed; review a new dry run.');
  const db = new DatabaseSync(plan.path, { readOnly: false, timeout: 1000 });
  let inTransaction = false;
  try {
    db.exec('BEGIN IMMEDIATE'); inTransaction = true;
    const current = readState(db);
    if (fingerprint(current) !== fingerprint(plan.state)) fail('Sidebar cache changed; review a new dry run.');
    const backupRoot = join(realpathSync(home), 'backups');
    const backupDirectory = join(backupRoot, 'sidebar-refresh');
    for (const directory of [backupRoot, backupDirectory]) {
      mkdirSync(directory, { recursive: true });
      const stat = lstatSync(directory);
      if (stat.isSymbolicLink() || !stat.isDirectory()) fail('Sidebar refresh backup directory must not be redirected.');
    }
    const backup = join(backupDirectory, `${Date.now()}-${randomUUID()}.json`);
    writeFileSync(backup, `${JSON.stringify({ format: 'ai-dotfiles/sidebar-refresh-v1', previousState: current }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    // The app performs the full authoritative scan on its next startup. Do not
    // delete catalog entries, thread histories, projects, or worktree records.
    db.prepare('UPDATE local_thread_catalog_sync_state SET last_full_reconciled_at = NULL WHERE host_id = ?').run('local');
    db.prepare('DELETE FROM local_thread_catalog_scan_checkpoints WHERE host_id = ?').run('local');
    db.exec('COMMIT'); inTransaction = false;
    return { available: true, pending: true, changed: true, backup };
  } finally {
    try { if (inTransaction) db.exec('ROLLBACK'); }
    finally { db.close(); }
  }
}

export function sidebarRefreshError(error) {
  return error instanceof SidebarCacheError || error instanceof ProcessError ? error.message
    : `Sidebar cache refresh failed (${/^[A-Z_]+$/.test(error?.code ?? '') ? error.code : 'storage error'}). No automatic retry was attempted.`;
}
