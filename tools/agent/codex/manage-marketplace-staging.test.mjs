import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect, clean, main, assertClientsClosed, MIN_AGE_MS } from './manage-marketplace-staging.mjs';

const name = 'openai-bundled.staging-12345678-1234-1234-1234-123456789abc';
const name2 = 'openai-bundled.staging-22345678-1234-1234-1234-123456789abc';
function fixture(t) {
  const base = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'marketplace-staging-test-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = join(base, 'codex');
  const root = join(home, '.tmp', 'bundled-marketplaces');
  const target = join(root, name);
  fs.mkdirSync(join(target, 'plugin'), { recursive: true });
  fs.writeFileSync(join(target, 'plugin', 'data'), 'abc');
  fs.mkdirSync(join(root, 'openai-bundled'));
  fs.writeFileSync(join(root, 'openai-bundled', 'keep'), 'canonical');
  fs.writeFileSync(join(home, 'config.toml'), 'keep');
  const now = Date.now() + MIN_AGE_MS * 2;
  const messages = [];
  const options = { now: () => now, closed: () => {}, confirm: async () => true, log: m => messages.push(m) };
  return { base, home, root, target, now, options, messages };
}

test('read-only inspection and scoped deletion preserve canonical and unrelated content', async t => {
  const f = fixture(t);
  const report = inspect(f.home, f.now);
  assert.equal(report.entries[0].bytes, 3);
  assert.equal('nodes' in report.entries[0], false);
  assert.ok(fs.existsSync(f.target));
  assert.equal(await clean(f.home, f.options), 0);
  assert.ok(!fs.existsSync(f.target));
  assert.equal(fs.readFileSync(join(f.root, 'openai-bundled', 'keep'), 'utf8'), 'canonical');
  assert.equal(fs.readFileSync(join(f.home, 'config.toml'), 'utf8'), 'keep');
  assert.equal(await clean(f.home, f.options), 0);
});

test('recent descendant, malformed name, and future timestamp remain untouched', async t => {
  const f = fixture(t);
  const recent = new Date(f.now - 1000);
  fs.utimesSync(join(f.target, 'plugin', 'data'), recent, recent);
  fs.mkdirSync(join(f.root, 'openai-bundled.staging-unknown'));
  assert.equal(await clean(f.home, f.options), 3);
  assert.ok(fs.existsSync(f.target));
  fs.utimesSync(join(f.target, 'plugin', 'data'), new Date(f.now + 1000), new Date(f.now + 1000));
  assert.ok(inspect(f.home, f.now).entries.every(e => !e.eligible));
});

test('new creation with old mtime is not eligible', t => {
  const f = fixture(t);
  fs.utimesSync(f.target, new Date(0), new Date(0));
  fs.utimesSync(join(f.target, 'plugin', 'data'), new Date(0), new Date(0));
  assert.equal(inspect(f.home).entries[0].eligible, false);
});

test('links and redirected storage are rejected without traversing/deleting their targets', async t => {
  const f = fixture(t);
  const outside = join(f.base, 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(join(outside, 'keep'), 'outside');
  fs.symlinkSync(outside, join(f.target, 'redirect'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(await clean(f.home, f.options), 3);
  assert.equal(fs.readFileSync(join(outside, 'keep'), 'utf8'), 'outside');
  const redirected = join(f.base, 'redirected');
  fs.symlinkSync(f.home, redirected, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => inspect(redirected), /redirected storage/);
});

test('hard links are excluded', async t => {
  const f = fixture(t);
  fs.linkSync(join(f.target, 'plugin', 'data'), join(f.base, 'hardlink'));
  assert.equal(await clean(f.home, f.options), 3);
  assert.equal(fs.readFileSync(join(f.base, 'hardlink'), 'utf8'), 'abc');
});

for (const lock of ['openai-bundled.refresh.lock', '.ai-dotfiles-marketplace-staging.lock']) {
  test(`existing ${lock} blocks cleanup`, async t => {
    const f = fixture(t);
    fs.writeFileSync(join(f.root, lock), '');
    await assert.rejects(clean(f.home, f.options), /lock exists/);
    assert.ok(fs.existsSync(f.target));
    assert.ok(fs.existsSync(join(f.root, lock)));
  });
}

test('cancel and process inspection failure leave candidates intact', async t => {
  const f = fixture(t);
  assert.equal(await clean(f.home, { ...f.options, confirm: async () => false }), 0);
  await assert.rejects(clean(f.home, { ...f.options, closed: () => { throw Error('running'); } }), /running/);
  assert.ok(fs.existsSync(f.target));
});

test('post-confirmation changes abort before deleting any candidate', async t => {
  const f = fixture(t);
  fs.mkdirSync(join(f.root, name2));
  await assert.rejects(clean(f.home, { ...f.options, confirm: async () => {
    fs.writeFileSync(join(f.root, name2, 'new'), 'new');
    return true;
  } }), /changed since confirmation/);
  assert.ok(fs.existsSync(f.target));
  assert.ok(!fs.existsSync(join(f.root, '.ai-dotfiles-marketplace-staging.lock')));
});

test('client restart after confirmation aborts', async t => {
  const f = fixture(t);
  let checks = 0;
  await assert.rejects(clean(f.home, { ...f.options, closed: () => { if (++checks === 2) throw Error('restarted'); } }), /restarted/);
  assert.ok(fs.existsSync(f.target));
});

test('rechecks detect same-size file edits even when mtime is restored', async t => {
  const f = fixture(t);
  const file = join(f.target, 'plugin', 'data');
  const before = fs.statSync(file);
  await assert.rejects(clean(f.home, { ...f.options, confirm: async () => {
    // Avoid performing both writes in the same clock tick on the test filesystem.
    await new Promise(resolve => setTimeout(resolve, 20));
    fs.writeFileSync(file, 'xyz');
    fs.utimesSync(file, before.atime, before.mtime);
    return true;
  } }), /changed since confirmation/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'xyz');
  assert.ok(fs.existsSync(f.target));
});

test('a later candidate changed after preflight is kept; earlier removal is reported', async t => {
  const f = fixture(t);
  const later = join(f.root, name2);
  fs.mkdirSync(later);
  fs.writeFileSync(join(later, 'data'), 'abc');
  let checks = 0;
  await assert.rejects(clean(f.home, { ...f.options, closed: () => {
    if (++checks === 4) fs.writeFileSync(join(later, 'data'), 'changed');
  } }), /changed since confirmation/);
  assert.ok(!fs.existsSync(f.target));
  assert.equal(fs.readFileSync(join(later, 'data'), 'utf8'), 'changed');
  assert.match(f.messages.join('\n'), /Stopped: 1 directories fully removed/);
});

test('partial failure is reported and helper lock released', async t => {
  const f = fixture(t);
  fs.mkdirSync(join(f.root, name2));
  let checks = 0;
  await assert.rejects(clean(f.home, { ...f.options, closed: () => { if (++checks === 4) throw Error('restarted'); } }), /restarted/);
  assert.ok(!fs.existsSync(f.target));
  assert.ok(fs.existsSync(join(f.root, name2)));
  assert.match(f.messages.join('\n'), /Stopped: 1 directories fully removed/);
  assert.ok(!fs.existsSync(join(f.root, '.ai-dotfiles-marketplace-staging.lock')));
});

test('process checks reject running clients and failed or unparseable inventories', () => {
  if (!process.env.SystemRoot && !process.env.WINDIR) return;
  const result = stdout => () => ({ status: 0, stdout });
  assert.doesNotThrow(() => assertClientsClosed({ spawn: result('"System","4","Services","0","0 K"\r\n') }));
  assert.throws(() => assertClientsClosed({ spawn: result('"codex.exe","123","Console","1","0 K"\r\n') }), /running/);
  assert.throws(() => assertClientsClosed({ spawn: result('Access denied') }), /could not be parsed/);
  assert.throws(() => assertClientsClosed({ spawn: () => ({ status: 1 }) }), /inspection failed/);
});

test('CLI validates arguments and OS without writes; missing target stays missing', async t => {
  const f = fixture(t);
  const log = () => {};
  assert.equal(await main(['clean', '--yes'], { log }), 2);
  assert.equal(await main(['status'], { log, platform: 'linux' }), 1);
  assert.equal(await main(['help'], { log }), 0);
  const missing = join(f.base, 'missing');
  assert.equal(inspect(missing).entries.length, 0);
  assert.ok(!fs.existsSync(missing));
});
