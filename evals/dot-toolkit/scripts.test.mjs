// All fixtures are invented, disposable inputs. No actual cloud configuration is read.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, parseIndex, supportedNode, validName, validRelative, validateManifest } from '../../plugins/dot-toolkit/skills/dot-guidelines/scripts/lib.mjs';
import { createHash } from 'node:crypto';

const scripts = path.resolve(import.meta.dirname, '../../plugins/dot-toolkit/skills/dot-guidelines/scripts');
const commands = ['inspect-computer', 'check-skill-index', 'verify-skill-files'];
const digest = value => createHash('sha256').update(value).digest('hex');
const state = '.agents/skills-state';
function temporary(t) {
  // Canonicalize the test framework's temp parent, not the helper's requested root.
  const root = fs.mkdtempSync(path.join(fs.realpathSync(tmpdir()), 'dot-synthetic-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root, relative, content) {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}
function record(name = 'sample', files = { 'SKILL.md': '---\nname: sample\ndescription: |\n  Synthetic description.\n---\n' }) {
  return { schemaVersion: 1, name, source: { repository: 'https://example.invalid/repository', path: `skills/${name}`,
    ref: 'synthetic-ref', commit: 'a'.repeat(40) }, files: Object.entries(files).map(([name, content]) => ({ path: name, sha256: digest(content) })) };
}
function putSkill(root, name = 'sample', files = { 'SKILL.md': 'Synthetic skill; YAML semantics intentionally unchecked.\n' }, manifest = record(name, files)) {
  for (const [relative, content] of Object.entries(files)) write(root, `.agents/skills/${name}/${relative}`, content);
  write(root, `${state}/manifests/${name}.json`, JSON.stringify(manifest));
  return manifest;
}
function entry(name, description = 'Synthetic description.') {
  return `## [${name}](../skills/${name}/SKILL.md)\n\n${description.split('\n').map(line => line ? `> ${line}` : '>').join('\n')}\n\n---\n`;
}
function index(root, entries = [entry('sample')]) { write(root, `${state}/INDEX.md`, `# Skills\n\n${entries.join('\n')}`); }
function execute(command, args, options = {}) {
  const child = spawnSync(process.execPath, [path.join(scripts, `${command}.mjs`), ...args], { encoding: 'utf8', ...options });
  assert.equal(child.signal, null, child.stderr);
  assert.equal(child.stderr, '', child.stderr);
  let output;
  try { output = JSON.parse(child.stdout); }
  catch { assert.fail(`Expected JSON, got ${child.stdout}`); }
  assert.deepEqual(Object.keys(output), ['schemaVersion', 'command', 'status', 'scope', 'data', 'findings']);
  assert.equal(output.schemaVersion, 1);
  assert.equal(output.command, command);
  assert.equal(output.scope.root, '<root>');
  return { code: child.status, output, text: child.stdout };
}
function run(command, root, extra = [], options) { return execute(command, ['--root', root, ...extra], options); }
function codes(result) { return result.output.findings.map(item => item.code); }
function snapshot(root) {
  const records = [];
  function visit(relative = '') {
    const absolute = path.join(root, relative);
    const stat = fs.lstatSync(absolute, { bigint: true });
    records.push({ path: relative, mode: String(stat.mode), size: String(stat.size), mtime: String(stat.mtimeNs),
      content: stat.isSymbolicLink() ? fs.readlinkSync(absolute) : stat.isFile() ? fs.readFileSync(absolute).toString('base64') : null });
    if (stat.isDirectory()) for (const entry of fs.readdirSync(absolute).sort()) visit(path.join(relative, entry));
  }
  visit();
  return records;
}
function boot(command, root, code, extra = []) {
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import fs from 'node:fs';
    import path from 'node:path';
    ${code}
    process.argv = [process.execPath, ${JSON.stringify(path.join(scripts, `${command}.mjs`))}, '--root', ${JSON.stringify(root)}, ...${JSON.stringify(extra)}];
    await import(${JSON.stringify(pathToFileURL(path.join(scripts, `${command}.mjs`)).href)});
  `], { encoding: 'utf8' });
  assert.equal(child.stderr, '');
  return { code: child.status, output: JSON.parse(child.stdout) };
}

test('every helper has stable JSON help, requires explicit absolute root, and refuses unknown flags', () => {
  for (const command of commands) {
    const help = execute(command, ['--help']);
    assert.equal(help.code, 0);
    assert.equal(help.output.status, 'help');
    assert.equal(help.output.data.nodeRequirement, '>=24');
    assert.equal(help.output.data.readOnly, true);
    for (const args of [[], ['--root', 'relative'], ['--root', '/synthetic', '--write'], ['--help', '--write'], ['--root', '/synthetic', '--root', '/another']]) {
      assert.equal(execute(command, args).code, 2);
    }
  }
});

test('Node >=24 is checked, including before help, without automatic installation', t => {
  assert.equal(supportedNode('23.9.0'), false);
  assert.equal(supportedNode('24.0.0'), true);
  assert.equal(supportedNode('26.0.0'), true);
  const root = temporary(t);
  for (const command of commands) {
    const result = boot(command, root, `Object.defineProperty(process.versions, 'node', { value: '23.9.0' });`);
    assert.equal(result.code, 2);
    assert.deepEqual(codes(result), ['node_version_unsupported']);
  }
});

test('fresh root inspection only reports fixed locations and never reads private or legacy contents', t => {
  const root = temporary(t);
  const fresh = run('inspect-computer', root);
  assert.equal(fresh.code, 0);
  assert.equal(fresh.output.status, 'complete');
  assert.ok(fresh.output.data.locations.every(item => item.state === 'missing'));
  const secret = 'SYNTHETIC_PRIVATE_CONTENT_MUST_NOT_APPEAR';
  for (const file of ['.codex/AGENTS-private.md', 'AGENTS.md', '.codex/dot-setup.md', '.agents/skills/INDEX.md', '.agents/skills/skills-manifest.json']) write(root, file, secret);
  const before = snapshot(root);
  const result = boot('inspect-computer', root, `
    const original = fs.readFileSync;
    fs.readFileSync = function (target, ...args) {
      if (typeof target === 'string' && target.startsWith(${JSON.stringify(root)})) throw new Error('Private content was opened');
      return original.call(this, target, ...args);
    };
    fs.readdirSync = () => { throw new Error('Unexpected inventory'); };
  `);
  assert.equal(result.code, 0);
  assert.equal(result.output.data.privateContents, 'not_read');
  assert.equal(result.output.data.writable, 'not_tested');
  assert.ok(result.output.data.locations.filter(item => item.role === 'legacy').every(item => item.state === 'present'));
  assert.ok(!JSON.stringify(result.output).includes(secret));
  assert.deepEqual(snapshot(root), before);
});

test('missing root and missing INDEX are unverified, never empty selection', t => {
  const root = temporary(t);
  for (const command of commands) assert.equal(run(command, path.join(root, 'missing'), command === 'verify-skill-files' ? ['--all'] : []).code, 2);
  const result = run('check-skill-index', root);
  assert.equal(result.code, 2);
  assert.deepEqual(codes(result), ['index_missing']);
  assert.equal(fs.existsSync(path.join(root, '.agents')), false);
});

test('title-only index is intentional empty selection and does not enumerate manifests', t => {
  const root = temporary(t);
  putSkill(root, 'unselected');
  for (const text of ['# Skills', '# Skills\n', '# Skills\n\n', '# Skills\r\n\r\n']) {
    write(root, `${state}/INDEX.md`, text);
    const result = boot('check-skill-index', root, `fs.readdirSync = () => { throw new Error('No scans permitted'); };`);
    assert.equal(result.code, 0);
    assert.deepEqual(result.output.data.entries, []);
  }
});

test('multiline descriptions preserve all lines, blank lines, headings, separators and nested quote prefixes', t => {
  const description = 'First line\n\n## [decoy](../skills/decoy/SKILL.md)\n---\n> quoted\nlast line  ';
  const text = `# Skills\n\n${entry('sample', description)}`;
  const parsed = parseIndex(Buffer.from(text));
  assert.equal(parsed.entries[0].description, description);
  const root = temporary(t);
  putSkill(root);
  index(root, [entry('sample', description)]);
  const result = run('check-skill-index', root);
  assert.equal(result.code, 0);
  assert.deepEqual(result.output.data.entries.map(item => item.name), ['sample']);
  assert.equal(result.output.data.descriptionSemantics, 'not_checked');
  assert.equal(result.output.data.fileHashes, 'not_checked');
});

test('malformed INDEX grammar, duplicate/escape names, wrong links and unquoted descriptions are mismatches', t => {
  const root = temporary(t);
  putSkill(root);
  const good = `# Skills\n\n${entry('sample')}`;
  const bad = ['', '# Other\n', good.replace('> Synthetic', 'Synthetic'), good.replace('../skills/sample/', '../skills/other/'),
    good.replace('sample', '../escape'), good.replaceAll('sample', 'bad--name'), good + `\n${entry('sample')}`,
    good.replace('> Synthetic description.', '>Synthetic description.'), good.replace('\n\n---', '\n---'),
    good.replace('\n\n> ', '\n> '), good.replace('---\n', ''), good.replace('> Synthetic description.', '> '), good.replace('> Synthetic description.', '>'),
    good + '\nUnexpected prose\n', good.replace('> Synthetic description.', '> first\n\n> second'), '\ufeff' + good];
  for (const value of bad) {
    write(root, `${state}/INDEX.md`, value);
    const result = run('check-skill-index', root);
    assert.equal(result.code, 1, value);
  }
  write(root, `${state}/INDEX.md`, Buffer.from([0xff, 0xfe]));
  assert.deepEqual(codes(run('check-skill-index', root)), ['index_encoding_invalid']);
  assert.equal(validName('a'.repeat(64)), true);
  for (const name of ['a'.repeat(65), '', '..', '-sample', 'sample-', 'UPPER', 'bad--name', 'a/b']) assert.equal(validName(name), false);
});

test('index checks selected correspondence only, without YAML parsing or undeclared-selection additions', t => {
  const root = temporary(t);
  putSkill(root, 'sample', { 'SKILL.md': 'Intentionally invalid YAML: [\n' });
  putSkill(root, 'unselected');
  write(root, `${state}/manifests/unselected.json`, 'false');
  index(root);
  const result = boot('check-skill-index', root, `fs.readdirSync = () => { throw new Error('No scans permitted'); };`);
  assert.equal(result.code, 0);
  assert.deepEqual(result.output.data.entries.map(item => item.name), ['sample']);
  fs.unlinkSync(path.join(root, `${state}/manifests/sample.json`));
  assert.deepEqual(codes(run('check-skill-index', root)), ['manifest_missing']);
  fs.unlinkSync(path.join(root, '.agents/skills/sample/SKILL.md'));
  assert.ok(codes(run('check-skill-index', root)).includes('skill_file_missing'));
});

test('manifest falsy JSON, malformed JSON, unsupported schemas and selection fields fail closed', t => {
  const root = temporary(t);
  putSkill(root);
  index(root);
  for (const value of ['null', 'false', '0', '""', '[]', '{', '{"schemaVersion":1}']) {
    write(root, `${state}/manifests/sample.json`, value);
    for (const command of ['check-skill-index', 'verify-skill-files']) assert.equal(run(command, root, command === 'verify-skill-files' ? ['--skill', 'sample'] : []).code, 1, value);
  }
  for (const change of [value => { value.schemaVersion = 4; }, value => { value.selected = true; }, value => { value.enabled = false; },
    value => { value.name = 'other'; }, value => { value.source.commit = 'main'; }, value => { value.source.ref = 'bad\nref'; },
    value => { value.source = null; }, value => { value.source.path = '../outside'; },
    value => { value.source.path = '/absolute'; }, value => { value.source.commit = 'A'.repeat(40); },
    value => { value.files[0].sha256 = 'A'.repeat(64); }, value => { value.source.unrecognized = 'unknown'; }, value => { value.files = []; },
    value => { value.files.push(value.files[0]); }, value => { value.files[0].path = '../escape'; },
    value => { value.files[0].path = '/absolute'; }, value => { value.files[0].path = 'C:\\escape'; },
    value => { value.files[0].path = 'folder//file'; }, value => { value.files[0].path = './SKILL.md'; },
    value => { value.files[0].path = 'folder/../SKILL.md'; }, value => { value.files[0].path = 'folder\\file'; },
    value => { value.files[0].path = 'SKILL.md:stream'; }, value => { value.files[0].path = 'bad\u0000file'; },
    value => { value.files[0].sha256 = '123'; }, value => { value.files[0].unknown = true; },
    value => { value.files[0].path = 'other.md'; }, value => { value.localChanges = ''; },
    value => { value.verification = true; }, value => { value.verification = { summary: 'ok', selected: true }; },
    value => { value.files.push({ path: 'SKILL.md/nested', sha256: 'b'.repeat(64) }); }]) {
    const value = record();
    change(value);
    assert.ok(validateManifest(value, 'sample'), JSON.stringify(value));
    write(root, `${state}/manifests/sample.json`, JSON.stringify(value));
    assert.equal(run('verify-skill-files', root, ['--skill', 'sample']).code, 1);
  }
});

test('valid optional provenance metadata never authorizes differences or changes verdict', t => {
  const root = temporary(t);
  const files = { 'SKILL.md': 'Synthetic bytes\r\n', 'reference/note.md': 'Synthetic support\n', 'scripts/run.mjs': '#!/usr/bin/env node\n' };
  const value = record('sample', files);
  value.source.commit = 'b'.repeat(64);
  value.source.path = '.';
  value.localChanges = 'An intentionally adopted wording edit.';
  value.verification = { summary: 'Informational past observation.' };
  putSkill(root, 'sample', files, value);
  const result = run('verify-skill-files', root, ['--skill', 'sample']);
  assert.equal(result.code, 0);
  assert.equal(result.output.data.skills[0].checkedFiles, 3);
  assert.equal(result.output.data.fileMetadata, 'not_compared');
  assert.equal(result.output.data.sourceTrust, 'not_verified');
  write(root, '.agents/skills/sample/SKILL.md', 'Synthetic bytes\n');
  assert.deepEqual(codes(run('verify-skill-files', root, ['--skill', 'sample'])), ['modified_file']);
});

test('verifier detects extra, missing and raw-byte modified files and undeclared empty directories', t => {
  const root = temporary(t);
  putSkill(root, 'sample', { 'SKILL.md': 'original', 'reference/keep.md': 'keep', 'reference/missing.md': 'missing' });
  write(root, '.agents/skills/sample/SKILL.md', 'modified');
  fs.unlinkSync(path.join(root, '.agents/skills/sample/reference/missing.md'));
  write(root, '.agents/skills/sample/extra.txt', 'extra');
  fs.mkdirSync(path.join(root, '.agents/skills/sample/empty'));
  const before = snapshot(root);
  const result = run('verify-skill-files', root, ['--skill', 'sample']);
  assert.equal(result.code, 1);
  assert.deepEqual(codes(result).sort(), ['extra_directory', 'extra_file', 'missing_file', 'modified_file']);
  assert.deepEqual(snapshot(root), before);
});

for (const alias of ['skill.md', 'SKILL.md.']) {
  test(`a filesystem alias cannot stand in for a declared file: ${alias}`, t => {
    const root = temporary(t);
    const manifest = putSkill(root);
    manifest.files.push({ path: alias, sha256: manifest.files[0].sha256 });
    write(root, `${state}/manifests/sample.json`, JSON.stringify(manifest));
    const before = snapshot(root);
    // Model case/trailing-dot aliases on every platform. Directory enumeration
    // still exposes only the real entry; stat/open would otherwise read it twice.
    const result = boot('verify-skill-files', root, `
      const alias = ${JSON.stringify(alias)};
      const canonical = target => path.basename(String(target)) === alias
        ? path.join(path.dirname(String(target)), 'SKILL.md') : target;
      for (const method of ['lstatSync', 'openSync']) {
        const original = fs[method];
        fs[method] = (target, ...args) => original.call(fs, canonical(target), ...args);
      }
    `, ['--skill', 'sample']);
    assert.equal(result.code, 1);
    assert.deepEqual(codes(result), ['missing_file']);
    assert.equal(result.output.data.skills[0].checkedFiles, 1);
    assert.deepEqual(snapshot(root), before);
  });
}

test('named scope is explicit, repeated skills work and --all uses manifests without changing selection', t => {
  const root = temporary(t);
  putSkill(root, 'first');
  putSkill(root, 'second');
  putSkill(root, 'unselected');
  index(root, [entry('first')]);
  write(root, '.agents/skills/unselected/SKILL.md', 'different');
  for (const args of [[], ['--skill', '../escape'], ['--all', '--skill', 'first'], ['--skill', 'first', '--skill', 'first'], ['--all', '--all']]) assert.equal(run('verify-skill-files', root, args).code, 2);
  const named = run('verify-skill-files', root, ['--skill', 'first', '--skill', 'second']);
  assert.equal(named.code, 0);
  assert.deepEqual(named.output.scope.skills, ['first', 'second']);
  const before = snapshot(root);
  const all = run('verify-skill-files', root, ['--all']);
  assert.equal(all.code, 1);
  assert.deepEqual(all.output.scope.skills, ['first', 'second', 'unselected']);
  assert.equal(all.output.scope.mode, 'all_manifests');
  assert.deepEqual(snapshot(root), before);
  assert.deepEqual(run('check-skill-index', root).output.data.entries.map(item => item.name), ['first']);
});

test('--all distinguishes missing manifests directory, empty directory and unexpected entries', t => {
  const root = temporary(t);
  assert.deepEqual(codes(run('verify-skill-files', root, ['--all'])), ['manifest_directory_missing']);
  fs.mkdirSync(path.join(root, `${state}/manifests`), { recursive: true });
  assert.equal(run('verify-skill-files', root, ['--all']).code, 0);
  write(root, `${state}/manifests/README.txt`, 'undeclared');
  write(root, `${state}/manifests/bad--name.json`, '{}');
  const result = run('verify-skill-files', root, ['--all']);
  assert.equal(result.code, 1);
  assert.deepEqual(codes(result), ['unexpected_manifest_entry', 'unexpected_manifest_entry']);
});

test('symlinked skills, files, state ancestors, root, and ancestors above root are rejected without following', t => {
  if (process.platform === 'win32') { t.skip('Symlink creation needs Windows privileges.'); return; }
  const parent = temporary(t);
  const root = path.join(parent, 'root');
  const outside = path.join(parent, 'outside');
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  putSkill(root);
  index(root);
  write(outside, 'SKILL.md', 'external bytes');
  const target = path.join(root, '.agents/skills/sample/SKILL.md');
  fs.unlinkSync(target);
  fs.symlinkSync(path.join(outside, 'SKILL.md'), target);
  for (const command of ['check-skill-index', 'verify-skill-files']) {
    const result = run(command, root, command === 'verify-skill-files' ? ['--skill', 'sample'] : []);
    assert.equal(result.code, 2);
    assert.ok(codes(result).includes('unsupported_symlink'));
    assert.ok(!result.text.includes(parent));
    assert.ok(!result.text.includes('external bytes'));
  }
  fs.unlinkSync(target);
  fs.rmdirSync(path.dirname(target));
  fs.symlinkSync(outside, path.dirname(target), 'dir');
  assert.equal(run('verify-skill-files', root, ['--skill', 'sample']).code, 2);
  fs.renameSync(path.join(root, state), path.join(outside, 'state'));
  fs.symlinkSync(path.join(outside, 'state'), path.join(root, state), 'dir');
  assert.equal(run('check-skill-index', root).code, 2);
  assert.equal(run('inspect-computer', root).code, 2);
  const rootLink = path.join(parent, 'root-link');
  fs.symlinkSync(root, rootLink, 'dir');
  assert.deepEqual(codes(run('inspect-computer', rootLink)), ['unsupported_symlink']);
  const parentLink = path.join(parent, 'ancestor-link');
  fs.symlinkSync(outside, parentLink, 'dir');
  fs.mkdirSync(path.join(outside, 'nested'));
  assert.deepEqual(codes(run('inspect-computer', path.join(parentLink, 'nested'))), ['unsupported_symlink']);
});

test('hardlinked skill files, manifests and INDEX are unsupported', t => {
  const root = temporary(t);
  putSkill(root);
  index(root);
  for (const [relative, command, args] of [['.agents/skills/sample/SKILL.md', 'verify-skill-files', ['--skill', 'sample']],
    [`${state}/manifests/sample.json`, 'check-skill-index', []], [`${state}/INDEX.md`, 'check-skill-index', []]]) {
    const link = path.join(root, 'extra-link');
    fs.linkSync(path.join(root, relative), link);
    const result = run(command, root, args);
    assert.equal(result.code, 2);
    assert.ok(codes(result).includes('unsupported_hardlink'));
    fs.unlinkSync(link);
  }
});

test('special filesystem entries are rejected without opening or blocking', t => {
  if (process.platform === 'win32') { t.skip('POSIX FIFO fixture.'); return; }
  const root = temporary(t);
  putSkill(root);
  const fifo = path.join(root, '.agents/skills/sample/pipe');
  const mkfifo = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
  if (mkfifo.error?.code === 'ENOENT') { t.skip('mkfifo is unavailable for fixture construction.'); return; }
  assert.equal(mkfifo.status, 0, mkfifo.stderr);
  const result = run('verify-skill-files', root, ['--skill', 'sample'], { timeout: 5000 });
  assert.equal(result.code, 2);
  assert.ok(codes(result).includes('unsupported_file_type'));
});

test('confirmed read-denied is distinct from missing, including mixed mismatch precedence', t => {
  const root = temporary(t);
  putSkill(root);
  index(root);
  // Deterministic fault injection works even when this test process runs as root.
  const denied = boot('check-skill-index', root, `
    const original = fs.openSync;
    fs.openSync = function (target, ...args) {
      if (path.basename(String(target)) === 'INDEX.md') { const error = new Error('private path'); error.code = 'EACCES'; throw error; }
      return original.call(this, target, ...args);
    };
  `);
  assert.equal(denied.code, 2);
  assert.deepEqual(codes(denied), ['read_denied']);
  const failed = boot('check-skill-index', root, `
    const original = fs.openSync;
    fs.openSync = function (target, ...args) {
      if (path.basename(String(target)) === 'INDEX.md') { const error = new Error('private path'); error.code = 'EIO'; throw error; }
      return original.call(this, target, ...args);
    };
  `);
  assert.equal(failed.code, 2);
  assert.deepEqual(codes(failed), ['read_failed']);
  write(root, '.agents/skills/sample/extra', 'extra');
  const mixed = boot('verify-skill-files', root, `
    const original = fs.openSync;
    fs.openSync = function (target, ...args) {
      if (path.basename(String(target)) === 'SKILL.md') { const error = new Error('private path'); error.code = 'EACCES'; throw error; }
      return original.call(this, target, ...args);
    };
  `, ['--skill', 'sample']);
  assert.equal(mixed.code, 2);
  assert.ok(codes(mixed).includes('extra_file'));
  assert.ok(codes(mixed).includes('read_denied'));
});

test('OS permission denial is not silently treated as missing when enforceable', t => {
  if (process.platform === 'win32') { t.skip('POSIX permission fixture.'); return; }
  const root = temporary(t);
  putSkill(root);
  index(root);
  const target = path.join(root, `${state}/INDEX.md`);
  fs.chmodSync(root, 0o755);
  fs.chmodSync(target, 0);
  t.after(() => { if (fs.existsSync(target)) fs.chmodSync(target, 0o600); });
  const options = process.getuid?.() === 0 ? { uid: 65534, gid: 65534 } : {};
  const child = spawnSync(process.execPath, [path.join(scripts, 'check-skill-index.mjs'), '--root', root], { encoding: 'utf8', ...options });
  if (!child.stdout || child.error || child.stderr) { t.skip('Cannot execute a lower-privilege test child here; deterministic denial test still covers classification.'); return; }
  const result = { code: child.status, output: JSON.parse(child.stdout) };
  assert.equal(result.code, 2);
  assert.deepEqual(codes(result), ['read_denied']);
});

test('executable and read-only regular files are supported, not mistaken for metadata equivalence', t => {
  const root = temporary(t);
  putSkill(root, 'sample', { 'SKILL.md': 'sample', 'scripts/task.mjs': 'process.stdout.write("sample");' });
  fs.chmodSync(path.join(root, '.agents/skills/sample/SKILL.md'), 0o444);
  fs.chmodSync(path.join(root, '.agents/skills/sample/scripts/task.mjs'), 0o755);
  const before = snapshot(root);
  const result = run('verify-skill-files', root, ['--skill', 'sample']);
  assert.equal(result.code, 0);
  assert.equal(result.output.data.fileMetadata, 'not_compared');
  assert.deepEqual(snapshot(root), before);
});

test('concurrent replacement is unverified rather than a hash verdict', t => {
  const root = temporary(t);
  putSkill(root);
  const result = boot('verify-skill-files', root, `
    const original = fs.openSync;
    fs.openSync = function (target, ...args) {
      if (path.basename(String(target)) === 'SKILL.md') fs.writeFileSync(target, 'changed while opening');
      return original.call(this, target, ...args);
    };
  `, ['--skill', 'sample']);
  assert.equal(result.code, 2);
  assert.ok(codes(result).includes('changed_during_read'));
});

test('successful checks are read-only, do not need PATH and redact absolute roots and provenance', t => {
  const root = temporary(t);
  const value = putSkill(root);
  value.source.repository = 'https://example.invalid/PRIVATE_SYNTHETIC_PROVENANCE';
  write(root, `${state}/manifests/sample.json`, JSON.stringify(value));
  index(root);
  const before = snapshot(root);
  const env = { ...process.env, PATH: '' };
  for (const command of commands) {
    const result = run(command, root, command === 'verify-skill-files' ? ['--all'] : [], { env });
    assert.equal(result.code, 0);
    assert.ok(!result.text.includes(root));
    assert.ok(!result.text.includes('PRIVATE_SYNTHETIC_PROVENANCE'));
  }
  assert.deepEqual(snapshot(root), before);
});

test('non-UTF-8 directory names cannot alias a valid replacement-character filename', t => {
  if (process.platform === 'win32') { t.skip('Byte-level POSIX filename fixture.'); return; }
  const root = temporary(t);
  const files = { 'SKILL.md': 'sample', '\ufffd': 'declared unicode name' };
  putSkill(root, 'sample', files);
  const badPath = Buffer.concat([Buffer.from(path.join(root, '.agents/skills/sample') + '/'), Buffer.from([0xff])]);
  fs.writeFileSync(badPath, 'undeclared invalid-UTF-8 name');
  const result = run('verify-skill-files', root, ['--skill', 'sample']);
  assert.equal(result.code, 2);
  assert.ok(codes(result).includes('unsupported_path_encoding'));
});

test('INDEX and manifest do not accept linked state files or non-file SKILL targets', t => {
  if (process.platform === 'win32') { t.skip('Symlink fixture needs Windows privileges.'); return; }
  const root = temporary(t);
  putSkill(root);
  index(root);
  const indexPath = path.join(root, `${state}/INDEX.md`);
  const movedIndex = path.join(root, 'index-content');
  fs.renameSync(indexPath, movedIndex);
  fs.symlinkSync(movedIndex, indexPath);
  assert.deepEqual(codes(run('check-skill-index', root)), ['unsupported_symlink']);
  fs.unlinkSync(indexPath);
  fs.renameSync(movedIndex, indexPath);
  const manifestPath = path.join(root, `${state}/manifests/sample.json`);
  const movedManifest = path.join(root, 'manifest-content');
  fs.renameSync(manifestPath, movedManifest);
  fs.symlinkSync(movedManifest, manifestPath);
  assert.deepEqual(codes(run('check-skill-index', root)), ['unsupported_symlink']);
  assert.ok(codes(run('verify-skill-files', root, ['--all'])).includes('unsupported_symlink'));
  fs.unlinkSync(manifestPath);
  fs.renameSync(movedManifest, manifestPath);
  const skillPath = path.join(root, '.agents/skills/sample/SKILL.md');
  fs.unlinkSync(skillPath);
  fs.mkdirSync(skillPath);
  assert.deepEqual(codes(run('check-skill-index', root)), ['unexpected_file_type']);
});

test('literal JSON lone-surrogate path cannot alias a declared U+FFFD filename', t => {
  const root = temporary(t);
  write(root, '.agents/skills/sample/SKILL.md', 'sample');
  write(root, '.agents/skills/sample/\ufffd', 'replacement');
  // Intentionally literal JSON, not JSON.stringify or a path-sanitized fixture.
  // Both last hashes match the sole U+FFFD file. Without Unicode validation,
  // Node would encode the lone surrogate as U+FFFD and verify a nonexistent file.
  const manifest = String.raw`{
    "schemaVersion": 1,
    "name": "sample",
    "source": {
      "repository": "https://example.invalid/repository",
      "path": "skills/sample",
      "ref": "synthetic-ref",
      "commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    },
    "files": [
      { "path": "SKILL.md", "sha256": "af2bdbe1aa9b6ec1e2ade1d694f41fc71a831d0268e9891562113d8a62add1bf" },
      { "path": "\ufffd", "sha256": "95713e9cbdd1dfcb2d4080c2537f418d43ca0da25f0d7d6631f4f7c97b89dc47" },
      { "path": "\ud800", "sha256": "95713e9cbdd1dfcb2d4080c2537f418d43ca0da25f0d7d6631f4f7c97b89dc47" }
    ]
  }`;
  write(root, `${state}/manifests/sample.json`, manifest);
  index(root);
  const before = snapshot(root);
  const checked = run('check-skill-index', root);
  assert.equal(checked.code, 1);
  assert.deepEqual(codes(checked), ['manifest_file_invalid']);
  const verified = run('verify-skill-files', root, ['--skill', 'sample']);
  assert.equal(verified.code, 1);
  assert.deepEqual(codes(verified), ['manifest_file_invalid']);
  assert.equal(verified.output.data.skills[0].checkedFiles, 0);
  assert.deepEqual(snapshot(root), before);
});

test('ill-formed Unicode is rejected in roots, relative paths and provenance metadata', t => {
  const root = temporary(t);
  for (const value of ['\ud800', '\udfff', 'before\ud800after', '\udfff\ud800']) {
    assert.equal(validRelative(value), false);
    assert.throws(() => parseArgs('inspect-computer', ['--root', path.join(root, value)]), /invalid_root/u);
    for (const field of ['repository', 'path', 'ref']) {
      const manifest = record();
      manifest.source[field] = value;
      assert.equal(validateManifest(manifest, 'sample'), 'manifest_source_invalid');
    }
    const changes = record();
    changes.localChanges = value;
    assert.equal(validateManifest(changes, 'sample'), 'manifest_local_changes_invalid');
    const verification = record();
    verification.verification = { summary: value };
    assert.equal(validateManifest(verification, 'sample'), 'manifest_verification_invalid');
  }
  assert.equal(validRelative('well-formed-\ud83d\ude00'), true);
  assert.equal(validRelative('\ufffd'), true);
});

test('description quote-prefix parsing preserves Unicode line and paragraph separators', t => {
  const root = temporary(t);
  putSkill(root);
  for (const separator of ['\u2028', '\u2029']) {
    const description = `first${separator}second`;
    const source = `# Skills\n\n${entry('sample', description)}`;
    const parsed = parseIndex(Buffer.from(source));
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.entries[0].description, description);
    assert.equal(parsed.entries[0].descriptionLines, 1);
    write(root, `${state}/INDEX.md`, source);
    const before = snapshot(root);
    assert.equal(run('check-skill-index', root).code, 0);
    assert.deepEqual(snapshot(root), before);
  }
});
