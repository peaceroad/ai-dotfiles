import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const inputs = {
  '.codex/AGENTS.md': 'Synthetic shared instructions.\n',
  '.codex/config.toml': '# Shared settings start here.\nmodel = "synthetic-model"\n# Shared settings end here.\nprivate_note = "not exported"\n',
  '.codex/browser/config.toml': 'browser = "synthetic"\n',
  '.agents/ai-dotfiles/skill-links.json': JSON.stringify({ schemaVersion: 1, linkRoot: '~/.agents/skills', skills: {
    'fixture-skill': '~/repository/plugins/fixture-skill',
    'unrelated-skill': '~/elsewhere',
  } }) + '\n',
  '.agents/scripts/check-lf.mjs': '// Synthetic export fixture.\nexport const fixture = true;\n',
};

function fixture(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'agent-export-policy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'synthetic-home');
  const repository = join(home, 'repository');
  mkdirSync(repository, { recursive: true });
  const exporter = join(repository, 'export.mjs');
  copyFileSync(new URL('./export.js', import.meta.url), exporter);
  // Exercise the checked-in selection rather than a second copy of its path list.
  copyFileSync(new URL('./export.yaml', import.meta.url), join(repository, 'export.yaml'));
  for (const [path, content] of Object.entries(inputs)) {
    const target = join(home, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return { home, repository, destination: join(repository, 'home'), run(...args) {
    return spawnSync(process.execPath, [exporter, ...args], {
      cwd: repository, encoding: 'utf8',
      // os.homedir() uses HOME on POSIX and USERPROFILE on Windows.
      env: { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
  } };
}

function files(root, prefix = '') {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? files(join(root, entry.name), path) : [path];
  }).sort();
}

test('configured export dry run is isolated, and writes only selected synthetic content', t => {
  const f = fixture(t);
  const dryRun = f.run('--dry-run');
  assert.equal(dryRun.status, 0, dryRun.stdout + dryRun.stderr);
  assert.match(dryRun.stdout, /No potential issues found\./);
  assert.match(dryRun.stdout, /Dry run only\./);
  assert.equal(existsSync(f.destination), false);

  const written = f.run('--write');
  assert.equal(written.status, 0, written.stdout + written.stderr);
  assert.deepEqual(files(f.destination), Object.keys(inputs).sort());
  const expected = { ...inputs,
    '.codex/config.toml': 'model = "synthetic-model"\n',
    '.agents/ai-dotfiles/skill-links.json': JSON.stringify({ schemaVersion: 1, linkRoot: '~/.agents/skills',
      skills: { 'fixture-skill': '~/repository/plugins/fixture-skill' } }, null, 2) + '\n',
  };
  for (const [path, content] of Object.entries(expected)) {
    assert.equal(readFileSync(join(f.destination, path), 'utf8'), content, path);
    assert.equal(readFileSync(join(f.home, path), 'utf8'), inputs[path], `source unchanged: ${path}`);
  }
  const repeated = f.run('--write');
  assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr);
  assert.match(repeated.stdout, /All 5 file\(s\) are already up to date\./);
});

test('missing configured export inputs fail both dry run and write without creating output', t => {
  const f = fixture(t);
  rmSync(join(f.home, '.codex/browser/config.toml'));
  for (const mode of ['--dry-run', '--write']) {
    const result = f.run(mode);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ENOENT/);
    assert.equal(result.stderr.includes(f.home), false);
    assert.equal(existsSync(f.destination), false);
  }
  mkdirSync(join(f.destination, '.codex'), { recursive: true });
  writeFileSync(join(f.destination, '.codex/AGENTS.md'), 'previously exported instructions\n');
  for (const mode of ['--dry-run', '--write']) {
    const result = f.run(mode);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ENOENT/);
    assert.deepEqual(files(f.destination), ['.codex/AGENTS.md']);
    assert.equal(readFileSync(join(f.destination, '.codex/AGENTS.md'), 'utf8'), 'previously exported instructions\n');
  }
});

test('sensitive synthetic content blocks dry run and write without changing existing output', t => {
  const f = fixture(t);
  // Deliberately invalid synthetic token; never copy a real credential into a fixture.
  writeFileSync(join(f.home, '.codex/AGENTS.md'), `sk-${'a'.repeat(24)}\n`);
  mkdirSync(join(f.destination, '.codex'), { recursive: true });
  writeFileSync(join(f.destination, '.codex/AGENTS.md'), 'previously exported instructions\n');
  writeFileSync(join(f.destination, 'sentinel.txt'), 'preserve this output\n');
  for (const mode of ['--dry-run', '--write']) {
    const result = f.run(mode);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /sk-prefixed API key/);
    assert.match(result.stderr, /no files were changed/);
    assert.ok(result.stderr.includes(mode === '--write' ? 'npm run build' : 'npm run check:export'));
    assert.deepEqual(files(f.destination), ['.codex/AGENTS.md', 'sentinel.txt']);
    assert.equal(readFileSync(join(f.destination, '.codex/AGENTS.md'), 'utf8'), 'previously exported instructions\n');
    assert.equal(readFileSync(join(f.destination, 'sentinel.txt'), 'utf8'), 'preserve this output\n');
  }
});

test('export rejects private agent data, nested paths, and broad parent selections before writing', t => {
  const f = fixture(t);
  for (const path of [
    '.agents', '.agents/ai-dotfiles', '.agents/ai-dotfiles/development.json',
    '.agents/ai-dotfiles/state/marketplaces/team.json', '.agents/development.json', '.agents/skill-links.json',
    '.agents/ai-dotfiles/codex-session-export.json',
  ]) {
    writeFileSync(join(f.repository, 'export.yaml'), `paths:\n  - ${path}\n`);
    const result = f.run('--write');
    assert.notEqual(result.status, 0, path);
    assert.match(result.stderr, /must not be exported|must be below/, path);
    assert.equal(existsSync(f.destination), false);
  }
});
