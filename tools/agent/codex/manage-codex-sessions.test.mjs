import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, renameSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectSessions, makePlan, selectPlan, parseSessionArgs, exportSessions, runSessions, assertClientsClosed, runOfficialCodex, displayText, planExportedDeletion } from './manage-codex-sessions.mjs';
import { listBundles } from './session-export-storage.mjs';
import { listBatches, readBatch } from './session-export-batches.mjs';

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

test('pinned and sectioned descendants protect the parent plan', async t => {
  const f = fixture(t);
  f.update('UPDATE threads SET is_pinned = 1, thread_section_id = ? WHERE id = ?', 'important', child);
  const plan = makePlan(await inspectSessions(f.home), parent);
  assert.match(plan.problems.join('\n'), /pinned/);
  assert.match(plan.problems.join('\n'), /sidebar-section/);
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
      assert.deepEqual(args, ['--version']);
      return { status: 0, stdout: 'codex-cli 0.153.4\n' };
    } };
}

test('cancellation, unknown CLI version, active clients, and new descendant changes prevent deletion', async t => {
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
    if (args[0] === '--version') return base.cli(args);
    assert.deepEqual(args, ['delete', parent, '--force']);
    // Simulated official command: only disposable fixture files are removed by the test.
    for (const id of [parent, child]) {
      f.update('DELETE FROM threads WHERE id = ?', id);
      rmSync(join(f.home, 'sessions', `${id}.jsonl`));
    }
    f.update('DELETE FROM thread_spawn_edges WHERE parent_thread_id = ?', parent);
    return { status: 0 };
  } }), 0);
  assert.equal(calls.length, 2);
  assert.deepEqual((await inspectSessions(f.home)).sessions.map(row => row.id), [other]);
});

test('partial failures and false success do not retry or report success', async t => {
  const f = fixture(t), base = deletionOptions(f);
  for (const status of [0, 1, null]) {
    let deletes = 0;
    assert.equal(await runSessions(['delete', parent], { ...base, cli: args => {
      if (args[0] === '--version') return base.cli(args);
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
    return { status: 0, stdout: '0\r\n' };
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

test('bulk deletion calls only roots once, verifies each family, and leaves excluded sessions intact', async t => {
  const f = fixture(t), base = deletionOptions(f), calls = [];
  assert.equal(await runSessions(['delete', '--older-than-weeks', '4'], { ...base, ask: confirmPrompt, cli: args => {
    if (args[0] === '--version') return base.cli(args);
    calls.push(args[1]);
    for (const id of args[1] === parent ? [parent, child] : [other]) {
      f.update('DELETE FROM threads WHERE id = ?', id); rmSync(join(f.home, 'sessions', `${id}.jsonl`));
    }
    f.update('DELETE FROM thread_spawn_edges WHERE parent_thread_id = ?', args[1]);
    return { status: 0 };
  } }), 0);
  assert.deepEqual(calls, [parent, other]);
});

test('archive verifies actual descendant moves; partial success stops the batch', async t => {
  for (const partial of [false, true]) {
    const f = fixture(t), base = deletionOptions(f), calls = [], output = [];
    mkdirSync(join(f.home, 'archived_sessions'));
    const result = await runSessions(['archive', '--before', '2026-07-01'], { ...base, ask: confirmPrompt, log: line => output.push(line), cli: args => {
      if (args[0] === '--version') return base.cli(args);
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
    if (args[0] === '--version') return base.cli(args);
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
      if (line.startsWith('Export directory:')) writeFileSync(join(f.home, 'sessions', `${parent}.jsonl`), '{"changed":true,"extra":1}\n');
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
        if (line !== `Exported: ${parent}`) return;
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

test('empty bulk selections create no export directory and never prompt or invoke a command', async t => {
  const f = fixture(t), output = exportParent(t);
  for (const action of ['archive', 'delete', 'export']) {
    assert.equal(await runSessions([action, '--before', '1970-01-01', ...(action === 'export' ? ['--output', output] : [])], {
      ...deletionOptions(f), ask: () => assert.fail(), cli: () => assert.fail(),
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

test('a portable export receipt deletes exactly its original family, never newly eligible sessions', async t => {
  const f = renderableFixture(t), output = exportParent(t), { batch } = await saveBatch(f, output);
  const moved = join(exportParent(t), 'relocated'); renameSync(output, moved);
  assert.equal(readBatch(moved, batch.id).digest, batch.digest);
  const selection = ['delete', '--exported', batch.id, '--in', moved];
  const token = await previewToken(f, selection), base = deletionOptions(f), calls = [];
  assert.equal(await runSessions([...selection, '--confirm', token], { ...base, interactive: false, ask: () => assert.fail(), cli: args => {
    if (args[0] === '--version') return base.cli(args);
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
    if (change === 'warning') writeFileSync(join(f.home, 'sessions', `${child}.jsonl`), '{"fixture":true}\n');
    const { batch } = await saveBatch(f, output), snapshot = await inspectSessions(f.home);
    if (change === 'bytes') writeFileSync(join(f.home, 'sessions', `${child}.jsonl`), 'changed bytes\n');
    if (change === 'descendant') f.update('INSERT INTO thread_spawn_edges VALUES (?, ?)', child, other);
    if (change === 'pin') f.update('UPDATE threads SET is_pinned = 1 WHERE id = ?', child);
    if (change === 'missing') rmSync(join(output, batch.entries[0].key, 'conversation.md'));
    const plan = await planExportedDeletion(change === 'bytes' ? snapshot : await inspectSessions(f.home), output, batch.id);
    assert.equal(plan.sessions.length, 0, change); assert.equal(plan.skipped.length, 1, change);
    if (change === 'bytes') assert.match(plan.skipped[0].problems[0], /content changed/);
  }
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
    if (args[0] === '--version') return base.cli(args);
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
