// @ai-dotfiles agent-dev-runtime managed
import { randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, openSync, closeSync, readSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';

const OWNER = 'owner.json';
const LIMIT = 4096;
const fail = message => { throw new Error(message); };

function snapshot(path) {
  const info = lstatSync(path, { bigint: true });
  if (!info.isDirectory() || info.isSymbolicLink()) fail('Sync lock must be a real directory.');
  const entries = readdirSync(path);
  if (entries.length > 1 || (entries.length === 1 && entries[0] !== OWNER)) {
    fail('Sync lock contains unexpected files; inspect it manually.');
  }
  let raw = null;
  let owner = null;
  if (entries.length) {
    const file = join(path, OWNER);
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > LIMIT) fail('Sync lock metadata is unsafe or too large; inspect it manually.');
    const fd = openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(LIMIT + 1);
      let length = 0;
      while (length < buffer.length) {
        const count = readSync(fd, buffer, length, buffer.length - length, null);
        if (!count) break;
        length += count;
      }
      if (length > LIMIT) fail('Sync lock metadata is too large; inspect it manually.');
      raw = buffer.subarray(0, length).toString('utf8');
    } finally { closeSync(fd); }
    try { owner = JSON.parse(raw); } catch { fail('Sync lock metadata is invalid; inspect it manually.'); }
    if (owner?.schemaVersion !== 1 || typeof owner.id !== 'string' || !/^[a-f0-9-]{36}$/.test(owner.id)
      || typeof owner.host !== 'string' || !owner.host || owner.host.length > 255 || /[\x00-\x1f\x7f]/.test(owner.host)
      || !Number.isSafeInteger(owner.pid) || owner.pid <= 0
      || typeof owner.startedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(owner.startedAt)
      || !Number.isFinite(Date.parse(owner.startedAt))) fail('Sync lock metadata is invalid; inspect it manually.');
  }
  const identity = `${info.dev}:${info.ino}:${info.birthtimeNs}`;
  return { owner, raw, identity, legacyIdentity: `${identity}:${info.mtimeNs}:${info.ctimeNs}` };
}

function same(a, b) {
  // Directory write timestamps can settle after owner.json is written on SMB.
  // Owned locks have an immutable UUID-bearing record; timestamps are not ownership.
  // Empty legacy locks have no token, so retain their conservative metadata check.
  return a.identity === b.identity && a.raw === b.raw
    && (a.owner !== null || a.legacyIdentity === b.legacyIdentity);
}

function ownerState(owner) {
  if (!owner || owner.host.toLowerCase() !== hostname().toLowerCase()) return 'unknown';
  try { process.kill(owner.pid, 0); return 'running'; }
  catch (error) { return error.code === 'ESRCH' ? 'stopped' : 'unknown-local'; }
}

// Serialize short lock mutations only, never user input or the assembler.
// A crash in this section leaves a small guard directory. Do not guess its age
// or automatically remove it: that would introduce another takeover race.
function guarded(path, validate, action) {
  const guard = `${path}.guard`;
  validate(path);
  validate(guard);
  try { mkdirSync(guard); }
  catch (error) {
    if (error.code === 'EEXIST') fail('Sync lock maintenance is in progress. Retry shortly; if it persists, confirm all writers stopped and inspect agent-dev-sync.lock.guard.');
    throw error;
  }
  let primaryError;
  try { return action(); }
  catch (error) { primaryError = error; throw error; }
  finally {
    try { rmdirSync(guard); }
    catch (error) {
      if (!primaryError) throw error;
      primaryError.message += '\nSync lock maintenance guard could not be removed; inspect agent-dev-sync.lock.guard before retrying.';
    }
  }
}

function create(path) {
  mkdirSync(path);
  const owner = { schemaVersion: 1, id: randomUUID(), host: hostname(), pid: process.pid, startedAt: new Date().toISOString() };
  // Preserve partial evidence on I/O failure; never recursively delete it.
  writeFileSync(join(path, OWNER), `${JSON.stringify(owner)}\n`, { flag: 'wx' });
  return snapshot(path);
}

function remove(path, observed, changedMessage = 'Sync lock changed; nothing was removed. Retry sync to inspect the current lock.') {
  if (!same(snapshot(path), observed)) fail(changedMessage);
  if (observed.owner) unlinkSync(join(path, OWNER));
  rmdirSync(path);
}

export async function acquireSyncLock(path, {
  validate = () => {}, interactive = false, confirm, log = console.log,
} = {}) {
  let observed;
  const acquired = guarded(path, validate, () => {
    try { return create(path); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      observed = snapshot(path);
      return null;
    }
  });
  if (acquired) return acquired;
  const state = ownerState(observed.owner);
  log('Marketplace sync lock exists. A previous sync may have been interrupted.');
  if (observed.owner) {
    log(`Lock owner: host=${observed.owner.host}, PID=${observed.owner.pid}, started=${observed.owner.startedAt}`);
  } else log('Legacy lock: no owner information is available.');
  if (state === 'running') fail('The recorded process is still running on this host. Wait for it to finish; lock recovery is refused.');
  if (state === 'unknown-local') fail('The recorded local process could not be checked. Lock recovery is refused.');
  if (!interactive) fail('Marketplace is locked by another sync. Run sync in an interactive terminal to review a stale lock; non-interactive sync never removes locks.');
  log(state === 'stopped' ? 'The recorded local process has stopped.' : 'Whether another host is still syncing cannot be checked automatically.');
  log('Confirm no sync is running on ANY computer, including older CLI versions. Removing an active lock can corrupt shared contents.');
  if (!await confirm('No sync is running on any computer. Remove this stale lock and retry?')) fail('Sync cancelled; the lock was preserved.');
  return guarded(path, validate, () => {
    const current = ownerState(observed.owner);
    if (current === 'running' || current === 'unknown-local') fail('The recorded local process is running or cannot be checked; the lock was preserved.');
    // Re-read once, immediately before deletion, while holding the guard.
    remove(path, observed, 'Sync lock changed during confirmation; nothing was removed. Retry sync.');
    return create(path);
  });
}

export function releaseSyncLock(path, acquired, { validate = () => {} } = {}) {
  return guarded(path, validate, () => remove(path, acquired));
}
