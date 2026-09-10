import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { installAgent } from './install-agent.mjs';
import { CODEX_TOOLS } from '../tools/agent/codex/codex.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'agent-install-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { agentsRoot: join(root, 'space and 日本語', '.agents'), binDir: join(root, 'bin'), searchPath: '', log() {} };
}

function verifyInstalledDefaults(options) {
  const data = join(options.agentsRoot, 'ai-dotfiles');
  assert.equal(fs.existsSync(join(data, 'development.schema.json')), true);
  assert.equal(fs.existsSync(join(options.agentsRoot, 'development.schema.json')), false);
  const config = join(data, 'development.json');
  fs.writeFileSync(join(data, 'skill-links.json'), '{"schemaVersion":1,"linkRoot":"~/.agents/skills","skills":{"sample-skill":"~/repos/sample-skill"}}\n');
  const source = join(options.agentsRoot, '..', 'plugin-source');
  fs.mkdirSync(source);
  fs.writeFileSync(join(source, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'sample-plugin', version: '1.0.0', description: 'Test plugin.' }));
  fs.writeFileSync(config, JSON.stringify({ schemaVersion: 2,
    plugins: { sample: { repository: source, pluginRoot: '.' } },
    marketplaces: { team: { root: join(options.agentsRoot, '..', 'shared'), name: 'test-team', displayName: 'Test Team', mode: 'authoritative', plugins: [{ target: 'sample', category: 'Tools' }] } },
  }));
  for (const args of [['dev'], ['dev', 'skill', 'status'], ['dev', 'plugin', 'check', 'sample'], ['dev', 'marketplace', 'sync', 'team'], ['dev', 'marketplace', 'check', 'team']]) {
    const result = spawnSync(process.execPath, [join(options.agentsRoot, 'ai-dotfiles', 'runtime', 'agent.mjs'), ...args], {
      encoding: 'utf8',
      env: { ...process.env, AGENT_DEV_HOME: join(options.agentsRoot, '..'), AGENT_DEV_CONFIG: '', AGENT_DEV_SKILL_LINKS: '', AGENT_DEV_SKILL_MANAGER: '', AGENT_DEV_LOCAL_PLUGIN_MANAGER: '', AGENT_DEV_MARKETPLACE_MANAGER: '' },
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  assert.equal(fs.existsSync(join(options.agentsRoot, 'scripts', 'agent.mjs')), false);
  assert.equal(fs.existsSync(join(options.agentsRoot, 'scripts', 'manage-skill-links.mjs')), false);
  assert.equal(fs.existsSync(join(options.agentsRoot, 'scripts', 'agent-runtime')), false);
}

test('dry run creates nothing for each supported platform', t => {
  const options = fixture(t);
  for (const platform of ['win32', 'linux', 'darwin']) {
    const output = [];
    installAgent({ ...options, platform, dryRun: true, log: line => output.push(line) });
    assert.ok(output.some(line => line.includes('/ai-dotfiles/development.schema.json')));
  }
  assert.equal(fs.existsSync(options.agentsRoot), false);
  assert.equal(fs.existsSync(options.binDir), false);
});

test('shared installation preserves configuration, is idempotent, and preflights all collisions', t => {
  const options = { ...fixture(t), platform: 'win32' };
  fs.mkdirSync(options.agentsRoot, { recursive: true });
  const config = join(options.agentsRoot, 'ai-dotfiles', 'development.json');
  fs.mkdirSync(join(options.agentsRoot, 'ai-dotfiles'));
  fs.writeFileSync(config, '{"schemaVersion":2,"plugins":{},"marketplaces":{}}\n');
  installAgent(options);
  const implementation = join(options.agentsRoot, 'ai-dotfiles', 'runtime', 'agent.mjs');
  const timestamp = fs.statSync(implementation).mtimeMs;
  installAgent(options);
  assert.equal(fs.statSync(implementation).mtimeMs, timestamp);
  assert.equal(fs.readFileSync(config, 'utf8'), '{"schemaVersion":2,"plugins":{},"marketplaces":{}}\n');
  const command = join(options.agentsRoot, 'scripts', 'agent.cmd');
  fs.writeFileSync(command, 'rem @ai-dotfiles agent-dev-runtime managed\nstale');
  fs.writeFileSync(implementation, 'unmanaged');
  assert.throws(() => installAgent(options), /unmanaged/);
  assert.match(fs.readFileSync(command, 'utf8'), /stale/);
  installAgent({ ...options, force: true });
  const result = spawnSync(process.execPath, [implementation, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  verifyInstalledDefaults(options);
});

test('Codex payload is self-contained and collisions are checked before updates', t => {
  const options = { ...fixture(t), platform: 'win32' };
  installAgent(options);
  const runtime = join(options.agentsRoot, 'ai-dotfiles', 'runtime');
  assert.equal(fs.existsSync(join(options.agentsRoot, 'skills')), false);
  assert.equal(fs.existsSync(join(options.agentsRoot, 'ai-dotfiles', 'codex-session-export.json')), false);
  assert.deepEqual(fs.readdirSync(join(runtime, 'codex')).sort(), [...new Set(['codex.mjs', ...CODEX_TOOLS.flatMap(tool => [tool.file, ...(tool.supportFiles ?? [])])])].sort());
  const env = { ...process.env, AGENT_DEV_CONFIG: join(options.agentsRoot, 'missing.json') };
  for (const entry of ['agent.mjs', 'codex/codex.mjs']) {
    const result = spawnSync(process.execPath, [join(runtime, entry), ...(entry === 'agent.mjs' ? ['codex'] : []), '--help'], { encoding: 'utf8', env });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Codex diagnostics/);
  }
  for (const tool of CODEX_TOOLS.filter(tool => tool.file.endsWith('.mjs'))) {
    const result = spawnSync(process.execPath, [join(runtime, 'codex', tool.file), 'help'], { encoding: 'utf8', env });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  const command = join(options.agentsRoot, 'scripts', 'agent.cmd');
  fs.writeFileSync(command, 'rem @ai-dotfiles agent-dev-runtime managed\nstale');
  const helper = join(runtime, 'codex', CODEX_TOOLS[0].file);
  fs.writeFileSync(helper, 'unmanaged helper');
  assert.throws(() => installAgent(options), /unmanaged/);
  assert.match(fs.readFileSync(command, 'utf8'), /stale/);
  assert.equal(fs.readFileSync(helper, 'utf8'), 'unmanaged helper');
});

test('runtime updates preserve separately managed skills, including legacy installer copies', t => {
  const options = { ...fixture(t), platform: 'win32' };
  const skills = join(options.agentsRoot, 'skills');
  const legacy = join(skills, 'codex-history', 'SKILL.md');
  const custom = join(skills, 'ai-dotfiles-cli', 'SKILL.md');
  fs.mkdirSync(join(skills, 'codex-history'), { recursive: true });
  fs.mkdirSync(join(skills, 'ai-dotfiles-cli'));
  fs.writeFileSync(legacy, '<!-- @ai-dotfiles agent-dev-runtime managed -->\nLegacy user-edited copy.\n');
  fs.writeFileSync(custom, 'Independently managed skill.\n');
  const before = [legacy, custom].map(path => fs.readFileSync(path));
  installAgent(options);
  installAgent({ ...options, force: true });
  assert.deepEqual([legacy, custom].map(path => fs.readFileSync(path)), before);
  assert.deepEqual(fs.readdirSync(skills).sort(), ['ai-dotfiles-cli', 'codex-history']);
});

test('ownership stays within the first eight lines and late collisions prevent all writes', t => {
  const options = { ...fixture(t), platform: 'win32' };
  const command = join(options.agentsRoot, 'scripts', 'agent.cmd');
  fs.mkdirSync(join(options.agentsRoot, 'scripts'), { recursive: true });
  const ninthLineMarker = '\r\n'.repeat(8) + 'rem @ai-dotfiles agent-dev-runtime managed\r\n';
  fs.writeFileSync(command, ninthLineMarker);
  assert.throws(() => installAgent(options), /unmanaged/);
  assert.equal(fs.existsSync(join(options.agentsRoot, 'ai-dotfiles')), false);
  assert.equal(fs.readFileSync(command, 'utf8'), ninthLineMarker);
  fs.writeFileSync(command, '\r\n'.repeat(7) + 'rem @ai-dotfiles agent-dev-runtime managed\r\n');
  const installed = [];
  installAgent({ ...options, log: line => installed.push(line) });
  assert.match(installed.at(-2), /\/runtime\/agent\.mjs$/);
  assert.match(installed.at(-1), /\/scripts\/agent\.cmd$/);
});

test('Unix command collisions reject even force before writing runtime', t => {
  const options = fixture(t);
  fs.mkdirSync(options.binDir);
  fs.writeFileSync(join(options.binDir, 'agent'), 'another command');
  for (const platform of ['linux', 'darwin']) {
    assert.throws(() => installAgent({ ...options, platform, force: true }), /collision/);
    assert.equal(fs.existsSync(options.agentsRoot), false);
  }
});

test('directory targets reject even force', t => {
  const options = { ...fixture(t), platform: 'win32', force: true };
  fs.mkdirSync(join(options.agentsRoot, 'ai-dotfiles', 'runtime', 'agent.mjs'), { recursive: true });
  assert.throws(() => installAgent(options), /regular file/);
  assert.equal(fs.existsSync(join(options.agentsRoot, 'scripts', 'agent.cmd')), false);
});

test('native Unix entry executes with its runtime and repairs execute permission', { skip: process.platform === 'win32' }, t => {
  const options = fixture(t);
  installAgent(options);
  verifyInstalledDefaults(options);
  const entry = join(options.binDir, 'agent');
  assert.equal(fs.lstatSync(entry).isSymbolicLink(), true);
  assert.equal(fs.existsSync(join(options.agentsRoot, 'scripts', 'agent.cmd')), false);
  const result = spawnSync(entry, ['--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  fs.chmodSync(join(options.agentsRoot, 'ai-dotfiles', 'runtime', 'agent.mjs'), 0o644);
  installAgent(options);
  assert.notEqual(fs.statSync(entry).mode & 0o111, 0);
  fs.unlinkSync(entry);
  fs.symlinkSync('unrelated-missing-target', entry);
  assert.throws(() => installAgent({ ...options, force: true }), /collision/);
});

test('native Unix refuses redirected runtime directories', { skip: process.platform === 'win32' }, t => {
  const options = fixture(t);
  fs.mkdirSync(options.agentsRoot, { recursive: true });
  fs.mkdirSync(options.binDir);
  fs.symlinkSync(options.binDir, join(options.agentsRoot, 'ai-dotfiles'));
  assert.throws(() => installAgent({ ...options, force: true }), /real directory/);
  assert.deepEqual(fs.readdirSync(options.binDir), []);
});


test('Unix PATH collision is detected before runtime writes', t => {
  const options = fixture(t);
  const otherBin = join(options.binDir, 'other');
  fs.mkdirSync(otherBin, { recursive: true });
  fs.writeFileSync(join(otherBin, 'agent'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  assert.throws(() => installAgent({ ...options, platform: 'linux', searchPath: otherBin }), /already on PATH/);
  assert.equal(fs.existsSync(options.agentsRoot), false);
});


test('Unix reinstall accepts its own command through an aliased parent', { skip: process.platform === 'win32' }, t => {
  const options = fixture(t);
  const actual = join(options.binDir, 'actual');
  const alias = join(options.binDir, 'alias');
  fs.mkdirSync(actual, { recursive: true });
  fs.symlinkSync(actual, alias);
  const throughAlias = { ...options, agentsRoot: join(alias, '.agents'), binDir: join(alias, 'bin') };
  installAgent(throughAlias);
  installAgent({ ...throughAlias, searchPath: throughAlias.binDir });
  const result = spawnSync(join(throughAlias.binDir, 'agent'), ['--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('macOS zsh finds and launches agent through PATH', { skip: process.platform !== 'darwin' }, t => {
  const options = fixture(t);
  installAgent(options);
  const result = spawnSync('/bin/zsh', ['-f', '-c', 'agent --help'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${options.binDir}:${process.env.PATH ?? ''}` },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Agent Skill/);
});


test('unsupported Node version is rejected before installation', t => {
  const options = fixture(t);
  const descriptor = Object.getOwnPropertyDescriptor(process.versions, 'node');
  try {
    Object.defineProperty(process.versions, 'node', { ...descriptor, value: '22.12.0' });
    assert.throws(() => installAgent(options), /Node.js 24 or later/);
    assert.equal(fs.existsSync(options.agentsRoot), false);
  } finally { Object.defineProperty(process.versions, 'node', descriptor); }
});


test('empty PATH entry still detects a command in the current directory', t => {
  const options = fixture(t);
  fs.mkdirSync(options.binDir, { recursive: true });
  fs.writeFileSync(join(options.binDir, 'agent'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const previousDirectory = process.cwd();
  try {
    process.chdir(options.binDir);
    assert.throws(() => installAgent({ ...options, binDir: join(options.binDir, 'new-bin'), platform: 'linux', searchPath: '' }), /already on PATH/);
    assert.equal(fs.existsSync(options.agentsRoot), false);
  } finally { process.chdir(previousDirectory); }
});

test('existing installation roots use filesystem canonical spelling', { skip: process.platform === 'win32' }, t => {
  const options = fixture(t);
  const root = join(options.binDir, 'MixedCase');
  fs.mkdirSync(root, { recursive: true });
  const otherSpelling = join(options.binDir, 'mixedcase');
  if (!fs.existsSync(otherSpelling)) return t.skip('Case-sensitive filesystem');
  installAgent({ ...options, agentsRoot: root });
  installAgent({ ...options, agentsRoot: otherSpelling });
  assert.equal(fs.realpathSync(join(options.binDir, 'agent')), join(fs.realpathSync(root), 'ai-dotfiles', 'runtime', 'agent.mjs'));
});
