import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const managers = [
  ['manage-codex-disk-pressure.mjs', 'inspectAclState'],
  ['manage-sqlite-trace-log-suppression.mjs', 'configureLogRetention'],
  ['manage-skill-validator-utf8-patch.mjs', 'classifyValidator'],
];

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'maintenance-entry-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'home');
  mkdirSync(home);
  const run = (args, input) => {
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      env: { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: join(home, '.codex') },
      encoding: 'utf8', input, timeout: 10000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.deepEqual(readdirSync(home), [], 'Import and help must not create user state');
    return result.stdout;
  };
  return { root, run };
}

for (const [filename, exported] of managers) {
  const url = new URL(filename, import.meta.url).href;
  const source = `import assert from 'node:assert/strict';
const manager = await import(${JSON.stringify(url)});
assert.equal(typeof manager[${JSON.stringify(exported)}], 'function');
console.log('IMPORT_OK');\n`;

  for (const mode of ['explicit stdin', 'implicit stdin', 'eval', 'file']) {
    test(`${filename} imports without running its CLI from ${mode}`, t => {
      const f = fixture(t);
      let args;
      if (mode === 'file') {
        const entry = join(f.root, 'import.mjs');
        writeFileSync(entry, source);
        args = [entry];
      } else if (mode === 'eval') {
        args = ['--input-type=module', '-e', source];
      } else {
        args = ['--input-type=module', ...(mode === 'explicit stdin' ? ['-'] : [])];
      }
      assert.equal(f.run(args, source), 'IMPORT_OK\n');
    });
  }

  for (const linked of [false, true]) {
    test(`${filename} runs CLI help through a ${linked ? 'linked' : 'direct'} path`, t => {
      const f = fixture(t);
      let directory = here;
      if (linked) {
        directory = join(f.root, 'linked');
        symlinkSync(here, directory, process.platform === 'win32' ? 'junction' : 'dir');
      }
      assert.match(f.run([join(directory, filename), 'help']), /Usage:/);
    });
  }
}
