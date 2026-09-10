#!/usr/bin/env node
// @ai-dotfiles agent-dev-runtime managed

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statfsSync, writeFileSync } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const reviewedVersion = 'codex-cli 0.153.4';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bytes = value => `${(value / 1024 ** 2).toFixed(2)} MiB`;
class SessionError extends Error {}
const fail = message => { throw new SessionError(message); };
const exists = path => { try { lstatSync(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const errorTag = error => [
  /^[A-Z_]+$/.test(error?.code ?? '') ? error.code : null,
  Number.isInteger(error?.errcode) ? `SQLite ${error.errcode}` : null,
].filter(Boolean).join(', ') || 'unknown error';

export function displayText(value) {
  return String(value).replaceAll(homedir(), '~').replaceAll(homedir().replaceAll('\\', '/'), '~')
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ');
}

function help(log) {
  log(`Inspect, archive, delete, or export local Codex sessions, including spawned descendants.
Experimental: archive/delete/export are fixture-tested, not validated against real user history.
Usage: agent codex session <list|plan|archive|delete|export> [arguments]
Standalone: node <runtime>/codex/manage-codex-sessions.mjs <command> [arguments]

  list [--before DATE|Nw] [--limit N]
  plan [archive|delete|export] <selection>    Read-only preview (default: delete).
  archive <selection>                      Archive using the official CLI.
  delete <selection>                       Permanently delete using the official CLI.
  export <selection> --output <directory>   Create a new verified local export bundle.
  help                                    Show this help.

Selection: one UUID, --before YYYY-MM-DD, or --before 4w (positive integer weeks).
Also accepts --before 4weeks, --before 4 weeks, and --before "4 weeks".
Compatibility alias: --older-than-weeks N.
Dates use UTC midnight; weeks mean N * 7 days before the invocation time, fixed for the run.
Omitting a selection in a terminal prompts for a UUID, date, or Nw; Enter cancels.
Bulk archive/delete skip protected families or those containing newer descendants.
Bulk archive skips already archived roots. Export includes protected sessions but requires safe files.
Archiving retains rollout bytes; the app may separately clean up associated managed worktrees.
list and plan are read-only. No history bodies are read, and no server is started.
Sizes cover indexed rollout files only, not shared databases, attachments, or guaranteed savings.
Updated time is not last-viewed time. Use --limit 0 to list all matching sessions.
Titles can contain private information; review output before sharing it.

Requires Node.js 24 with node:sqlite and the reviewed state_5.sqlite layout.
CODEX_HOME is respected (default: ~/.codex). Custom SQLite locations are unsupported.
Archive/delete require Windows, PowerShell 7, and ${reviewedVersion}.
Fully close all Codex/ChatGPT clients, IDE integrations, and background writers first.
Keep them closed until completion. Concurrent writers and remote users are unsupported.
Pinned/sectioned sessions, unfinished goals, automation references, and unknown state block deletion.
Export contains private raw rollouts, indexed history JSONL, and a manifest; no attachments or restore.
The output parent must exist, outside CODEX_HOME and outside Git repositories. Originals stay intact.
No --force/--yes bypass, automatic retry, raw file deletion, or database repair.
Exit codes: 0 completed/cancelled, 1 blocked/failed, 2 invalid arguments.`);
}

export function parseSessionArgs(args, now = Date.now()) {
  const [action = 'help', ...rest] = args;
  if (['help', '--help', '-h'].includes(action) && !rest.length) return { action: 'help' };
  if (!['list', 'plan', 'archive', 'delete', 'export'].includes(action)) fail('Unknown command. Run agent codex session help.');
  const operation = action === 'plan' ? (['archive', 'delete', 'export'].includes(rest[0]) ? rest.shift() : 'delete') : action;
  const options = { action, operation, limit: 20, before: Infinity };
  if (UUID.test(rest[0] ?? '') && action !== 'list') options.id = rest.shift().toLowerCase();
  const seen = new Set();
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    let value = rest[i + 1];
    if (key === '--before' && /^[1-9]\d*$/.test(value ?? '') && /^weeks?$/i.test(rest[i + 2] ?? '')) {
      value += rest[i + 2];
      i++;
    }
    if (seen.has(key)) fail('Repeated option. Run agent codex session help.');
    seen.add(key);
    if (key === '--limit' && action === 'list' && /^\d+$/.test(value ?? '') && Number.isSafeInteger(Number(value))) options.limit = Number(value);
    else if (key === '--before' || key === '--older-than-weeks') options.before = parseCutoff(key === '--older-than-weeks' ? `${value}w` : value, now);
    else if (key === '--output' && operation === 'export' && value?.trim()) options.output = resolve(value);
    else fail('Invalid option. Run agent codex session help.');
  }
  if ((seen.has('--before') && seen.has('--older-than-weeks')) || (options.id && Number.isFinite(options.before))) fail('Use exactly one selection: UUID, date, or weeks.');
  return options;
}

function parseCutoff(value, now) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value) return Date.parse(value);
  const match = /^([1-9]\d*)\s*(?:w|weeks?)$/i.exec(value ?? '');
  if (match && Number.isSafeInteger(Number(match[1]))) {
    const cutoff = now - Number(match[1]) * 7 * 86400000;
    if (Number.isFinite(new Date(cutoff).getTime())) return cutoff;
  }
  fail('Invalid cutoff. Use YYYY-MM-DD or positive integer weeks, for example --before 4w.');
}

// Read-only, narrowly scoped adapter: do not start app-server for an inventory.
// Private formats can change. Any failed protection inspection blocks deletion.
export async function inspectSessions(home) {
  const { DatabaseSync } = await import('node:sqlite');
  home = realpathSync(home);
  const issues = [], protectionIssues = [];
  const protectedIds = new Map();
  const protect = (id, reason) => {
    if (!protectedIds.has(id)) protectedIds.set(id, new Set());
    protectedIds.get(id).add(reason);
  };
  function query(file, sql) {
    const db = new DatabaseSync(join(home, file), { readOnly: true });
    try { return db.prepare(sql).all(); } finally { db.close(); }
  }
  const names = readdirSync(home);
  // Codex 0.153.4 fixes this filename; the suffix is not a per-user counter.
  // Migrations also change the schema within the same file, so a filename override cannot establish compatibility.
  // https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/state/src/sqlite.rs
  if (names.some(name => /^state_\d+\.sqlite$/.test(name) && name !== 'state_5.sqlite')) issues.push('Unknown state database version.');
  if (names.some(name => /^queue_\d+\.sqlite$/.test(name) && name !== 'queue_1.sqlite')) protectionIssues.push('Unknown queue database version.');
  if (names.includes('queue_1.sqlite')) {
    try {
      for (const row of query('queue_1.sqlite', 'SELECT DISTINCT thread_id FROM queued_items')) protect(row.thread_id, 'queued-input');
    } catch (error) { protectionIssues.push(`Queued input protection could not be inspected (${errorTag(error)}).`); }
  }
  for (const name of ['config.toml', 'requirements.toml']) {
    if (exists(join(home, name)) && /sqlite_home|thread_store|state_db/.test(readFileSync(join(home, name), 'utf8'))) {
      issues.push('Custom database configuration needs manual review.');
    }
  }
  if (process.env.CODEX_SQLITE_HOME) issues.push('Custom database environment needs manual review.');
  // A single transaction provides a consistent view of rows and cascade edges.
  const db = new DatabaseSync(join(home, 'state_5.sqlite'), { readOnly: true });
  let rows, edges;
  try {
    db.exec('BEGIN');
    rows = db.prepare(`SELECT id, rollout_path, name, title, updated_at, updated_at_ms,
      recency_at_ms, archived, is_pinned, thread_section_id, history_mode FROM threads ORDER BY id`).all();
    edges = db.prepare('SELECT parent_thread_id AS parent, child_thread_id AS child FROM thread_spawn_edges ORDER BY parent_thread_id, child_thread_id').all();
    db.exec('COMMIT');
  } finally { db.close(); }
  for (const folder of ['', 'sqlite']) {
    const root = join(home, folder);
    if (!exists(root)) continue;
    const files = folder ? readdirSync(root) : names;
    // Default CLI storage is at CODEX_HOME; sqlite/ may retain inactive legacy goals/state DBs.
    if (!folder && files.some(name => /^goals_\d+\.sqlite$/.test(name) && name !== 'goals_1.sqlite')) protectionIssues.push('Unknown goals database version.');
    if (!folder && files.includes('goals_1.sqlite')) {
      try {
        for (const row of query(join(folder, 'goals_1.sqlite'), 'SELECT thread_id, status FROM thread_goals')) {
          if (row.status !== 'complete') protect(row.thread_id, 'unfinished-goal');
        }
      } catch (error) { protectionIssues.push(`Goal protection could not be inspected (${errorTag(error)}).`); }
    }
    for (const file of files.filter(name => /^codex.*\.db$/.test(name) && !name.includes('thread-summaries'))) {
      try {
        for (const row of query(join(folder, file), 'SELECT target_thread_id AS id FROM automations UNION SELECT thread_id AS id FROM automation_runs UNION SELECT thread_id AS id FROM inbox_items')) {
          if (row.id) protect(row.id, 'automation-or-inbox');
        }
      } catch (error) { protectionIssues.push(`App automation protection could not be inspected (${errorTag(error)}).`); }
    }
  }
  try {
    const globalFile = join(home, '.codex-global-state.json');
    if (exists(globalFile)) {
      const state = JSON.parse(readFileSync(globalFile, 'utf8'));
      if (!state || typeof state !== 'object' || Array.isArray(state)) fail('Invalid app state.');
      // Also covers legacy pinned IDs and queued follow-ups without depending on their value shape.
      for (const [key, value] of Object.entries(state)) {
        if (/pinned|queued-follow-ups/.test(key)) {
          for (const id of JSON.stringify(value).match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi) ?? []) protect(id.toLowerCase(), 'app-pin-or-queue');
        }
      }
    }
    const automations = join(home, 'automations');
    if (exists(automations)) {
      for (const entry of readdirSync(automations, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) fail('Unknown automation entry.');
        const text = readFileSync(join(automations, entry.name, 'automation.toml'), 'utf8');
        for (const id of text.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi) ?? []) protect(id.toLowerCase(), 'automation-reference');
      }
    }
  } catch (error) { protectionIssues.push(`App pins, queues, or automation files could not be inspected (${errorTag(error)}).`); }
  const paths = new Set(), checkedDirectories = new Set();
  const sessions = rows.map(row => {
    const reasons = [...(protectedIds.get(row.id) ?? [])];
    if (!UUID.test(row.id)) issues.push('Invalid session identifier in index.');
    if (![0, 1].includes(row.is_pinned) || ![0, 1].includes(row.archived)) reasons.push('invalid-metadata');
    if (row.is_pinned) reasons.push('pinned');
    if (row.thread_section_id) reasons.push('sidebar-section');
    const updated = row.updated_at_ms ?? row.updated_at * 1000;
    if (!Number.isSafeInteger(updated) || !Number.isFinite(new Date(updated).getTime())) reasons.push('invalid-date');
    let size = null, modified = null;
    try {
      const path = row.rollout_path;
      const rel = relative(home, path);
      if (!isAbsolute(path) || isAbsolute(rel) || !['sessions', 'archived_sessions'].includes(rel.split(sep)[0])) fail('Outside storage.');
      // No junctions/symlinks in the path, or shared hard-linked rollout files.
      let part = home;
      for (const name of rel.split(sep).slice(0, -1)) {
        part = join(part, name);
        if (!checkedDirectories.has(part)) {
          const stat = lstatSync(part);
          if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Linked storage.');
          checkedDirectories.add(part);
        }
      }
      const stat = lstatSync(path);
      const canonical = realpathSync(path), expected = resolve(path);
      const samePath = process.platform === 'win32' ? canonical.toLowerCase() === expected.toLowerCase() : canonical === expected;
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !basename(path).endsWith(`${row.id}.jsonl`) || !samePath) fail('Unsupported rollout.');
      const key = process.platform === 'win32' ? path.toLowerCase() : path;
      if (paths.has(key)) issues.push('Multiple sessions reference the same rollout.');
      paths.add(key);
      size = stat.size; modified = stat.mtimeMs;
    } catch (error) { reasons.push(`rollout-unavailable-or-unsafe${/^[A-Z_]+$/.test(error.code ?? '') ? `(${error.code})` : ''}`); }
    return { id: row.id, title: row.name || row.title || '(untitled)', updated,
      recency: row.recency_at_ms, archived: Boolean(row.archived), historyMode: row.history_mode, size, modified,
      path: row.rollout_path, reasons: reasons.sort() };
  });
  return { home, sessions, edges, issues: [...new Set([...issues, ...protectionIssues])].sort(), exportIssues: [...new Set(issues)].sort() };
}

function indexSnapshot(snapshot) {
  const byId = new Map(snapshot.sessions.map(row => [row.id, row]));
  const children = new Map(), parents = new Map();
  for (const { parent, child } of snapshot.edges) {
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(child);
    if (!parents.has(child)) parents.set(child, []);
    parents.get(child).push(parent);
  }
  return { byId, children, parents };
}

export function makePlan(snapshot, root, operation = 'delete', index = indexSnapshot(snapshot)) {
  const { byId, children } = index;
  if (!byId.has(root)) fail('Session UUID not found in the local index.');
  const selected = new Set(), visiting = new Set();
  const problems = [...(operation === 'export' ? snapshot.exportIssues ?? snapshot.issues : snapshot.issues)];
  function visit(id) {
    if (visiting.has(id)) { problems.push('Cyclic spawn relationship.'); return; }
    if (selected.has(id)) return;
    selected.add(id); visiting.add(id);
    if (!byId.has(id)) problems.push('A spawned descendant is missing from the index.');
    for (const child of children.get(id) ?? []) visit(child);
    visiting.delete(id);
  }
  visit(root);
  const ids = [...selected].sort();
  const sessions = ids.map(id => byId.get(id)).filter(Boolean);
  for (const row of sessions) for (const reason of row.reasons) {
    if (operation !== 'export' || /^(invalid-|rollout-)/.test(reason)) problems.push(`${row.id}: ${reason}`);
  }
  // Include edges, private paths, timestamps, titles, sizes, and protection reasons in revalidation.
  const fingerprint = hash({ home: snapshot.home, root, sessions,
    edges: ids.flatMap(parent => (children.get(parent) ?? []).map(child => ({ parent, child }))), problems });
  return { root, sessions, problems, fingerprint, size: sessions.reduce((sum, row) => sum + (row.size ?? 0), 0) };
}

export function selectPlan(snapshot, options) {
  const operation = options.operation ?? 'delete';
  const index = indexSnapshot(snapshot);
  const candidates = new Set(options.id ? [options.id] : snapshot.sessions
    .filter(row => row.updated < options.before && (operation !== 'archive' || !row.archived)).map(row => row.id));
  // Select only outermost candidate roots. A child is never submitted twice to a cascading command.
  const roots = [...candidates].filter(id => {
    if (options.id) return true;
    const seen = new Set([id]), pending = [...(index.parents.get(id) ?? [])];
    while (pending.length) {
      const parent = pending.pop();
      if (seen.has(parent)) fail('Cyclic spawn relationship.');
      seen.add(parent);
      if (candidates.has(parent)) return false;
      pending.push(...(index.parents.get(parent) ?? []));
    }
    return true;
  }).sort();
  if (candidates.size && !roots.length) fail('Could not resolve independent roots; inspect spawn relationships.');
  const problems = [...(operation === 'export' ? snapshot.exportIssues ?? snapshot.issues : snapshot.issues)];
  const groups = [], skipped = [], covered = new Set();
  for (const root of roots) {
    const group = makePlan(snapshot, root, operation, index);
    for (const row of group.sessions) covered.add(row.id);
    const localProblems = group.problems.filter(problem => !problems.includes(problem));
    if (!options.id && group.sessions.some(row => !(row.updated < options.before))) localProblems.push('Contains a descendant outside the selected period.');
    if (options.id && localProblems.length) problems.push(...localProblems);
    if (!options.id && localProblems.length) skipped.push({ root, problems: localProblems });
    else groups.push(group);
  }
  const sessions = groups.flatMap(group => group.sessions);
  if ([...candidates].some(id => !covered.has(id))) problems.push('Unresolved or cyclic candidate relationships.');
  if (new Set(sessions.map(row => row.id)).size !== sessions.length) problems.push('Overlapping descendant groups.');
  return { operation, groups, sessions, problems, skipped,
    size: groups.reduce((sum, group) => sum + group.size, 0),
    fingerprint: hash({ operation, before: Number.isFinite(options.before) ? options.before : null,
      groups: groups.map(group => group.fingerprint), problems, skipped }) };
}

function printRows(rows, log) {
  for (const row of rows) {
    const date = Number.isFinite(new Date(row.updated).getTime()) ? new Date(row.updated).toISOString().slice(0, 10) : 'unknown';
    log(`${row.id}  ${date}  ${row.size === null ? 'size unknown' : bytes(row.size)}  ${row.archived ? 'archived' : 'saved'}${row.reasons.length ? `  protected: ${row.reasons.join(', ')}` : ''}`);
    log(`  ${displayText(row.title)}`);
  }
}

function printPlan(plan, log) {
  log(`${plan.operation} plan: ${plan.sessions.length} session(s), including spawned descendants.`);
  printRows(plan.sessions, log);
  log(`Indexed rollout bytes: ${bytes(plan.size)}. Shared databases may not shrink. This is not a backup.`);
  for (const problem of plan.problems) log(`Blocked: ${problem}`);
  for (const skipped of plan.skipped ?? []) log(`Skipped family ${skipped.root}: ${skipped.problems.join('; ')}`);
}

async function digestFile(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

async function writeVerifiedFile(source, path) {
  const digest = createHash('sha256');
  let size = 0;
  await pipeline(source, new Transform({ transform(chunk, encoding, callback) {
    digest.update(chunk); size += chunk.length; callback(null, chunk);
  } }), createWriteStream(path, { flags: 'wx', mode: 0o600 }));
  const sha256 = digest.digest('hex');
  if (await digestFile(path) !== sha256) fail('Export copy verification failed.');
  return { file: basename(path), bytes: size, sha256 };
}

export async function exportSessions(snapshot, plan, output, { inspect = inspectSessions, log = console.log } = {}) {
  if (plan.operation !== 'export' || plan.problems.length) fail('Export requires an unblocked export plan.');
  if (!output) fail('Export requires --output pointing to an existing directory.');
  const destination = realpathSync(output);
  if (!lstatSync(destination).isDirectory()) fail('Export output must be an existing directory.');
  const relativeHome = relative(snapshot.home, destination);
  if (!relativeHome || (!isAbsolute(relativeHome) && relativeHome !== '..' && !relativeHome.startsWith(`..${sep}`))) fail('Export output must be outside CODEX_HOME.');
  for (let dir = destination; ; dir = resolve(dir, '..')) {
    if (exists(join(dir, '.git'))) fail('Export output must be outside Git repositories; exports contain private history.');
    if (resolve(dir, '..') === dir) break;
  }
  const space = statfsSync(destination, { bigint: true });
  if (space.bavail * space.bsize < BigInt(plan.size) + 64n * 1024n ** 2n) fail('Insufficient export space for measured rollouts and 64 MiB headroom. Indexed history needs additional space.');
  const names = readdirSync(snapshot.home);
  if (names.some(name => /^thread_history_\d+\.sqlite$/.test(name) && name !== 'thread_history_1.sqlite')) fail('Unknown indexed history database version.');
  const historyPath = join(snapshot.home, 'thread_history_1.sqlite');
  const historyTables = ['thread_turns', 'thread_items', 'thread_realtime_items', 'thread_history_projection_state'];
  let db, folder, historyVersion;
  try {
    if (exists(historyPath)) {
      const { DatabaseSync } = await import('node:sqlite');
      db = new DatabaseSync(historyPath, { readOnly: true });
      historyVersion = db.prepare('PRAGMA data_version').get().data_version;
      db.exec('BEGIN');
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);
      if (tables.some(name => name.startsWith('thread_') && !historyTables.includes(name)) || historyTables.some(name => !tables.includes(name))) fail('Unsupported indexed history schema.');
    }
    if (plan.sessions.some(row => !['legacy', 'paginated'].includes(row.historyMode) || (row.historyMode === 'paginated' && !db))) fail('Indexed history is required for paginated sessions; export stopped.');
    // Prepare once and iterate indexed thread ranges, not the entire database or history in memory.
    const queries = db ? historyTables.map(table => [table, db.prepare(`SELECT * FROM ${table} WHERE thread_id = ? ORDER BY ${table === 'thread_history_projection_state' ? 'thread_id' : 'rollout_ordinal'}`)]) : [];
    folder = mkdtempSync(join(destination, `codex-sessions-${new Date().toISOString().replace(/[:.]/g, '-')}-`));
    log(`Export directory: ${displayText(folder)}`);
    writeFileSync(join(folder, 'README.txt'), 'PRIVATE SESSION EXPORT\nOnly a manifest.json with complete=true marks a completed export.\nRollouts and indexed history are preserved as JSONL. history.jsonl rows identify their source table.\nAttachments, project files, credentials/configuration files, and unindexed sessions are not collected.\nReferenced files may no longer exist. This is not an importable Codex backup.\nAn incomplete directory is retained for inspection; no source data is removed.\n', { flag: 'wx', mode: 0o600 });
    const exported = [];
    for (const row of plan.sessions) {
      const file = `${new Date(row.updated).toISOString().slice(0, 10)}_${row.id}.jsonl`;
      const rollout = await writeVerifiedFile(createReadStream(row.path), join(folder, file));
      if (rollout.bytes !== row.size) fail('Source rollout size changed during export. The bundle is incomplete; no source data was removed.');
      let history = null;
      if (db) {
        const historyFile = `${row.id}.history.jsonl`;
        let records = 0;
        function* lines() {
          for (const [table, query] of queries) for (const record of query.iterate(row.id)) {
            records++;
            yield `${JSON.stringify({ table, row: record })}\n`;
          }
        }
        const saved = await writeVerifiedFile(Readable.from(lines(), { objectMode: false }), join(folder, historyFile));
        history = { file: saved.file, records, sha256: saved.sha256 };
      }
      exported.push({ id: row.id, title: row.title, updated: row.updated, archived: row.archived,
        historyMode: row.historyMode, rollout, history });
      log(`Exported: ${row.id}`);
    }
    const fresh = await inspect(snapshot.home);
    if (db) {
      // Check outside the read transaction: WAL readers otherwise retain the old snapshot.
      db.exec('COMMIT');
      if (db.prepare('PRAGMA data_version').get().data_version !== historyVersion) fail('Indexed history changed during export. The bundle is incomplete; no source data was removed.');
    } else if (exists(historyPath)) fail('Indexed history appeared during export. The bundle is incomplete; no source data was removed.');
    const index = indexSnapshot(fresh);
    for (const group of plan.groups) {
      if (makePlan(fresh, group.root, 'export', index).fingerprint !== group.fingerprint) fail('Source sessions changed during export. The bundle is incomplete; no source data was removed.');
    }
    const ids = new Set(plan.sessions.map(row => row.id));
    writeFileSync(join(folder, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, complete: true,
      exportedAt: new Date().toISOString(), restorable: false, sessions: exported,
      spawnEdges: snapshot.edges.filter(edge => ids.has(edge.parent) || ids.has(edge.child)) }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    log(`Export complete: ${exported.length} session(s). Originals were not changed. Keep this bundle private.`);
    return folder;
  } catch (error) {
    if (folder) log(`Incomplete export retained: ${displayText(folder)}. No completed manifest was written.`);
    throw error;
  } finally { if (db) db.close(); }
}

// Only the reviewed Windows process check and CLI invocation are enabled for archive/delete.
// Inspection works on other platforms; do not claim an untested quiescence check is safe.
export function assertClientsClosed({ platform = process.platform, spawn = spawnSync } = {}) {
  if (platform !== 'win32') fail('Archive/delete are currently supported only on Windows; list, plan, and export remain available.');
  const result = spawn('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
    "$ErrorActionPreference='Stop'; $items=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(codex|chatgpt)([.-]|$)' -or ($_.Name -match '^node(\\.exe)?$' -and $_.CommandLine -match '[/\\\\]codex[/\\\\]bin[/\\\\]codex\\.js') }); Write-Output $items.Count"],
  { encoding: 'utf8', timeout: 15000, windowsHide: true });
  if (result.status !== 0 || !/^\d+\s*$/.test(result.stdout ?? '')) fail('Could not verify that all Codex clients are closed.');
  if (Number(result.stdout) !== 0) fail('Close Codex/ChatGPT, CLI sessions, IDE integrations, and background writers first.');
}

export function runOfficialCodex(args, home, spawn = spawnSync) {
  // Fixed command name and validated UUID only; no user strings are interpolated into shell code.
  return spawn('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
    "$ErrorActionPreference='Stop'; $arguments=@(ConvertFrom-Json $env:AGENT_CODEX_SESSION_ARGS); & codex @arguments; exit $LASTEXITCODE"],
  { cwd: home, env: { ...process.env, CODEX_HOME: home, AGENT_CODEX_SESSION_ARGS: JSON.stringify(args) }, encoding: 'utf8', timeout: 60000, windowsHide: true });
}

async function askTerminal(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return await rl.question(prompt); } finally { rl.close(); }
}

export async function runSessions(args, {
  home = resolve(process.env.CODEX_HOME || join(homedir(), '.codex')),
  platform = process.platform,
  interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  log = console.log, ask = askTerminal, inspect = inspectSessions,
  closed = assertClientsClosed, cli = runOfficialCodex,
} = {}) {
  let options, operationStarted = false;
  const completed = [];
  const now = Date.now();
  try { options = parseSessionArgs(args, now); } catch (error) { log(`Error: ${error.message}`); return 2; }
  if (options.action === 'help') { help(log); return 0; }
  try {
    const mutation = ['archive', 'delete'].includes(options.action);
    if (mutation && platform !== 'win32') fail('Archive/delete are currently supported only on Windows; list, plan, and export remain available.');
    if (options.action !== 'list' && !options.id && !Number.isFinite(options.before)) {
      if (!interactive) { log('Error: A UUID or date/week selection is required. Run agent codex session help.'); return 2; }
      const selection = (await ask('Selection: UUID, YYYY-MM-DD, or Nw (Enter cancels): '))?.trim();
      if (!selection) { log('Cancelled; nothing changed.'); return 0; }
      const selectedArgs = UUID.test(selection) ? [selection] : ['--before', selection];
      try {
        options = parseSessionArgs([options.action, ...(options.action === 'plan' ? [options.operation] : []), ...selectedArgs,
          ...(options.output ? ['--output', options.output] : [])], now);
      } catch (error) { log(`Error: ${error.message}`); return 2; }
    }
    const snapshot = await inspect(home);
    if (options.action === 'list') {
      const rows = snapshot.sessions.filter(row => row.updated < options.before).sort((a, b) => b.size - a.size || a.id.localeCompare(b.id));
      log(`Indexed sessions: ${snapshot.sessions.length}; matching: ${rows.length}; measured matching rollout bytes: ${bytes(rows.reduce((sum, row) => sum + (row.size ?? 0), 0))}; size unknown: ${rows.filter(row => row.size === null).length}.`);
      log('Largest first. Updated time is not last-viewed time. Titles may be private.');
      printRows(options.limit ? rows.slice(0, options.limit) : rows, log);
      for (const issue of snapshot.issues) log(`Deletion blocked: ${issue}`);
      log('Sizes exclude shared databases and attachments; unindexed rollouts are not scanned. Run plan <UUID> to inspect the cascade.');
      return 0;
    }
    if (Number.isFinite(options.before)) log(`Selection: updated before ${new Date(options.before).toISOString()} (exclusive).`);
    const plan = selectPlan(snapshot, options);
    printPlan(plan, log);
    if (plan.problems.length) return 1;
    if (options.action === 'plan') { log('Read-only preview. The operation will rebuild and recheck this plan.'); return 0; }
    if (!plan.sessions.length) { log('No eligible sessions; nothing changed.'); return 0; }
    if (!interactive) fail('This operation requires an interactive terminal; no force bypass is available.');
    if (mutation) {
      closed();
      const version = cli(['--version'], snapshot.home);
      if (version.status !== 0 || version.stdout?.trim() !== reviewedVersion) fail(`Archive/delete require the reviewed ${reviewedVersion}. Nothing changed.`);
    } else if (!options.output) {
      const output = (await ask('Existing export parent directory (Enter cancels): '))?.trim();
      if (!output) { log('Cancelled; nothing changed.'); return 0; }
      options.output = resolve(output);
    }
    log(options.action === 'export' ? 'Export includes private history. Originals stay intact; no import/restore is provided.'
      : 'Keep all clients and background writers closed until completion. Delete is permanent. Archive retains rollout bytes; the app may clean up associated managed worktrees. Preserve worktree changes first.');
    const confirmation = `${options.action.toUpperCase()} ${options.id ?? `${plan.sessions.length} ${plan.fingerprint.slice(0, 8)}`}`;
    if (await ask(`Type ${confirmation} to ${options.action} all ${plan.sessions.length} listed session(s): `) !== confirmation) {
      log('Cancelled; nothing changed.'); return 0;
    }
    if (mutation) closed();
    let current = await inspect(home);
    const fresh = selectPlan(current, options);
    if (fresh.fingerprint !== plan.fingerprint || fresh.problems.length) fail('The operation plan changed. Nothing changed by this operation; review a new plan.');
    if (options.action === 'export') {
      await exportSessions(current, plan, options.output, { inspect, log });
      return 0;
    }
    for (const group of plan.groups) {
      const check = makePlan(current, group.root, options.action);
      if (check.fingerprint !== group.fingerprint || check.problems.length) fail('A remaining family changed. Stopped; inspect a new plan.');
      closed();
      operationStarted = true;
      log(`Starting ${options.action}: ${group.root} (${group.sessions.length} session(s))`);
      const result = cli([options.action, group.root, ...(options.action === 'delete' ? ['--force'] : [])], snapshot.home);
      if (result.status !== 0) fail('Official operation failed or was interrupted. Some sessions may already be changed. No retry was attempted.');
      current = await inspect(home);
      const byId = new Map(current.sessions.map(row => [row.id, row]));
      const incomplete = group.sessions.some(row => options.action === 'delete'
        ? byId.has(row.id) || exists(row.path)
        : !byId.get(row.id)?.archived || byId.get(row.id)?.size !== row.size || byId.get(row.id)?.size === null ||
          relative(snapshot.home, byId.get(row.id).path).split(sep)[0] !== 'archived_sessions' || (!row.archived && exists(row.path)));
      if (incomplete) fail('Official operation returned success but descendant verification is incomplete. No retry was attempted.');
      completed.push(group.root);
      log(`Verified ${options.action}: ${group.root}`);
    }
    log(`${options.action === 'delete' ? 'Deleted' : 'Archived'} and verified: ${plan.sessions.length} indexed session(s). No project file or shared database was manually removed.`);
    return 0;
  } catch (error) {
    // OS/SQLite/child stderr can contain private paths, settings, and history content.
    log(`Error: ${error instanceof SessionError ? displayText(error.message) : `Session operation failed (${errorTag(error)}). Check permissions, free space, and the supported storage layout; no automatic retry was attempted.`}`);
    if (operationStarted) log(`The official operation was started; completion may be partial. Verified roots: ${completed.join(', ') || 'none'}. Inspect remaining sessions before retrying.`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runSessions(process.argv.slice(2));
}
