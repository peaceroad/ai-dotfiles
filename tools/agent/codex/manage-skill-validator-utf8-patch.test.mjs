import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { classifyValidator, replaceKnownFile } from './manage-skill-validator-utf8-patch.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const manager = join(here, 'manage-skill-validator-utf8-patch.mjs');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const originalLine = 'content = skill_md.read_text()';
const patchedLine = 'content = skill_md.read_text(encoding="utf-8")  # Managed by manage-skill-validator-utf8-patch.mjs';
const variants = [
  ['skills', '5347a0a09cfb546bba1c0d1a30dae0a233d9a05f57bd4e7877155c588bcdabf7', '3271802f366bd5bdc3498ac7b2d9805920c0392ca3b6f5f58fa9989448500887'],
  ['preformat', '547af3cec2ae71ac2a4ef606365d23a8c58b586862211e9c7a9be7bfd0e30fbb', '8467d14095ffec0f1e079fd37c8e5768e0164ee66205ec87c91baaffb49807d8'],
  ['formatted', '6068513d924ed3559e186dfcdead7439129828dcf402167fd925c06dffbf2806', '60d7a11365c2f3f1ec22e57f749c18aaa50177e62f9e284de2f03fa46e3c2ce7'],
].map(([name, originalHash, patchedHash]) => {
  const text = fs.readFileSync(join(here, 'fixtures', 'skill-validator', `quick-validate-${name}.py`), 'utf8').replaceAll('\r\n', '\n').replaceAll('\n', '\r\n');
  return { name, originalHash, patchedHash, original: Buffer.from(text), patched: Buffer.from(text.replace(originalLine, patchedLine)) };
});

function fixture(t, bytes = Buffer.from('original synthetic bytes')) {
  const home = fs.mkdtempSync(join(tmpdir(), 'validator-boundary-test-'));
  t.after(() => fs.rmSync(home, { force: true, recursive: true }));
  const path = join(home, '.codex', 'skills', '.system', 'skill-creator', 'scripts', 'quick_validate.py');
  fs.mkdirSync(dirname(path), { recursive: true });
  fs.writeFileSync(path, bytes, { mode: 0o640 });
  const before = fs.statSync(path);
  const bootstrap = join(home, 'confirm.mjs');
  fs.writeFileSync(bootstrap, `import readline from 'node:readline/promises';
import { syncBuiltinESMExports } from 'node:module';
readline.createInterface = () => ({ question: async () => process.env.TEST_CONFIRM, close() {} });
syncBuiltinESMExports();
Object.defineProperty(process.stdin, 'isTTY', { value: true });
Object.defineProperty(process.stdout, 'isTTY', { value: true });\n`);
  const env = { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: join(home, '.codex'), PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1' };
  const cli = (command, { answer = 'y', interactive = true } = {}) => spawnSync(process.execPath,
    [...(interactive ? ['--import', bootstrap] : []), manager, command],
    { env: { ...env, TEST_CONFIRM: answer }, encoding: 'utf8', cwd: home, timeout: 15000 });
  return { home, path, before, env, cli, read: () => fs.readFileSync(path), replace: (next, options = {}) => replaceKnownFile(sha256(bytes), next, sha256(next), { path, ...options }) };
}

for (const variant of variants) {
  test(`${variant.name} public fixture matches both reviewed hashes`, () => {
    assert.equal(sha256(variant.original), variant.originalHash);
    assert.equal(sha256(variant.patched), variant.patchedHash);
    assert.equal(classifyValidator(variant.original).kind, 'known-unpatched');
    assert.equal(classifyValidator(variant.patched).kind, 'known-patched');
  });

  test(`${variant.name} CLI apply, repeated apply and restore preserve the file identity`, t => {
    const f = fixture(t, variant.original);
    const python = spawnSync('python', ['-c', 'import yaml'], { env: f.env, encoding: 'utf8', timeout: 10000 });
    if (python.error || python.status !== 0) { t.skip('python with PyYAML is required for CLI validation'); return; }
    for (const [command, hash] of [['status', variant.originalHash], ['apply', variant.patchedHash], ['apply', variant.patchedHash], ['restore', variant.originalHash]]) {
      const result = f.cli(command);
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      assert.equal(sha256(f.read()), hash);
      const after = fs.statSync(f.path);
      assert.equal(after.ino, f.before.ino);
      assert.equal(after.dev, f.before.dev);
      assert.equal(after.mode, f.before.mode);
    }
  });
}

test('CLI apply rejects a hard-linked known version before writing either name', t => {
  const f = fixture(t, variants[0].original);
  const alias = join(f.home, 'alias.py');
  fs.linkSync(f.path, alias);
  const result = f.cli('apply');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /hard links/);
  assert.deepEqual(f.read(), variants[0].original);
  assert.deepEqual(fs.readFileSync(alias), variants[0].original);
});

test('CLI cancellation and non-interactive restore leave a known patch unchanged', t => {
  const f = fixture(t, variants[0].patched);
  const cancelled = f.cli('restore', { answer: 'n' });
  assert.equal(cancelled.status, 0);
  assert.match(cancelled.stdout, /Cancelled/);
  assert.deepEqual(f.read(), variants[0].patched);
  const piped = f.cli('restore', { interactive: false });
  assert.equal(piped.status, 1);
  assert.match(piped.stderr, /interactive terminal/);
  assert.deepEqual(f.read(), variants[0].patched);
});

test('UTF-8-looking text inside an unknown string does not establish an upstream fix', t => {
  const source = Buffer.from('example = """\n    content = skill_md.read_text(encoding="utf-8")\n"""\n' + originalLine + '\n');
  const state = classifyValidator(source);
  assert.equal(state.kind, 'unknown-with-utf8-text');
  assert.match(state.description, /manual review required/);
  const f = fixture(t, source);
  const status = f.cli('status');
  assert.equal(status.status, 0);
  assert.match(status.stdout, /does not prove a fix/);
  for (const command of ['apply', 'restore']) {
    const result = f.cli(command);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown validator/);
    assert.deepEqual(f.read(), source);
  }
});

test('unknown and malformed UTF-8 bytes remain unknown', () => {
  assert.equal(classifyValidator(Buffer.from('not a reviewed source')).kind, 'unknown');
  assert.equal(classifyValidator(Buffer.from([0xff, 0xfe, 0xfd])).kind, 'unknown');
});

test('a normal replacement preserves inode, mode and verified bytes', async t => {
  const f = fixture(t);
  const next = Buffer.from('next bytes');
  await f.replace(next);
  assert.deepEqual(f.read(), next);
  assert.equal(fs.statSync(f.path).ino, f.before.ino);
  assert.equal(fs.statSync(f.path).mode, f.before.mode);
});

test('a hard link is refused before open', async t => {
  const f = fixture(t);
  const alias = join(f.home, 'alias');
  fs.linkSync(f.path, alias);
  await assert.rejects(f.replace(Buffer.from('next'), { openFile: () => { throw new Error('must not open'); } }), /hard links/);
  assert.deepEqual(f.read(), fs.readFileSync(alias));
});

test('a file replaced between lstat and open is refused despite matching bytes', async t => {
  const f = fixture(t);
  const before = f.read();
  await assert.rejects(f.replace(Buffer.from('next'), { openFile: async (path, flags) => {
    fs.renameSync(path, join(f.home, 'original'));
    fs.writeFileSync(path, before);
    return open(path, flags);
  } }), /identity or link count changed/);
  assert.deepEqual(f.read(), before);
  assert.deepEqual(fs.readFileSync(join(f.home, 'original')), before);
});

test('an opened different inode is refused before any write', async t => {
  const f = fixture(t);
  const other = join(f.home, 'other');
  fs.writeFileSync(other, f.read());
  const before = f.read();
  await assert.rejects(f.replace(Buffer.from('next'), { openFile: (_path, flags) => open(other, flags) }), /identity or link count changed/);
  assert.deepEqual(f.read(), before);
  assert.deepEqual(fs.readFileSync(other), before);
});

test('a hard link added while reading is caught before the first write', async t => {
  const f = fixture(t);
  const alias = join(f.home, 'late-alias');
  const before = f.read();
  await assert.rejects(f.replace(Buffer.from('next'), { openFile: async (path, flags) => {
    const handle = await open(path, flags);
    const read = handle.read.bind(handle);
    handle.read = async (...args) => {
      const result = await read(...args);
      fs.linkSync(path, alias);
      return result;
    };
    return handle;
  } }), /hard links/);
  assert.deepEqual(f.read(), before);
  assert.deepEqual(fs.readFileSync(alias), before);
});

test('changed bytes are refused and a flush failure restores previous bytes', async t => {
  const f = fixture(t);
  const original = f.read();
  await assert.rejects(replaceKnownFile('0'.repeat(64), Buffer.from('next'), sha256('next'), { path: f.path }), /changed after the preflight/);
  assert.deepEqual(f.read(), original);
  await assert.rejects(f.replace(Buffer.from('longer replacement bytes'), { openFile: async (path, flags) => {
    const handle = await open(path, flags);
    const sync = handle.sync.bind(handle);
    let calls = 0;
    handle.sync = () => ++calls === 1 ? Promise.reject(new Error('synthetic flush failure')) : sync();
    return handle;
  } }), /previous bytes were restored/);
  assert.deepEqual(f.read(), original);
  assert.equal(fs.statSync(f.path).ino, f.before.ino);
  assert.equal(fs.statSync(f.path).mode, f.before.mode);
});
