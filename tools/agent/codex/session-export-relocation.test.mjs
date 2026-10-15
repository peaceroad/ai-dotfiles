import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, symlinkSync, linkSync, unlinkSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { planRelocation, executeRelocation, runRelocation } from './session-export-relocation.mjs';
import { acquireExportLock, assertExportAvailable, EXPORT_LOCK, RELOCATION_MARKER } from './session-export-lock.mjs';
import { FORMAT, snapshotDigest, fingerprint, readExportSettings, writeExportDirectory } from './session-export-storage.mjs';
import { writeBatch, listBatches } from './session-export-batches.mjs';
import { runHistory } from './manage-codex-history.mjs';
import { runSessions } from './manage-codex-sessions.mjs';
import { createProgress } from './session-progress.mjs';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const id = '00000000-0000-4000-8000-000000000001';
const quiet = () => createProgress(() => {});
function fixture(t, nested = true) {
  const root = mkdtempSync(join(tmpdir(), 'agent-relocation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const from = join(root, 'exports'), to = join(nested ? from : root, 'sessions'), home = join(root, 'home'), settingsPath = join(root, 'settings', 'export.json');
  mkdirSync(from); mkdirSync(home);
  const key = 'snapshot', folder = join(from, key); mkdirSync(folder);
  const files = Object.entries({ 'conversation.md': '# Synthetic conversation\n', 'rollout.jsonl': '{}\n' }).map(([file, bytes]) => {
    writeFileSync(join(folder, file), bytes);
    return { file, bytes: Buffer.byteLength(bytes), sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  const manifest = { format: FORMAT, schemaVersion: 2, complete: true, exportedAt: '2000-01-01T00:00:00Z', session: { id, title: 'Synthetic' }, files, warnings: [], attachments: [], sources: [], spawnEdges: [] };
  manifest.contentDigest = snapshotDigest(manifest);
  writeFileSync(join(folder, 'manifest.json'), JSON.stringify(manifest));
  mkdirSync(join(folder, 'extra-empty'));
  mkdirSync(join(from, '.incomplete-synthetic'));
  writeFileSync(join(from, '.incomplete-synthetic', 'partial.bin'), Buffer.from([0, 255, 42]));
  const batch = writeBatch(from, { home }, { groups: [{ root: id, sessions: [{ id }], fingerprint: '0'.repeat(64) }] }, [{ id, key, digest: manifest.contentDigest }], { id });
  return { root, from, to, home, settingsPath, key, batch };
}

test('preview is read-only and nested relocation preserves all bytes, receipts and settings', async t => {
  const f = fixture(t);
  writeExportDirectory(f.from, f.settingsPath);
  const before = readdirSync(f.from).sort(), logs = [];
  assert.equal(await runRelocation(['--from', f.from, '--to', f.to, '--dry-run'], { ...f, log: s => logs.push(s) }), 0);
  assert.deepEqual(readdirSync(f.from).sort(), before);
  assert.equal(existsSync(f.to), false);
  const plan = planRelocation(f);
  assert.equal(plan.files, 5);
  assert.match(logs.join('\n'), /Confirmation token: [a-f0-9]{64}/);
  await executeRelocation(plan, { progress: quiet() });
  assert.deepEqual(readdirSync(f.from), ['sessions']);
  assert.deepEqual(readFileSync(join(f.to, '.incomplete-synthetic', 'partial.bin')), Buffer.from([0, 255, 42]));
  assert.ok(existsSync(join(f.to, f.key, 'extra-empty')));
  assert.equal(listBatches(f.to)[0].id, f.batch.id);
  assert.deepEqual(readExportSettings(f.settingsPath), { directory: f.to, previousDirectories: [f.from] });
  assert.equal(await runHistory(['check', '--in', f.to, '--all-versions'], { log: () => {} }), 0);
  assert.equal(existsSync(join(f.to, EXPORT_LOCK)), false);
});

test('sibling relocation creates a default when it was previously unset', async t => {
  const f = fixture(t, false);
  await executeRelocation(planRelocation(f), { progress: quiet() });
  assert.deepEqual(readdirSync(f.from), []);
  assert.deepEqual(readExportSettings(f.settingsPath), { directory: f.to, previousDirectories: [] });
});

test('interruption after rename retains a journal and resumes without duplicating data', async t => {
  const f = fixture(t), plan = planRelocation(f);
  await assert.rejects(executeRelocation(plan, { progress: quiet(), afterMove: () => { throw new Error('synthetic interruption'); } }), /synthetic interruption/);
  assert.ok(existsSync(join(f.from, RELOCATION_MARKER)));
  assert.ok(existsSync(join(f.to, RELOCATION_MARKER)));
  assert.equal(readExportSettings(f.settingsPath).directory, null);
  assert.throws(() => assertExportAvailable(f.to), /pending/);
  assert.equal(await runHistory(['list', '--in', f.to], { log: () => {} }), 1);
  assert.throws(() => planRelocation(f), /pending/);
  const resumed = planRelocation({ ...f, resume: true });
  assert.notEqual(resumed.token, plan.token);
  await executeRelocation(resumed, { progress: quiet() });
  assert.equal(readExportSettings(f.settingsPath).directory, f.to);
  assert.equal(existsSync(join(f.to, RELOCATION_MARKER)), false);
});

test('changed contents invalidate confirmation and a changed moved file blocks resume', async t => {
  const f = fixture(t), plan = planRelocation(f);
  writeFileSync(join(f.from, f.key, 'conversation.md'), 'Changed');
  await assert.rejects(executeRelocation(plan, { progress: quiet() }), /plan changed/);
  assert.equal(existsSync(f.to), false);
  const next = planRelocation(f);
  await assert.rejects(executeRelocation(next, { progress: quiet(), afterMove: () => { throw new Error('stop'); } }), /stop/);
  writeFileSync(join(f.to, '.incomplete-synthetic', 'partial.bin'), 'Changed');
  assert.throws(() => planRelocation({ ...f, resume: true }), /files changed/);
  assert.equal(readExportSettings(f.settingsPath).directory, null);
});

test('unrelated settings changes are retained after files move and require review', async t => {
  const f = fixture(t), other = join(f.root, 'other'); mkdirSync(other);
  await assert.rejects(executeRelocation(planRelocation(f), { progress: quiet(), afterMove: n => {
    if (n === 1) writeExportDirectory(other, f.settingsPath);
  } }), /settings changed/);
  assert.equal(readExportSettings(f.settingsPath).directory, other);
  assert.ok(existsSync(join(f.from, RELOCATION_MARKER)));
  assert.equal(existsSync(join(f.to, f.key)), true);
});

test('collisions, unknown entries, source overlap, Git and home boundaries fail closed', t => {
  const f = fixture(t);
  mkdirSync(f.to); writeFileSync(join(f.to, 'keep'), 'unrelated');
  assert.throws(() => planRelocation(f), /destination must be empty/);
  assert.throws(() => planRelocation({ ...f, to: f.from }), /different destination/);
  assert.throws(() => planRelocation({ ...f, to: f.home }), /CODEX_HOME/);
  const other = join(f.root, 'other');
  writeFileSync(join(f.from, 'unrelated.txt'), 'keep');
  assert.throws(() => planRelocation({ ...f, to: other }), /Unrecognized source/);
  mkdirSync(join(f.root, '.git'));
  assert.throws(() => planRelocation({ ...f, to: other }), /Git checkouts/);
});

test('links and hard links cannot redirect relocation outside the inventory', t => {
  const f = fixture(t), external = join(f.root, 'external'); mkdirSync(external);
  symlinkSync(external, join(f.from, f.key, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => planRelocation(f), /regular files and real directories/);
  const g = fixture(t);
  linkSync(join(g.from, g.key, 'conversation.md'), join(g.from, g.key, 'hardlink'));
  assert.throws(() => planRelocation(g), /hard links/);
});

test('live locks block relocation and history without reclaiming an active owner', async t => {
  const f = fixture(t), release = acquireExportLock(f.from);
  try {
    assert.throws(() => planRelocation(f), /locked/);
    assert.throws(() => acquireExportLock(f.from, { resume: true }), /still be running/);
    assert.equal(await runHistory(['list', '--in', f.from], { log: () => {} }), 1);
  } finally { release(); }
  assert.doesNotThrow(() => planRelocation(f));
});

test('tampered journal paths cannot escape relocation roots even with a recomputed digest', async t => {
  const f = fixture(t);
  await assert.rejects(executeRelocation(planRelocation(f), { progress: quiet(), afterMove: () => { throw new Error('stop'); } }));
  const path = join(f.from, RELOCATION_MARKER), { digest, ...journal } = JSON.parse(readFileSync(path));
  journal.entries[0].rows[1].path = '../outside';
  writeFileSync(path, JSON.stringify({ ...journal, digest: fingerprint(journal) }));
  assert.throws(() => planRelocation({ ...f, resume: true }), /Unsafe relocation inventory/);
});

test('CLI help is read-only and invalid or stale confirmations never start relocation', async t => {
  const f = fixture(t), log = () => {};
  assert.equal(await runSessions(['relocate', '--help'], { home: f.home, log, inspect: () => { throw new Error('must not inspect'); } }), 0);
  assert.equal(await runSessions(['help', 'relocate'], { home: f.home, log }), 0);
  assert.equal(await runRelocation(['--from', f.from, '--to', f.to, '--force'], { ...f, log }), 2);
  assert.equal(await runRelocation(['--from', f.from, '--to', f.to, '--confirm', '0'.repeat(64)], { ...f, log }), 1);
  assert.equal(existsSync(f.to), false);
});

test('an exited process leaves recoverable locks both before journal creation and after rename', async t => {
  for (const stage of ['preparation', 'moved']) {
    const f = fixture(t);
    const script = `
      import { acquireExportLock } from ${JSON.stringify(new URL('./session-export-lock.mjs', import.meta.url).href)};
      import { planRelocation, executeRelocation } from ${JSON.stringify(new URL('./session-export-relocation.mjs', import.meta.url).href)};
      const options = JSON.parse(process.argv[1]);
      if (process.argv[2] === 'preparation') { acquireExportLock(options.from); process.exit(47); }
      await executeRelocation(planRelocation(options), { afterMove: () => process.exit(47) });
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(f), stage], { encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 47, result.stderr);
    assert.ok(existsSync(join(f.from, EXPORT_LOCK)));
    await executeRelocation(planRelocation({ ...f, resume: true }), { progress: quiet() });
    assert.equal(readExportSettings(f.settingsPath).directory, f.to);
    assert.equal(existsSync(join(f.from, EXPORT_LOCK)), false);
    assert.equal(existsSync(join(f.to, EXPORT_LOCK)), false);
  }
});

test('resume finishes cleanup after settings commit without changing the chosen destination', async t => {
  const f = fixture(t);
  mkdirSync(join(f.root, 'settings'));
  const receiptFolder = join(f.root, 'settings', 'codex-export-relocations');
  writeFileSync(receiptFolder, 'synthetic collision');
  await assert.rejects(executeRelocation(planRelocation(f), { progress: quiet() }));
  assert.equal(readExportSettings(f.settingsPath).directory, f.to);
  assert.ok(existsSync(join(f.from, RELOCATION_MARKER)));
  unlinkSync(receiptFolder);
  await executeRelocation(planRelocation({ ...f, resume: true }), { progress: quiet() });
  assert.equal(existsSync(join(f.from, RELOCATION_MARKER)), false);
  assert.equal(readExportSettings(f.settingsPath).directory, f.to);
});

test('hash mismatches and journal flush failure never update settings or claim completion', async t => {
  const f = fixture(t);
  await assert.rejects(executeRelocation(planRelocation(f), { progress: quiet(), afterMove: () => { throw new Error('stop'); } }));
  const path = join(f.from, RELOCATION_MARKER), { digest, ...journal } = JSON.parse(readFileSync(path));
  journal.entries[0].rows.find(row => row.type === 'file').sha256 = '0'.repeat(64);
  writeFileSync(path, JSON.stringify({ ...journal, digest: fingerprint(journal) }));
  await assert.rejects(executeRelocation(planRelocation({ ...f, resume: true }), { progress: quiet() }), /hash verification failed/);
  assert.equal(readExportSettings(f.settingsPath).directory, null);
  const g = fixture(t), originalSync = fs.fsyncSync;
  fs.fsyncSync = () => { throw Object.assign(new Error('synthetic flush failure'), { code: 'EIO' }); };
  syncBuiltinESMExports();
  try { await assert.rejects(executeRelocation(planRelocation(g), { progress: quiet() }), /synthetic flush failure/); }
  finally { fs.fsyncSync = originalSync; syncBuiltinESMExports(); }
  assert.ok(existsSync(join(g.from, g.key)));
  assert.equal(readExportSettings(g.settingsPath).directory, null);
  await executeRelocation(planRelocation({ ...g, resume: true }), { progress: quiet() });
  assert.equal(readExportSettings(g.settingsPath).directory, g.to);
});

test('a destination redirected after rename is refused before verification or configuration', async t => {
  const f = fixture(t), redirected = join(f.root, 'redirected');
  await assert.rejects(executeRelocation(planRelocation(f), { progress: quiet(), afterMove: () => {
    renameSync(f.to, redirected);
    symlinkSync(redirected, f.to, process.platform === 'win32' ? 'junction' : 'dir');
  } }), /real directories/);
  assert.equal(readExportSettings(f.settingsPath).directory, null);
  assert.ok(existsSync(join(f.from, RELOCATION_MARKER)));
});
