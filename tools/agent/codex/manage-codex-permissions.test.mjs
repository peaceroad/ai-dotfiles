import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runPermission } from './manage-codex-permissions.mjs';

const script = fileURLToPath(new URL('manage-codex-permissions.mjs', import.meta.url));
const thread = 'abcdefab-1111-4111-8111-111111111111';
const first = '22222222-2222-4222-8222-222222222222';
const second = '33333333-3333-4333-8333-333333333333';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'codex-permissions-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'home');
  const project = join(root, 'repo');
  mkdirSync(join(home, 'sessions'), { recursive: true });
  mkdirSync(project);
  const config = join(home, 'config.toml');
  writeFileSync(config, 'approval_policy = "never"\ndefault_permissions = "fixture"\n[projects."unrelated"]\nsecret = "DO_NOT_PRINT"\n');
  const app = join(home, '.codex-global-state.json');
  writeFileSync(app, JSON.stringify({ 'electron-persisted-atom-state': {
    'agent-mode-by-host-id': { local: 'guardian-approvals', remote: 'UNRELATED_REMOTE' },
    'heartbeat-thread-permissions-by-id': { [thread]: { approvalPolicy: 'on-request', approvalsReviewer: 'auto_review', activePermissionProfile: { id: 'fixture', extends: null } }, unrelated: { secret: 'DO_NOT_PRINT' } },
  } }));
  const session = join(home, 'sessions', `rollout-${thread}.jsonl`);
  const rows = [
    { type: 'session_meta', payload: { id: thread, cwd: project, cli_version: 'fixture-version', secret: 'DO_NOT_PRINT' } },
    { type: 'response_item', payload: { message: 'DO_NOT_PRINT' } },
    ...[first, second].map((id, i) => ({ type: 'turn_context', timestamp: `fixture-${i}`, payload: { turn_id: id, cwd: project, approval_policy: i ? 'on-request' : 'never', approvals_reviewer: 'auto_review', sandbox_policy: { type: 'workspace-write', writable_roots: [join(homedir(), '.agents')], network_access: true }, permission_profile: { type: 'managed', network: 'enabled' } } })),
  ];
  const save = () => writeFileSync(session, rows.map(x => JSON.stringify(x)).join('\n') + '\n');
  save();
  const run = (...args) => spawnSync(process.execPath, [script, 'status', '--codex-home', home, '--project', project, '--thread', thread, '--json', ...args], { encoding: 'utf8', timeout: 15000 });
  return { root, home, project, config, app, session, rows, save, run };
}

test('exact thread, latest turn, privacy projection and unchanged source files', t => {
  const f = fixture(t);
  const files = [f.config, f.app, f.session];
  const before = files.map(p => readFileSync(p));
  const names = readdirSync(f.home, { recursive: true });
  const r = f.run();
  assert.equal(r.status, 3, r.stdout + r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.executionRecord.turn.turn_id, second);
  assert.equal(report.executionRecord.session.cli_version, 'fixture-version');
  assert.equal(report.executionRecord.selection, 'latest-recorded-turn');
  assert.ok(report.findings.some(f => f.field === 'approval_policy' && f.configured === 'never'));
  assert.doesNotMatch(r.stdout, /DO_NOT_PRINT|UNRELATED_REMOTE/);
  assert.ok(!r.stdout.includes(homedir().replaceAll('\\', '/')));
  assert.deepEqual(files.map(p => readFileSync(p)), before);
  assert.deepEqual(readdirSync(f.home, { recursive: true }), names);
});

test('explicit turn never silently falls back to latest', t => {
  const f = fixture(t);
  assert.equal(JSON.parse(f.run('--turn', first).stdout).executionRecord.turn.approval_policy, 'never');
  const report = JSON.parse(f.run('--turn', '44444444-4444-4444-8444-444444444444').stdout);
  assert.equal(report.executionRecord.status, 'unavailable');
  assert.equal(report.executionRecord.turn, null);
});

test('UUID case is normalized for app lookup; null execution fields are unavailable', t => {
  const f = fixture(t);
  f.rows.at(-1).payload.approval_policy = null;
  f.save();
  const r = f.run('--thread', thread.toUpperCase());
  const report = JSON.parse(r.stdout);
  assert.equal(report.threadId, thread);
  assert.equal(report.appSaved.threadPermissions.approvalPolicy, 'on-request');
  assert.ok(report.findings.some(x => x.kind === 'incomplete' && x.field === 'approval_policy'));
  assert.ok(!report.findings.some(x => x.kind === 'difference' && x.field === 'approval_policy'));
});

test('filename is insufficient evidence of session identity; duplicate candidates are refused', t => {
  const f = fixture(t);
  f.rows[0].payload.id = first;
  f.save();
  assert.equal(JSON.parse(f.run().stdout).executionRecord.reason, 'session-id-mismatch');
  writeFileSync(join(f.home, 'sessions', `second-${thread}.jsonl`), readFileSync(f.session));
  assert.equal(JSON.parse(f.run().stdout).executionRecord.reason, 'ambiguous-session');
});

test('malformed or concurrently incomplete JSONL does not publish stale effective values', t => {
  const f = fixture(t);
  writeFileSync(f.session, readFileSync(f.session, 'utf8') + '{"type":');
  const report = JSON.parse(f.run().stdout);
  assert.equal(report.executionRecord.status, 'invalid');
  assert.equal(report.executionRecord.turn, undefined);
});

test('TOML multiline content cannot masquerade as a setting; profiles remain separate evidence', t => {
  const f = fixture(t);
  writeFileSync(f.config, 'note = """\napproval_policy = "untrusted"\n"""\napproval_policy = "never"\nprofile = "chosen"\n[profiles.chosen]\napproval_policy = "on-request"\n');
  const c = JSON.parse(f.run().stdout).configFiles[0];
  assert.equal(c.values.approval_policy, 'never');
  assert.equal(c.selectedProfileValues.approval_policy, 'on-request');
  assert.equal(c.profileSelection.source, 'file');
  assert.equal(JSON.parse(f.run('--profile', 'different').stdout).configFiles[0].profileSelection.source, 'inspection-argument');
  mkdirSync(join(f.project, '.codex'));
  writeFileSync(join(f.project, '.codex', 'config.toml'), '[profiles.chosen]\napprovals_reviewer = "user"\n');
  const local = JSON.parse(f.run().stdout).configFiles.find(x => x.path.endsWith('/repo/.codex/config.toml'));
  assert.equal(local.selectedProfileValues.approvals_reviewer, 'user');
  assert.equal(local.profileSelection.source, 'user-file-assumption');
});

test('missing app state and malformed TOML are visible gaps; unknown actions never repair', t => {
  const f = fixture(t);
  writeFileSync(f.config, 'broken = [');
  rmSync(f.app);
  const report = JSON.parse(f.run().stdout);
  assert.equal(report.configFiles[0].status, 'invalid');
  assert.equal(report.appSaved.status, 'absent');
  const r = spawnSync(process.execPath, [script, 'repair'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /does not change settings/);
});

test('different project is reported; invalid arguments do not echo private input', t => {
  const f = fixture(t);
  f.rows.at(-1).payload.cwd = '/another-project';
  f.save();
  assert.equal(JSON.parse(f.run().stdout).executionRecord.projectMatches, false);
  const r = f.run('--unknown-private-argument');
  assert.equal(r.status, 2);
  assert.doesNotMatch(r.stdout + r.stderr, /unknown-private-argument/);
  assert.equal(f.run('--thr', thread).status, 2);
});

test('denied reads are reported once without retry or exposing the exception', () => {
  const helper = fileURLToPath(new URL('inspect-codex-permissions.py', import.meta.url));
  const code = `import importlib.util, pathlib, json
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('diagnostic', ${JSON.stringify(helper)})
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
with patch.object(pathlib.Path, 'read_bytes', side_effect=PermissionError('PRIVATE_ERROR')) as reader:
    result = m.read_document(pathlib.Path('fixture'), json.loads)
    assert result == {'status': 'denied'}
    assert reader.call_count == 1
def denied_walk(root, **options):
    options['onerror'](PermissionError('PRIVATE_ERROR'))
    return []
with patch.object(m.os, 'walk', side_effect=denied_walk) as walk:
    result = m.session_evidence(pathlib.Path('fixture'), '${thread}', None, pathlib.Path('repo'))
    assert result['status'] == 'denied'
    assert walk.call_count == 1
with patch.object(pathlib.Path, 'home', return_value=pathlib.Path('/fixture/user')) as home:
    result = m.public_output({'/fixture/user/key': ['/fixture/user/.agents', '/fixture/user-extra', None]})
    assert result == {'~/key': ['~/.agents', '/fixture/user-extra', None]}
    assert home.call_count == 1
print('denied-without-retry')
`;
  const r = spawnSync('python', ['-B', '-X', 'utf8', '-'], { input: code, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /denied-without-retry/);
  assert.doesNotMatch(r.stdout, /PRIVATE_ERROR/);
});

test('recent candidates use only metadata, sort by activity, and cap at 12 without writes', t => {
  const f = fixture(t);
  rmSync(f.session);
  const titles = [], paths = [];
  for (let i = 0; i < 14; i++) {
    const id = `abcdefab-1111-4111-8111-${String(i).padStart(12, '0')}`;
    titles.push({ id, thread_name: `Title ${i}` });
    const path = join(f.home, 'sessions', `rollout-${id}.jsonl`);
    writeFileSync(path, JSON.stringify({ type: 'session_meta', payload: { id, cwd: f.project } }) + '\nDO_NOT_READ_INVALID_CONVERSATION_BODY');
    utimesSync(path, 1700000000 + i, 1700000000 + i);
    paths.push(path);
  }
  writeFileSync(join(f.home, 'session_index.jsonl'), titles.map(x => JSON.stringify(x)).join('\n') + '\n');
  mkdirSync(join(f.home, 'archived_sessions'));
  writeFileSync(join(f.home, 'archived_sessions', `rollout-${thread}.jsonl`), JSON.stringify({ type: 'session_meta', payload: { id: thread, cwd: f.project } }));
  const before = paths.map(p => readFileSync(p));
  const r = f.run('--recent');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const result = JSON.parse(r.stdout);
  assert.equal(result.sessions.length, 12);
  assert.equal(result.sessions[0].title, 'Title 13');
  assert.equal(result.sessions.at(-1).title, 'Title 2');
  assert.equal(result.sessions[0].project, f.project.replaceAll('\\', '/').replace(homedir().replaceAll('\\', '/'), '~'));
  assert.equal(result.activitySource, 'session-record-mtime');
  assert.deepEqual(paths.map(p => readFileSync(p)), before);
  assert.doesNotMatch(r.stdout, /DO_NOT_READ/);
  rmSync(join(f.home, 'session_index.jsonl'));
  const missing = JSON.parse(f.run('--recent').stdout);
  assert.equal(missing.sessions[0].title, '(untitled)');
  assert.ok(missing.notes.length);
});

test('interactive picker forwards selected identity and project, sanitizes titles, and preserves exit', async () => {
  const calls = [], output = [], answers = ['invalid', '1'];
  const status = await runPermission(['status'], {
    interactive: true, ask: async () => answers.shift(), log: text => output.push(text), write: text => output.push(text),
    run(args) {
      calls.push(args);
      return args[0] === '--recent'
        ? { status: 0, stdout: JSON.stringify({ sessions: [{ id: thread, project: '~/repo', title: 'Private\x1b[2J\nTitle', updatedAt: '2026-09-13' }], notes: [] }) }
        : { status: 3, stdout: 'REPORT' };
    },
  });
  assert.equal(status, 3);
  assert.deepEqual(calls, [['--recent'], ['--thread', thread, '--project', join(homedir(), 'repo')]]);
  assert.doesNotMatch(output.join('\n'), /\x1b/);
  assert.match(output.join('\n'), /repo \/ Private/);
});

test('manual fallback and cancellation do not run unintended diagnostics', async () => {
  for (const answers of [['q'], [''], [null], ['m', ''], ['m', thread, null]]) {
    let calls = 0;
    assert.equal(await runPermission(['status'], {
      interactive: true, ask: async () => answers.shift(), log() {},
      run() { calls++; return { status: 1, stdout: '' }; },
    }), 0);
    assert.equal(calls, 1);
  }
  const answers = ['m', thread, ''];
  const calls = [];
  assert.equal(await runPermission(['status'], {
    interactive: true, ask: async () => answers.shift(), log() {}, write() {},
    run(args) { calls.push(args); return { status: args[0] === '--recent' ? 1 : 3, stdout: 'report' }; },
  }), 3);
  assert.deepEqual(calls[1], ['--thread', thread, '--project', process.cwd()]);
});

test('non-interactive status and explicit arguments bypass metadata lookup and prompts', async () => {
  for (const [interactive, args] of [[false, ['status']], [true, ['status', '--json']], [true, ['status', '--thread', thread]]]) {
    let calls = 0;
    assert.equal(await runPermission(args, {
      interactive, ask: () => assert.fail('must not prompt'), write() {},
      run(forwarded) { calls++; assert.deepEqual(forwarded, args.slice(1)); return { status: 3, stdout: '{}' }; },
    }), 3);
    assert.equal(calls, 1);
  }
});
