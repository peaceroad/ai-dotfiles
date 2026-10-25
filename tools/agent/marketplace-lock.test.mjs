import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync, utimesSync, renameSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { acquireSyncLock, releaseSyncLock } from './marketplace-lock.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'marketplace-lock-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return join(root, 'agent-dev-sync.lock');
}
const quiet = { log: () => {} };
const interactive = confirm => ({ ...quiet, interactive: true, confirm });

test('owned lock release tolerates delayed directory timestamp updates', async t => {
  const path = fixture(t);
  const lock = await acquireSyncLock(path, quiet);
  utimesSync(path, new Date('2020-01-01'), new Date('2020-01-01'));
  releaseSyncLock(path, lock);
  assert.equal(existsSync(path), false);
  assert.equal(existsSync(`${path}.guard`), false);
});

test('legacy lock metadata changes during confirmation still block recovery', async t => {
  const path = fixture(t);
  mkdirSync(path);
  await assert.rejects(acquireSyncLock(path, interactive(async () => {
    utimesSync(path, new Date('2020-01-01'), new Date('2020-01-01'));
    return true;
  })), /changed during confirmation/);
  assert.deepEqual(readdirSync(path), []);
});

test('a replacement directory is preserved even with identical owner bytes', async t => {
  const path = fixture(t);
  const lock = await acquireSyncLock(path, quiet);
  renameSync(path, `${path}.original`);
  mkdirSync(path);
  writeFileSync(join(path, 'owner.json'), lock.raw);
  assert.throws(() => releaseSyncLock(path, lock), /changed/);
  assert.equal(readFileSync(join(path, 'owner.json'), 'utf8'), lock.raw);
});

test('normal sync stores one bounded owner record, then removes all lock state', async t => {
  const path = fixture(t);
  for (let i = 0; i < 3; i++) {
    const lock = await acquireSyncLock(path, quiet);
    const raw = readFileSync(join(path, 'owner.json'));
    assert.ok(raw.length < 4096);
    assert.equal(JSON.parse(raw).pid, process.pid);
    assert.deepEqual(readdirSync(path), ['owner.json']);
    releaseSyncLock(path, lock);
    assert.equal(existsSync(path), false);
    assert.equal(existsSync(`${path}.guard`), false);
  }
});

test('noninteractive sync preserves legacy lock even with a confirmation callback', async t => {
  const path = fixture(t);
  mkdirSync(path);
  await assert.rejects(acquireSyncLock(path, { ...quiet, confirm: () => assert.fail('must not ask') }), /non-interactive sync never removes/);
  assert.deepEqual(readdirSync(path), []);
});

test('decline and EOF preserve legacy locks; explicit approval recovers them', async t => {
  const path = fixture(t);
  mkdirSync(path);
  await assert.rejects(acquireSyncLock(path, interactive(async () => false)), /cancelled/);
  await assert.rejects(acquireSyncLock(path, interactive(async () => { throw new Error('EOF'); })), /EOF/);
  assert.deepEqual(readdirSync(path), []);
  const lock = await acquireSyncLock(path, interactive(async () => true));
  releaseSyncLock(path, lock);
});

test('a running local owner cannot be overridden', async t => {
  const path = fixture(t);
  const lock = await acquireSyncLock(path, quiet);
  await assert.rejects(acquireSyncLock(path, interactive(() => assert.fail('must not ask'))), /still running/);
  releaseSyncLock(path, lock);
});

test('stopped local PID still requires explicit approval', async t => {
  const path = fixture(t);
  const original = await acquireSyncLock(path, quiet);
  const child = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  writeFileSync(join(path, 'owner.json'), JSON.stringify({ ...original.owner, pid: child.pid }));
  let asked = false;
  const replacement = await acquireSyncLock(path, interactive(async () => { asked = true; return true; }));
  assert.equal(asked, true);
  releaseSyncLock(path, replacement);
});

test('remote owner requires approval and old owner cannot release its replacement', async t => {
  const path = fixture(t);
  const original = await acquireSyncLock(path, quiet);
  const owner = { ...original.owner, host: `other-${hostname()}`.slice(0, 255) };
  writeFileSync(join(path, 'owner.json'), JSON.stringify(owner));
  const replacement = await acquireSyncLock(path, interactive(async () => true));
  assert.notEqual(replacement.owner.id, original.owner.id);
  await assert.rejects(async () => releaseSyncLock(path, original), /changed/);
  assert.equal(JSON.parse(readFileSync(join(path, 'owner.json'))).id, replacement.owner.id);
  releaseSyncLock(path, replacement);
});

test('replacement while confirmation is pending is preserved', async t => {
  const path = fixture(t);
  mkdirSync(path);
  let replacement;
  await assert.rejects(acquireSyncLock(path, interactive(async () => {
    rmSync(path, { recursive: true });
    replacement = await acquireSyncLock(path, quiet);
    return true;
  })), /changed during confirmation/);
  releaseSyncLock(path, replacement);
});

test('concurrent recovery prompts cannot both take ownership', async t => {
  const path = fixture(t);
  mkdirSync(path);
  let approveFirst;
  const first = acquireSyncLock(path, interactive(() => new Promise(resolve => { approveFirst = resolve; })));
  const second = await acquireSyncLock(path, interactive(async () => true));
  approveFirst(true);
  await assert.rejects(first, /changed during confirmation/);
  releaseSyncLock(path, second);
});

test('unknown contents and invalid or oversized metadata are never removed', async t => {
  for (const [file, content] of [['unexpected', 'data'], ['owner.json', '{'], ['owner.json', 'x'.repeat(4097)]]) {
    const path = fixture(t);
    mkdirSync(path);
    writeFileSync(join(path, file), content);
    await assert.rejects(acquireSyncLock(path, interactive(() => assert.fail('must not ask'))), /inspect it manually/);
    assert.equal(readFileSync(join(path, file), 'utf8'), content);
    assert.equal(existsSync(`${path}.guard`), false);
  }
});

test('maintenance guard prevents acquire and release; it is never automatically cleared', async t => {
  const path = fixture(t);
  const lock = await acquireSyncLock(path, quiet);
  mkdirSync(`${path}.guard`);
  await assert.rejects(acquireSyncLock(path, interactive(() => assert.fail('must not ask'))), /maintenance is in progress/);
  assert.throws(() => releaseSyncLock(path, lock), /maintenance is in progress/);
  assert.equal(existsSync(`${path}.guard`), true);
  rmSync(`${path}.guard`, { recursive: true });
  releaseSyncLock(path, lock);
});
