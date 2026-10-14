import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { configureLogRetention } from './manage-sqlite-trace-log-suppression.mjs';

const triggerName = 'codex_suppress_trace_logs';
const triggerSql = levels => `CREATE TRIGGER ${triggerName} BEFORE INSERT ON logs
  WHEN NEW.level IN (${levels.map(level => `'${level}'`).join(', ')})
  BEGIN SELECT RAISE(IGNORE); END;`;
const infoSql = triggerSql(['TRACE', 'DEBUG']);
const warnSql = triggerSql(['TRACE', 'DEBUG', 'INFO']);
const unknownSql = `CREATE TRIGGER ${triggerName} AFTER INSERT ON logs BEGIN SELECT 42; END;`;
const policy = db => db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND name = ?").get(triggerName)?.sql ?? null;
const rowCount = db => Number(db.prepare('SELECT count(*) AS n FROM logs').get().n);

function fixture(t, { active = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'log-policy-test-'));
  const path = join(root, 'logs.sqlite');
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE logs (
    id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, ts_nanos INTEGER NOT NULL,
    level TEXT NOT NULL, target TEXT NOT NULL, feedback_log_body TEXT,
    module_path TEXT, file TEXT, line INTEGER, thread_id TEXT, process_uuid TEXT,
    estimated_bytes INTEGER NOT NULL
  );`);
  const insert = db.prepare('INSERT INTO logs(ts, ts_nanos, level, target, process_uuid, estimated_bytes) VALUES (?, 0, ?, ?, ?, 0)');
  for (let index = 0; index < 100; index++) insert.run(Math.floor(Date.now() / 1000), 'TRACE', 'synthetic', 'fixture-process');
  if (active) db.exec(infoSql);
  const initialPolicy = policy(db);
  db.close();
  const events = [];
  let beforeBegin = () => {};
  let beforeExec = () => {};
  class InstrumentedDatabase extends DatabaseSync {
    exec(sql) {
      if (sql === 'BEGIN IMMEDIATE;') beforeBegin();
      const replacement = beforeExec(sql, this);
      events.push(sql);
      return super.exec(replacement ?? sql);
    }
  }
  const open = (Constructor, readOnly) => {
    events.push(readOnly ? 'open-readonly' : 'open-write');
    return new Constructor(path, { readOnly });
  };
  const inspect = callback => {
    const connection = new DatabaseSync(path);
    try { return callback(connection); } finally { connection.close(); }
  };
  const run = (level = 'warn', options = {}) => configureLogRetention(
    InstrumentedDatabase, level, level === 'trace' ? 'restore' : 'suppress',
    { open, confirm: async () => true, ...options },
  );
  return { events, initialPolicy, inspect, run, setBeforeBegin: value => { beforeBegin = value; }, setBeforeExec: value => { beforeExec = value; } };
}

for (const [name, replacement, expected] of [
  ['unknown trigger', unknownSql, /unrecognized SQL/],
  ['different recognized trigger', warnSql, /changed after confirmation/],
  ['concurrent restore', null, /changed after confirmation/],
]) {
  test(`a ${name} installed immediately before BEGIN is preserved`, async t => {
    const f = fixture(t);
    let competingPolicy;
    f.setBeforeBegin(() => f.inspect(db => {
      db.exec(`DROP TRIGGER ${triggerName};`);
      if (replacement) db.exec(replacement);
      competingPolicy = policy(db);
    }));
    await assert.rejects(f.run(), expected);
    assert.equal(f.inspect(policy), competingPolicy);
    assert.equal(f.inspect(rowCount), 100);
    assert.ok(f.events.includes('ROLLBACK;'));
    assert.ok(!f.events.includes(`DROP TRIGGER "${triggerName}";`));
  });
}

test('schema is checked inside the write transaction', async t => {
  const f = fixture(t);
  f.setBeforeBegin(() => f.inspect(db => db.exec('ALTER TABLE logs ADD COLUMN unexpected TEXT;')));
  await assert.rejects(f.run(), /schema differs/);
  assert.equal(f.inspect(policy), f.initialPolicy);
  assert.equal(f.inspect(rowCount), 100);
});

test('new suppression rechecks fresh evidence after obtaining the lock', async t => {
  const f = fixture(t, { active: false });
  f.setBeforeBegin(() => f.inspect(db => db.prepare("INSERT INTO logs(ts, ts_nanos, level, target, process_uuid, estimated_bytes) VALUES (?, 0, 'INFO', 'synthetic', 'next-process', 0)").run(Math.floor(Date.now() / 1000))));
  await assert.rejects(f.run(), /evidence changed after confirmation/);
  assert.equal(f.inspect(policy), null);
  assert.equal(f.inspect(rowCount), 101);
});

test('an active policy can be changed and restored without changing existing rows', async t => {
  const f = fixture(t);
  await f.run();
  assert.match(f.inspect(policy), /'TRACE', 'DEBUG', 'INFO'/);
  assert.equal(f.inspect(rowCount), 100);
  await f.run('trace');
  assert.equal(f.inspect(policy), null);
  assert.equal(f.inspect(rowCount), 100);
});

test('fresh evidence permits installing a new policy', async t => {
  const f = fixture(t, { active: false });
  await f.run('info');
  assert.match(f.inspect(policy), /'TRACE', 'DEBUG'/);
  assert.equal(f.inspect(rowCount), 100);
});

test('failed creation rolls back the preceding drop', async t => {
  const f = fixture(t);
  f.setBeforeExec(sql => { if (/CREATE TRIGGER/.test(sql)) throw new Error('synthetic creation failure'); });
  await assert.rejects(f.run(), /synthetic creation failure/);
  assert.equal(f.inspect(policy), f.initialPolicy);
  assert.equal(f.inspect(rowCount), 100);
});

test('post-change verification failure rolls back the transaction', async t => {
  const f = fixture(t);
  // Return a different recognized CREATE statement to exercise final verification.
  f.setBeforeExec(sql => /CREATE TRIGGER/.test(sql) ? infoSql : undefined);
  await assert.rejects(f.run(), /Post-change verification found a different policy/);
  assert.equal(f.inspect(policy), f.initialPolicy);
});

test('confirmation waits without a writable connection or lock', async t => {
  const f = fixture(t);
  await f.run('warn', { confirm: async () => {
    assert.deepEqual(f.events, ['open-readonly']);
    f.inspect(db => {
      db.exec('BEGIN IMMEDIATE;');
      db.exec('COMMIT;');
    });
    return true;
  } });
  assert.ok(f.events.includes('COMMIT;'));
});

test('cancellation never opens a writable connection', async t => {
  const f = fixture(t);
  await f.run('warn', { confirm: async () => false });
  assert.deepEqual(f.events, ['open-readonly']);
  assert.equal(f.inspect(policy), f.initialPolicy);
});

test('an unchanged policy is a no-op without confirmation', async t => {
  const f = fixture(t);
  await f.run('info', { confirm: () => { throw new Error('must not confirm'); } });
  assert.deepEqual(f.events, ['open-readonly']);
  assert.equal(f.inspect(policy), f.initialPolicy);
});

test('unknown trigger at preflight never reaches confirmation', async t => {
  const f = fixture(t);
  f.inspect(db => { db.exec(`DROP TRIGGER ${triggerName};`); db.exec(unknownSql); });
  const before = f.inspect(policy);
  await assert.rejects(f.run('warn', { confirm: () => { throw new Error('must not confirm'); } }), /unrecognized SQL/);
  assert.deepEqual(f.events, ['open-readonly']);
  assert.equal(f.inspect(policy), before);
});

test('restore still permits a changed logs schema with a recognized policy', async t => {
  const f = fixture(t);
  f.inspect(db => db.exec('ALTER TABLE logs ADD COLUMN upstream_field TEXT;'));
  await f.run('trace');
  assert.equal(f.inspect(policy), null);
  assert.equal(f.inspect(rowCount), 100);
});
