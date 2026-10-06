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

test('official maintenance startup overrides suppress synthetic history rewrites', {
  skip: process.platform !== 'win32' || process.env.AGENT_TEST_CODEX_COMPAT !== '1',
}, async t => {
  assert.ok(!process.env.CODEX_EXEC_SERVER_URL, 'Run this fixture in a local environment');
  assert.ok(!process.env.CODEX_SQLITE_HOME, 'The fixture must not use an external database');
  const root = mkdtempSync(join(tmpdir(), 'agent-cli-compat-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
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
      if (feature === 'background_paginated_rollout_migration') {
        // The short-lived delete/archive error can exit before migration's first await.
        // Keep a separately initialized local app-server alive to exercise that worker.
        const serverArgs = ['-c', 'features.local_thread_store_compression=false',
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
