// Opt-in: invokes the installed official CLI only in disposable synthetic homes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { runOfficialCodex, inspectSessions, exportSessions, selectPlan, parseSessionArgs, runSessions } from './manage-codex-sessions.mjs';
import { rolloutChunks } from './session-rollout-io.mjs';
import { DatabaseSync } from 'node:sqlite';
import { createInterface } from 'node:readline';
import { zstdCompressSync } from 'node:zlib';
import { paginatedTurn, encodeTurn } from './fixtures/paginated-turn.mjs';
import { compactedTurn } from './fixtures/compacted-turn.mjs';
import { developmentTurn } from './fixtures/development-turn.mjs';
import { boardFixture } from './fixtures/message-board.mjs';
import { listBundles, verifyBundle } from './session-export-storage.mjs';

function indexSyntheticThread(home, path, id) {
  const db = new DatabaseSync(join(home, 'state_5.sqlite'));
  try {
    const values = { id, rollout_path: path, created_at: 946684800, updated_at: 946684800,
      source: 'cli', model_provider: 'openai', cwd: home, title: 'Synthetic fixture',
      sandbox_policy: '"read-only"', approval_mode: 'never', history_mode: 'legacy' };
    for (const column of db.prepare('PRAGMA table_info(threads)').all()) {
      if (column.notnull && column.dflt_value === null && !(column.name in values)) {
        assert.match(column.name, /^[a-z_]+$/);
        values[column.name] = /INT|REAL/.test(column.type) ? 0 : '';
      }
    }
    const names = Object.keys(values);
    db.prepare(`INSERT OR REPLACE INTO threads (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`).run(...Object.values(values));
  } finally { db.close(); }
}

test('official maintenance startup overrides suppress synthetic history rewrites', {
  skip: process.platform !== 'win32' || process.env.AGENT_TEST_CODEX_COMPAT !== '1',
}, async t => {
  assert.ok(!process.env.CODEX_EXEC_SERVER_URL, 'Run this fixture in a local environment');
  assert.ok(!process.env.CODEX_SQLITE_HOME, 'The fixture must not use an external database');
  const root = mkdtempSync(join(tmpdir(), 'agent-cli-compat-'));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const version = runOfficialCodex(['--version'], root).stdout?.trim();
  assert.equal(version, 'codex-cli 0.159.2', 'Review the startup profile before testing another version');
  const id = '00000000-0000-4000-8000-000000000101';
  const missing = '00000000-0000-4000-8000-000000000199';
  for (const action of ['delete', 'archive']) for (const feature of ['local_thread_store_compression', 'background_paginated_rollout_migration']) {
    for (const suppressed of [false, true]) {
      const home = join(root, `${action}-${feature}-${suppressed}`);
      mkdirSync(join(home, 'sessions'), { recursive: true });
      const config = '[features]\nlocal_thread_store_compression = true\nbackground_paginated_rollout_migration = true\n';
      writeFileSync(join(home, 'config.toml'), config);
      const path = join(home, 'sessions', `rollout-2000-01-01T00-00-00-${id}.jsonl`);
      const timestamp = '2000-01-01T00:00:00Z';
      const raw = [{ timestamp, type: 'session_meta', payload: { id, session_id: id, timestamp, cwd: home,
        originator: 'fixture', cli_version: '0.159.2', source: 'cli', history_mode: 'legacy', model_provider: 'openai' } },
        { timestamp, type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Synthetic fixture' }] } },
      ].map(value => JSON.stringify(value) + '\n').join('');
      writeFileSync(path, raw); utimesSync(path, new Date(timestamp), new Date(timestamp));
      const args = [action, missing, ...(action === 'delete' ? ['--force'] : [])];
      // Initialize the official schema with workers disabled, then index only this fixture.
      assert.equal(runOfficialCodex(args, home, spawnSync, version).status, 1);
      indexSyntheticThread(home, path, id);
      if (feature === 'background_paginated_rollout_migration') {
        // The short-lived delete/archive error can exit before migration's first await.
        // Keep an isolated app-server alive to exercise that worker without
        // relying on a reusable daemon for the disposable fixture.
        const serverArgs = ['--no-daemon', '-c', 'features.local_thread_store_compression=false',
          '-c', `features.background_paginated_rollout_migration=${!suppressed}`, 'app-server'];
        const server = runOfficialCodex(serverArgs, home, spawn);
        server.stdout.on('data', () => {}); server.stderr.on('data', () => {});
        const closed = new Promise((resolve, reject) => { server.once('error', reject); server.once('exit', resolve); });
        try {
          server.stdin.write(JSON.stringify({ id: 1, method: 'initialize', params: { clientInfo: { name: 'fixture', version: '1' } } }) + '\n');
          server.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
          for (let i = 0; i < 30; i++) {
            await delay(200);
            if (!suppressed && JSON.parse(readFileSync(path, 'utf8').split('\n')[0]).payload.history_mode === 'paginated') break;
          }
        } finally { server.stdin.end(); await closed; }
      }
      let result;
      if (suppressed) result = runOfficialCodex(args, home, spawnSync, version);
      else {
        // One feature enabled per positive control, so both workers are observable separately.
        const other = feature === 'local_thread_store_compression' ? 'background_paginated_rollout_migration' : 'local_thread_store_compression';
        result = runOfficialCodex(['--no-daemon', '-c', `features.${other}=false`, ...args], home);
      }
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1, 'The synthetic target must remain nonexistent');
      assert.equal(readFileSync(join(home, 'config.toml'), 'utf8'), config, 'Overrides must not persist');
      if (suppressed) {
        assert.equal(existsSync(`${path}.zst`), false);
        assert.equal(readFileSync(path, 'utf8'), raw, 'Suppressed startup must preserve every source byte');
      } else if (feature === 'local_thread_store_compression') {
        assert.equal(existsSync(`${path}.zst`), true, 'Positive control must actually compress');
        assert.equal(existsSync(path), false);
        // Independent encoder: the installed official Codex worker produced this
        // frame from known synthetic bytes, not Node's own compression routine.
        const chunks = [];
        for await (const chunk of rolloutChunks(`${path}.zst`)) chunks.push(chunk);
        assert.equal(Buffer.concat(chunks).toString('utf8'), raw);
        if (action === 'delete') {
          const output = join(root, 'compressed-export'); mkdirSync(output);
          const snapshot = await inspectSessions(home);
          assert.deepEqual(snapshot.issues, []);
          const exported = await exportSessions(snapshot, selectPlan(snapshot, parseSessionArgs(['export', id])), output, { log() {} });
          const logs = [];
          const status = await runSessions(['delete', '--exported', exported.batch.id, '--in', output], {
            home, interactive: true, log: text => logs.push(text),
            // Only this disposable home is affected. The live app uses a different home.
            closed() {}, ask: async prompt => /^Type (.+) to /.exec(prompt)?.[1] ?? '',
          });
          assert.equal(status, 0, logs.join('\n'));
          assert.equal(existsSync(`${path}.zst`), false, 'Official deletion must remove compressed physical bytes');
          assert.equal((await inspectSessions(home)).sessions.length, 0);
        }
      } else {
        assert.equal(JSON.parse(readFileSync(path, 'utf8').split('\n')[0]).payload.history_mode, 'paginated', 'Positive control must actually migrate');
      }
    }
  }
});

test('official projection reads reviewed paginated fixtures before verified export and deletion', {
  skip: process.platform !== 'win32' || process.env.AGENT_TEST_CODEX_COMPAT !== '1' || process.versions.node !== '26.10.0',
}, async t => {
  assert.ok(!process.env.CODEX_EXEC_SERVER_URL && !process.env.CODEX_SQLITE_HOME);
  const root = mkdtempSync(join(tmpdir(), 'agent-paginated-compat-'));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const version = runOfficialCodex(['--version'], root).stdout?.trim();
  assert.equal(version, 'codex-cli 0.159.2');
  const id = '00000000-0000-4000-8000-000000000101', missing = '00000000-0000-4000-8000-000000000199';
  for (const makeTurn of [paginatedTurn, compactedTurn, developmentTurn]) for (const compressed of [false, true]) {
    const variant = `${makeTurn.name}-${compressed ? 'zstd' : 'plain'}`;
    const home = join(root, variant), output = join(root, `saved-${variant}`);
    mkdirSync(join(home, 'sessions'), { recursive: true }); mkdirSync(output);
    assert.equal(runOfficialCodex(['delete', missing, '--force'], home, spawnSync, version).status, 1);
    const plain = join(home, 'sessions', `rollout-2000-01-01T00-00-00-${id}.jsonl`), path = `${plain}${compressed ? '.zst' : ''}`;
    // Let the official migration build both the paginated file and its projection.
    // An empty manually created projection is not a valid paginated fixture.
    const records = makeTurn(id, home);
    records[0].payload.history_mode = 'legacy';
    for (const record of records) delete record.ordinal;
    writeFileSync(plain, encodeTurn(records)); indexSyntheticThread(home, plain, id);
    const server = runOfficialCodex(['--no-daemon', '-c', 'features.local_thread_store_compression=false',
      '-c', 'features.background_paginated_rollout_migration=true', 'app-server'], home, spawn);
    server.stderr.on('data', () => {});
    const closed = new Promise((resolve, reject) => { server.once('error', reject); server.once('exit', resolve); });
    const reader = createInterface({ input: server.stdout }), pending = new Map();
    reader.on('line', line => {
      let message; try { message = JSON.parse(line); } catch { return; }
      pending.get(message.id)?.(message);
    });
    let next = 0;
    const request = (method, params) => new Promise((resolve, reject) => {
      const id = ++next;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Fixture RPC timed out: ${method}`)); }, 10000);
      pending.set(id, message => { clearTimeout(timer); pending.delete(id); message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result); });
      server.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
    try {
      await request('initialize', { clientInfo: { name: 'fixture', version: '1' }, capabilities: { experimentalApi: true } });
      server.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
      for (let i = 0; i < 30; i++) {
        if (JSON.parse(readFileSync(plain, 'utf8').split('\n')[0]).payload.history_mode === 'paginated') break;
        await delay(200);
      }
      assert.equal(JSON.parse(readFileSync(plain, 'utf8').split('\n')[0]).payload.history_mode, 'paginated');
      const page = await request('thread/turns/list', { threadId: id, itemsView: 'full', limit: 10 });
      assert.equal(page.data.length, 1, 'Official typed projection must recover the synthetic turn');
      const items = page.data[0].items;
      for (const type of ['userMessage', 'agentMessage', 'commandExecution']) assert.ok(items.some(item => item.type === type), `Missing projected ${type}`);
      if (makeTurn !== paginatedTurn) for (const type of ['mcpToolCall', 'sleep', 'webSearch', 'imageGeneration', 'contextCompaction']) {
        assert.ok(items.some(item => item.type === type), `Missing projected ${type}`);
      }
      if (makeTurn === developmentTurn) for (const type of ['fileChange', 'enteredReviewMode', 'exitedReviewMode', 'collabAgentToolCall', 'subAgentActivity', 'imageView']) {
        assert.ok(items.some(item => item.type === type), `Missing projected ${type}`);
      }
    } finally { reader.close(); server.stdin.end(); await closed; }
    if (compressed) { writeFileSync(path, zstdCompressSync(readFileSync(plain))); rmSync(plain); }
    const bytes = readFileSync(path);
    let board;
    if (makeTurn === developmentTurn) {
      board = boardFixture(home);
      for (const table of ['channels', 'posts', 'subscriptions', 'subscription_opt_outs']) {
        board.put(table, id); board.put(table, missing, 'Unrelated synthetic board');
      }
    }
    const snapshot = await inspectSessions(home);
    const exported = await exportSessions(snapshot, selectPlan(snapshot, parseSessionArgs(['export', id])), output, { log() {} });
    assert.equal(exported.partial, false);
    assert.deepEqual(readFileSync(path), bytes, 'Export must preserve original rollout bytes');
    if (board) {
      const [bundle] = listBundles(output);
      await verifyBundle(bundle);
      assert.equal(bundle.manifest.files.find(file => file.file === 'message-board.jsonl').records, 4);
    }
    const logs = [];
    assert.equal(await runSessions(['delete', '--exported', exported.batch.id, '--in', output], {
      home, interactive: true, log: line => logs.push(line), closed() {}, ask: async prompt => /^Type (.+) to /.exec(prompt)?.[1] ?? '',
    }), 0, logs.join('\n'));
    assert.equal(existsSync(path), false);
    assert.equal((await inspectSessions(home)).sessions.length, 0);
    if (board) {
      const db = new DatabaseSync(board.path, { readOnly: true });
      try {
        for (const table of ['channels', 'posts', 'subscriptions', 'subscription_opt_outs']) {
          assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table} WHERE board=?`).get(id).n, 0);
          assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table} WHERE board=?`).get(missing).n, 1);
        }
        assert.equal(db.prepare('SELECT count(*) AS n FROM deleted_boards WHERE board=?').get(id).n, 1);
      } finally { db.close(); }
    }
  }
});
