import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, renameSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectSessions, inspectDeletionReferences, makePlan, selectPlan, parseSessionArgs, exportSessions, runSessions, assertClientsClosed, runOfficialCodex, displayText, planExportedDeletion } from './manage-codex-sessions.mjs';
import { listBundles, snapshotDigest, fingerprint, verifyBundle, HISTORY_TABLES } from './session-export-storage.mjs';
import { listBatches, readBatch } from './session-export-batches.mjs';
import { inspectSidebarRefresh } from './session-sidebar-cache.mjs';
import { runHistory } from './manage-codex-history.mjs';

const parent = '00000000-0000-4000-8000-000000000001';
const child = '00000000-0000-4000-8000-000000000002';
const other = '00000000-0000-4000-8000-000000000003';

function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), 'agent-session-test-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  mkdirSync(join(home, 'sessions'));
  const path = join(home, 'state_5.sqlite');
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, name TEXT, title TEXT,
    updated_at INTEGER, updated_at_ms INTEGER, recency_at_ms INTEGER, archived INTEGER,
    is_pinned INTEGER, thread_section_id TEXT, history_mode TEXT DEFAULT 'legacy');
    CREATE TABLE thread_spawn_edges (parent_thread_id TEXT, child_thread_id TEXT);`);
  const insert = db.prepare("INSERT INTO threads VALUES (?, ?, NULL, ?, 100, 100000, 100000, 0, 0, NULL, 'legacy')");
  for (const id of [parent, child, other]) {
    const rollout = join(home, 'sessions', `${id}.jsonl`);
    writeFileSync(rollout, '{"fixture":true}\n');
    insert.run(id, rollout, 'Japanese 日本語 fixture');
  }
  db.prepare('INSERT INTO thread_spawn_edges VALUES (?, ?)').run(parent, child);
  db.close();
  return { home, update(sql, ...args) { const db = new DatabaseSync(path); try { db.prepare(sql).run(...args); } finally { db.close(); } } };
}

test('read-only inventory reads metadata, includes descendants, and does not change rollouts or database', async t => {
  const f = fixture(t);
  const before = readFileSync(join(f.home, 'state_5.sqlite'));
  const snapshot = await inspectSessions(f.home);
  assert.equal(snapshot.sessions.length, 3);
  assert.deepEqual(snapshot.issues, []);
  const plan = makePlan(snapshot, parent);
  assert.deepEqual(plan.sessions.map(row => row.id), [parent, child]);
  assert.deepEqual(plan.problems, []);
  assert.equal(plan.size, 34);
  assert.deepEqual(readFileSync(join(f.home, 'state_5.sqlite')), before);
});

test('extended Windows paths use the same guarded session file', { skip: process.platform !== 'win32' }, async t => {
  const f = fixture(t);
  f.update('UPDATE threads SET rollout_path = ? WHERE id = ?', `\\\\?\\${join(f.home, 'sessions', `${parent}.jsonl`)}`, parent);
  const row = (await inspectSessions(f.home)).sessions.find(row => row.id === parent);
  assert.equal(row.path, join(f.home, 'sessions', `${parent}.jsonl`));
  assert.deepEqual(row.reasons, []);
});

test('rollover filenames retain metadata ownership and extra rollouts block deletion', async t => {
  const f = fixture(t), alias = '00000000-0000-4000-8000-000000000004';
  const original = join(f.home, 'sessions', `${parent}.jsonl`);
  const rollover = join(f.home, 'sessions', `rollout-2000-01-01T00-00-00-${parent}_${alias}.jsonl`);
  renameSync(original, rollover);
  writeFileSync(rollover, `${JSON.stringify({ type: 'session_meta', payload: { id: parent } })}\n`);
  f.update('UPDATE threads SET rollout_path = ? WHERE id = ?', rollover, parent);
  let snapshot = await inspectDeletionReferences(await inspectSessions(f.home));
  assert.deepEqual(snapshot.sessions.find(row => row.id === parent).reasons, []);
  assert.deepEqual(makePlan(snapshot, parent).problems, []);
  writeFileSync(original, `${JSON.stringify({ type: 'session_meta', payload: { id: parent } })}\n`);
  snapshot = await inspectDeletionReferences(await inspectSessions(f.home));
  assert.match(makePlan(snapshot, parent).problems.join('\n'), /Additional rollout/);
});

test('exported deletion verifies every additional rollout owned by the session', async t => {
  const f = renderableFixture(t), output = exportParent(t);
  const alias = '00000000-0000-4000-8000-000000000004';
  const extra = join(f.home, 'sessions', `rollout-2000-01-01T00-00-00-${parent}_${alias}.jsonl`);
  writeFileSync(extra, `${JSON.stringify({ type: 'session_meta', payload: { id: parent } })}\n`);
  const { batch } = await saveBatch(f, output);
  const plan = await planExportedDeletion(await inspectSessions(f.home), output, batch.id);
  assert.equal(plan.sessions.length, 2);
  writeFileSync(extra, `${readFileSync(extra, 'utf8')}{"fixture":true}\n`);
  const changed = await planExportedDeletion(await inspectSessions(f.home), output, batch.id);
  assert.equal(changed.sessions.length, 0);
  assert.match(changed.skipped[0].problems[0], /Additional rollout/);
});

test('pinned and sectioned descendants protect the parent plan', async t => {
  const f = fixture(t);
  f.update('UPDATE threads SET is_pinned = 1, thread_section_id = ? WHERE id = ?', 'important', child);
  const plan = makePlan(await inspectSessions(f.home), parent);
  assert.match(plan.problems.join('\n'), /pinned/);
  assert.match(plan.problems.join('\n'), /sidebar-section/);
});

test('pin migration bookkeeping is ignored while live and unknown protections remain', async t => {
  for (const protection of ['migration-only', 'db-pin', 'legacy-pin', 'queue', 'unknown-pin']) {
    const f = fixture(t);
    const state = { 'app-server-migrated-pinned-thread-ids-by-host': { 'fixture-host': [parent] } };
    if (protection === 'db-pin') f.update('UPDATE threads SET is_pinned = 1 WHERE id = ?', parent);
    if (protection === 'legacy-pin') state['pinned-thread-ids'] = [parent];
    if (protection === 'queue') state['queued-follow-ups'] = { [parent]: ['fixture input'] };
    if (protection === 'unknown-pin') state['future-pinned-records'] = [parent];
    writeFileSync(join(f.home, '.codex-global-state.json'), JSON.stringify(state));
    const plan = makePlan(await inspectSessions(f.home), parent);
    assert.equal(plan.problems.length > 0, protection !== 'migration-only', protection);
  }
});

test('unfinished goals, legacy pins, queues, and automation files protect referenced sessions', async t => {
  const f = fixture(t);
  const db = new DatabaseSync(join(f.home, 'goals_1.sqlite'));
  db.exec('CREATE TABLE thread_goals (thread_id TEXT, status TEXT)');
  db.prepare('INSERT INTO thread_goals VALUES (?, ?)').run(child, 'paused');
  db.close();
  writeFileSync(join(f.home, '.codex-global-state.json'), JSON.stringify({ 'pinned-thread-ids': [parent], 'queued-follow-ups': { [other]: [] } }));
  mkdirSync(join(f.home, 'automations', 'fixture'), { recursive: true });
  writeFileSync(join(f.home, 'automations', 'fixture', 'automation.toml'), `targetThreadId = "${child}"\n`);
  const snapshot = await inspectSessions(f.home);
  assert.ok(snapshot.sessions.every(row => row.reasons.length));
  assert.match(makePlan(snapshot, parent).problems.join('\n'), /unfinished-goal/);
  assert.match(makePlan(snapshot, parent).problems.join('\n'), /automation-reference/);
});

test('app database references protect sessions; an unknown schema blocks all deletion', async t => {
  const f = fixture(t);
  mkdirSync(join(f.home, 'sqlite'));
  const db = new DatabaseSync(join(f.home, 'sqlite', 'codex-dev.db'));
  db.exec('CREATE TABLE automations (target_thread_id TEXT); CREATE TABLE automation_runs (thread_id TEXT); CREATE TABLE inbox_items (thread_id TEXT)');
  db.prepare('INSERT INTO automations VALUES (?)').run(child);
  db.close();
  assert.match(makePlan(await inspectSessions(f.home), parent).problems.join('\n'), /automation-or-inbox/);
  writeFileSync(join(f.home, 'goals_2.sqlite'), 'unknown');
  assert.match(makePlan(await inspectSessions(f.home), other).problems.join('\n'), /Unknown goals/);
});

test('missing or outside rollouts, malformed protection data, cycles, and dangling descendants fail closed', async t => {
  const f = fixture(t);
  f.update('UPDATE threads SET rollout_path = ? WHERE id = ?', join(f.home, 'outside.jsonl'), parent);
  writeFileSync(join(f.home, '.codex-global-state.json'), '{');
  let snapshot = await inspectSessions(f.home);
  assert.match(makePlan(snapshot, parent).problems.join('\n'), /unsafe/);
  assert.match(makePlan(snapshot, parent).problems.join('\n'), /could not be inspected/);
  snapshot.edges.push({ parent: child, child: parent });
  assert.match(makePlan(snapshot, parent).problems.join('\n'), /Cyclic/);
  snapshot.edges = [{ parent, child: '00000000-0000-4000-8000-000000000099' }];
  assert.match(makePlan(snapshot, parent).problems.join('\n'), /missing from the index/);
});

test('list filtering, limits, help, and invalid arguments never invoke deletion', async t => {
  const f = fixture(t), output = [];
  const options = { home: f.home, platform: 'win32', log: line => output.push(line), cli: () => assert.fail('Must not run CLI') };
  assert.equal(await runSessions(['list', '--before', '1970-01-01', '--limit', '0'], options), 0);
  assert.match(output.join('\n'), /matching: 0/);
  for (const args of [['delete', '--force'], ['plan', 'a title'], ['list', '--before', '2026-02-30'], ['list', '--limit', '-1'], ['list', '--limit', '1', '--limit', '2'], ['help', 'extra']]) {
    assert.equal(await runSessions(args, options), 2);
  }
  assert.equal(await runSessions(['help'], { ...options, inspect: () => assert.fail() }), 0);
  assert.equal(await runSessions(['plan', parent], options), 0);
  assert.equal(await runSessions(['delete', parent], { ...options, interactive: false }), 1);
  assert.equal(await runSessions(['delete'], { ...options, interactive: false }), 2);
  assert.equal(await runSessions(['delete'], { ...options, interactive: true, ask: async () => '' }), 0);
});

function deletionOptions(f) {
  return { home: f.home, platform: 'win32', interactive: true, log() {}, closed() {},
    ask: async () => `DELETE ${parent}`, cli: args => {
      if (args[0] === '--version') return { status: 0, stdout: 'codex-cli 7.2.0\n' };
      assert.deepEqual(args, [args[0], '--help']);
      assert.ok(['archive', 'delete'].includes(args[0]));
      return { status: 0, stdout: `Usage: codex ${args[0]} [OPTIONS] <SESSION>\nOptions:\n      --force\n` };
    } };
}

test('cancellation, unsupported CLI interface, active clients, and new descendant changes prevent deletion', async t => {
  const f = fixture(t), base = deletionOptions(f);
  assert.equal(await runSessions(['delete', parent], { ...base, ask: async () => 'y' }), 0);
  assert.equal(await runSessions(['delete', parent], { ...base, cli: () => ({ status: 0, stdout: 'codex-cli 9.0.0' }) }), 1);
  assert.equal(await runSessions(['delete', parent], { ...base, closed: () => { throw new Error('running'); } }), 1);
  assert.equal(await runSessions(['delete', parent], { ...base, ask: async () => {
    f.update('INSERT INTO thread_spawn_edges VALUES (?, ?)', child, other);
    return `DELETE ${parent}`;
  } }), 1);
});

test('confirmation is followed by protection and rollout change rechecks', async t => {
  for (const mutation of [f => f.update('UPDATE threads SET is_pinned = 1 WHERE id = ?', child),
    f => writeFileSync(join(f.home, 'sessions', `${child}.jsonl`), 'changed')]) {
    const f = fixture(t);
    assert.equal(await runSessions(['delete', parent], { ...deletionOptions(f), ask: async () => {
      mutation(f); return `DELETE ${parent}`;
    } }), 1);
  }
});

test('official deletion is invoked once with a fixed UUID and its result is verified on fixtures only', async t => {
  const f = fixture(t), base = deletionOptions(f), calls = [];
  assert.equal(await runSessions(['delete', parent], { ...base, cli: args => {
    calls.push(args);
    if (args[0] === '--version' || args.at(-1) === '--help') return base.cli(args);
    assert.deepEqual(args, ['delete', parent, '--force']);
    // Simulated official command: only disposable fixture files are removed by the test.
    for (const id of [parent, child]) {
      f.update('DELETE FROM threads WHERE id = ?', id);
      rmSync(join(f.home, 'sessions', `${id}.jsonl`));
    }
    f.update('DELETE FROM thread_spawn_edges WHERE parent_thread_id = ?', parent);
    return { status: 0 };
  } }), 0);
  assert.equal(calls.length, 4);
  assert.deepEqual((await inspectSessions(f.home)).sessions.map(row => row.id), [other]);
});

test('partial failures and false success do not retry or report success', async t => {
  const f = fixture(t), base = deletionOptions(f);
  for (const status of [0, 1, null]) {
    let deletes = 0;
    assert.equal(await runSessions(['delete', parent], { ...base, cli: args => {
      if (args[0] === '--version' || args.at(-1) === '--help') return base.cli(args);
      deletes++; return { status };
    } }), 1);
    assert.equal(deletes, 1);
  }
});

test('process detection fails closed and never kills a process', () => {
  for (const result of [{ status: 1 }, { status: 0, stdout: '' }, { status: 0, stdout: '1\n' }]) {
    assert.throws(() => assertClientsClosed({ platform: 'win32', spawn: () => result }));
  }
  assert.doesNotThrow(() => assertClientsClosed({ platform: 'win32', spawn: (command, args, options) => {
    assert.equal(command, 'pwsh'); assert.equal(options.windowsHide, true);
    assert.match(args.at(-1), /Get-CimInstance/); assert.doesNotMatch(args.at(-1), /Stop-Process/);
    return { status: 0, stdout: '{"processes":[]}\r\n' };
  } }));
  for (const platform of ['darwin', 'linux']) assert.throws(() => assertClientsClosed({ platform, spawn: () => assert.fail() }));
});

test('unsafe terminal controls and unexpected diagnostic content are not printed', async () => {
  assert.doesNotMatch(displayText('fixture\n\x1b[2J\u202e'), /[\n\x1b\u202e]/);
  const output = [];
  assert.equal(await runSessions(['list'], { log: line => output.push(line), inspect: () => { throw new Error('PRIVATE PATH AND CONTENT'); } }), 1);
  assert.doesNotMatch(output.join('\n'), /PRIVATE PATH/);
});

test('queued input protects descendants; inactive legacy goal files do not override default storage', async t => {
  const f = fixture(t);
  const db = new DatabaseSync(join(f.home, 'queue_1.sqlite'));
  db.exec('CREATE TABLE queued_items (thread_id TEXT)');
  db.prepare('INSERT INTO queued_items VALUES (?)').run(child);
  db.close();
  mkdirSync(join(f.home, 'sqlite'));
  writeFileSync(join(f.home, 'sqlite', 'goals_1.sqlite'), 'inactive legacy data');
  const snapshot = await inspectSessions(f.home);
  assert.deepEqual(snapshot.issues, []);
  assert.match(makePlan(snapshot, parent).problems.join('\n'), /queued-input/);
});

test('official command wrapper fixes the home, passes arguments as data, and hides the helper window', () => {
  const args = ['delete', parent, '--force'];
  runOfficialCodex(args, 'fixture-home', (command, forwarded, options) => {
    assert.equal(command, 'pwsh');
    assert.equal(options.cwd, 'fixture-home');
    assert.equal(options.env.CODEX_HOME, 'fixture-home');
    assert.deepEqual(JSON.parse(options.env.AGENT_CODEX_SESSION_ARGS), args);
    assert.equal(options.windowsHide, true);
    assert.doesNotMatch(forwarded.at(-1), new RegExp(parent));
    return { status: 0 };
  });
});

test('Windows wrapper preserves single and multiple arguments through a fake Codex executable', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t);
  writeFileSync(join(f.home, 'codex.ps1'), 'ConvertTo-Json -Compress -InputObject @($args)\nexit 0\n');
  for (const args of [['--version'], ['delete', parent, '--force']]) {
    const result = runOfficialCodex(args, f.home, (command, forwarded, options) => spawnSync(command, forwarded, {
      ...options, env: { ...options.env, PATH: `${f.home}${delimiter}${process.env.PATH}` },
    }));
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), args);
  }
});

test('Windows combined version guard starts deletion only for the reviewed CLI', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t), marker = join(f.home, 'called.txt');
  writeFileSync(join(f.home, 'codex.ps1'), `if($args[0] -eq '--version') { Write-Output 'codex-cli 0.159.2'; exit 0 }\nSet-Content -LiteralPath (Join-Path $env:CODEX_HOME 'called.txt') -Value 'fixture'\nConvertTo-Json -Compress -InputObject @($args)\nexit 0\n`);
  const launch = (command, args, options) => spawnSync(command, args, {
    ...options, env: { ...options.env, PATH: `${f.home}${delimiter}${process.env.PATH}` },
  });
  const args = ['delete', parent, '--force'];
  let result = runOfficialCodex(args, f.home, launch, 'codex-cli 0.159.3');
  assert.equal(result.status, 91);
  assert.match(result.stderr, /AGENT_CODEX_VERSION_GUARD/);
  assert.equal(existsSync(marker), false);
  result = runOfficialCodex(args, f.home, launch, 'codex-cli 0.159.2');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), args);
  assert.equal(existsSync(marker), true);
});

test('unsupported deletion stops before asking for a UUID or inspecting storage', async () => {
  for (const platform of ['darwin', 'linux']) assert.equal(await runSessions(['delete'], {
    platform, interactive: true, log() {}, ask: () => assert.fail(), inspect: () => assert.fail(),
  }), 1);
});

test('date and week selectors are strict, exclusive, and fixed to the invocation time', () => {
  const now = Date.parse('2026-09-10T12:34:56Z');
  const options = parseSessionArgs(['delete', '--older-than-weeks', '4'], now);
  assert.equal(options.before, now - 28 * 86400000);
  for (const value of [['4w'], ['4weeks'], ['4', 'weeks'], ['4 weeks'], ['4W']]) {
    assert.equal(parseSessionArgs(['list', '--before', ...value, '--limit', '0'], now).before, options.before);
    assert.equal(parseSessionArgs(['list', '--before', ...value, '--limit', '0'], now).limit, 0);
  }
  assert.equal(parseSessionArgs(['plan', '--before', '1', 'week'], now).before, now - 7 * 86400000);
  for (const value of ['4wweks', '4', '0w', '-4w', '1.5w', '999999999999999999w', '4 weeks ago']) {
    assert.throws(() => parseSessionArgs(['delete', '--before', value], now), /Invalid cutoff/);
  }
  assert.throws(() => parseSessionArgs(['delete', '--before', '4', 'weeks', '--before', '2026-07-01'], now), /Repeated option/);
  assert.equal(parseSessionArgs(['plan', 'archive', '--before', '2026-07-01']).operation, 'archive');
  for (const args of [['delete', parent, '--before', '2026-07-01'], ['archive', '--older-than-weeks', '0'],
    ['export', '--older-than-weeks', '1.5'], ['list', '--before', '2026-07-01', '--older-than-weeks', '4'],
    ['delete', '--limit', '1'], ['archive', '--output', 'fixture']]) assert.throws(() => parseSessionArgs(args, now));
});

test('bulk selection deduplicates roots and skips entire protected or newer families', async t => {
  const f = fixture(t), options = parseSessionArgs(['delete', '--before', '2026-07-01']);
  let plan = selectPlan(await inspectSessions(f.home), options);
  assert.deepEqual(plan.groups.map(group => group.root), [parent, other]);
  assert.equal(plan.sessions.length, 3);
  f.update('UPDATE threads SET updated_at_ms = ? WHERE id = ?', options.before, child);
  plan = selectPlan(await inspectSessions(f.home), options);
  assert.deepEqual(plan.sessions.map(row => row.id), [other]);
  assert.match(plan.skipped[0].problems.join('\n'), /outside the selected period/);
  f.update('UPDATE threads SET updated_at_ms = 100000, is_pinned = 1 WHERE id = ?', child);
  plan = selectPlan(await inspectSessions(f.home), options);
  assert.deepEqual(plan.sessions.map(row => row.id), [other]);
  assert.match(plan.skipped[0].problems.join('\n'), /pinned/);
  f.update('INSERT INTO thread_spawn_edges VALUES (?, ?)', child, parent);
  assert.match(selectPlan(await inspectSessions(f.home), options).problems.join('\n'), /cyclic/);
});

test('archive filters already archived roots but includes children when archiving an active root', async t => {
  const f = fixture(t);
  f.update('UPDATE threads SET archived = 1 WHERE id IN (?, ?)', child, other);
  const plan = selectPlan(await inspectSessions(f.home), parseSessionArgs(['archive', '--older-than-weeks', '4']));
  assert.deepEqual(plan.sessions.map(row => row.id), [parent, child]);
  assert.deepEqual(plan.groups.map(group => group.root), [parent]);
});

const confirmPrompt = async prompt => prompt.match(/^Type (.+) to /)?.[1] ?? assert.fail('Unexpected prompt');

function forkMetadata(home, id, base, { archived = false } = {}) {
  const dir = join(home, archived ? 'archived_sessions' : 'sessions');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.jsonl`), `${JSON.stringify({ type: 'session_meta', payload: {
    id, forked_from_id: base, ...(base ? { history_base: { thread_id: base, end_ordinal_exclusive: 1 } } : {}),
  } })}\n`);
}

test('eligible referencing forks are deleted before their parents in the same invocation', async t => {
  const f = fixture(t), base = deletionOptions(f), calls = [], output = [];
  forkMetadata(f.home, other, parent);
  assert.equal(await runSessions(['delete', '--before', '2026-07-01'], {
    ...base, ask: confirmPrompt, log: line => output.push(line), cli: args => {
      if (args[0] === '--version' || args.at(-1) === '--help') return base.cli(args);
      calls.push(args[1]);
      for (const id of args[1] === parent ? [parent, child] : [other]) {
        f.update('DELETE FROM threads WHERE id=?', id);
        rmSync(join(f.home, 'sessions', `${id}.jsonl`));
      }
      f.update('DELETE FROM thread_spawn_edges WHERE parent_thread_id=?', args[1]);
      return { status: 0 };
    },
  }), 0);
  assert.deepEqual(calls, [other, parent]);
  assert.doesNotMatch(output.join('\n'), /Retain session/);
  assert.equal((await inspectSessions(f.home)).sessions.length, 0);
});

test('newer or protected forks retain their ancestors without expanding the cutoff', async t => {
  for (const reason of ['newer', 'protected']) {
    const f = fixture(t);
    forkMetadata(f.home, other, parent);
    if (reason === 'newer') f.update('UPDATE threads SET updated_at_ms=? WHERE id=?', Date.parse('2026-10-01'), other);
    else f.update('UPDATE threads SET is_pinned=1 WHERE id=?', other);
    const snapshot = await inspectDeletionReferences(await inspectSessions(f.home));
    const plan = selectPlan(snapshot, { operation: 'delete', before: Date.parse('2026-07-01') });
    assert.equal(plan.sessions.length, 0);
    assert.match(plan.skipped.find(group => group.root === parent).problems.join('\n'), new RegExp(`fork session ${other}`));
  }
});

test('fork cycles and transitive external dependencies retain all affected ancestors', async t => {
  for (const cycle of [false, true]) {
    const f = fixture(t), orphan = '00000000-0000-4000-8000-000000000099';
    forkMetadata(f.home, other, parent);
    forkMetadata(f.home, cycle ? parent : orphan, other);
    const plan = selectPlan(await inspectDeletionReferences(await inspectSessions(f.home)), { operation: 'delete', before: Infinity });
    assert.equal(plan.sessions.length, 0);
    assert.equal(plan.skipped.length, 2);
    if (cycle) assert.ok(plan.skipped.every(group => /cyclic fork/.test(group.problems.join('\n'))));
  }
});

test('branching fork history waits for every eligible referencer and propagates exclusions through the branch', () => {
  const ids = Array.from({ length: 5 }, (_, n) => `00000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`);
  const reference = (source, target) => ({ source: ids[source], rollout: ids[source], target: ids[target] });
  for (const external of [false, true]) {
    const snapshot = { home: 'synthetic-home', issues: [], edges: [],
      sessions: ids.slice(0, 4).map(id => ({ id, reasons: [], updated: 0, size: 1 })),
      deletionReferences: [reference(1, 0), reference(2, 0), reference(3, 1), reference(2, 0),
        ...(external ? [reference(4, 3)] : [])],
    };
    const plan = selectPlan(snapshot, { operation: 'delete', before: 1 });
    if (external) {
      assert.deepEqual(plan.groups.map(group => group.root), [ids[2]]);
      assert.deepEqual(new Set(plan.skipped.map(group => group.root)), new Set([ids[0], ids[1], ids[3]]));
    } else {
      const order = plan.groups.map(group => group.root);
      assert.equal(order.length, 4);
      assert.equal(new Set(order).size, 4);
      assert.ok(order.indexOf(ids[3]) < order.indexOf(ids[1]));
      assert.ok(order.indexOf(ids[1]) < order.indexOf(ids[0]));
      assert.ok(order.indexOf(ids[2]) < order.indexOf(ids[0]));
    }
  }
});

test('internal fork references are allowed and forked_from_id alone does not protect a parent', async t => {
  const f = fixture(t);
  forkMetadata(f.home, child, parent);
  writeFileSync(join(f.home, 'sessions', `${other}.jsonl`), `${JSON.stringify({ type: 'session_meta', payload: { id: other, forked_from_id: parent } })}\n`);
  const snapshot = await inspectDeletionReferences(await inspectSessions(f.home));
  assert.deepEqual(makePlan(snapshot, parent, 'delete').problems, []);
  assert.equal(snapshot.deletionReferences.length, 1);
});

test('archived and unindexed references exclude exported deletion without invalidating the export receipt', async t => {
  const f = renderableFixture(t), output = exportParent(t), snapshot = await inspectSessions(f.home);
  const plan = selectPlan(snapshot, { id: parent, operation: 'export' });
  const result = await exportSessions(snapshot, plan, output, { log() {} });
  const orphan = '00000000-0000-4000-8000-000000000099';
  forkMetadata(f.home, orphan, parent, { archived: true });
  const deleted = await planExportedDeletion(await inspectSessions(f.home), output, result.batch.id);
  assert.equal(deleted.sessions.length, 0);
  assert.match(deleted.skipped[0].problems.join('\n'), new RegExp(`fork session ${orphan}`));
  assert.doesNotMatch(deleted.skipped[0].problems.join('\n'), /metadata or descendant membership changed/);
});

test('a fork added during confirmation stops before the official delete', async t => {
  const f = fixture(t), base = deletionOptions(f), output = [];
  assert.equal(await runSessions(['delete', parent], {
    ...base, log: line => output.push(line), ask: async prompt => {
      forkMetadata(f.home, other, parent);
      return confirmPrompt(prompt);
    }, cli: args => {
      if (args[0] === '--version' || args.at(-1) === '--help') return base.cli(args);
      assert.fail('New external reference must prevent deletion');
    },
  }), 1);
  assert.match(output.join('\n'), /operation plan changed/);
});

test('unreadable or compressed-only reference metadata blocks deletion globally', async t => {
  const f = fixture(t), orphan = '00000000-0000-4000-8000-000000000099';
  const path = join(f.home, 'sessions', `${orphan}.jsonl`);
  writeFileSync(path, 'invalid json\n');
  let snapshot = await inspectDeletionReferences(await inspectSessions(f.home));
  assert.match(selectPlan(snapshot, { operation: 'delete', before: Infinity }).problems.join('\n'), /could not be inspected/);
  rmSync(path);
  writeFileSync(`${path}.zst`, 'compressed fixture');
  snapshot = await inspectDeletionReferences(await inspectSessions(f.home));
  assert.match(makePlan(snapshot, parent, 'delete').problems.join('\n'), /Compressed fork history/);
});

test('bulk deletion calls only roots once, verifies each family, and leaves excluded sessions intact', async t => {
  const f = fixture(t), base = deletionOptions(f), calls = [];
  assert.equal(await runSessions(['delete', '--older-than-weeks', '4'], { ...base, ask: async prompt => `  ${await confirmPrompt(prompt)}  `, cli: args => {
    if (args[0] === '--version' || args.at(-1) === '--help') return base.cli(args);
    calls.push(args[1]);
    for (const id of args[1] === parent ? [parent, child] : [other]) {
      f.update('DELETE FROM threads WHERE id = ?', id); rmSync(join(f.home, 'sessions', `${id}.jsonl`));
    }
    f.update('DELETE FROM thread_spawn_edges WHERE parent_thread_id = ?', args[1]);
    return { status: 0 };
  } }), 0);
  assert.deepEqual(calls, [parent, other]);
});

test('confirmation trimming still rejects blank, wrong-case, and changed internal spacing before deletion', async t => {
  const f = fixture(t), base = deletionOptions(f);
  for (const change of [() => '   ', value => value.toLowerCase(), value => value.replace(' ', '  ')]) {
    const output = [];
    assert.equal(await runSessions(['delete', '--older-than-weeks', '4'], {
      ...base, log: line => output.push(line), ask: async prompt => change(await confirmPrompt(prompt)),
      cli: args => {
        if (args[0] === '--version' || args.at(-1) === '--help') return base.cli(args);
        assert.fail('Unmatched confirmation must not invoke deletion');
      },
    }), 0);
    assert.match(output.join('\n'), /Cancelled; nothing changed/);
  }
});

test('archive verifies actual descendant moves; partial success stops the batch', async t => {
  for (const partial of [false, true]) {
    const f = fixture(t), base = deletionOptions(f), calls = [], output = [];
    mkdirSync(join(f.home, 'archived_sessions'));
    const result = await runSessions(['archive', '--before', '2026-07-01'], { ...base, ask: confirmPrompt, log: line => output.push(line), cli: args => {
      if (args[0] === '--version' || args.at(-1) === '--help') return base.cli(args);
      assert.equal(args.length, 2); calls.push(args[1]);
      for (const id of args[1] === parent ? (partial ? [parent] : [parent, child]) : [other]) {
        const target = join(f.home, 'archived_sessions', `${id}.jsonl`);
        renameSync(join(f.home, 'sessions', `${id}.jsonl`), target);
        f.update('UPDATE threads SET archived = 1, rollout_path = ? WHERE id = ?', target, id);
      }
      return { status: 0 };
    } });
    assert.equal(result, partial ? 1 : 0);
    assert.deepEqual(calls, partial ? [parent] : [parent, other]);
    if (partial) assert.match(output.join('\n'), /completion may be partial/);
  }
});

test('a change to a remaining family stops after already verified roots, with no retry', async t => {
  const f = fixture(t), base = deletionOptions(f), calls = [], output = [];
  assert.equal(await runSessions(['delete', '--older-than-weeks', '4'], { ...base, ask: confirmPrompt, log: line => output.push(line), cli: args => {
    if (args[0] === '--version' || args.at(-1) === '--help') return base.cli(args);
    calls.push(args[1]);
    for (const id of [parent, child]) { f.update('DELETE FROM threads WHERE id = ?', id); rmSync(join(f.home, 'sessions', `${id}.jsonl`)); }
    f.update('DELETE FROM thread_spawn_edges WHERE parent_thread_id = ?', parent);
    f.update('UPDATE threads SET is_pinned = 1 WHERE id = ?', other);
    return { status: 0 };
  } }), 1);
  assert.deepEqual(calls, [parent]);
  assert.match(output.join('\n'), new RegExp(`Verified roots: ${parent}`));
});

function exportParent(t) {
  const output = mkdtempSync(join(tmpdir(), 'agent-export-test-'));
  t.after(() => rmSync(output, { recursive: true, force: true }));
  return output;
}

function historyFixture(f) {
  const db = new DatabaseSync(join(f.home, 'thread_history_1.sqlite'));
  for (const table of ['thread_turns', 'thread_items', 'thread_realtime_items']) {
    db.exec(`CREATE TABLE ${table} (thread_id TEXT, rollout_ordinal INTEGER, item_json TEXT)`);
    for (const id of [parent, child, other]) db.prepare(`INSERT INTO ${table} VALUES (?, 1, ?)`).run(id, JSON.stringify({ text: id === other ? 'UNSELECTED PRIVATE CONTENT' : '日本語 history' }));
  }
  db.exec('CREATE TABLE thread_history_projection_state (thread_id TEXT, next_rollout_byte_offset INTEGER)');
  db.close();
  f.update("UPDATE threads SET history_mode = 'paginated'");
}

function rolloverHistoryFixture(t) {
  const f = renderableFixture(t);
  historyFixture(f);
  const rolloutId = '00000000-0000-4000-8000-000000000004';
  const path = join(f.home, 'sessions', `${parent}_${rolloutId}.jsonl`);
  renameSync(join(f.home, 'sessions', `${parent}.jsonl`), path);
  f.update('UPDATE threads SET rollout_path = ? WHERE id = ?', path, parent);
  const db = new DatabaseSync(join(f.home, 'thread_history_1.sqlite'));
  for (const table of ['thread_turns', 'thread_items', 'thread_realtime_items']) {
    db.prepare(`UPDATE ${table} SET thread_id = ? WHERE thread_id = ?`).run(rolloutId, parent);
  }
  db.prepare('INSERT INTO thread_history_projection_state VALUES (?, 123)').run(rolloutId);
  db.close();
  return { ...f, rolloutId };
}

test('export preserves all four indexed history tables keyed by a distinct rollout ID', async t => {
  const f = rolloverHistoryFixture(t), output = exportParent(t);
  await saveBatch(f, output);
  const bundle = listBundles(output).find(bundle => bundle.manifest.session.id === parent);
  const rows = readFileSync(join(bundle.folder, 'history.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  assert.deepEqual(rows.map(value => value.table).sort(), ['thread_history_projection_state', 'thread_items', 'thread_realtime_items', 'thread_turns']);
  assert.ok(rows.every(value => value.row.thread_id === f.rolloutId));
});

test('changes only to rollout-keyed DB rows block deletion for all four tables', async t => {
  for (const table of HISTORY_TABLES) for (const mutation of ['insert', 'update', 'delete']) {
    const f = rolloverHistoryFixture(t), output = exportParent(t);
    const { batch } = await saveBatch(f, output);
    const db = new DatabaseSync(join(f.home, 'thread_history_1.sqlite'));
    if (mutation === 'insert') db.prepare(`INSERT INTO ${table} SELECT * FROM ${table} WHERE thread_id = ?`).run(f.rolloutId);
    else if (mutation === 'delete') db.prepare(`DELETE FROM ${table} WHERE thread_id = ?`).run(f.rolloutId);
    else db.prepare(`UPDATE ${table} SET ${table === 'thread_history_projection_state' ? 'next_rollout_byte_offset = 456' : "item_json = 'changed history'"} WHERE thread_id = ?`).run(f.rolloutId);
    db.close();
    const plan = await planExportedDeletion(await inspectSessions(f.home), output, batch.id);
    assert.equal(plan.groups.length, 0, `${table}/${mutation}`);
    assert.match(plan.skipped[0].problems[0], /Indexed history changed/);
    const base = deletionOptions(f);
    let calls = 0;
    assert.equal(await runSessions(['delete', '--exported', batch.id, '--in', output], { ...base, ask: () => assert.fail('No deletion confirmation'), cli(args) {
      if (args[0] === 'delete' && args[1] !== '--help') { calls++; return { status: 1 }; }
      return base.cli(args);
    } }), 3);
    assert.equal(calls, 0);
  }
});

test('multiple owned rollout generations and legacy DB rows are saved once in deterministic order', async t => {
  const f = rolloverHistoryFixture(t), output = exportParent(t);
  const extraId = '00000000-0000-4000-8000-000000000005';
  const extra = join(f.home, 'sessions', `${parent}_${extraId}.jsonl`);
  writeFileSync(extra, `${JSON.stringify({ type: 'session_meta', payload: { id: parent } })}\n`);
  const db = new DatabaseSync(join(f.home, 'thread_history_1.sqlite'));
  for (const table of HISTORY_TABLES) for (const id of [extraId, parent]) {
    db.prepare(`INSERT INTO ${table} SELECT ?, ${table === 'thread_history_projection_state' ? 'next_rollout_byte_offset' : 'rollout_ordinal, item_json'} FROM ${table} WHERE thread_id = ?`).run(id, f.rolloutId);
  }
  db.close();
  const { batch } = await saveBatch(f, output);
  const bundle = listBundles(output).find(bundle => bundle.manifest.session.id === parent);
  const rows = readFileSync(join(bundle.folder, 'history.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rows.length, 12);
  assert.deepEqual(rows.map(({ row }) => row.thread_id), HISTORY_TABLES.flatMap(() => [parent, f.rolloutId, extraId]));
  assert.deepEqual(bundle.manifest.coverage.indexedHistory.ids, [parent, f.rolloutId, extraId]);
  await verifyBundle(bundle);
  assert.equal((await saveBatch(f, output)).skipped.length, 2);
  assert.equal((await planExportedDeletion(await inspectSessions(f.home), output, batch.id)).groups.length, 1);
  rmSync(extra);
  const removed = await planExportedDeletion(await inspectSessions(f.home), output, batch.id);
  assert.equal(removed.groups.length, 0);
  assert.match(removed.skipped[0].problems[0], /owned rollout IDs changed/);
});

test('old v2 snapshots stay readable but require a new export before deletion', async t => {
  const f = renderableFixture(t), output = exportParent(t), { batch } = await saveBatch(f, output);
  const bundles = listBundles(output);
  for (const bundle of bundles) {
    delete bundle.manifest.coverage.indexedHistory;
    bundle.manifest.contentDigest = snapshotDigest(bundle.manifest);
    writeFileSync(join(bundle.folder, 'manifest.json'), JSON.stringify(bundle.manifest));
    batch.entries.find(entry => entry.key === bundle.key).digest = bundle.manifest.contentDigest;
    await verifyBundle(bundle);
    const outputLines = [];
    assert.equal(await runHistory(['read', bundle.key, '--in', output], { log: line => outputLines.push(line) }), 0);
    assert.match(outputLines.join('\n'), /Fixture conversation/);
  }
  const { digest, ...body } = batch;
  writeFileSync(join(output, 'batches', `${batch.id}.json`), JSON.stringify({ ...body, digest: fingerprint(body) }));
  const plan = await planExportedDeletion(await inspectSessions(f.home), output, batch.id);
  assert.equal(plan.groups.length, 0);
  assert.match(plan.skipped[0].problems[0], /lacks owned-rollout indexed history coverage; export again/);
  const fresh = await saveBatch(f, output);
  assert.equal(fresh.folders.length, 2);
  assert.equal(fresh.skipped.length, 0);
  assert.equal((await planExportedDeletion(await inspectSessions(f.home), output, fresh.batch.id)).groups.length, 1);
});

test('indexed history ordering is stable for non-null, nullable, and differently collated primary keys', async t => {
  for (const mode of ['non-null', 'nullable', 'collated-key']) {
    const nonNull = mode !== 'nullable';
    const f = renderableFixture(t), output = exportParent(t);
    historyFixture(f);
    const db = new DatabaseSync(join(f.home, 'thread_history_1.sqlite'));
    db.exec(`DROP TABLE thread_items;
      CREATE TABLE thread_items (thread_id TEXT NOT NULL, rollout_ordinal INTEGER NOT NULL,
        item_json TEXT, item_key TEXT ${mode === 'collated-key' ? 'COLLATE NOCASE' : ''} ${nonNull ? 'NOT NULL' : ''}, PRIMARY KEY (thread_id, item_key COLLATE BINARY));`);
    const insert = db.prepare('INSERT INTO thread_items VALUES (?, 1, ?, ?)');
    const values = mode === 'collated-key' ? [['A', 'a'], ['Z', 'A']] : [['A', nonNull ? 'b' : null], ['Z', nonNull ? 'a' : null]];
    for (const [text, key] of values) insert.run(parent, text, key);
    db.close();
    await saveBatch(f, output);
    const bundle = listBundles(output).find(bundle => bundle.manifest.session.id === parent);
    const rows = readFileSync(join(bundle.folder, 'history.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).filter(value => value.table === 'thread_items');
    assert.deepEqual(rows.map(value => value.row.item_json), nonNull ? ['Z', 'A'] : ['A', 'Z']);
    const writer = new DatabaseSync(join(f.home, 'thread_history_1.sqlite'));
    writer.exec('DELETE FROM thread_items');
    for (const [text, key] of [...values].reverse()) writer.prepare('INSERT INTO thread_items VALUES (?, 1, ?, ?)').run(parent, text, key);
    writer.close();
    assert.equal((await saveBatch(f, output)).skipped.length, 2);
  }
});

test('indexed history coverage tampering fails integrity and semantic verification', async t => {
  const f = rolloverHistoryFixture(t), output = exportParent(t);
  await saveBatch(f, output);
  const original = listBundles(output).find(bundle => bundle.manifest.session.id === parent);
  for (const change of [coverage => { coverage.ids = [parent]; }, coverage => { coverage.policy = 'unknown'; },
    coverage => { coverage.member = 'rollout.jsonl'; }, coverage => { coverage.present = false; }]) {
    const bundle = structuredClone(original);
    change(bundle.manifest.coverage.indexedHistory);
    await assert.rejects(verifyBundle(bundle), /metadata failed integrity/);
    bundle.manifest.contentDigest = snapshotDigest(bundle.manifest);
    await assert.rejects(verifyBundle(bundle), /Invalid indexed history coverage/);
  }
  const duplicate = structuredClone(original);
  duplicate.manifest.sources.push({ ...duplicate.manifest.sources[0] });
  duplicate.manifest.contentDigest = snapshotDigest(duplicate.manifest);
  await assert.rejects(verifyBundle(duplicate), /Invalid indexed history rollout inventory/);
});

test('export preserves raw and indexed history with verified hashes, without unrelated threads or source changes', async t => {
  const f = fixture(t), output = exportParent(t);
  historyFixture(f);
  f.update('UPDATE threads SET is_pinned = 1 WHERE id = ?', child);
  const snapshot = await inspectSessions(f.home);
  const options = parseSessionArgs(['export', parent, '--output', output]);
  const plan = selectPlan(snapshot, options);
  assert.deepEqual(plan.problems, []);
  const result = await exportSessions(snapshot, plan, output, { log() {} });
  assert.equal(result.folders.length, 2);
  const bundles = listBundles(output);
  assert.deepEqual(bundles.map(bundle => bundle.manifest.session.id).sort(), [parent, child]);
  for (const { folder, manifest } of bundles) {
    assert.equal(manifest.complete, true); assert.equal(manifest.restorable, false);
    assert.deepEqual(manifest.spawnEdges, snapshot.edges.filter(edge => edge.parent === manifest.session.id || edge.child === manifest.session.id).map(edge => ({ ...edge })));
    for (const file of manifest.files) {
      const content = readFileSync(join(folder, file.file));
      assert.equal(createHash('sha256').update(content).digest('hex'), file.sha256);
      assert.doesNotMatch(content.toString(), /UNSELECTED PRIVATE CONTENT/);
    }
    assert.ok(manifest.files.find(file => file.file === 'history.jsonl').records > 0);
  }
  assert.deepEqual(await inspectSessions(f.home), snapshot);
});

test('export works from the command on non-Windows, asks once, and never invokes the official CLI', async t => {
  const f = fixture(t), output = exportParent(t);
  assert.equal(await runSessions(['export', '--older-than-weeks', '4', '--output', output, '--after', 'keep'], {
    home: f.home, platform: 'linux', interactive: true, log() {}, ask: confirmPrompt,
    closed: () => assert.fail(), cli: () => assert.fail(),
  }), 3); // Fixture contains no recognized conversation messages: explicitly partial.
  assert.equal(listBundles(output).length, 3);
  assert.equal(listBatches(output).length, 1);
});

test('streamed export preserves large UTF-8 rollouts, many history rows, and empty history files', async t => {
  const f = fixture(t), output = exportParent(t);
  historyFixture(f);
  const raw = `${JSON.stringify({ text: '日本語🙂'.repeat(20000) })}\n`;
  writeFileSync(join(f.home, 'sessions', `${parent}.jsonl`), raw);
  const db = new DatabaseSync(join(f.home, 'thread_history_1.sqlite'));
  const payload = JSON.stringify({ text: '日本語🙂'.repeat(100) });
  try {
    db.exec('BEGIN');
    for (const table of ['thread_turns', 'thread_items', 'thread_realtime_items']) {
      db.prepare(`DELETE FROM ${table} WHERE thread_id = ?`).run(child);
    }
    const insert = db.prepare('INSERT INTO thread_items VALUES (?, ?, ?)');
    for (let i = 2; i <= 1001; i++) insert.run(parent, i, payload);
    db.exec('COMMIT');
  } finally { db.close(); }
  const snapshot = await inspectSessions(f.home), plan = selectPlan(snapshot, parseSessionArgs(['export', parent]));
  await exportSessions(snapshot, plan, output, { log() {} });
  const bundles = listBundles(output);
  const { folder, manifest } = bundles.find(bundle => bundle.manifest.session.id === parent);
  const rollout = manifest.files.find(file => file.file === 'rollout.jsonl');
  const history = manifest.files.find(file => file.file === 'history.jsonl');
  assert.equal(rollout.bytes, Buffer.byteLength(raw));
  assert.equal(readFileSync(join(folder, rollout.file), 'utf8'), raw);
  const rows = readFileSync(join(folder, history.file), 'utf8').trimEnd().split('\n').map(JSON.parse);
  assert.equal(rows.length, history.records);
  assert.equal(rows.length, 1003);
  assert.deepEqual(rows.filter(row => row.table === 'thread_items').slice(1).map(row => row.row.item_json), Array(1000).fill(payload));
  const childBundle = bundles.find(bundle => bundle.manifest.session.id === child);
  const empty = childBundle.manifest.files.find(file => file.file === 'history.jsonl');
  assert.equal(empty.records, 0);
  assert.equal(readFileSync(join(childBundle.folder, empty.file)).length, 0);
  assert.equal(empty.sha256, createHash('sha256').digest('hex'));
  assert.deepEqual(await inspectSessions(f.home), snapshot);
});

test('export rejects rollout size drift even before final metadata inspection', async t => {
  const f = fixture(t), output = exportParent(t);
  const snapshot = await inspectSessions(f.home), plan = selectPlan(snapshot, parseSessionArgs(['export', parent]));
  await assert.rejects(exportSessions(snapshot, plan, output, {
    inspect: () => assert.fail('Size mismatch should stop before final inspection'),
    log(line) {
      if (line === 'Progress: Read indexed history') writeFileSync(join(f.home, 'sessions', `${parent}.jsonl`), '{"changed":true,"extra":1}\n');
    },
  }), /Source rollout size changed/);
  const [folder] = readdirSync(output);
  assert.equal(existsSync(join(output, folder, 'manifest.json')), false);
});

test('export refuses missing indexed history and unsafe destinations before creating a bundle', async t => {
  const f = fixture(t), output = exportParent(t);
  f.update("UPDATE threads SET history_mode = 'paginated' WHERE id = ?", parent);
  const snapshot = await inspectSessions(f.home), plan = selectPlan(snapshot, parseSessionArgs(['export', parent]));
  await assert.rejects(exportSessions(snapshot, plan, output, { log() {} }), /Indexed history is required/);
  assert.deepEqual(readdirSync(output), []);
  await assert.rejects(exportSessions(snapshot, plan, f.home, { log() {} }), /outside CODEX_HOME/);
  mkdirSync(join(output, '.git'));
  await assert.rejects(exportSessions(snapshot, plan, output, { log() {} }), /outside Git/);
});

test('failed revalidation leaves an explicitly incomplete export, with no completed manifest', async t => {
  const f = fixture(t), output = exportParent(t);
  const snapshot = await inspectSessions(f.home), plan = selectPlan(snapshot, parseSessionArgs(['export', parent]));
  await assert.rejects(exportSessions(snapshot, plan, output, { log() {}, inspect: async () => {
    f.update('UPDATE threads SET updated_at_ms = updated_at_ms + 1 WHERE id = ?', child);
    return inspectSessions(f.home);
  } }), /changed during export/);
  const [folder] = readdirSync(output);
  assert.ok(folder);
  assert.equal(existsSync(join(output, folder, 'manifest.json')), false);
  assert.ok(existsSync(join(output, folder, 'README.txt')));
});

test('export detects history-only WAL commits and a newly created history database', async t => {
  for (const existing of [true, false]) {
    const f = fixture(t), output = exportParent(t);
    if (existing) historyFixture(f);
    const writer = existing ? new DatabaseSync(join(f.home, 'thread_history_1.sqlite')) : null;
    if (writer) writer.exec('PRAGMA journal_mode=WAL');
    const snapshot = await inspectSessions(f.home), plan = selectPlan(snapshot, parseSessionArgs(['export', parent]));
    try {
      await assert.rejects(exportSessions(snapshot, plan, output, { log(line) {
        if (line !== 'Progress: Reinspect source session metadata') return;
        if (writer) writer.prepare('UPDATE thread_items SET item_json = ? WHERE thread_id = ?').run('"changed"', parent);
        else { const created = new DatabaseSync(join(f.home, 'thread_history_1.sqlite')); created.close(); }
      } }), /Indexed history (changed|appeared) during operation/);
    } finally { writer?.close(); }
    const [folder] = readdirSync(output);
    assert.ok(folder);
    assert.equal(existsSync(join(output, folder, 'manifest.json')), false);
    assert.deepEqual(await inspectSessions(f.home), snapshot);
  }
});

test('interactive week and date selectors preview without running a mutation', async t => {
  const f = fixture(t);
  for (const selection of ['4w', '4weeks', '4 weeks', '2026-07-01']) {
    const output = [];
    assert.equal(await runSessions(['plan'], { home: f.home, interactive: true,
      ask: async () => selection, log: line => output.push(line), cli: () => assert.fail(),
    }), 0);
    assert.match(output.join('\n'), /delete plan: 3 session/);
  }
});

test('newly eligible families after confirmation are not silently added to a batch', async t => {
  const f = fixture(t), base = deletionOptions(f);
  f.update('UPDATE threads SET is_pinned = 1 WHERE id = ?', other);
  assert.equal(await runSessions(['delete', '--older-than-weeks', '4'], { ...base, ask: async prompt => {
    f.update('UPDATE threads SET is_pinned = 0 WHERE id = ?', other);
    return confirmPrompt(prompt);
  } }), 1);
});

test('empty bulk selections create no export directory and never prompt or invoke a mutation', async t => {
  const f = fixture(t), output = exportParent(t);
  for (const action of ['archive', 'delete', 'export']) {
    assert.equal(await runSessions([action, '--before', '1970-01-01', ...(action === 'export' ? ['--output', output] : [])], {
      ...deletionOptions(f), ask: () => assert.fail(),
    }), 0);
  }
  assert.deepEqual(readdirSync(output), []);
});

function renderableFixture(t) {
  const f = fixture(t);
  for (const id of [parent, child, other]) writeFileSync(join(f.home, 'sessions', `${id}.jsonl`),
    `${JSON.stringify({ type: 'session_meta', payload: { id, history_mode: 'legacy' } })}\n${JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Fixture conversation' }] } })}\n`);
  return f;
}
async function saveBatch(f, output, selection = [parent]) {
  const snapshot = await inspectSessions(f.home);
  return exportSessions(snapshot, selectPlan(snapshot, parseSessionArgs(['export', ...selection])), output, { log() {} });
}
async function previewToken(f, args) {
  const output = [];
  assert.equal(await runSessions(['plan', ...args], { home: f.home, interactive: false, log: line => output.push(line), cli: () => assert.fail(), ask: () => assert.fail() }), 0);
  const token = output.find(line => line.startsWith('Confirmation token: '))?.slice('Confirmation token: '.length);
  assert.match(token, /^[0-9a-f]{64}$/); return token;
}

test('export tokens support non-interactive period selection and bind the destination', async t => {
  const f = renderableFixture(t), output = exportParent(t), different = exportParent(t);
  const token = await previewToken(f, ['export', '--before', '4w', '--output', output]);
  const options = { home: f.home, interactive: false, log() {}, cli: () => assert.fail(), ask: () => assert.fail() };
  assert.equal(await runSessions(['export', '--before', '4w', '--output', different, '--confirm', token], options), 1);
  assert.deepEqual(readdirSync(different), []);
  assert.equal(await runSessions(['export', '--before', '4w', '--output', output, '--confirm', token, '--after', 'review-delete'], options), 0);
  assert.equal(listBatches(output)[0].entries.length, 3);
  assert.ok(listBatches(output)[0].selection.before.endsWith('Z'));
  assert.equal((await inspectSessions(f.home)).sessions.length, 3);
});

test('four-week export followed by deletion removes eligible fork and parent in one reviewed run', async t => {
  const f = renderableFixture(t), output = exportParent(t), base = deletionOptions(f), calls = [];
  const path = join(f.home, 'sessions', `${parent}.jsonl`);
  const raw = readFileSync(path, 'utf8').replace('"history_mode":"legacy"', '"history_mode":"paginated"');
  writeFileSync(path, raw);
  const fork = join(f.home, 'sessions', `${other}.jsonl`);
  const lines = readFileSync(fork, 'utf8').trimEnd().split('\n');
  const meta = JSON.parse(lines[0]);
  meta.payload.history_base = { thread_id: parent, end_ordinal_exclusive: 2, end_byte_offset: Buffer.byteLength(raw) };
  lines[0] = JSON.stringify(meta);
  writeFileSync(fork, `${lines.join('\n')}\n`);
  assert.equal(await runSessions(['export', '--before', '4w', '--output', output, '--after', 'review-delete'], {
    ...base, ask: confirmPrompt, cli: args => {
      if (args[0] === '--version' || args.at(-1) === '--help') return base.cli(args);
      calls.push(args[1]);
      const batch = listBatches(output)[0];
      assert.ok(batch.entries.some(entry => entry.id === args[1]), 'Every deletion must have a published export');
      for (const id of args[1] === parent ? [parent, child] : [other]) {
        f.update('DELETE FROM threads WHERE id=?', id);
        rmSync(join(f.home, 'sessions', `${id}.jsonl`));
      }
      f.update('DELETE FROM thread_spawn_edges WHERE parent_thread_id=?', args[1]);
      return { status: 0 };
    },
  }), 0);
  assert.deepEqual(calls, [other, parent]);
  assert.equal((await inspectSessions(f.home)).sessions.length, 0);
  assert.equal(listBatches(output)[0].entries.length, 3);
});

test('incompletely exported forks also retain their otherwise fully exported parents', async t => {
  const f = renderableFixture(t), output = exportParent(t);
  writeFileSync(join(f.home, 'external.png'), 'uncollected fixture');
  const path = join(f.home, 'sessions', `${parent}.jsonl`);
  const raw = readFileSync(path, 'utf8').replace('"history_mode":"legacy"', '"history_mode":"paginated"');
  writeFileSync(path, raw);
  const meta = { type: 'session_meta', payload: { id: other, history_base: {
    thread_id: parent, end_ordinal_exclusive: 2, end_byte_offset: Buffer.byteLength(raw),
  } } };
  writeFileSync(join(f.home, 'sessions', `${other}.jsonl`), `${JSON.stringify(meta)}\n${JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'local_image', path: join(f.home, 'external.png') }] } })}\n`);
  const { batch } = await saveBatch(f, output, ['--before', '4w']);
  const plan = await planExportedDeletion(await inspectSessions(f.home), output, batch.id);
  assert.equal(plan.sessions.length, 0);
  assert.match(plan.skipped.find(group => group.root === other).problems.join('\n'), /attachment warnings/);
  assert.match(plan.skipped.find(group => group.root === parent).problems.join('\n'), new RegExp(`fork session ${other}`));
});

test('a portable export receipt deletes exactly its original family, never newly eligible sessions', async t => {
  const f = renderableFixture(t), output = exportParent(t), { batch } = await saveBatch(f, output);
  const moved = join(exportParent(t), 'relocated'); renameSync(output, moved);
  assert.equal(readBatch(moved, batch.id).digest, batch.digest);
  const selection = ['delete', '--exported', batch.id, '--in', moved];
  const token = await previewToken(f, selection), base = deletionOptions(f), calls = [];
  assert.equal(await runSessions([...selection, '--confirm', token], { ...base, interactive: false, ask: () => assert.fail(), cli: args => {
    if (args[0] === '--version' || args.at(-1) === '--help') return base.cli(args);
    assert.deepEqual(args, ['delete', parent, '--force']); calls.push(args[1]);
    for (const id of [parent, child]) { f.update('DELETE FROM threads WHERE id = ?', id); rmSync(join(f.home, 'sessions', `${id}.jsonl`)); }
    f.update('DELETE FROM thread_spawn_edges WHERE parent_thread_id = ?', parent);
    return { status: 0 };
  } }), 0);
  assert.deepEqual(calls, [parent]);
  assert.deepEqual((await inspectSessions(f.home)).sessions.map(row => row.id), [other]);
  const after = await planExportedDeletion(await inspectSessions(f.home), moved, batch.id);
  assert.equal(after.sessions.length, 0); assert.match(after.skipped[0].problems[0], /Already absent/);
});

test('exported deletion blocks changed content, new descendants, protections, missing files and warnings', async t => {
  for (const change of ['bytes', 'descendant', 'pin', 'missing', 'warning']) {
    const f = renderableFixture(t), output = exportParent(t);
    if (change === 'warning') writeFileSync(join(f.home, 'external.png'), 'uncollected fixture');
    if (change === 'warning') writeFileSync(join(f.home, 'sessions', `${child}.jsonl`), `${JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'local_image', path: join(f.home, 'external.png') }] } })}\n`);
    const { batch } = await saveBatch(f, output), snapshot = await inspectSessions(f.home);
    if (change === 'bytes') {
      const path = join(f.home, 'sessions', `${child}.jsonl`);
      writeFileSync(path, `${readFileSync(path, 'utf8')}${JSON.stringify({ type: 'event_msg', payload: { type: 'fixture_changed_content' } })}\n`);
    }
    if (change === 'descendant') f.update('INSERT INTO thread_spawn_edges VALUES (?, ?)', child, other);
    if (change === 'pin') f.update('UPDATE threads SET is_pinned = 1 WHERE id = ?', child);
    if (change === 'missing') rmSync(join(output, batch.entries[0].key, 'conversation.md'));
    const plan = await planExportedDeletion(change === 'bytes' ? snapshot : await inspectSessions(f.home), output, batch.id);
    assert.equal(plan.sessions.length, 0, change); assert.equal(plan.skipped.length, 1, change);
    if (change === 'bytes') assert.match(plan.skipped[0].problems[0], /content changed/);
  }
});

test('embedded media limitations permit deletion only after full raw history verification', async t => {
  for (const data of ['', 'Zh==']) {
    const f = renderableFixture(t), output = exportParent(t);
    const raw = `${JSON.stringify({ type: 'session_meta', payload: { id: child, history_mode: 'legacy' } })}\n`
      + `${JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [
        { type: 'input_image', image_url: `data:image/png;base64,${data}` },
      ] } })}\n`;
    writeFileSync(join(f.home, 'sessions', `${child}.jsonl`), raw);
    const args = ['export', '--before', '4w', '--output', output], logs = [];
    const token = await previewToken(f, args);
    assert.equal(await runSessions([...args, '--confirm', token], {
      home: f.home, interactive: false, log: text => logs.push(text),
      cli: () => assert.fail(), closed: () => assert.fail(), ask: () => assert.fail(),
    }), 3);
    assert.ok(logs.some(text => text.startsWith('Warning:') && text.includes('embedded-media')));
    assert.ok(logs.some(text => text.startsWith('Export complete:')));
    const [batch] = listBatches(output); assert.equal(batch.entries.length, 3);
    const eligible = await planExportedDeletion(await inspectSessions(f.home), output, batch.id);
    assert.equal(eligible.sessions.length, 3);
    // Raw history must still be present and fully verified despite rendering warnings.
    const childEntry = batch.entries.find(entry => entry.id === child);
    rmSync(join(output, childEntry.key, 'rollout.jsonl'));
    const plan = await planExportedDeletion(await inspectSessions(f.home), output, batch.id);
    assert.deepEqual(plan.sessions.map(row => row.id), [other]);
    assert.equal(plan.skipped.length, 1); assert.equal(plan.skipped[0].root, parent);
    assert.match(plan.skipped[0].problems[0], /verification failed|ENOENT/);
    assert.equal(readFileSync(join(f.home, 'sessions', `${child}.jsonl`), 'utf8'), raw);
  }
});

test('absent local attachments are recorded and a reappearing file stops deletion', async t => {
  const f = renderableFixture(t), output = exportParent(t), missing = join(f.home, 'missing.png');
  const raw = `${JSON.stringify({ type: 'session_meta', payload: { id: child, history_mode: 'legacy' } })}\n`
    + `${JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'local_image', path: missing }] } })}\n`;
  writeFileSync(join(f.home, 'sessions', `${child}.jsonl`), raw);
  const { batch } = await saveBatch(f, output);
  assert.equal((await planExportedDeletion(await inspectSessions(f.home), output, batch.id)).sessions.length, 2);
  writeFileSync(missing, 'new fixture attachment');
  const changed = await planExportedDeletion(await inspectSessions(f.home), output, batch.id);
  assert.equal(changed.sessions.length, 0);
  assert.match(changed.skipped[0].problems[0], /previously absent attachment/);
});

test('CLI export failures include safe source diagnostics and never announce completion', async t => {
  const f = renderableFixture(t), output = exportParent(t), logs = [];
  const path = join(f.home, 'sessions', `${parent}.jsonl`);
  writeFileSync(path, readFileSync(path, 'utf8') + 'SYNTHETIC SECRET RECORD\n');
  const args = ['export', parent, '--output', output], token = await previewToken(f, args);
  assert.equal(await runSessions([...args, '--confirm', token], {
    home: f.home, interactive: false, log: text => logs.push(text),
    cli: () => assert.fail(), closed: () => assert.fail(), ask: () => assert.fail(),
  }), 1);
  const error = logs.find(text => text.startsWith('Error:'));
  assert.match(error, new RegExp(`session ${parent}; phase render conversation and attachments; source rollout\\.jsonl`));
  assert.match(error, /Invalid JSON in history record at line 3/);
  assert.doesNotMatch(logs.join('\n'), /SYNTHETIC SECRET RECORD/);
  assert.deepEqual(listBundles(output), []); assert.deepEqual(listBatches(output), []);
  assert.ok(logs.some(text => text.startsWith('Incomplete export retained:')));
  assert.ok(!logs.some(text => text.startsWith('Export complete:')));
});

test('history-only changes invalidate exported deletion and stale confirmation never runs the CLI delete', async t => {
  const f = renderableFixture(t), output = exportParent(t); historyFixture(f);
  const { batch } = await saveBatch(f, output);
  const args = ['delete', '--exported', batch.id, '--in', output], token = await previewToken(f, args);
  const db = new DatabaseSync(join(f.home, 'thread_history_1.sqlite'));
  db.prepare('UPDATE thread_items SET item_json = ? WHERE thread_id = ?').run('changed', child); db.close();
  const plan = await planExportedDeletion(await inspectSessions(f.home), output, batch.id);
  assert.equal(plan.groups.length, 0); assert.match(plan.skipped[0].problems[0], /Indexed history changed/);
  const base = deletionOptions(f);
  assert.equal(await runSessions([...args, '--confirm', token], { ...base, interactive: false }), 1);
  assert.equal(await runSessions(args, { ...base, ask: () => assert.fail() }), 3);
  assert.equal((await inspectSessions(f.home)).sessions.length, 3);
});

test('exported deletion rechecks saved files immediately after confirmation', async t => {
  const f = renderableFixture(t), output = exportParent(t), { batch } = await saveBatch(f, output);
  const base = deletionOptions(f);
  assert.equal(await runSessions(['delete', '--exported', batch.id, '--in', output], { ...base, ask: async prompt => {
    rmSync(join(output, batch.entries[0].key, 'rollout.jsonl'));
    return confirmPrompt(prompt);
  } }), 1);
  assert.equal((await inspectSessions(f.home)).sessions.length, 3);
});

test('receipts cannot cross Codex homes or escape their export folder', async t => {
  const f = renderableFixture(t), different = renderableFixture(t), output = exportParent(t), { batch } = await saveBatch(f, output);
  await assert.rejects(planExportedDeletion(await inspectSessions(different.home), output, batch.id), /different Codex home/);
  assert.throws(() => readBatch(output, '../other'), /not a path/);
  const path = join(output, 'batches', `${batch.id}.json`);
  const receipt = JSON.parse(readFileSync(path, 'utf8')); receipt.entries[0].key = 'changed'; writeFileSync(path, JSON.stringify(receipt));
  assert.throws(() => readBatch(output, batch.id), /Invalid or incomplete/);
});

test('interactive export defaults to keeping originals and can hand off to a cancellable deletion review', async t => {
  for (const review of [false, true]) {
    const f = renderableFixture(t), output = exportParent(t), base = deletionOptions(f), prompts = [];
    assert.equal(await runSessions(['export', parent, '--output', output], { ...base, ask: async prompt => {
      prompts.push(prompt);
      if (prompt.startsWith('Type EXPORT')) return confirmPrompt(prompt);
      if (prompt.startsWith('Next:')) return review ? '2' : '';
      if (review && prompt.startsWith('Type DELETE')) return '';
      assert.fail('Unexpected prompt');
    } }), 0);
    assert.equal(prompts.some(prompt => prompt.startsWith('Type DELETE')), review);
    assert.equal((await inspectSessions(f.home)).sessions.length, 3);
  }
});

test('batch and confirmation arguments never silently combine with another selector', () => {
  for (const args of [ ['delete', parent, '--exported', 'batch'], ['delete', '--before', '4w', '--exported', 'batch'],
    ['delete', '--in', 'fixture'], ['delete', '--exported', '--confirm', 'a'.repeat(64)],
    ['export', parent, '--after', 'delete'], ['plan', 'delete', '--confirm', 'a'.repeat(64)], ['config', '--output', '--confirm'] ]) assert.throws(() => parseSessionArgs(args));
});

test('export batch selection is interactive, cancellable, and does not inspect unrelated saved bodies', async t => {
  const f = renderableFixture(t), output = exportParent(t), { batch } = await saveBatch(f, output);
  const unrelated = join(output, 'unrelated'); mkdirSync(unrelated); writeFileSync(join(unrelated, 'manifest.json'), 'not json');
  assert.equal((await planExportedDeletion(await inspectSessions(f.home), output, batch.id)).sessions.length, 2);
  const base = deletionOptions(f), prompts = [];
  assert.equal(await runSessions(['delete', '--exported', '--in', output], { ...base, ask: async prompt => {
    prompts.push(prompt); return prompt.startsWith('Export batch number') ? '1' : '';
  } }), 0);
  assert.ok(prompts.some(prompt => prompt.startsWith('Type DELETE')));
  assert.equal(await runSessions(['delete', '--exported', '--in', output], { ...base, interactive: false, ask: () => assert.fail() }), 1);
});

test('batch deletion stops when a remaining family history changes after the first verified deletion', async t => {
  const f = renderableFixture(t), output = exportParent(t); historyFixture(f);
  const { batch } = await saveBatch(f, output, ['--before', '4w']), base = deletionOptions(f), calls = [];
  const args = ['delete', '--exported', batch.id, '--in', output], token = await previewToken(f, args);
  assert.equal(await runSessions([...args, '--confirm', token], { ...base, interactive: false, ask: () => assert.fail(), cli: args => {
    if (args[0] === '--version' || args.at(-1) === '--help') return base.cli(args);
    assert.deepEqual(args, ['delete', parent, '--force']); calls.push(args[1]);
    for (const id of [parent, child]) { f.update('DELETE FROM threads WHERE id = ?', id); rmSync(join(f.home, 'sessions', `${id}.jsonl`)); }
    f.update('DELETE FROM thread_spawn_edges WHERE parent_thread_id = ?', parent);
    const db = new DatabaseSync(join(f.home, 'thread_history_1.sqlite'));
    db.prepare('UPDATE thread_items SET item_json = ? WHERE thread_id = ?').run('changed remaining history', other); db.close();
    return { status: 0 };
  } }), 1);
  assert.deepEqual(calls, [parent]);
  assert.deepEqual((await inspectSessions(f.home)).sessions.map(row => row.id), [other]);
});

test('verified deletion schedules the sidebar scan, including before a later family fails', async t => {
  for (const mode of ['complete', 'later-failure', 'unknown-cache']) {
    const f = fixture(t), base = deletionOptions(f), output = [];
    mkdirSync(join(f.home, 'sqlite'));
    const db = new DatabaseSync(join(f.home, 'sqlite', 'codex-dev.db'));
    db.exec(`CREATE TABLE automations (target_thread_id TEXT);
      CREATE TABLE automation_runs (thread_id TEXT); CREATE TABLE inbox_items (thread_id TEXT);
      CREATE TABLE local_thread_catalog_hosts (host_id TEXT PRIMARY KEY, host_kind TEXT);
      CREATE TABLE local_thread_catalog_sync_state (host_id TEXT PRIMARY KEY, watermark_updated_at INTEGER, initial_build_complete INTEGER, observation_sequence INTEGER, last_full_reconciled_at INTEGER);
      CREATE TABLE local_thread_catalog_scan_checkpoints (host_id TEXT PRIMARY KEY, checkpoint TEXT, failed_at INTEGER);
      INSERT INTO local_thread_catalog_hosts VALUES ('local', 'local');
      INSERT INTO local_thread_catalog_sync_state VALUES ('local', 123, 1, 5, 456);`);
    if (mode === 'unknown-cache') db.exec('ALTER TABLE local_thread_catalog_sync_state ADD COLUMN unknown TEXT');
    db.close();
    let mutations = 0;
    const status = await runSessions(['delete', '--before', '2026-07-01'], { ...base, ask: confirmPrompt, log: s => output.push(s), cli: args => {
      if (args[0] === '--version' || args.at(-1) === '--help') return base.cli(args);
      if (++mutations === 2 && mode === 'later-failure') return { status: 1 };
      for (const id of args[1] === parent ? [parent, child] : [other]) {
        f.update('DELETE FROM threads WHERE id=?', id);
        rmSync(join(f.home, 'sessions', `${id}.jsonl`));
      }
      f.update('DELETE FROM thread_spawn_edges WHERE parent_thread_id=?', args[1]);
      return { status: 0 };
    } });
    assert.equal(status, mode === 'complete' ? 0 : mode === 'unknown-cache' ? 3 : 1);
    assert.match(output.join('\n'), /Verified delete/);
    if (mode === 'unknown-cache') {
      assert.match(output.join('\n'), /deletion was verified, but Unsupported sidebar cache/);
      assert.equal(existsSync(join(f.home, 'backups')), false);
    } else {
      assert.equal((await inspectSidebarRefresh(f.home)).pending, true);
      assert.equal(readdirSync(join(f.home, 'backups', 'sidebar-refresh')).length, 1);
    }
  }
});
