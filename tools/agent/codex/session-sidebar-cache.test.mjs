import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectSidebarRefresh, requestSidebarRefresh } from './session-sidebar-cache.mjs';
import { runSessions, parseSessionArgs } from './manage-codex-sessions.mjs';

function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), 'agent-sidebar-test-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  mkdirSync(join(home, 'sqlite'));
  const path = join(home, 'sqlite', 'codex-dev.db');
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE local_thread_catalog_hosts (host_id TEXT PRIMARY KEY, host_kind TEXT);
    CREATE TABLE local_thread_catalog_sync_state (host_id TEXT PRIMARY KEY, watermark_updated_at INTEGER, initial_build_complete INTEGER, observation_sequence INTEGER, last_full_reconciled_at INTEGER);
    CREATE TABLE local_thread_catalog_scan_checkpoints (host_id TEXT PRIMARY KEY, checkpoint TEXT, failed_at INTEGER);
    CREATE TABLE local_thread_catalog (host_id TEXT, thread_id TEXT);
    CREATE TABLE automations (id TEXT, prompt TEXT);
    INSERT INTO local_thread_catalog_hosts VALUES ('local', 'local'), ('remote', 'remote');
    INSERT INTO local_thread_catalog_sync_state VALUES ('local', 123, 1, 5, 456), ('remote', 789, 1, 9, 999);
    INSERT INTO local_thread_catalog_scan_checkpoints VALUES ('local', 'synthetic checkpoint', NULL), ('remote', 'remote checkpoint', NULL);
    INSERT INTO local_thread_catalog VALUES ('local', 'synthetic thread');
    INSERT INTO automations VALUES ('synthetic automation', 'retained synthetic prompt');`);
  db.close();
  return { home, path, sql(sql) { const db = new DatabaseSync(path); try { db.exec(sql); } finally { db.close(); } } };
}

test('refresh schedules a local full scan, backs up scan state, and preserves catalog and other data', async t => {
  const f = fixture(t), plan = await inspectSidebarRefresh(f.home);
  let checks = 0;
  assert.equal(plan.pending, false);
  const result = await requestSidebarRefresh(f.home, { closed: () => checks++, expectedToken: plan.token });
  assert.equal(result.changed, true);
  assert.equal(checks, 1);
  const previous = JSON.parse(readFileSync(result.backup, 'utf8')).previousState;
  assert.equal(previous.sync.last_full_reconciled_at, 456);
  assert.equal(previous.checkpoint.checkpoint, 'synthetic checkpoint');
  const db = new DatabaseSync(f.path, { readOnly: true });
  try {
    assert.deepEqual({ ...db.prepare("SELECT * FROM local_thread_catalog_sync_state WHERE host_id='local'").get() },
      { host_id: 'local', watermark_updated_at: 123, initial_build_complete: 1, observation_sequence: 5, last_full_reconciled_at: null });
    assert.equal(db.prepare("SELECT last_full_reconciled_at FROM local_thread_catalog_sync_state WHERE host_id='remote'").get().last_full_reconciled_at, 999);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM local_thread_catalog_scan_checkpoints').get().count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM local_thread_catalog').get().count, 1);
    assert.equal(db.prepare('SELECT prompt FROM automations').get().prompt, 'retained synthetic prompt');
  } finally { db.close(); }
  assert.equal((await inspectSidebarRefresh(f.home)).pending, true);
  assert.equal((await requestSidebarRefresh(f.home, { closed() { assert.fail('Pending refresh needs no process scan'); } })).changed, false);
  assert.equal(readdirSync(join(f.home, 'backups', 'sidebar-refresh')).length, 1);
});

test('missing cache is a no-op and never creates a database', async t => {
  const home = mkdtempSync(join(tmpdir(), 'agent-sidebar-empty-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  assert.equal((await requestSidebarRefresh(home, { closed() { assert.fail('Missing cache needs no process scan'); } })).available, false);
  assert.deepEqual(readdirSync(home), []);
});

test('changed plans and open clients prevent a refresh', async t => {
  const f = fixture(t), plan = await inspectSidebarRefresh(f.home);
  f.sql('UPDATE local_thread_catalog_sync_state SET observation_sequence=6');
  await assert.rejects(requestSidebarRefresh(f.home, { closed() {}, expectedToken: plan.token }), /plan changed/);
  await assert.rejects(requestSidebarRefresh(f.home, { closed() { throw new Error('running clients'); } }), /running clients/);
  assert.equal(existsSync(join(f.home, 'backups')), false);
});

test('unknown columns, triggers, foreign keys, and nonlocal host kinds fail closed', async t => {
  for (const sql of [
    'ALTER TABLE local_thread_catalog_sync_state ADD COLUMN unsupported TEXT',
    'CREATE TRIGGER unknown_effect AFTER UPDATE ON local_thread_catalog_sync_state BEGIN DELETE FROM automations; END',
    'CREATE TABLE incoming_reference (host_id TEXT REFERENCES LOCAL_THREAD_CATALOG_SCAN_CHECKPOINTS(host_id) ON DELETE CASCADE)',
    `ALTER TABLE local_thread_catalog_scan_checkpoints RENAME TO old_checkpoints;
      CREATE TABLE local_thread_catalog_scan_checkpoints (host_id TEXT PRIMARY KEY REFERENCES local_thread_catalog_hosts(host_id), checkpoint TEXT, failed_at INTEGER);
      INSERT INTO local_thread_catalog_scan_checkpoints SELECT * FROM old_checkpoints`,
    "UPDATE local_thread_catalog_hosts SET host_kind='remote' WHERE host_id='local'",
  ]) {
    const f = fixture(t); f.sql(sql);
    await assert.rejects(requestSidebarRefresh(f.home, { closed() {} }), /Unsupported|unsupported/);
    assert.equal(existsSync(join(f.home, 'backups')), false);
  }
});

test('cache changes during the final process check stop before writing', async t => {
  const f = fixture(t);
  await assert.rejects(requestSidebarRefresh(f.home, { closed() {
    f.sql('UPDATE local_thread_catalog_sync_state SET observation_sequence=6');
  } }), /cache changed/);
  assert.equal((await inspectSidebarRefresh(f.home)).pending, false);
  assert.equal(existsSync(join(f.home, 'backups')), false);
});

test('cache removed during the final process check is not recreated', async t => {
  const f = fixture(t);
  await assert.rejects(requestSidebarRefresh(f.home, { closed() { rmSync(f.path); } }), /path changed/);
  assert.equal(existsSync(f.path), false);
  assert.equal(existsSync(join(f.home, 'backups')), false);
});

test('refresh help and dry run do not inspect histories or require closed clients', async t => {
  const f = fixture(t), before = readFileSync(f.path), output = [];
  const options = { home: f.home, platform: 'win32', interactive: false, log: s => output.push(s),
    inspect: () => assert.fail('No history inspection'), closed: () => assert.fail('Dry run needs no closure') };
  assert.equal(await runSessions(['refresh-sidebar', '--help'], options), 0);
  assert.equal(await runSessions(['refresh-sidebar', '--dry-run'], options), 0);
  assert.match(output.join('\n'), /Confirmation token: [a-f0-9]{64}/);
  assert.deepEqual(readFileSync(f.path), before);
  assert.equal(existsSync(join(f.home, 'backups')), false);
});

test('refresh confirmation trims whitespace, cancellation preserves state, and tokens cannot be stale', async t => {
  const f = fixture(t), options = { home: f.home, platform: 'win32', interactive: true, log() {}, closed() {} };
  assert.equal(await runSessions(['refresh-sidebar'], { ...options, ask: async () => '' }), 0);
  assert.equal((await inspectSidebarRefresh(f.home)).pending, false);
  const token = (await inspectSidebarRefresh(f.home)).token;
  assert.equal(await runSessions(['refresh-sidebar'], { ...options, ask: async () => ' REFRESH SIDEBAR ' }), 0);
  assert.equal((await inspectSidebarRefresh(f.home)).pending, true);
  assert.equal(await runSessions(['refresh-sidebar', '--confirm', token], { ...options, interactive: false }), 1);
  assert.throws(() => parseSessionArgs(['refresh-sidebar', '--output', 'synthetic']), /Unknown option/);
  assert.throws(() => parseSessionArgs(['refresh-sidebar', '--dry-run', '--confirm', token]), /cannot accompany/);
});

test('state changed after confirmation stops before cache mutation', async t => {
  const f = fixture(t);
  assert.equal(await runSessions(['refresh-sidebar'], { home: f.home, platform: 'win32', interactive: true, log() {}, closed() {},
    ask: async () => { f.sql('UPDATE local_thread_catalog_sync_state SET observation_sequence=6'); return 'REFRESH SIDEBAR'; } }), 1);
  assert.equal((await inspectSidebarRefresh(f.home)).pending, false);
  assert.equal(existsSync(join(f.home, 'backups')), false);
});
