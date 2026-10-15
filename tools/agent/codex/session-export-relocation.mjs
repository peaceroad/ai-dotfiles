// @ai-dotfiles agent-dev-runtime managed
// Move saved exports only. Never opens CODEX_HOME databases or launches Codex.
import { lstatSync, readdirSync, readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync, openSync, closeSync, fstatSync, createReadStream } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { configPath, exists, fingerprint, readBundle, readExportSettings, writeExportDirectory, safeText, ExportError, reject, syncExportFile, syncExportDirectory } from './session-export-storage.mjs';
import { listBatches } from './session-export-batches.mjs';
import { acquireExportLock, assertExportAvailable, checkedDirectory, EXPORT_LOCK, RELOCATION_MARKER } from './session-export-lock.mjs';
import { createProgress } from './session-progress.mjs';

export const relocationHelp = `Usage: agent codex session relocate --from <directory> --to <directory> [--resume] [--dry-run | --confirm <token>]
Move saved exports within one filesystem, then update the default export directory.
The destination must be absent or empty; its parent must exist. A direct child of the source is supported.
Snapshots, batches, and .incomplete-* directories retain names and bytes. Unknown entries stop the move.
No original Codex sessions are changed. No cross-filesystem copy, overwrite, or automatic rollback.
Stop other export/history operations first; updated agent writers use exclusive directory locks.
--dry-run inventories files without moving or hashing them. Confirmation also approves the default-path change.
Execution compares SHA-256 before/after moving every regular file, including unfinished output.
Interrupted moves retain a journal. Review the same --from/--to with --resume --dry-run, then confirm its fresh token.
Existing export coverage warnings are preserved; relocation does not improve completeness or restore support.
Links, hard-linked files, Git checkouts, CODEX_HOME, and device roots are refused.
Node.js 24+. Exit 0: completed/cancelled/preview; 1: blocked or partial; 2: invalid arguments.`;

const FORMAT = 'ai-dotfiles/export-relocation-v1';
const LIMIT = 100000, MAX_JOURNAL = 32 * 1024 * 1024;
const stat = path => lstatSync(path, { throwIfNoEntry: false, bigint: true });
const canonical = path => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
const same = (a, b) => canonical(a) === canonical(b);
const inside = (root, path) => { const r = relative(canonical(root), canonical(path)); return !r || (!isAbsolute(r) && r !== '..' && !r.startsWith(`..${sep}`)); };
const validName = name => typeof name === 'string' && name.length > 0 && name !== '.' && name !== '..' && !/[\\/:\x00-\x1f]/.test(name) && !/[. ]$/.test(name) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
const identity = info => ({ dev: String(info.dev), ino: String(info.ino), birth: String(info.birthtimeNs) });

function safeRoot(path, home, { absent = false } = {}) {
  path = resolve(path);
  if (same(path, dirname(path))) reject('A filesystem root cannot be an export relocation root.');
  if (!validName(basename(path))) reject('Unsupported relocation directory name.');
  if (inside(home, path) || inside(path, home)) reject('Relocation roots must not overlap CODEX_HOME.');
  const present = stat(path);
  const parent = checkedDirectory(present ? path : dirname(path));
  if (!present && !absent) reject('The source directory does not exist.');
  path = present ? parent : join(parent, basename(path));
  for (let dir = present ? path : dirname(path); ; dir = dirname(dir)) {
    if (exists(join(dir, '.git'))) reject('Relocation roots must be outside Git checkouts.');
    if (dirname(dir) === dir) break;
  }
  return path;
}

function tree(folder) {
  const rows = [];
  function visit(path, parts) {
    const info = lstatSync(path, { bigint: true });
    if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory()) || (info.isFile() && info.nlink !== 1n)) reject('Relocation requires regular files and real directories without hard links.');
    if (rows.length >= LIMIT || parts.length > 64) reject('Relocation inventory limit exceeded.');
    const row = { path: parts.join('/'), type: info.isDirectory() ? 'directory' : 'file', ...identity(info) };
    if (info.isFile()) {
      if (info.size > BigInt(Number.MAX_SAFE_INTEGER)) reject('Relocation file size is unsupported.');
      Object.assign(row, { size: Number(info.size), modified: String(info.mtimeNs) });
    }
    rows.push(row);
    if (info.isDirectory()) for (const name of readdirSync(path).sort()) {
      if (!validName(name)) reject('Unsupported relocation member name.');
      visit(join(path, name), [...parts, name]);
    }
  }
  visit(folder, []);
  return rows;
}

function sourceEntries(from, to) {
  return readdirSync(from).filter(name => name !== EXPORT_LOCK && name !== RELOCATION_MARKER && !same(join(from, name), to)).sort();
}
function destinationEntries(to) {
  return exists(to) ? readdirSync(to).filter(name => name !== EXPORT_LOCK && name !== RELOCATION_MARKER).sort() : [];
}
function classify(from, key) {
  if (!validName(key) || !lstatSync(join(from, key)).isDirectory()) reject('Unrecognized source entry; move unrelated files separately.');
  if (key === 'batches') return 'batches';
  if (/^\.incomplete-[a-zA-Z0-9-]+$/.test(key)) return 'incomplete';
  if (/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(key) && readBundle(from, key)) return 'snapshot';
  reject('Unrecognized source directory; no content was discarded.');
}
function checkReferences(root, entries) {
  const snapshots = new Map(entries.filter(e => e.kind === 'snapshot').map(e => [e.key, readBundle(root, e.key)]));
  for (const batch of listBatches(root)) for (const entry of batch.entries) {
    const bundle = snapshots.get(entry.key);
    if (!bundle || bundle.manifest.session.id !== entry.id || bundle.manifest.contentDigest !== entry.digest) reject('An export receipt refers to a missing or changed snapshot.');
  }
}
function stateHash(rows) { return fingerprint(rows.map(({ sha256, ...row }) => row)); }
function readJournal(path) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > MAX_JOURNAL) reject('Unrecognized relocation journal.');
  const { digest, ...journal } = JSON.parse(readFileSync(path, 'utf8'));
  if (journal.format !== FORMAT || digest !== fingerprint(journal) || !/^[a-f0-9-]{36}$/.test(journal.id ?? '') || !Array.isArray(journal.entries)) reject('Invalid relocation journal; no automatic repair.');
  for (const entry of journal.entries) {
    if (!validName(entry.key) || [EXPORT_LOCK, RELOCATION_MARKER].includes(entry.key) || !['snapshot', 'batches', 'incomplete'].includes(entry.kind) || !Array.isArray(entry.rows) || !entry.rows.length) reject('Invalid relocation inventory.');
    for (const row of entry.rows) {
      if (typeof row.path !== 'string' || (row.path && !row.path.split('/').every(validName)) || !['file', 'directory'].includes(row.type) || (row.type === 'file' && !/^[0-9a-f]{64}$/.test(row.sha256 ?? ''))) reject('Unsafe relocation inventory.');
    }
  }
  if (new Set(journal.entries.map(e => e.key)).size !== journal.entries.length) reject('Duplicate relocation entries.');
  return journal;
}
function saveExclusive(path, value) {
  const text = JSON.stringify({ ...value, digest: fingerprint(value) }) + '\n';
  if (Buffer.byteLength(text) > MAX_JOURNAL) reject('Relocation journal is too large.');
  writeFileSync(path, text, { flag: 'wx', mode: 0o600, flush: true });
  syncExportDirectory(dirname(path));
}

export function planRelocation({ from, to, resume = false, home = process.env.CODEX_HOME || join(homedir(), '.codex'), settingsPath = configPath() }) {
  home = exists(home) ? checkedDirectory(home) : resolve(home);
  let settingsParent = dirname(resolve(settingsPath));
  while (!exists(settingsParent)) settingsParent = dirname(settingsParent);
  checkedDirectory(settingsParent);
  from = safeRoot(from, home); to = safeRoot(to, home, { absent: true });
  if (same(from, to) || inside(to, from) || (inside(from, to) && !same(dirname(to), from))) reject('Use a different destination, outside the source or a direct child of it.');
  if (inside(from, settingsPath) || inside(to, settingsPath)) reject('The export settings file must be outside both relocation roots.');
  const sourceStat = stat(from), targetStat = stat(exists(to) ? to : dirname(to));
  if (sourceStat.dev !== targetStat.dev) reject('Cross-filesystem relocation is unsupported; no copy fallback is used.');
  const settings = readExportSettings(settingsPath), journalPath = join(from, RELOCATION_MARKER);
  let entries, journal;
  if (exists(journalPath)) {
    if (!resume) reject('A relocation is pending. Review --resume --dry-run with the same source and destination.');
    journal = readJournal(journalPath);
    if (!same(journal.from, from) || !same(journal.to, to) || !same(journal.settingsPath, settingsPath) || fingerprint(journal.sourceIdentity) !== fingerprint(identity(sourceStat))) reject('Relocation roots or settings path do not match the journal.');
    entries = journal.entries;
    const expected = entries.map(e => e.key).sort();
    const source = sourceEntries(from, to), target = destinationEntries(to);
    if (fingerprint([...source, ...target].sort()) !== fingerprint(expected)) reject('Relocation contents changed or are present at both locations.');
    const sourceKeys = new Set(source);
    for (const entry of entries) {
      const root = sourceKeys.has(entry.key) ? from : to;
      if (stateHash(tree(join(root, entry.key))) !== stateHash(entry.rows)) reject('Relocation files changed; resume stopped.');
    }
  } else {
    if (resume) {
      // A process can stop during pre-move hashing, before publishing its journal.
      // Reclaiming the remaining locks still requires a dead owner on this host.
      if (!exists(join(from, EXPORT_LOCK)) && !exists(join(to, EXPORT_LOCK))) reject('No pending relocation journal or preparation lock was found.');
      if (exists(join(to, RELOCATION_MARKER))) reject('Destination has a relocation marker without the matching source journal.');
    } else {
      assertExportAvailable(from);
      if (exists(to)) assertExportAvailable(to);
    }
    if (destinationEntries(to).length) reject('The destination must be empty; merging or overwriting is unsupported.');
    let count = 0;
    entries = sourceEntries(from, to).map(key => {
      const entry = { key, kind: classify(from, key), rows: tree(join(from, key)) };
      count += entry.rows.length;
      if (count > LIMIT) reject('Relocation inventory limit exceeded.');
      return entry;
    });
    if (!entries.some(e => e.kind === 'snapshot')) reject('No completed saved snapshots were found.');
    checkReferences(from, entries);
  }
  let count = 0, files = 0, bytes = 0;
  for (const entry of entries) {
    count += entry.rows.length;
    if (count > LIMIT) reject('Relocation inventory limit exceeded.');
    for (const row of entry.rows) if (row.type === 'file') { files++; bytes += row.size; }
  }
  const plan = { from, to, home: resolve(home), settingsPath: resolve(settingsPath), settings, sourceIdentity: identity(sourceStat),
    targetIdentity: exists(to) ? identity(stat(to)) : null,
    entries, resume, journal, files, bytes };
  plan.token = fingerprint({ from, to, settingsPath: plan.settingsPath, settings, sourceIdentity: plan.sourceIdentity,
    targetIdentity: plan.targetIdentity, entries, resume, journalId: journal?.id });
  return plan;
}

async function hashTree(root, entry, progress, verify = false) {
  const folder = join(root, entry.key);
  const expectedState = stateHash(entry.rows);
  if (stateHash(tree(folder)) !== expectedState) reject('Relocation inventory changed before reading.');
  for (const row of entry.rows) {
    if (row.type !== 'file') continue;
    const path = join(folder, ...row.path.split('/'));
    const fd = openSync(path, 'r');
    try {
      const before = fstatSync(fd, { bigint: true });
      if (fingerprint(identity(before)) !== fingerprint({ dev: row.dev, ino: row.ino, birth: row.birth }) || String(before.mtimeNs) !== row.modified || Number(before.size) !== row.size) reject('Relocation file changed before hashing.');
      const hash = createHash('sha256'); let read = 0;
      for await (const chunk of createReadStream(path, { fd, autoClose: false })) {
        hash.update(chunk); read += chunk.length; progress.bytes(read, row.size);
        if (read > row.size) reject('Relocation file grew while reading.');
      }
      const after = fstatSync(fd, { bigint: true });
      if (read !== row.size || after.mtimeNs !== before.mtimeNs || after.size !== before.size) reject('Relocation file changed while reading.');
      const sha256 = hash.digest('hex');
      if (verify && sha256 !== row.sha256) reject('Relocation hash verification failed; both locations are retained for inspection.');
      if (!verify) row.sha256 = sha256;
    } finally { closeSync(fd); }
  }
  if (stateHash(tree(folder)) !== expectedState) reject('Relocation inventory changed while reading.');
}

export async function executeRelocation(reviewed, { progress = createProgress(), afterMove = () => {} } = {}) {
  // Rebuild before creating anything. A dry-run token cannot authorize changed contents.
  const fresh = planRelocation(reviewed);
  if (fresh.token !== reviewed.token) reject('Relocation plan changed. Review a new dry run.');
  let releaseSource, releaseTarget, journal = fresh.journal;
  const sourceMarker = join(fresh.from, RELOCATION_MARKER), targetMarker = join(fresh.to, RELOCATION_MARKER);
  try {
    releaseSource = acquireExportLock(fresh.from, { resume: fresh.resume, relocating: true });
    if (!exists(fresh.to)) mkdirSync(fresh.to);
    releaseTarget = acquireExportLock(fresh.to, { resume: fresh.resume, relocating: true });
    if (fingerprint(identity(stat(fresh.from))) !== fingerprint(fresh.sourceIdentity) || (fresh.targetIdentity && fingerprint(identity(stat(fresh.to))) !== fingerprint(fresh.targetIdentity))) reject('Relocation root changed while acquiring locks.');
    if (!journal) {
      for (const [i, entry] of fresh.entries.entries()) {
        progress.phase('Hash source exports', i, fresh.entries.length);
        await hashTree(fresh.from, entry, progress);
      }
      progress.phase('Hash source exports', fresh.entries.length, fresh.entries.length);
      if (fingerprint(sourceEntries(fresh.from, fresh.to)) !== fingerprint(fresh.entries.map(e => e.key)) || destinationEntries(fresh.to).length) reject('Relocation directory contents changed.');
      journal = { format: FORMAT, id: randomUUID(), from: fresh.from, to: fresh.to, settingsPath: fresh.settingsPath,
        settings: fresh.settings, sourceIdentity: fresh.sourceIdentity, targetIdentity: identity(stat(fresh.to)), entries: fresh.entries };
      saveExclusive(sourceMarker, journal);
    }
    if (fingerprint(identity(stat(fresh.to))) !== fingerprint(journal.targetIdentity)) reject('Relocation destination was replaced.');
    const marker = { format: FORMAT, id: journal.id, from: journal.from, to: journal.to };
    const checkMarker = () => {
      const info = lstatSync(targetMarker);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 4096 || readFileSync(targetMarker, 'utf8') !== JSON.stringify(marker) + '\n') reject('Destination relocation marker does not match.');
    };
    if (exists(targetMarker)) checkMarker();
    else writeFileSync(targetMarker, JSON.stringify(marker) + '\n', { flag: 'wx', mode: 0o600, flush: true });
    // A prior run may have stopped on flush failure after writing valid JSON.
    // Resume must obtain fresh OS flush acceptance before the first rename too.
    syncExportFile(sourceMarker, fresh.from); syncExportFile(targetMarker, fresh.to);
    syncExportDirectory(fresh.from); syncExportDirectory(fresh.to);
    const assertRoots = () => {
      checkedDirectory(fresh.from); checkedDirectory(fresh.to);
      if (fingerprint(identity(stat(fresh.from))) !== fingerprint(journal.sourceIdentity) || fingerprint(identity(stat(fresh.to))) !== fingerprint(journal.targetIdentity)) reject('Relocation root was replaced; operation stopped.');
    };
    for (const [i, entry] of journal.entries.entries()) {
      progress.phase('Move and verify exports', i, journal.entries.length);
      assertRoots();
      const source = join(fresh.from, entry.key), target = join(fresh.to, entry.key);
      if (exists(source)) {
        if (exists(target) || stateHash(tree(source)) !== stateHash(entry.rows)) reject('Source changed or destination collided; relocation stopped.');
        renameSync(source, target);
        syncExportDirectory(fresh.from); syncExportDirectory(fresh.to);
        await afterMove(i + 1); // Dependency-injected fault boundary for synthetic recovery tests.
      }
      assertRoots();
      await hashTree(fresh.to, entry, progress, true);
    }
    progress.phase('Move and verify exports', journal.entries.length, journal.entries.length);
    assertRoots();
    if (sourceEntries(fresh.from, fresh.to).length || fingerprint(destinationEntries(fresh.to)) !== fingerprint(journal.entries.map(e => e.key).sort())) reject('Relocation membership changed before completion.');
    for (const entry of journal.entries) if (stateHash(tree(join(fresh.to, entry.key))) !== stateHash(entry.rows)) reject('Relocated files changed before completion.');
    checkReferences(fresh.to, journal.entries);
    if (fingerprint(readJournal(sourceMarker)) !== fingerprint(journal)) reject('Relocation journal changed before completion.');
    checkMarker();
    const current = readExportSettings(fresh.settingsPath);
    // Retry after settings commit is allowed only for the exact intended configuration.
    const expectedPrevious = [...new Map([journal.settings.directory, ...journal.settings.previousDirectories].filter(p => p && !same(p, fresh.to)).map(p => [canonical(p), p])).values()];
    if (fingerprint(current) !== fingerprint(journal.settings) && !(current.directory && same(current.directory, fresh.to) && fingerprint(current.previousDirectories) === fingerprint(expectedPrevious))) reject('Export settings changed during relocation; files remain at the destination. Review settings before resuming.');
    writeExportDirectory(fresh.to, fresh.settingsPath, fingerprint(current));
    const receiptFolder = join(dirname(fresh.settingsPath), 'codex-export-relocations');
    if (!exists(receiptFolder)) mkdirSync(receiptFolder);
    checkedDirectory(receiptFolder);
    const receipt = join(receiptFolder, `${journal.id}.json`);
    if (!exists(receipt)) saveExclusive(receipt, { ...journal, completed: true });
    else if (fingerprint(readJournal(receipt)) !== fingerprint({ ...journal, completed: true })) reject('Relocation completion receipt changed.');
    // Release locks while pending markers still block new operations. A crash during
    // final marker cleanup can be resumed without stranding an orphaned lock.
    releaseTarget(); releaseSource();
    unlinkSync(targetMarker); unlinkSync(sourceMarker);
    syncExportDirectory(fresh.from); syncExportDirectory(fresh.to);
    return { directories: journal.entries.length, files: fresh.files, bytes: fresh.bytes };
  } finally { try { releaseTarget?.(); } finally { releaseSource?.(); progress.clear(); } }
}

export async function runRelocation(args, { home, log = console.log, ask, interactive = false, settingsPath = configPath() } = {}) {
  if (args.length === 1 && ['--help', '-h', 'help'].includes(args[0])) { log(relocationHelp); return 0; }
  const options = { home, settingsPath }, seen = new Set();
  try {
    for (let i = 0; i < args.length; i++) {
      const key = args[i];
      if (seen.has(key)) reject('Repeated relocation option.'); seen.add(key);
      if (key === '--dry-run') options.dryRun = true;
      else if (key === '--resume') options.resume = true;
      else if (['--from', '--to', '--confirm'].includes(key) && args[i + 1]?.trim() && !args[i + 1].startsWith('--')) options[key.slice(2)] = args[++i];
      else reject('Invalid relocation option. Run session relocate --help.');
    }
    if (!options.from || !options.to || (options.dryRun && options.confirm) || (options.confirm && !/^[0-9a-f]{64}$/.test(options.confirm))) reject('Specify --from and --to, with --dry-run or a valid confirmation token.');
  } catch (error) { log(`Error: ${error.message}`); return 2; }
  const progress = createProgress(log);
  try {
    const plan = planRelocation(options);
    progress.log(`Relocate saved exports: ${safeText(plan.from)} -> ${safeText(plan.to)}`);
    progress.log(`${plan.entries.length} directories; ${plan.files} files; ${(plan.bytes / 1024 ** 3).toFixed(2)} GiB. Unfinished output is preserved. Default export directory will be updated after verification.`);
    progress.log(`Confirmation token: ${plan.token}`);
    if (options.confirm && options.confirm !== plan.token) reject('Confirmation token does not match the current relocation plan.');
    if (options.dryRun) { progress.log('Read-only preview. Stop other saved-export operations before confirming.'); return 0; }
    if (!options.confirm) {
      if (!interactive || !ask) reject('Review relocate --dry-run, then pass its --confirm token.');
      if ((await ask('Type RELOCATE EXPORTS to move files and update the default (Enter cancels): '))?.trim() !== 'RELOCATE EXPORTS') { progress.log('Cancelled; nothing changed.'); return 0; }
    }
    const result = await executeRelocation(plan, { progress });
    progress.log(`Relocation completed and hashes verified: ${result.directories} directories, ${result.files} files. Default export directory updated.`);
    return 0;
  } catch (error) {
    progress.log(`Error: ${error instanceof ExportError ? safeText(error.message) : 'Relocation failed. Check permissions, filesystem availability, and retained journal; no automatic rollback.'}`);
    progress.log('If a journal was created, keep both locations intact and review the same --from/--to with --resume --dry-run.');
    return 1;
  } finally { progress.clear(); }
}
