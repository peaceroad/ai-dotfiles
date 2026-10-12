import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
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
  function run(args, nodeArgs = []) {
    return spawnSync(process.execPath, [...nodeArgs, exporter, ...args], {
      cwd: repository, encoding: 'utf8',
      // os.homedir() uses HOME on POSIX and USERPROFILE on Windows.
      env: { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
  }
  return {
    home, repository, destination: join(repository, 'home'),
    run(...args) { return run(args); },
    runWithPreload(source, ...args) {
      const preload = join(root, 'fault.mjs');
      writeFileSync(preload, source);
      return run(args, ['--import', preload]);
    },
  };
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


function select(f, paths) {
  writeFileSync(join(f.repository, 'export.yaml'), `paths:\n${paths.map(path => `  - ${path}\n`).join('')}`);
}

function write(target, content) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function directoryLink(t, target, link) {
  mkdirSync(dirname(link), { recursive: true });
  try {
    symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    return true;
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip(`Directory links unavailable: ${error.code}`);
      return false;
    }
    throw error;
  }
}

test('replacement detaches hard links without changing source or unrelated linked content', t => {
  const f = fixture(t);
  select(f, ['.codex/config.toml', '.codex/AGENTS.md']);
  const source = join(f.home, '.codex/config.toml');
  const sourceOutput = join(f.destination, '.codex/config.toml');
  const sentinel = join(f.home, 'sentinel.txt');
  const sentinelOutput = join(f.destination, '.codex/AGENTS.md');
  write(sentinel, 'unrelated content to preserve\n');
  mkdirSync(dirname(sourceOutput), { recursive: true });
  linkSync(source, sourceOutput);
  linkSync(sentinel, sentinelOutput);
  if (process.platform !== 'win32') chmodSync(sentinelOutput, 0o751);
  const result = f.run('--write');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(readFileSync(source, 'utf8'), inputs['.codex/config.toml']);
  assert.equal(readFileSync(sentinel, 'utf8'), 'unrelated content to preserve\n');
  assert.equal(readFileSync(sourceOutput, 'utf8'), 'model = "synthetic-model"\n');
  assert.equal(readFileSync(sentinelOutput, 'utf8'), inputs['.codex/AGENTS.md']);
  assert.notEqual(statSync(source).ino, statSync(sourceOutput).ino);
  assert.notEqual(statSync(sentinel).ino, statSync(sentinelOutput).ino);
  if (process.platform !== 'win32') assert.equal(statSync(sentinelOutput).mode & 0o777, 0o751);
  assert.deepEqual(files(f.destination), ['.codex/AGENTS.md', '.codex/config.toml']);
});

for (const linkedPath of ['home', 'home/.agents', 'home/.agents/public-empty']) {
  test(`empty-directory exports reject redirected ${linkedPath} before deleting or writing`, t => {
    const f = fixture(t);
    select(f, ['.codex/browser', '.agents/public-empty']);
    mkdirSync(join(f.home, '.agents/public-empty'), { recursive: true });
    const outside = join(f.home, 'outside');
    const remaining = 'home/.agents/public-empty'.slice(linkedPath.length).replace(/^\//, '');
    const sentinel = join(outside, remaining, 'sentinel.txt');
    write(sentinel, 'preserve outside content\n');
    if (!directoryLink(t, outside, join(f.repository, linkedPath))) return;
    const oldOutput = join(f.destination, '.codex/browser/config.toml');
    write(oldOutput, 'preserve old output\n');
    for (const mode of ['--dry-run', '--write']) {
      const result = f.run(mode);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Destination contains a symbolic link/);
      assert.equal(result.stderr.includes(f.home), false);
      assert.equal(readFileSync(sentinel, 'utf8'), 'preserve outside content\n');
      assert.equal(readFileSync(oldOutput, 'utf8'), 'preserve old output\n');
    }
  });
}

test('a missing empty directory behind an ancestor link is not created', t => {
  const f = fixture(t);
  select(f, ['.agents/public-empty']);
  mkdirSync(join(f.home, '.agents/public-empty'), { recursive: true });
  const outside = join(f.home, 'outside');
  mkdirSync(outside);
  if (!directoryLink(t, outside, join(f.destination, '.agents'))) return;
  const result = f.run('--write');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Destination contains a symbolic link/);
  assert.deepEqual(readdirSync(outside), []);
});

test('normal empty-directory synchronization and file/directory transitions still work', t => {
  const f = fixture(t);
  select(f, ['.agents/public-empty', '.agents/public-tree']);
  mkdirSync(join(f.home, '.agents/public-empty/kept-empty'), { recursive: true });
  write(join(f.home, '.agents/public-tree/to-file'), 'now a file\n');
  write(join(f.home, '.agents/public-tree/to-directory/child.txt'), 'now a directory\n');
  write(join(f.destination, '.agents/public-empty/old/obsolete.txt'), 'obsolete\n');
  write(join(f.destination, '.agents/public-tree/to-file/old.txt'), 'obsolete\n');
  write(join(f.destination, '.agents/public-tree/to-directory'), 'old file\n');
  const dry = f.run('--dry-run');
  assert.equal(dry.status, 0, dry.stdout + dry.stderr);
  assert.equal(existsSync(join(f.destination, '.agents/public-empty/old/obsolete.txt')), true);
  const result = f.run('--write');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(statSync(join(f.destination, '.agents/public-empty/kept-empty')).isDirectory(), true);
  assert.equal(existsSync(join(f.destination, '.agents/public-empty/old')), false);
  assert.equal(readFileSync(join(f.destination, '.agents/public-tree/to-file'), 'utf8'), 'now a file\n');
  assert.equal(readFileSync(join(f.destination, '.agents/public-tree/to-directory/child.txt'), 'utf8'), 'now a directory\n');
});

test('canonical source aliases into the mirror are rejected without changing either tree', t => {
  const f = fixture(t);
  select(f, ['.agents/public-empty']);
  const mirrored = join(f.destination, '.agents/public-empty');
  write(join(mirrored, 'sentinel.txt'), 'preserve aliased source\n');
  rmSync(join(f.home, '.agents'), { recursive: true });
  if (!directoryLink(t, join(f.destination, '.agents'), join(f.home, '.agents'))) return;
  for (const mode of ['--dry-run', '--write']) {
    const result = f.run(mode);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Source overlaps the repository home\/ mirror/);
    assert.equal(readFileSync(join(mirrored, 'sentinel.txt'), 'utf8'), 'preserve aliased source\n');
  }
});

for (const stage of ['partial-write', 'rename']) {
  test(`${stage} failure preserves the old destination, source, and hard-linked sentinel`, t => {
    const f = fixture(t);
    select(f, ['.codex/AGENTS.md']);
    const sentinel = join(f.home, 'sentinel.txt');
    const output = join(f.destination, '.codex/AGENTS.md');
    write(sentinel, 'old output remains intact\n');
    mkdirSync(dirname(output), { recursive: true });
    linkSync(sentinel, output);
    const result = f.runWithPreload(`
      import fs from 'node:fs/promises';
      import { syncBuiltinESMExports } from 'node:module';
      const failure = () => Object.assign(new Error('Synthetic ${stage} failure'), { code: 'EIO' });
      ${stage === 'partial-write' ? `
      const original = fs.open;
      fs.open = async (...args) => {
        const handle = await original(...args);
        if (String(args[0]).includes('.export-')) {
          const write = handle.writeFile.bind(handle);
          handle.writeFile = async content => { await write(content.subarray(0, 4)); throw failure(); };
        }
        return handle;
      };` : `
      const original = fs.rename;
      fs.rename = async (...args) => {
        if (String(args[0]).includes('.export-')) throw failure();
        return original(...args);
      };`}
      syncBuiltinESMExports();
    `, '--write');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`Synthetic ${stage} failure`));
    assert.equal(readFileSync(output, 'utf8'), 'old output remains intact\n');
    assert.equal(readFileSync(sentinel, 'utf8'), 'old output remains intact\n');
    assert.equal(readFileSync(join(f.home, '.codex/AGENTS.md'), 'utf8'), inputs['.codex/AGENTS.md']);
    assert.deepEqual(files(f.destination), ['.codex/AGENTS.md']);
    const retry = f.run('--write');
    assert.equal(retry.status, 0, retry.stdout + retry.stderr);
    assert.equal(readFileSync(output, 'utf8'), inputs['.codex/AGENTS.md']);
    assert.equal(readFileSync(sentinel, 'utf8'), 'old output remains intact\n');
  });
}


test('a repository alias uses the resolved repository as its destination root', t => {
  const f = fixture(t);
  select(f, ['.codex/config.toml']);
  const alias = join(f.home, 'repository-alias');
  if (!directoryLink(t, f.repository, alias)) return;
  const result = spawnSync(process.execPath, ['--preserve-symlinks-main', join(alias, 'export.mjs'), '--write'], {
    cwd: alias, encoding: 'utf8',
    env: { ...process.env, HOME: f.home, USERPROFILE: f.home, NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(readFileSync(join(f.destination, '.codex/config.toml'), 'utf8'), 'model = "synthetic-model"\n');
  assert.equal(readFileSync(join(f.home, '.codex/config.toml'), 'utf8'), inputs['.codex/config.toml']);
});

test('source ancestor aliases outside the mirror remain supported', t => {
  const f = fixture(t);
  select(f, ['.codex/config.toml']);
  const sourceRoot = join(f.home, 'source-config');
  write(join(sourceRoot, 'config.toml'), inputs['.codex/config.toml']);
  rmSync(join(f.home, '.codex'), { recursive: true });
  if (!directoryLink(t, sourceRoot, join(f.home, '.codex'))) return;
  const result = f.run('--write');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(readFileSync(join(f.destination, '.codex/config.toml'), 'utf8'), 'model = "synthetic-model"\n');
  assert.equal(readFileSync(join(sourceRoot, 'config.toml'), 'utf8'), inputs['.codex/config.toml']);
});

test('deletion rechecks a destination ancestor changed after obsolete-entry validation', t => {
  const f = fixture(t);
  select(f, ['.agents/public-empty']);
  mkdirSync(join(f.home, '.agents/public-empty'), { recursive: true });
  const selected = join(f.destination, '.agents/public-empty');
  const original = join(f.destination, '.agents/saved-original');
  const outside = join(f.home, 'outside');
  write(join(selected, 'sentinel.txt'), 'preserve original output\n');
  write(join(outside, 'sentinel.txt'), 'preserve outside output\n');
  // Check capability before asking the child process to simulate this boundary change.
  const probe = join(f.home, 'link-probe');
  if (!directoryLink(t, outside, probe)) return;
  rmSync(probe);
  const result = f.runWithPreload(`
    import fs from 'node:fs/promises';
    import { syncBuiltinESMExports } from 'node:module';
    const originalLstat = fs.lstat;
    let inspections = 0;
    fs.lstat = async (...args) => {
      const metadata = await originalLstat(...args);
      if (args[0] === ${JSON.stringify(join(selected, 'sentinel.txt'))} && ++inspections === 2) {
        await fs.rename(${JSON.stringify(selected)}, ${JSON.stringify(original)});
        await fs.symlink(${JSON.stringify(outside)}, ${JSON.stringify(selected)}, ${JSON.stringify(process.platform === 'win32' ? 'junction' : 'dir')});
      }
      return metadata;
    };
    syncBuiltinESMExports();
  `, '--write');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Destination contains a symbolic link/);
  assert.equal(readFileSync(join(outside, 'sentinel.txt'), 'utf8'), 'preserve outside output\n');
  assert.equal(readFileSync(join(original, 'sentinel.txt'), 'utf8'), 'preserve original output\n');
});

test('a source selection containing the mirror is rejected before traversal', t => {
  const f = fixture(t);
  select(f, ['.agents/ancestor/repository']);
  const sentinel = join(f.destination, 'sentinel.txt');
  write(sentinel, 'preserve output\n');
  if (!directoryLink(t, f.home, join(f.home, '.agents/ancestor'))) return;
  const result = f.run('--write');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Source overlaps the repository home\/ mirror/);
  assert.equal(readFileSync(sentinel, 'utf8'), 'preserve output\n');
});

test('exclusive temporary-file creation preserves an existing collision and old output', t => {
  const f = fixture(t);
  select(f, ['.codex/AGENTS.md']);
  const output = join(f.destination, '.codex/AGENTS.md');
  const collision = join(dirname(output), '.export-synthetic-collision.tmp');
  write(output, 'preserve output\n');
  write(collision, 'preserve pre-existing file\n');
  const result = f.runWithPreload(`
    import crypto from 'node:crypto';
    import { syncBuiltinESMExports } from 'node:module';
    crypto.randomUUID = () => 'synthetic-collision';
    syncBuiltinESMExports();
  `, '--write');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EEXIST/);
  assert.equal(readFileSync(output, 'utf8'), 'preserve output\n');
  assert.equal(readFileSync(collision, 'utf8'), 'preserve pre-existing file\n');
  assert.equal(readFileSync(join(f.home, '.codex/AGENTS.md'), 'utf8'), inputs['.codex/AGENTS.md']);
});

test('skill-link export resolves repository aliases while excluding redirected outside targets', t => {
  const f = fixture(t);
  select(f, ['.agents/ai-dotfiles/skill-links.json']);
  const alias = join(f.home, 'repository-alias');
  const outside = join(f.home, 'outside');
  mkdirSync(join(f.repository, 'plugins/existing'), { recursive: true });
  mkdirSync(outside);
  if (!directoryLink(t, f.repository, alias)) return;
  if (!directoryLink(t, outside, join(f.repository, 'plugins/redirected'))) return;
  const expectedSkills = {
    'alias-existing': '~/repository-alias/plugins/existing',
    'alias-planned': '~/repository-alias/plugins/planned/nested',
    'direct-existing': '~/repository/plugins/existing',
  };
  const manifest = JSON.stringify({ schemaVersion: 1, linkRoot: '~/.agents/skills', skills: {
    ...expectedSkills,
    'redirected-outside': '~/repository-alias/plugins/redirected/planned',
    'direct-redirected-outside': '~/repository/plugins/redirected/planned',
    'repository-root': '~/repository-alias',
    'unrelated-skill': '~/elsewhere',
  } }) + '\n';
  const source = join(f.home, '.agents/ai-dotfiles/skill-links.json');
  writeFileSync(source, manifest);
  const result = spawnSync(process.execPath, ['--preserve-symlinks-main', join(alias, 'export.mjs'), '--write'], {
    cwd: alias, encoding: 'utf8',
    env: { ...process.env, HOME: f.home, USERPROFILE: f.home, NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const output = JSON.parse(readFileSync(join(f.destination, '.agents/ai-dotfiles/skill-links.json'), 'utf8'));
  assert.deepEqual(output.skills, expectedSkills);
  assert.equal(readFileSync(source, 'utf8'), manifest);
});

test('skill-link export rejects dangling ancestor aliases without replacing old output', t => {
  const f = fixture(t);
  select(f, ['.agents/ai-dotfiles/skill-links.json']);
  const dangling = join(f.repository, 'plugins/dangling');
  if (!directoryLink(t, join(f.home, 'missing-outside'), dangling)) return;
  const source = join(f.home, '.agents/ai-dotfiles/skill-links.json');
  const manifest = JSON.stringify({ schemaVersion: 1, linkRoot: '~/.agents/skills', skills: {
    'dangling-outside': '~/repository/plugins/dangling/planned',
  } }) + '\n';
  writeFileSync(source, manifest);
  const output = join(f.destination, '.agents/ai-dotfiles/skill-links.json');
  write(output, 'preserve old output\n');
  for (const mode of ['--dry-run', '--write']) {
    const result = f.run(mode);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ENOENT/);
    assert.equal(result.stderr.includes(f.home), false);
    assert.equal(readFileSync(output, 'utf8'), 'preserve old output\n');
    assert.equal(readFileSync(source, 'utf8'), manifest);
  }
});

test('skill-link resolution errors do not disclose paths outside the synthetic home', t => {
  const f = fixture(t);
  select(f, ['.agents/ai-dotfiles/skill-links.json']);
  const outsideFile = join(dirname(f.home), 'outside-regular-file');
  write(outsideFile, 'synthetic file, not an ancestor directory\n');
  writeFileSync(join(f.home, '.agents/ai-dotfiles/skill-links.json'), JSON.stringify({
    schemaVersion: 1, linkRoot: '~/.agents/skills', skills: {
      'unresolvable-outside': '~/../outside-regular-file/child',
    },
  }) + '\n');
  const output = join(f.destination, '.agents/ai-dotfiles/skill-links.json');
  write(output, 'preserve old output\n');
  const result = f.run('--write');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /skill-links\.json: could not resolve a skill target \(ENOTDIR\)/);
  assert.equal(result.stderr.includes(outsideFile), false);
  assert.equal(result.stderr.includes(dirname(f.home)), false);
  assert.equal(readFileSync(output, 'utf8'), 'preserve old output\n');
});
