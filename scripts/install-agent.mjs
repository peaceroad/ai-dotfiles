#!/usr/bin/env node
// Repository-owned installer; no external dependencies.
import * as fs from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute, delimiter } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const marker = '@ai-dotfiles agent-dev-runtime managed';
const coreMarkers = [marker, '@ai-dotfiles agent-command v1'];
const assemblerMarker = '@plugin-creator-agent-plugins managed-marketplace-assembler v1';
const stat = path => { try { return fs.lstatSync(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
const hasMarker = (content, markers) => content.toString('utf8').split(/\r?\n/).slice(0, 8).some(line => markers.some(value => line.includes(value)));
const managed = (path, markers) => stat(path)?.isFile() && hasMarker(fs.readFileSync(path), markers);
const same = (a, b) => process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);
export function displayPath(path) {
  const suffix = relative(homedir(), resolve(path));
  if (!suffix) return '~';
  if (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) return `~/${suffix.replaceAll('\\', '/')}`;
  return `[custom]/${resolve(path).split(/[\\/]/).at(-1)}`;
}

function assertParents(path, checked) {
  // Refuse redirected destinations, including Windows junctions, even with --force.
  for (let parent = dirname(path); ; parent = dirname(parent)) {
    if (checked.has(parent)) break;
    const info = stat(parent);
    if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error(`Installation parent must be a real directory: ${displayPath(parent)}`);
    checked.add(parent);
    if (dirname(parent) === parent) break;
  }
}

function canonicalRoot(value) {
  const root = resolve(value);
  const info = stat(root);
  if (info && !info.isDirectory()) throw new Error(`Installation root must be a real directory: ${displayPath(root)}`);
  if (info) return fs.realpathSync(root);
  // Resolve existing ancestors, including macOS /tmp -> /private/tmp, once.
  let ancestor = dirname(root);
  while (!stat(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new Error('Installation filesystem root is unavailable.');
    ancestor = parent;
  }
  return resolve(fs.realpathSync(ancestor), relative(ancestor, root));
}

function legacyContent(content) {
  return content.toString('utf8')
    .replace(/^rem @ai-dotfiles agent-dev-runtime managed\r?\n/m, '')
    .replace(/^\/\/ @ai-dotfiles agent-dev-runtime managed\r?\n\r?\n/m, '')
    .replace(/^  "\$comment": "@ai-dotfiles agent-dev-runtime managed",\r?\n/m, '')
    .replace('/tools/agent/development.schema.json', '/.agents/development.schema.json');
}

export function installAgent({ agentsRoot = join(homedir(), '.agents'), binDir = join(homedir(), '.local', 'bin'), platform = process.platform, force = false, dryRun = false, searchPath = process.env.PATH ?? '', log = console.log } = {}) {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js 24 or later is required.');
  if (!['win32', 'linux', 'darwin'].includes(platform)) throw new Error('Supported installer platforms are Windows, Linux, and macOS.');
  agentsRoot = canonicalRoot(agentsRoot);
  binDir = platform === 'win32' ? resolve(binDir) : canonicalRoot(binDir);
  const checkedParents = new Set();
  const scripts = join(agentsRoot, 'scripts');
  const plugin = 'plugins/agent-plugin-tools/skills/plugin-creator-agent-plugins';
  const payload = [];
  const add = (source, target, markers = coreMarkers) => payload.push({ source: join(repository, source), target: join(agentsRoot, target), markers });
  if (platform === 'win32') add('tools/agent/agent.cmd', 'scripts/agent.cmd');
  add('tools/agent/agent.mjs', 'scripts/agent.mjs');
  add('tools/agent/development.schema.json', 'development.schema.json');
  const core = [...payload];
  add('home/.agents/scripts/manage-skill-links.mjs', 'scripts/manage-skill-links.mjs');
  for (const [name, owner] of [
    ['scripts/manage-local-agent-plugin.mjs', '@plugin-creator-agent-plugins managed-local-runner v1'],
    ['scripts/assemble-agent-marketplace.mjs', assemblerMarker],
    ['scripts/validate-agent-plugin.mjs', '@plugin-creator-agent-plugins managed-portable-validator v1'],
    ['assets/marketplace-distribution/marketplace-development.schema.json', '@plugin-creator-agent-plugins managed-marketplace-schema v2'],
  ]) add(`${plugin}/${name}`, `scripts/agent-runtime/plugin-tools/${name}`, [owner, marker]);
  for (const item of payload) {
    assertParents(item.target, checkedParents);
    item.content = fs.readFileSync(item.source);
    if (!hasMarker(item.content, item.markers)) throw new Error(`Source is missing its managed marker: ${displayPath(item.source)}`);
    const info = stat(item.target);
    if (info && !info.isFile()) throw new Error(`Installation target must be a regular file: ${displayPath(item.target)}`);
    item.existed = !!info;
    item.installed = info ? fs.readFileSync(item.target) : null;
    item.current = !!item.installed && item.content.equals(item.installed);
    item.managed = !!item.installed && hasMarker(item.installed, item.markers);
  }
  const legacy = platform === 'win32' && core.every(item => item.existed
    && (item.managed || item.installed.toString('utf8') === legacyContent(item.content)));
  for (const item of payload) {
    if (item.existed && !item.current && !force && !item.managed && !(legacy && core.includes(item))) {
      throw new Error(`Refusing to replace an unmanaged file: ${displayPath(item.target)}. Review it before using --force.`);
    }
  }
  const entry = join(binDir, 'agent');
  const implementation = join(scripts, 'agent.mjs');
  let linkExists = false;
  if (platform !== 'win32') {
    assertParents(entry, checkedParents);
    const info = stat(entry);
    linkExists = !!info;
    if (info && (!info.isSymbolicLink() || !same(resolve(binDir, fs.readlinkSync(entry)), implementation))) throw new Error('Another file or link occupies the agent command. Resolve the collision before installing.');
    for (const directory of new Set(searchPath.split(delimiter))) {
      const candidate = resolve(directory, 'agent');
      if (same(candidate, entry) || !stat(candidate)) continue;
      // PATH can retain an alias such as macOS /tmp after the install root is canonicalized.
      if (same(join(fs.realpathSync(dirname(candidate)), 'agent'), entry)) continue;
      try { if (!fs.statSync(candidate).isFile()) continue; } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      try { fs.accessSync(candidate, fs.constants.X_OK); } catch { continue; }
      throw new Error('Another command named agent is already on PATH. Resolve the collision before installing.');
    }
  }
  // All collision checks finish before the first write. Each file replacement is atomic;
  // an interrupted multi-file update can be completed by rerunning the installer.
  for (const item of payload) {
    if (dryRun || item.current) {
      log(`${item.current ? 'Current' : 'Would install/update'}: ${displayPath(item.target)}`);
      continue;
    }
    fs.mkdirSync(dirname(item.target), { recursive: true });
    const temporary = join(dirname(item.target), `.agent-install-${randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temporary, item.content, { flag: 'wx', mode: 0o644 });
      fs.renameSync(temporary, item.target);
    } finally { if (stat(temporary)) fs.unlinkSync(temporary); }
    log(`${item.existed ? 'Updated' : 'Installed'}: ${displayPath(item.target)}`);
  }
  for (const [target, recognized] of [
    [join(scripts, 'agent.test.mjs'), path => fs.readFileSync(path).equals(fs.readFileSync(join(repository, 'tools/agent/agent.test.mjs')))],
    [join(scripts, 'agent-runtime/plugin-tools/scripts/assemble-plugin-marketplace.mjs'), path => managed(path, [assemblerMarker, marker])],
  ]) {
    const info = stat(target);
    if (!info) continue;
    if (!info.isFile() || !recognized(target)) { log(`Preserved unrecognized obsolete file: ${displayPath(target)}`); continue; }
    log(`${dryRun ? 'Would remove' : 'Removed'} obsolete: ${displayPath(target)}`);
    if (!dryRun) fs.unlinkSync(target);
  }
  if (platform !== 'win32') {
    if (!dryRun) {
      const mode = fs.statSync(implementation).mode;
      if ((mode & 0o111) !== 0o111) fs.chmodSync(implementation, mode | 0o111);
      if (!linkExists) {
        fs.mkdirSync(binDir, { recursive: true });
        fs.symlinkSync(relative(binDir, implementation), entry);
      }
    }
    log(`${dryRun ? 'Would ensure' : 'Ready'}: ${displayPath(entry)}`);
    if (!searchPath.split(delimiter).some(path => path && same(path, binDir))) log(`Add ${displayPath(binDir)} to your shell PATH, then run agent --help. Shell startup files were not modified.`);
  }
}

function main(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/install-agent.mjs [--agents-root PATH] [--bin-dir PATH] [--dry-run] [--force]\nRequires Node.js 24 or later. Installs the shared runtime; Linux/macOS also create an agent link in ~/.local/bin.\n--force replaces unmanaged regular runtime files, never command links or redirected paths.\nWindows PATH registration is available through install-agent.ps1.');
      return;
    }
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--agents-root' || arg === '--bin-dir') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('A path option requires a value.');
      options[arg === '--agents-root' ? 'agentsRoot' : 'binDir'] = args[++i];
    } else throw new Error('Unknown installer option. Use --help.');
  }
  if (process.platform === 'win32' && options.binDir) throw new Error('--bin-dir is only available on Linux and macOS.');
  installAgent(options);
}
if (process.argv[1] && same(process.argv[1], fileURLToPath(import.meta.url))) {
  try { main(process.argv.slice(2)); } catch (error) {
    // Node filesystem errors embed absolute paths. Do not expose local paths.
    console.error(error.code ? `Installation failed (${error.code}); check destination permissions and file types.` : error.message);
    process.exitCode = 1;
  }
}
