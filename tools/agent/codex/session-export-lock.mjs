// @ai-dotfiles agent-dev-runtime managed
import { lstatSync, realpathSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, rmdirSync, openSync, closeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { reject } from './session-rollout-io.mjs';

export const EXPORT_LOCK = '.agent-export-lock';
export const RELOCATION_MARKER = '.agent-export-relocation.json';
const stat = path => lstatSync(path, { throwIfNoEntry: false });

export function checkedDirectory(path) {
  path = resolve(path);
  for (let parent = path; ; parent = dirname(parent)) {
    const info = lstatSync(parent);
    if (!info.isDirectory() || info.isSymbolicLink()) reject('Storage paths must contain only real directories.');
    if (dirname(parent) === parent) break;
  }
  return realpathSync(path);
}

export function assertExportAvailable(directory) {
  if (stat(join(directory, RELOCATION_MARKER))) reject('Export relocation is pending. Resume relocation before using this directory.');
  if (stat(join(directory, EXPORT_LOCK))) reject('Saved exports are locked by another operation. Wait for it to finish; do not remove an active lock.');
}

function readOwner(folder) {
  const info = lstatSync(folder), path = join(folder, 'owner.json'), ownerInfo = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink() || !ownerInfo.isFile() || ownerInfo.isSymbolicLink() || ownerInfo.size > 4096) reject('Unrecognized export lock; manual inspection is required.');
  const owner = JSON.parse(readFileSync(path, 'utf8'));
  if (owner.format !== 'ai-dotfiles/export-lock-v1' || !Number.isSafeInteger(owner.pid) || owner.pid <= 0 || typeof owner.host !== 'string' || !/^[a-f0-9-]{36}$/.test(owner.id ?? '')) reject('Unrecognized export lock; manual inspection is required.');
  return owner;
}

export function acquireExportLock(directory, { resume = false, relocating = false } = {}) {
  directory = checkedDirectory(directory);
  if (!relocating && stat(join(directory, RELOCATION_MARKER))) reject('Export relocation is pending. Resume it before writing saved exports.');
  const folder = join(directory, EXPORT_LOCK);
  if (stat(folder)) {
    if (!resume) reject('Saved exports are locked. Wait for the operation or review relocate --resume --dry-run after an interruption.');
    const owner = readOwner(folder);
    if (owner.host !== hostname()) reject('Cannot reclaim an export lock from another host.');
    let stopped = false;
    try { process.kill(owner.pid, 0); } catch (error) { if (error.code === 'ESRCH') stopped = true; }
    if (!stopped) reject('The export lock owner may still be running; relocation stopped.');
    const recovery = join(folder, 'recovery');
    mkdirSync(recovery); // Only one resumer can reclaim this dead owner's lock.
    try {
      if (readOwner(folder).id !== owner.id) reject('Export lock changed.');
      unlinkSync(join(folder, 'owner.json'));
    } finally { rmdirSync(recovery); }
    rmdirSync(folder);
  }
  mkdirSync(folder); // Exclusive: no recursive creation or replacement.
  const owner = { format: 'ai-dotfiles/export-lock-v1', id: randomUUID(), pid: process.pid, host: hostname() };
  const ownerPath = join(folder, 'owner.json');
  let fd, created = false;
  try {
    fd = openSync(ownerPath, 'wx', 0o600); created = true;
    // Ephemeral coordination only. Persistent relocation journals are separately flushed.
    writeFileSync(fd, JSON.stringify(owner) + '\n');
    closeSync(fd); fd = undefined;
  } catch (error) {
    try { if (fd !== undefined) closeSync(fd); } catch {}
    try { if (created) unlinkSync(ownerPath); rmdirSync(folder); } catch {}
    throw error;
  }
  let released = false;
  return () => {
    if (released) return;
    if (readOwner(folder).id !== owner.id) reject('Export lock ownership changed; lock retained.');
    unlinkSync(join(folder, 'owner.json')); rmdirSync(folder); released = true;
  };
}
