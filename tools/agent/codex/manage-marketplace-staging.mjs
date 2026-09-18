#!/usr/bin/env node
// @ai-dotfiles agent-dev-runtime managed

import * as fs from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

export const MIN_AGE_MS = 24 * 60 * 60 * 1000;
const pattern = /^openai-bundled\.staging-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const refreshLock = 'openai-bundled.refresh.lock';
const cleanupLock = '.ai-dotfiles-marketplace-staging.lock';
const stat = path => { try { return fs.lstatSync(path); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
const fail = message => { throw new Error(message); };
const identity = s => [s.dev, s.ino, s.birthtimeMs];
const sameIdentity = (s, id) => s.dev === id[0] && s.ino === id[1] && s.birthtimeMs === id[2];
const sameMetadata = (s, node) => sameIdentity(s, node.id)
  && s.isDirectory() === node.directory && s.size === node.size
  && s.mtimeMs === node.mtime && s.ctimeMs === node.ctime;
const safeName = name => name.replace(/[\x00-\x1f\x7f-\x9f]/g, '?');

// Check each component before reading through it, including redirected ancestors.
function realDirectories(path) {
  const parent = dirname(path);
  if (parent !== path && !realDirectories(parent)) return false;
  const s = stat(path);
  if (!s) return false;
  if (!s.isDirectory() || s.isSymbolicLink()) fail('A storage ancestor is not a real directory; refusing redirected storage.');
  return true;
}

function targetPath(root, name) {
  if (!pattern.test(name)) fail('Invalid staging directory name.');
  const target = resolve(root, name);
  if (dirname(target) !== root) fail('Invalid cleanup boundary.');
  return target;
}

// Status needs aggregates only. Cleaning retains one inventory; rechecks compare
// against it during traversal instead of allocating and serializing a second tree.
function snapshot(path, { retainNodes = false, expected } = {}) {
  const nodes = retainNodes ? [] : undefined;
  let index = 0;
  let bytes = 0;
  let newest = 0;
  function walk(current, key) {
    const s = fs.lstatSync(current);
    if (s.isSymbolicLink() || (!s.isFile() && !s.isDirectory())) fail('Contains a link or unsupported file type.');
    if (key === '' && !s.isDirectory()) fail('Staging entry is not a directory.');
    if (s.isFile() && s.nlink !== 1) fail('Contains a hard-linked file.');
    if (expected) {
      const node = expected[index++];
      if (!node || key !== node.key || !sameMetadata(s, node)) fail('Staging changed since confirmation; rerun status.');
    }
    newest = Math.max(newest, s.mtimeMs, s.birthtimeMs);
    if (s.isFile()) bytes += s.size;
    if (nodes) nodes.push({ key, directory: s.isDirectory(), id: identity(s), size: s.size, mtime: s.mtimeMs, ctime: s.ctimeMs });
    if (s.isDirectory()) {
      const names = fs.readdirSync(current);
      if (nodes || expected) names.sort();
      for (const name of names) walk(join(current, name), key ? `${key}/${name}` : name);
    }
  }
  walk(path, '');
  if (expected && index !== expected.length) fail('Staging changed since confirmation; rerun status.');
  return nodes ? { nodes, bytes, newest } : { bytes, newest };
}

export function inspect(home, now = Date.now(), { retainNodes = false } = {}) {
  const root = join(resolve(home), '.tmp', 'bundled-marketplaces');
  if (!realDirectories(root)) return { root, entries: [], refreshLocked: false, cleanupLocked: false };
  const entries = [];
  for (const name of fs.readdirSync(root).sort()) {
    if (!name.startsWith('openai-bundled.staging-')) continue;
    const entry = { name, eligible: false };
    if (!pattern.test(name)) entry.reason = 'Unrecognized staging name';
    else {
      try {
        Object.assign(entry, snapshot(targetPath(root, name), { retainNodes }));
        entry.eligible = now - entry.newest >= MIN_AGE_MS;
        if (!entry.eligible) entry.reason = 'Created or modified within 24 hours (or future timestamp)';
      } catch (e) { entry.reason = e.code ? `Inspection failed (${e.code})` : e.message; }
    }
    entries.push(entry);
  }
  return { root, entries, refreshLocked: !!stat(join(root, refreshLock)), cleanupLocked: !!stat(join(root, cleanupLock)) };
}

export function assertClientsClosed({ spawn = spawnSync } = {}) {
  const windowsRoot = process.env.SystemRoot || process.env.WINDIR;
  if (!windowsRoot) fail('Cannot locate Windows process inventory.');
  const result = spawn(join(windowsRoot, 'System32', 'tasklist.exe'), ['/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  if (result.error || result.status !== 0) fail('Process inspection failed; cleanup refused.');
  const names = [...result.stdout.matchAll(/^"([^"\r\n]+)","\d+",/gm)].map(m => m[1].toLowerCase());
  if (!names.length) fail('Process inventory could not be parsed; cleanup refused.');
  if (names.some(n => ['codex.exe', 'chatgpt.exe', 'codex-app-server.exe', 'codex-desktop.exe'].includes(n))) {
    fail('Codex/ChatGPT is running. Close Desktop, CLI and IDE Codex clients; retry from an external terminal.');
  }
}

function assertIdle(root, closed) {
  closed();
  if (!realDirectories(root)) fail('Storage disappeared.');
  if (stat(join(root, refreshLock))) fail('Marketplace refresh lock exists; cleanup refused.');
}

function print(report, log) {
  log('Target: <Codex home>/.tmp/bundled-marketplaces/openai-bundled.staging-<UUID>');
  log(`Locks: refresh=${report.refreshLocked}; cleanup=${report.cleanupLocked}`);
  for (const e of report.entries) log(`${e.eligible ? 'candidate' : 'skip'} ${safeName(e.name)} | ${e.bytes ?? '?'} bytes | ${e.newest ? new Date(e.newest).toISOString() : 'unknown time'}${e.reason ? ` | ${e.reason}` : ''}`);
  const candidates = report.entries.filter(e => e.eligible);
  log(`Candidates: ${candidates.length}; ${candidates.reduce((sum, e) => sum + e.bytes, 0)} bytes (logical size; actual freed space may differ).`);
}

// Never recursively delete a computed root. Remove only inventoried regular files
// and then empty directories, checking identities and ancestors before each step.
function removeSnapshot(path, entry) {
  for (let index = entry.nodes.length - 1; index >= 0; index--) {
    const node = entry.nodes[index];
    const current = node.key ? join(path, node.key) : path;
    if (!realDirectories(dirname(current))) fail('An ancestor disappeared during cleanup.');
    const s = fs.lstatSync(current);
    if (s.isSymbolicLink() || !sameIdentity(s, node.id) || s.isDirectory() !== node.directory) fail('Entry changed during cleanup.');
    if (node.directory) fs.rmdirSync(current);
    else {
      if (!s.isFile() || s.nlink !== 1 || s.size !== node.size || s.mtimeMs !== node.mtime || s.ctimeMs !== node.ctime) fail('File changed during cleanup.');
      fs.unlinkSync(current);
    }
  }
  if (stat(path)) fail('Removal verification failed.');
}

export async function clean(home, { closed = assertClientsClosed, confirm, log = console.log, now = Date.now } = {}) {
  const initial = inspect(home, now(), { retainNodes: true });
  print(initial, log);
  if (initial.refreshLocked || initial.cleanupLocked) fail('A marketplace lock exists; cleanup refused. Do not remove locks automatically.');
  const candidates = initial.entries.filter(e => e.eligible);
  if (!candidates.length) { log('No eligible staging directories.'); return initial.entries.length ? 3 : 0; }
  assertIdle(initial.root, closed);
  if (!await confirm()) { log('Cancelled; no files removed.'); return 0; }
  assertIdle(initial.root, closed);
  const lockPath = join(initial.root, cleanupLock);
  const lock = fs.openSync(lockPath, 'wx');
  let lockId;
  let removed = 0;
  try {
    lockId = identity(fs.fstatSync(lock));
    // Validate the entire confirmed candidate set before the first deletion.
    for (const entry of candidates) {
      snapshot(targetPath(initial.root, entry.name), { expected: entry.nodes });
    }
    for (const entry of candidates) {
      assertIdle(initial.root, closed);
      const path = targetPath(initial.root, entry.name);
      snapshot(path, { expected: entry.nodes });
      removeSnapshot(path, entry);
      removed++;
      log(`Removed: ${entry.name} (${entry.bytes} bytes logical size)`);
    }
    log(`Completed: ${removed} directories removed; ${initial.entries.length - candidates.length} skipped.`);
    return initial.entries.length > candidates.length ? 3 : 0;
  } catch (e) {
    log(`Stopped: ${removed} directories fully removed; the current directory may be partially removed. Rerun status before retrying.`);
    throw e;
  } finally {
    fs.closeSync(lock);
    if (realDirectories(initial.root)) {
      const s = stat(lockPath);
      if (s && lockId && !s.isSymbolicLink() && sameIdentity(s, lockId)) fs.unlinkSync(lockPath);
    }
  }
}

const help = `Inspect and clean old bundled-marketplace temporary directories (Windows, Node.js 24).
Usage: agent codex marketplace-staging <status|clean> [--codex-home DIRECTORY]
Home: --codex-home, then CODEX_HOME, then ~/.codex. The chosen root is displayed without personal paths.
status: read-only; may run with Codex open. Candidates are not proof of the upstream bug.
clean: permanently delete only openai-bundled.staging-<UUID> under .tmp/bundled-marketplaces.
Only real directory trees with no links and no file/directory created or modified in the last 24 hours qualify.
Close Codex/ChatGPT Desktop, CLI and IDE clients; keep them closed until completion.
An external interactive terminal and y confirmation are required. No --yes/force option.
Process checks fail closed; refresh/cleanup locks block cleaning. Stale locks need manual review.
Confirmation is followed by metadata rechecks. The helper lock does not coordinate with Codex itself;
do not restart clients or modify the tree during cleanup. Concurrent external mutations are unsupported.
Canonical marketplace, plugin caches, sessions, credentials and user skill links are outside the target.
No automatic rollback, recurrence prevention or background cleanup. Interrupted cleanup may be partial.
Exit codes: 0 completed/cancelled/no candidates; 1 failure; 2 invalid arguments; 3 skipped entries remain.`;

export async function main(args, { log = console.log, platform = process.platform } = {}) {
  if (!args.length || (args.length === 1 && ['help', '--help', '-h'].includes(args[0]))) { log(help); return 0; }
  if (!['status', 'clean'].includes(args[0]) || !(args.length === 1 || (args.length === 3 && args[1] === '--codex-home' && args[2] && !args[2].startsWith('--')))) { log(help); return 2; }
  if (platform !== 'win32') { log('Windows is required; no operation started.'); return 1; }
  const home = resolve(args[2] || process.env.CODEX_HOME || join(homedir(), '.codex'));
  log(`Codex home: ${args[2] ? '<explicit --codex-home>' : process.env.CODEX_HOME ? '<CODEX_HOME>' : '~/.codex'}`);
  if (args[0] === 'status') {
    const report = inspect(home);
    print(report, log);
    return report.entries.some(e => !e.eligible) ? 3 : 0;
  }
  return clean(home, { log, confirm: async () => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) fail('Clean requires an external interactive terminal; piped confirmation is not accepted.');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try { return (await rl.question('Permanently delete the listed candidates? [y/N]: ')).trim().toLowerCase() === 'y'; }
    finally { rl.close(); }
  } });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(process.argv.slice(2)); }
  catch (e) { console.error(e.code ? `Cleanup/inspection failed (${e.code}); inspect access and retry status.` : e.message); process.exitCode = 1; }
}
