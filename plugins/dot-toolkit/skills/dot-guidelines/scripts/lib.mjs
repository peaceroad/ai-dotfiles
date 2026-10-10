// Shared, read-only primitives. No network, installation, repair, or YAML parsing.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const INDEX = '.agents/skills-state/INDEX.md';
export const MANIFESTS = '.agents/skills-state/manifests';
export const SKILLS = '.agents/skills';
const NAME = /^(?!.*--)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
export const validName = value => typeof value === 'string' && value.length <= 64 && NAME.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeString = value => typeof value === 'string' && value.isWellFormed() && value.trim().length > 0 && !CONTROL.test(value);
export function validRelative(value) {
  return safeString(value) && !value.includes('\\') && !value.includes(':') &&
    !value.startsWith('/') && value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}
export const supportedNode = version => /^\d+\./u.test(version) && Number(version.split('.')[0]) >= 24;
const display = target => target === '' ? '<root>' : validRelative(target) ? `<root>/${target}` : '<invalid-target>';

export function report(command) {
  return { schemaVersion: 1, command, status: 'verified', scope: { root: '<root>' }, data: {}, findings: [] };
}
export function finding(result, severity, code, target = '', detail) {
  const value = { severity, code, target: display(target) };
  if (detail !== undefined) value.detail = detail;
  result.findings.push(value);
}
export function finish(result, successfulStatus = 'verified') {
  const exitCode = result.findings.some(item => item.severity === 'unverified') ? 2 :
    result.findings.some(item => item.severity === 'mismatch') ? 1 : 0;
  result.status = exitCode === 2 ? 'unverified' : exitCode === 1 ? 'mismatch' : successfulStatus;
  return exitCode;
}
function usage(command) {
  return `node ${command}.mjs --root <absolute-cloud-root>${command === 'verify-skill-files' ? ' (--skill <name> [--skill <name> ...] | --all)' : ''}`;
}
export function parseArgs(command, argv) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) return { help: true };
  const options = { skills: [], all: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--root' && options.root === undefined && argv[index + 1] && !argv[index + 1].startsWith('--')) {
      options.root = argv[++index];
    } else if (command === 'verify-skill-files' && arg === '--skill' && validName(argv[index + 1])) {
      const name = argv[++index];
      if (options.skills.includes(name)) throw new Error('duplicate_skill');
      options.skills.push(name);
    } else if (command === 'verify-skill-files' && arg === '--all' && !options.all) {
      options.all = true;
    } else throw new Error('invalid_arguments');
  }
  if (!options.root || !path.isAbsolute(options.root)) throw new Error('absolute_root_required');
  // Reject dot components rather than resolving through a possibly linked ancestor.
  const components = options.root.slice(path.parse(options.root).root.length).split(path.sep);
  if (!options.root.isWellFormed() || components.some(part => part === '.' || part === '..') || CONTROL.test(options.root)) throw new Error('invalid_root');
  options.root = path.normalize(options.root);
  if (command === 'verify-skill-files' && (options.all === (options.skills.length > 0))) throw new Error('explicit_scope_required');
  return options;
}
export function run(command, argv, action, successfulStatus = 'verified') {
  const result = report(command);
  if (!supportedNode(process.versions.node)) {
    finding(result, 'unverified', 'node_version_unsupported', '', 'Node.js >=24 is required; no runtime was installed.');
  } else {
    let options;
    try { options = parseArgs(command, argv); }
    catch (error) {
      finding(result, 'unverified', error.message, '', usage(command));
    }
    if (options?.help) {
      result.data = { usage: usage(command), nodeRequirement: '>=24', readOnly: true,
        exitCodes: { 0: 'verified or inspection complete (also help)', 1: 'confirmed mismatch', 2: 'unverified, read, runtime, or usage error' } };
      successfulStatus = 'help';
    } else if (options) {
      try {
        const access = new ReadOnlyRoot(options.root);
        access.stat('', 'directory');
        action(options, result, access);
      } catch (error) { addAccessFailure(result, error, ''); }
    }
  }
  const exitCode = finish(result, successfulStatus);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = exitCode;
}

class AccessFailure extends Error {
  constructor(code, target, missing = false) {
    super(code);
    this.code = code;
    this.target = target;
    this.missing = missing;
  }
}
function accessFailure(error, target) {
  if (error instanceof AccessFailure) return error;
  // Do not expose native error messages: they contain absolute/private paths.
  const code = error?.code === 'ENOENT' ? 'missing' :
    ['EACCES', 'EPERM'].includes(error?.code) ? 'read_denied' : 'read_failed';
  return new AccessFailure(code, target, code === 'missing');
}
export function addAccessFailure(result, error, fallback, missingSeverity = 'unverified', missingCode = 'missing') {
  const failure = accessFailure(error, fallback);
  finding(result, failure.missing ? missingSeverity : 'unverified', failure.missing ? missingCode : failure.code, failure.target);
}
const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.nlink === b.nlink;
const sameVersion = (a, b) => sameIdentity(a, b) && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;

export class ReadOnlyRoot {
  constructor(root) { this.root = root; }
  absolute(relative) {
    if (relative !== '' && !validRelative(relative)) throw new AccessFailure('unsafe_path', relative);
    const absolute = path.join(this.root, ...relative.split('/'));
    const within = path.relative(this.root, absolute);
    if (within === '..' || within.startsWith(`..${path.sep}`) || path.isAbsolute(within)) throw new AccessFailure('outside_root', relative);
    return absolute;
  }
  stat(relative, expected) {
    const absolute = this.absolute(relative);
    const parsed = path.parse(absolute);
    const components = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean);
    let cursor = parsed.root;
    let stat;
    // lstat every ancestor, including ancestors of --root; never follow a known link.
    for (let index = -1; index < components.length; index++) {
      if (index >= 0) cursor = path.join(cursor, components[index]);
      try { stat = fs.lstatSync(cursor, { bigint: true }); }
      catch (error) { throw accessFailure(error, relative); }
      if (stat.isSymbolicLink()) throw new AccessFailure('unsupported_symlink', relative);
      if (index < components.length - 1 && !stat.isDirectory()) throw new AccessFailure('unsupported_ancestor_type', relative);
    }
    if (!stat.isFile() && !stat.isDirectory()) throw new AccessFailure('unsupported_file_type', relative);
    if (stat.isFile() && stat.nlink !== 1n) throw new AccessFailure('unsupported_hardlink', relative);
    if (expected === 'file' && !stat.isFile() || expected === 'directory' && !stat.isDirectory()) {
      throw new AccessFailure('unexpected_file_type', relative);
    }
    return stat;
  }
  read(relative) {
    const before = this.stat(relative, 'file');
    let fd;
    try {
      fd = fs.openSync(this.absolute(relative), fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
      const opened = fs.fstatSync(fd, { bigint: true });
      if (!opened.isFile() || opened.nlink !== 1n || !sameVersion(before, opened)) throw new AccessFailure('changed_during_read', relative);
      // Recheck ancestry after opening and after reading. This is not an atomic snapshot
      // or a hostile-concurrent-writer sandbox; maintenance must exclude parallel edits.
      if (!sameVersion(before, this.stat(relative, 'file'))) throw new AccessFailure('changed_during_read', relative);
      const bytes = fs.readFileSync(fd);
      if (!sameVersion(opened, fs.fstatSync(fd, { bigint: true })) || !sameVersion(before, this.stat(relative, 'file'))) {
        throw new AccessFailure('changed_during_read', relative);
      }
      return bytes;
    } catch (error) { throw accessFailure(error, relative); }
    finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  list(relative) {
    const before = this.stat(relative, 'directory');
    try {
      const rawEntries = fs.readdirSync(this.absolute(relative), { encoding: 'buffer' });
      let entries;
      try { entries = rawEntries.map(entry => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(entry)); }
      catch { throw new AccessFailure('unsupported_path_encoding', relative); }
      if (!sameVersion(before, this.stat(relative, 'directory'))) throw new AccessFailure('changed_during_read', relative);
      return entries.sort();
    } catch (error) { throw accessFailure(error, relative); }
  }
}

export function parseIndex(bytes) {
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { return { error: 'index_encoding_invalid' }; }
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  if (lines[0] !== '# Skills') return { error: 'index_title_invalid', line: 1 };
  let index = 1;
  const entries = [];
  const names = new Set();
  function blanks() { const start = index; while (lines[index] === '') index++; return index > start; }
  if (index === lines.length) return { entries };
  if (!blanks()) return { error: 'index_blank_required', line: index + 1 };
  while (index < lines.length) {
    const heading = /^## \[([^\]]+)\]\(([^)]+)\)$/u.exec(lines[index]);
    if (!heading) return { error: 'index_entry_invalid', line: index + 1 };
    const [, name, link] = heading;
    if (!validName(name)) return { error: 'index_name_invalid', line: index + 1 };
    if (names.has(name)) return { error: 'index_duplicate_name', line: index + 1 };
    if (link !== `../skills/${name}/SKILL.md`) return { error: 'index_link_invalid', line: index + 1 };
    names.add(name);
    index++;
    if (!blanks()) return { error: 'index_blank_required', line: index + 1 };
    const description = [];
    while (index < lines.length && (lines[index] === '>' || (lines[index].startsWith('> ') && lines[index].length > 2))) {
      description.push(lines[index] === '>' ? '' : lines[index].slice(2));
      index++;
    }
    if (!description.some(line => line.trim().length > 0)) return { error: 'index_description_required', line: index + 1 };
    if (!blanks() || lines[index] !== '---') return { error: 'index_separator_required', line: index + 1 };
    index++;
    entries.push({ name, link, description: description.join('\n'), descriptionLines: description.length });
    if (index < lines.length && !blanks()) return { error: 'index_blank_required', line: index + 1 };
  }
  return { entries };
}

export function validateManifest(value, name) {
  if (!object(value)) return 'manifest_object_required';
  if (Object.keys(value).some(key => !['schemaVersion', 'name', 'source', 'files', 'localChanges', 'verification'].includes(key))) return 'manifest_unknown_field';
  if (value.schemaVersion !== 1) return 'manifest_schema_unsupported';
  if (!validName(value.name) || value.name !== name) return 'manifest_name_mismatch';
  if (!object(value.source) || Object.keys(value.source).some(key => !['repository', 'path', 'ref', 'commit'].includes(key)) ||
    !['repository', 'path', 'ref', 'commit'].every(key => safeString(value.source[key])) ||
    !(value.source.path === '.' || validRelative(value.source.path)) ||
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value.source.commit)) return 'manifest_source_invalid';
  if (!Array.isArray(value.files) || !value.files.length) return 'manifest_files_required';
  const paths = new Set();
  for (const item of value.files) {
    if (!object(item) || Object.keys(item).some(key => !['path', 'sha256'].includes(key)) || !validRelative(item.path) ||
      typeof item.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(item.sha256)) return 'manifest_file_invalid';
    if (paths.has(item.path)) return 'manifest_duplicate_path';
    paths.add(item.path);
  }
  if (!paths.has('SKILL.md')) return 'manifest_skill_file_required';
  for (const file of paths) {
    const parts = file.split('/');
    for (let length = 1; length < parts.length; length++) if (paths.has(parts.slice(0, length).join('/'))) return 'manifest_path_conflict';
  }
  if ('localChanges' in value && !safeString(value.localChanges)) return 'manifest_local_changes_invalid';
  if ('verification' in value && (!object(value.verification) ||
    Object.keys(value.verification).some(key => key !== 'summary') || !safeString(value.verification.summary))) return 'manifest_verification_invalid';
  // Informational metadata never changes expected bytes, source identity,
  // selection, or the computed verdict.
  return null;
}
export function readManifest(access, result, name) {
  const target = `${MANIFESTS}/${name}.json`;
  let bytes;
  try { bytes = access.read(target); }
  catch (error) { addAccessFailure(result, error, target, 'mismatch', 'manifest_missing'); return null; }
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)); }
  catch { finding(result, 'mismatch', 'manifest_json_invalid', target); return null; }
  const error = validateManifest(value, name);
  if (error) { finding(result, 'mismatch', error, target); return null; }
  return value;
}
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
