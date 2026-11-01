import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const cli = join(import.meta.dirname, 'agent.mjs');
function fixture(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'catalog-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = join(root, 'development.json');
  writeFileSync(config, '{ invalid synthetic configuration');
  return { root, run: args => spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8', cwd: root,
    env: { ...process.env, AGENT_DEV_HOME: root, AGENT_DEV_CONFIG: config },
  }) };
}
const command = (...args) => ['dev', 'marketplace', 'catalog', ...args];
function success(result) { assert.equal(result.status, 0, result.stdout + result.stderr); return result; }

test('global and scoped catalog help works without development settings or writes', t => {
  const { root, run } = fixture(t);
  for (const args of [[], ['--help'], ['dev', '--help'], ['dev', 'marketplace', '--help']]) {
    assert.match(success(run(args)).stdout, /catalog/);
  }
  for (const args of [command(), command('--help'), ['dev', 'mp', 'catalog', '-h'],
    ...['init', 'list', 'check', 'add', 'update', 'remove'].flatMap(action => [command(action, '--help'), command(action, 'help')])]) {
    assert.match(success(run(args)).stdout, /agent dev marketplace catalog/);
  }
  assert.deepEqual(readdirSync(root), ['development.json']);
});

test('catalog actions remain standalone with malformed development settings', t => {
  const { root, run } = fixture(t);
  const target = join(root, 'catalog');
  mkdirSync(target);
  success(run(command('init', target, '--format', 'codex', '--name', 'sample', '--yes')));
  const manifest = join(target, '.agents', 'plugins', 'marketplace.json');
  success(run(command('add', target, 'sample-plugin', '--format', 'codex', '--repo', 'sample-owner/sample-plugin', '--ref', 'main', '--yes')));
  assert.match(success(run(command('list', target, '--format', 'codex'))).stdout, /sample-plugin/);
  success(run(command('check', target, '--format', 'codex')));
  success(run(command('update', target, 'sample-plugin', '--format', 'codex', '--ref', 'stable', '--yes')));
  assert.match(readFileSync(manifest, 'utf8'), /stable/);
  success(run(command('remove', target, 'sample-plugin', '--format', 'codex', '--yes')));
  assert.equal(JSON.parse(readFileSync(manifest, 'utf8')).plugins.length, 0);
  assert.equal(existsSync(join(root, '.agents')), false);
});

test('catalog invalid arguments and dry run create no directories or locks', t => {
  const { root, run } = fixture(t);
  const target = join(root, 'new-catalog');
  for (const args of [
    ['init', target, '--name', 'sample', '--yes'],
    ['init', target, '--format', 'other', '--name', 'sample', '--yes'],
    ['init', target, '--format', 'codex', '--name', 'sample', '--unknown', '--yes'],
    ['init', target, '--format', 'codex', '--format', 'claude', '--name', 'sample', '--yes'],
    ['add', target, 'sample-plugin', '--format', 'codex', '--repo'],
  ]) {
    const result = run(command(...args));
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.equal(existsSync(target), false);
  }
  mkdirSync(target);
  success(run(command('init', target, '--format', 'codex', '--name', 'sample', '--dry-run')));
  assert.deepEqual(readdirSync(target), []);
});

test('catalog non-interactive mutation requires confirmation and --yes does not bypass management guards', t => {
  const { root, run } = fixture(t);
  const target = join(root, 'catalog');
  mkdirSync(target);
  const unconfirmed = run(command('init', target, '--format', 'codex', '--name', 'sample'));
  assert.notEqual(unconfirmed.status, 0);
  assert.deepEqual(readdirSync(target), []);
  mkdirSync(join(target, '.agents', 'marketplace-development'), { recursive: true });
  writeFileSync(join(target, '.agents', 'marketplace-development', 'config.json'), '{}');
  const guarded = run(command('init', target, '--format', 'codex', '--name', 'sample', '--yes'));
  assert.notEqual(guarded.status, 0);
  assert.equal(existsSync(join(target, '.agents', 'plugins')), false);
});

test('catalog check returns nonzero for unverified sources while list remains read-only', t => {
  const { root, run } = fixture(t);
  const target = join(root, 'catalog');
  mkdirSync(target);
  success(run(command('init', target, '--format', 'codex', '--name', 'sample', '--yes')));
  const manifest = join(target, '.agents', 'plugins', 'marketplace.json');
  const document = JSON.parse(readFileSync(manifest, 'utf8'));
  document.plugins.push({ name: 'future-plugin', source: { source: 'future-type', location: 'opaque' } });
  writeFileSync(manifest, JSON.stringify(document));
  const before = readFileSync(manifest);
  success(run(command('list', target, '--format', 'codex')));
  assert.notEqual(run(command('check', target, '--format', 'codex')).status, 0);
  assert.deepEqual(readFileSync(manifest), before);
});
