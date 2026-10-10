import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dotToolkitFiles = [
  'README.md',
  'plugin.json',
  'skills/dot-guidelines/SKILL.md',
  'skills/dot-guidelines/reference/computer-checks.md',
  'skills/dot-guidelines/reference/migrations/0.1-to-0.2.md',
  'skills/dot-guidelines/reference/setup.md',
  'skills/dot-guidelines/reference/skills-maintenance.md',
  'skills/dot-guidelines/scripts/check-skill-index.mjs',
  'skills/dot-guidelines/scripts/inspect-computer.mjs',
  'skills/dot-guidelines/scripts/lib.mjs',
  'skills/dot-guidelines/scripts/verify-skill-files.mjs',
];
const dotToolkitDirectories = [
  'skills',
  'skills/dot-guidelines',
  'skills/dot-guidelines/reference',
  'skills/dot-guidelines/reference/migrations',
  'skills/dot-guidelines/scripts',
];

function assertDotToolkitPackage(root) {
  const files = [];
  const directories = [];
  function inspect(directory) {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const packagePath = relative(root, path).split(sep).join('/');
      const stat = lstatSync(path);
      if (stat.isDirectory()) {
        directories.push(packagePath);
        inspect(path);
      } else {
        assert.ok(stat.isFile(), `dot-toolkit package entries must be regular files: ${packagePath}`);
        files.push(packagePath);
      }
    }
  }
  inspect(root);
  assert.deepEqual(files.sort(), dotToolkitFiles, 'dot-toolkit must contain exactly its declared public package files.');
  assert.deepEqual(directories.sort(), dotToolkitDirectories, 'dot-toolkit must contain only its declared skill directories.');
}

function markdownFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : entry.name.endsWith('.md') ? [path] : [];
  });
}

function assertLocalDocumentation(root) {
  for (const file of markdownFiles(root)) {
    const text = readFileSync(file, 'utf8').replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
    for (const match of text.matchAll(/\[[^\]\n]*\]\(([^\s)]+)\)/g)) {
      const link = match[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('#')) continue;
      const target = resolve(dirname(file), decodeURIComponent(link.split('#')[0]));
      const rel = relative(root, target);
      assert.ok(!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`), `${relative(root, file)} escapes the distribution: ${link}`);
      assert.ok(existsSync(target), `${relative(root, file)} has a missing target: ${link}`);
    }
  }
}

for (const name of ['agent-design-tools', 'agent-plugin-tools', 'ai-dotfiles-cli', 'agent-eval-tools', 'dot-toolkit']) {
  test(`${name} keeps local documentation dependencies inside its isolated package`, t => {
    const root = mkdtempSync(join(tmpdir(), 'agent-package-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const plugin = join(root, name);
    cpSync(join(repository, 'plugins', name), plugin, { recursive: true });
    if (name === 'dot-toolkit') assertDotToolkitPackage(plugin);
    assertLocalDocumentation(plugin);
    if (name === 'agent-plugin-tools') {
      const skill = join(plugin, 'skills', 'plugin-creator-agent-plugins');
      for (const script of ['validate-agent-plugin.mjs', 'manage-local-agent-plugin.mjs', 'scaffold-local-agent-plugin.mjs', 'assemble-agent-marketplace.mjs']) {
        const result = spawnSync(process.execPath, [join(skill, 'scripts', script), '--help'], { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: '' } });
        assert.equal(result.status, 0, result.stdout + result.stderr);
      }
    } else if (name === 'dot-toolkit') {
      const metadata = JSON.parse(readFileSync(join(plugin, 'plugin.json'), 'utf8'));
      assert.equal(metadata.version, '0.2.0');
      const scriptRoot = join(plugin, 'skills', 'dot-guidelines', 'scripts');
      for (const script of ['inspect-computer.mjs', 'check-skill-index.mjs', 'verify-skill-files.mjs']) {
        const result = spawnSync(process.execPath, [join(scriptRoot, script), '--help'], {
          cwd: root, encoding: 'utf8', env: { ...process.env, PATH: '', NODE_PATH: '', NODE_OPTIONS: '' },
        });
        assert.equal(result.status, 0, result.stdout + result.stderr);
        const help = JSON.parse(result.stdout);
        assert.equal(help.schemaVersion, 1);
        assert.equal(help.status, 'help');
        assert.equal(result.stderr, '');
        assert.ok(help.data.usage, `${script} must document isolated execution`);
        assert.match(help.data.nodeRequirement, /24/);
      }
      assertDotToolkitPackage(plugin); // --help must not create generated or runtime files.
    } else if (name === 'ai-dotfiles-cli') {
      assert.deepEqual(readdirSync(join(plugin, 'skills')).sort(), ['ai-dotfiles-cli', 'codex-history']);
    } else if (name === 'agent-eval-tools') {
      assert.deepEqual(readdirSync(join(plugin, 'skills')), ['agent-improve']);
      const script = join(plugin, 'skills', 'agent-improve', 'scripts', 'agent-eval.mjs');
      const result = spawnSync(process.execPath, [script, '--help'], { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: '' } });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const testEnvironment = { ...process.env, PATH: '' };
      // A nested Node test invocation must start its own runner, not inherit
      // the parent's internal worker context and exit without running tests.
      delete testEnvironment.NODE_TEST_CONTEXT;
      const tests = spawnSync(process.execPath, ['--test', '--test-reporter=tap', join(dirname(script), 'agent-eval.test.mjs'), join(dirname(script), 'comparison.test.mjs')], { cwd: root, encoding: 'utf8', env: testEnvironment });
      assert.equal(tests.status, 0, tests.stdout + tests.stderr);
      assert.match(tests.stdout, /^# tests [1-9][0-9]*$/m, 'The isolated package must execute its controller tests.');
    } else if (name === 'agent-design-tools') {
      assert.deepEqual(readdirSync(join(plugin, 'skills')).sort(), ['agent-workflow-design', 'prompt-design', 'prompt-gemini-reference']);
    }
  });
}

for (const extra of ['AGENTS-private.md', 'skills/dot-guidelines/private/notes.md', 'skills/dot-guidelines/INDEX.md', 'skills/dot-guidelines/manifests/alpha.json']) {
  test(`dot-toolkit rejects an additional package file: ${extra}`, t => {
    const root = mkdtempSync(join(tmpdir(), 'dot-package-boundary-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    cpSync(join(repository, 'plugins', 'dot-toolkit'), root, { recursive: true });
    assertDotToolkitPackage(root);
    const file = join(root, extra);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, 'Synthetic fixture; no private user data.\n');
    assert.throws(() => assertDotToolkitPackage(root), /dot-toolkit must contain exactly its declared public package files/);
  });
}

for (const file of dotToolkitFiles) {
  test(`dot-toolkit rejects a directory in place of a package file: ${file}`, t => {
    const root = mkdtempSync(join(tmpdir(), 'dot-package-boundary-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    cpSync(join(repository, 'plugins', 'dot-toolkit'), root, { recursive: true });
    assertDotToolkitPackage(root);
    rmSync(join(root, file));
    mkdirSync(join(root, file));
    assert.throws(() => assertDotToolkitPackage(root), /dot-toolkit must contain exactly its declared public package files/);
  });
}

test('dot-toolkit rejects an additional empty skill directory', t => {
  const root = mkdtempSync(join(tmpdir(), 'dot-package-boundary-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(join(repository, 'plugins', 'dot-toolkit'), root, { recursive: true });
  assertDotToolkitPackage(root);
  mkdirSync(join(root, 'skills', 'unexpected'));
  assert.throws(() => assertDotToolkitPackage(root), /dot-toolkit must contain only its declared skill directories/);
});

for (const names of [['prompt-design'], ['prompt-design', 'prompt-gemini-reference']]) {
  test(`standalone ${names.join(' + ')} keeps documentation links within the installed skills`, t => {
    const root = mkdtempSync(join(tmpdir(), 'prompt-skill-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    for (const name of names) {
      cpSync(join(repository, 'plugins', 'agent-design-tools', 'skills', name), join(root, name), { recursive: true });
    }
    assertLocalDocumentation(root);
  });
}
