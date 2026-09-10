#!/usr/bin/env node
// @ai-dotfiles agent-dev-runtime managed

import { createReadStream, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FORMAT, MAX_MANIFEST_BYTES, UUID, exists, fingerprint as hash, snapshotDigest, safeText as displayText, ExportError, digestFile, digestChunks, writeVerifiedFile, listBundles, readBundle, verifyBundle, readExportSettings, readExportDirectory, writeExportDirectory } from './session-export-storage.mjs';
import { collectDependencies, checkDependencySources, checkAttachmentSources, createRolloutIndex, renderConversation } from './session-export-content.mjs';
import { writeBatch, readBatch, listBatches, sourceIdentity, openHistoryReader } from './session-export-batches.mjs';

const reviewedVersion = 'codex-cli 0.153.4';
const bytes = value => `${(value / 1024 ** 2).toFixed(2)} MiB`;
class SessionError extends Error {}
const fail = message => { throw new SessionError(message); };
const errorTag = error => [
  /^[A-Z_]+$/.test(error?.code ?? '') ? error.code : null,
  Number.isInteger(error?.errcode) ? `SQLite ${error.errcode}` : null,
].filter(Boolean).join(', ') || 'unknown error';

export { displayText };

function help(log) {
  log(`Inspect, archive, delete, or export local Codex sessions, including spawned descendants.
Experimental: archive/delete/export are fixture-tested, not validated against real user history.
Usage: agent codex session <list|plan|archive|delete|export|config> [arguments]
Standalone: node <runtime>/codex/manage-codex-sessions.mjs <command> [arguments]

  list [--before DATE|Nw] [--limit N]
  plan [archive|delete|export] <selection>    Read-only preview (default: delete).
  archive <selection>                      Archive using the official CLI.
  delete <selection>                       Permanently delete using the official CLI.
  export <selection> [--output <directory>] Save one reference folder per session snapshot.
  delete --exported [batch-id] [--in <directory>]  Review/delete exactly one export batch.
  config [--output <directory>] [--dry-run | --confirm <token>]  Inspect/change destinations.
  help                                    Show this help.

Selection: one UUID, --before YYYY-MM-DD, or --before 4w (positive integer weeks).
Also accepts --before 4weeks, --before 4 weeks, and --before "4 weeks".
Compatibility alias: --older-than-weeks N.
Dates use UTC midnight; weeks mean N * 7 days before the invocation time, fixed for the run.
Omitting a selection in a terminal prompts for a UUID, date, or Nw; delete also accepts exported.
Enter cancels. --exported without an ID opens a batch picker; it cannot accompany a UUID/date.
Use agent codex history batches [--in <directory>] [--json] to find saved batch IDs.
Export defaults to keeping originals, then offers a separate deletion review in a terminal.
--after keep suppresses this prompt; --after review-delete opens the review explicitly.
With --confirm or redirected input, review-delete only prints the deletion plan, never deletes.
For non-interactive operations, review plan <operation> first, then pass --confirm <token>.
The token binds the selected state and destination; changes require reviewing a new plan.
Export and deletion require separate confirmations. No blanket approval option is provided.
Bulk archive/delete skip protected families or those containing newer descendants.
Bulk archive skips already archived roots. Export includes protected sessions but requires safe files.
Archiving retains rollout bytes; the app may separately clean up associated managed worktrees.
list and plan are read-only; no server is started. Only plan delete --exported reads history
bodies and verifies saved files against live sources; ordinary plans inspect metadata only.
Sizes cover indexed rollout files only, not shared databases, attachments, or guaranteed savings.
Updated time is not last-viewed time. Use --limit 0 to list all matching sessions.
Titles can contain private information; review output before sharing it.

Requires Node.js 24 with node:sqlite and the reviewed state_5.sqlite layout.
CODEX_HOME is respected (default: ~/.codex). Custom SQLite locations are unsupported.
Archive/delete require Windows, PowerShell 7, and ${reviewedVersion}.
Fully close all Codex/ChatGPT clients, IDE integrations, and background writers first.
Keep them closed until completion. Concurrent writers and remote users are unsupported.
Pinned/sectioned sessions, unfinished goals, automation references, and unknown state block deletion.
Export preserves JSONL, a readable conversation, inherited prefixes, and supported embedded media.
File mentions are not followed. --attachments-from <directory> explicitly permits structured local media references within that directory (current bytes, not historical originals).
Coverage warnings remain visible; export completion does not imply full history or attachment recovery.
No project copy, network downloads, import, or restore. Use agent codex history to read saved exports.
Default-destination setting: ~/.agents/ai-dotfiles/codex-session-export.json (AGENT_CODEX_EXPORT_CONFIG overrides its path).
config remembers previous destinations but never moves files. Interactive config can select one.
--in selects an old or relocated export directory; --output overrides this export only.
Export receipts live in batches/ and use relative snapshot paths; keep them with the snapshots.
Batch deletion excludes changed/protected families, missing snapshots, and content/attachment warnings.
Both saved and live bytes are rechecked. Receipts do not authorize deletion or guarantee restoration.
The output parent must exist, outside CODEX_HOME and outside Git repositories. Originals stay intact.
No --force/--yes bypass, automatic retry, direct source-file deletion, or database repair.
Exit codes: 0 completed/cancelled, 1 blocked/failed, 2 invalid arguments,
3 export coverage warnings or exported deletion with excluded families (already absent is not a warning).`);
}

export function parseSessionArgs(args, now = Date.now()) {
  const [action = 'help', ...rest] = args;
  if (['help', '--help', '-h'].includes(action) && !rest.length) return { action: 'help' };
  if (action === 'config') {
    const options = { action }, seen = new Set();
    for (let i = 0; i < rest.length; i++) {
      const key = rest[i];
      if (seen.has(key)) fail('Repeated configuration option.'); seen.add(key);
      if (key === '--dry-run') options.dryRun = true;
      else if (key === '--output' && rest[i + 1]?.trim() && !rest[i + 1].startsWith('--')) options.output = resolve(rest[++i]);
      else if (key === '--confirm' && /^[0-9a-f]{64}$/.test(rest[i + 1] ?? '')) options.confirm = rest[++i];
      else fail('Use config [--output <directory>] [--dry-run | --confirm <token>].');
    }
    if ((!options.output && (options.dryRun || options.confirm)) || (options.dryRun && options.confirm)) fail('Configuration confirmation requires an output directory and cannot accompany --dry-run.');
    return options;
  }
  if (!['list', 'plan', 'archive', 'delete', 'export'].includes(action)) fail('Unknown command. Run agent codex session help.');
  const operation = action === 'plan' ? (['archive', 'delete', 'export'].includes(rest[0]) ? rest.shift() : 'delete') : action;
  const options = { action, operation, limit: 20, before: Infinity };
  if (UUID.test(rest[0] ?? '') && action !== 'list') options.id = rest.shift().toLowerCase();
  const seen = new Set();
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (seen.has(key)) fail('Repeated option. Run agent codex session help.');
    seen.add(key);
    if (key === '--exported' && operation === 'delete') {
      options.batch = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
      if (options.batch !== true && !/^[a-zA-Z0-9_-]+$/.test(options.batch)) fail('Invalid export batch ID.');
      continue;
    }
    let value = rest[++i];
    if (!value || value.startsWith('--')) fail('An option requires a value.');
    if (key === '--before' && /^[1-9]\d*$/.test(value) && /^weeks?$/i.test(rest[i + 1] ?? '')) value += rest[++i];
    if (key === '--limit' && action === 'list' && /^\d+$/.test(value ?? '') && Number.isSafeInteger(Number(value))) options.limit = Number(value);
    else if (key === '--before' || key === '--older-than-weeks') options.before = parseCutoff(key === '--older-than-weeks' ? `${value}w` : value, now);
    else if (key === '--output' && operation === 'export' && value?.trim()) options.output = resolve(value);
    else if (key === '--attachments-from' && operation === 'export' && value?.trim()) options.attachmentRoot = resolve(value);
    else if (key === '--in' && operation === 'delete') options.directory = resolve(value);
    else if (key === '--after' && action === 'export' && ['keep', 'review-delete'].includes(value)) options.after = value;
    else if (key === '--confirm' && ['export', 'delete', 'archive'].includes(action) && /^[0-9a-f]{64}$/.test(value)) options.confirm = value;
    else fail('Invalid option. Run agent codex session help.');
  }
  if ((seen.has('--before') && seen.has('--older-than-weeks')) || (options.id && Number.isFinite(options.before))) fail('Use exactly one selection: UUID, date, or weeks.');
  if ((options.batch && (options.id || Number.isFinite(options.before))) || (options.directory && !options.batch)) fail('Use --exported [batch-id] [--in <directory>] without a UUID or period.');
  if (options.confirm && options.batch === true) fail('An explicit batch ID is required with --confirm.');
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
  const projects = new Map();
  try {
    db.exec('BEGIN');
    const columns = new Set(db.prepare('PRAGMA table_info(threads)').all().map(row => row.name));
    rows = db.prepare(`SELECT id, rollout_path, name, title, updated_at, updated_at_ms,
      recency_at_ms, archived, is_pinned, thread_section_id, history_mode,
      ${columns.has('cwd') ? 'cwd' : 'NULL AS cwd'}, ${columns.has('project_id') ? 'project_id' : 'NULL AS project_id'} FROM threads ORDER BY id`).all();
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
    if (tables.has('projects') && tables.has('project_roots')) {
      for (const project of db.prepare('SELECT id, name FROM projects').all()) projects.set(project.id, { ...project, roots: [] });
      for (const root of db.prepare('SELECT project_id, path FROM project_roots ORDER BY position').all()) projects.get(root.project_id)?.roots.push(root.path);
    }
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
      path: row.rollout_path, project: row.project_id ? projects.get(row.project_id) ?? { id: row.project_id, name: null, roots: [] } : null,
      cwd: row.cwd, reasons: reasons.sort() };
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

export async function exportSessions(snapshot, plan, output, { inspect = inspectSessions, log = console.log, attachmentRoots = [], selection = null } = {}) {
  if (plan.operation !== 'export' || plan.problems.length || !plan.sessions.length) fail('Export requires a nonempty, unblocked export plan.');
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
  let reader;
  const staged = [], folders = [], skipped = [], entries = [];
  const getIndex = createRolloutIndex(snapshot.home);
  const edgesBySession = new Map(plan.sessions.map(row => [row.id, []]));
  for (const edge of snapshot.edges) {
    edgesBySession.get(edge.parent)?.push(edge);
    if (edge.child !== edge.parent) edgesBySession.get(edge.child)?.push(edge);
  }
  const existing = new Map();
  for (const bundle of listBundles(destination)) {
    const key = `${bundle.manifest.session.id}:${bundle.manifest.contentDigest}`;
    if (!existing.has(key)) existing.set(key, bundle);
  }
  try {
    reader = await openHistoryReader(snapshot.home, plan.sessions);
    for (const row of plan.sessions) {
      const folder = mkdtempSync(join(destination, `.incomplete-${row.id}-`));
      const stage = { folder, checks: [], manifest: null }; staged.push(stage);
      log(`Export directory: ${displayText(folder)}`);
      writeFileSync(join(folder, 'README.txt'), 'PRIVATE SESSION EXPORT\nOnly a manifest.json with complete=true marks a completed write. Inspect coverage and warnings separately.\nThis is reference material, not current instructions or an importable backup.\nNo project/worktree copy, remote downloads, or attachment paths mentioned only in prose are collected.\nRaw history may contain credentials and other sensitive information. Do not publish it.\n', { flag: 'wx', mode: 0o600 });
      const rollout = await writeVerifiedFile(createReadStream(row.path), join(folder, 'rollout.jsonl'));
      if (rollout.bytes !== row.size) fail('Source rollout size changed during export. The bundle is incomplete; no source data was removed.');
      let history = null;
      if (reader.present) {
        const historyFile = 'history.jsonl';
        let records = 0;
        function* lines() {
          for (const line of reader.lines(row.id)) {
            records++;
            yield line;
          }
        }
        const saved = await writeVerifiedFile(Readable.from(lines(), { objectMode: false }), join(folder, historyFile));
        history = { ...saved, records };
      }
      const inherited = await collectDependencies(folder, row, snapshot, getIndex);
      stage.checks = inherited.checks;
      const rendered = await renderConversation(folder, row, inherited.sources, { attachmentRoots });
      stage.attachments = rendered.sourceChecks;
      stage.source = { path: row.path, sha256: rollout.sha256 };
      const warnings = [...inherited.warnings, ...rendered.warnings];
      const files = [rollout, ...(history ? [history] : []), ...inherited.files, ...rendered.files];
      const session = { id: row.id, title: row.title, updated: row.updated, archived: row.archived,
        historyMode: row.historyMode, project: row.project ?? null, cwd: row.cwd ?? null };
      const spawnEdges = edgesBySession.get(row.id);
      stage.manifest = { format: FORMAT, schemaVersion: 2, complete: true, restorable: false,
        exportedAt: new Date().toISOString(), session, files,
        coverage: { history: inherited.warnings.length ? 'partial' : 'collected', attachments: 'supported-inputs-only', conversation: 'record-view-not-exact-ui' },
        sources: inherited.sources.map(({ path, ...source }) => source), attachments: rendered.attachments, warnings,
        spawnEdges };
      stage.manifest.contentDigest = snapshotDigest(stage.manifest);
      log(`Exported: ${row.id}`);
    }
    const fresh = await inspect(snapshot.home);
    reader.check();
    const index = indexSnapshot(fresh);
    for (const group of plan.groups) {
      if (makePlan(fresh, group.root, 'export', index).fingerprint !== group.fingerprint) fail('Source sessions changed during export. The bundle is incomplete; no source data was removed.');
    }
    for (const stage of staged) {
      if (await digestFile(stage.source.path) !== stage.source.sha256) fail('Source rollout content changed during export.');
      await checkDependencySources(stage.checks, snapshot.home);
      await checkAttachmentSources(stage.attachments);
    }
    for (const stage of staged) {
      const duplicate = existing.get(`${stage.manifest.session.id}:${stage.manifest.contentDigest}`);
      if (duplicate) {
        await verifyBundle(duplicate);
        // Only the exact private staging directory created by this invocation is removed.
        if (relative(destination, stage.folder).includes(sep) || !basename(stage.folder).startsWith('.incomplete-')) fail('Invalid staging directory.');
        rmSync(stage.folder, { recursive: true }); stage.removed = true;
        entries.push({ id: stage.manifest.session.id, key: duplicate.key, digest: stage.manifest.contentDigest });
        skipped.push(duplicate.folder); log(`Unchanged: ${stage.manifest.session.id}`); continue;
      }
      const manifestText = `${JSON.stringify(stage.manifest, null, 2)}\n`;
      if (Buffer.byteLength(manifestText) > MAX_MANIFEST_BYTES) fail('Export manifest exceeds the supported size.');
      writeFileSync(join(stage.folder, 'manifest.json'), manifestText, { flag: 'wx', mode: 0o600 });
      const final = join(destination, `${stage.manifest.exportedAt.replace(/[:.]/g, '-')}_${stage.manifest.session.id}_${basename(stage.folder).slice(-6)}`);
      renameSync(stage.folder, final); stage.published = true; folders.push(final);
      entries.push({ id: stage.manifest.session.id, key: basename(final), digest: stage.manifest.contentDigest });
      log(`Saved: ${displayText(final)}`);
    }
    const partial = staged.some(stage => stage.manifest.warnings.length);
    const batch = writeBatch(destination, snapshot, plan, entries, selection);
    log(`Export batch: ${batch.id}`);
    log(`Export complete: ${folders.length} saved; ${skipped.length} unchanged. Coverage warnings: ${partial ? 'yes; inspect each manifest' : 'none detected (supported input formats only)'}. Originals were not changed.`);
    return { folders, skipped, partial, batch };
  } catch (error) {
    for (const stage of staged.filter(stage => !stage.published && !stage.removed)) log(`Incomplete export retained: ${displayText(stage.folder)}. Not published for search.`);
    if (folders.length) log(`Already published: ${folders.length} session export(s). No automatic rollback.`);
    throw error;
  } finally { reader?.close(); }
}

// Tokens bind the selected data and destination, not a moving relative cutoff.
export function confirmationToken(plan, options) {
  return hash({ operation: plan.operation, groups: plan.groups.map(group => group.fingerprint), skipped: plan.skipped, problems: plan.problems,
    batch: plan.batchDigest ?? null, directory: options.directory ?? null,
    output: plan.operation === 'export' ? options.output ?? null : null,
    attachmentRoot: options.attachmentRoot ?? null });
}

export async function planExportedDeletion(snapshot, directory, batchId, onlyRoot) {
  const batch = readBatch(directory, batchId);
  if (batch.source !== sourceIdentity(snapshot.home)) fail('Export batch belongs to a different Codex home.');
  const entries = new Map(batch.entries.map(entry => [entry.id, entry]));
  const index = indexSnapshot(snapshot), groups = [], skipped = [];
  for (const saved of batch.groups) {
    if (onlyRoot && saved.root !== onlyRoot) continue;
    const present = saved.ids.filter(id => index.byId.has(id));
    if (!present.length) { skipped.push({ root: saved.root, alreadyAbsent: true, problems: ['Already absent from the local index.'] }); continue; }
    try {
      const exported = makePlan(snapshot, saved.root, 'export', index);
      if (exported.fingerprint !== saved.fingerprint) fail('Source session metadata or descendant membership changed after export.');
      const group = makePlan(snapshot, saved.root, 'delete', index);
      if (group.problems.length) fail(group.problems.join(' '));
      const reader = await openHistoryReader(snapshot.home, group.sessions);
      try {
        for (const row of group.sessions) {
          const entry = entries.get(row.id), bundle = entry && readBundle(directory, entry.key);
          if (!bundle || bundle.manifest.session.id !== row.id || bundle.manifest.contentDigest !== entry.digest) fail('Required exported snapshot is missing or changed.');
          await verifyBundle(bundle);
          const warnings = bundle.manifest.warnings;
          if (!Array.isArray(warnings) || warnings.some(w => w.kind !== 'rendering' || w.reason !== 'multiple-record-representations')) fail('Export has missing content or attachment warnings; excluded from batch deletion.');
          const rollout = bundle.manifest.files.find(file => file.file === 'rollout.jsonl');
          const history = bundle.manifest.files.find(file => file.file === 'history.jsonl');
          if (await digestFile(row.path) !== rollout.sha256) fail('Source rollout content changed after export.');
          if (reader.present !== !!history || (history && await digestChunks(reader.lines(row.id)) !== history.sha256)) fail('Indexed history changed after export.');
        }
        reader.check();
      } finally { reader.close(); }
      groups.push(group);
    } catch (error) {
      skipped.push({ root: saved.root, problems: [error instanceof SessionError || error instanceof ExportError ? error.message : 'Export verification failed; inspect saved files and source state.'] });
    }
  }
  const sessions = groups.flatMap(group => group.sessions), problems = [...snapshot.issues];
  if (new Set(sessions.map(row => row.id)).size !== sessions.length) problems.push('Overlapping descendant groups.');
  return { operation: 'delete', groups, sessions, problems, skipped, batchDigest: batch.digest,
    size: groups.reduce((sum, group) => sum + group.size, 0),
    fingerprint: hash({ batch: batch.digest, groups: groups.map(group => group.fingerprint), skipped, problems }) };
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
    if (options.action === 'config') {
      const settings = readExportSettings(), known = [settings.directory, ...settings.previousDirectories].filter(Boolean);
      log(`Default export directory: ${displayText(settings.directory ?? '(not configured)')}`);
      known.forEach((path, i) => log(`  ${i + 1}. ${displayText(path)}${i === 0 ? ' (current)' : ' (previous)'}`));
      if (!options.output) {
        if (!interactive) return 0;
        const value = (await ask('New directory path or listed number (Enter keeps current): '))?.trim();
        if (!value) return 0;
        if (/^\d+$/.test(value) && !known[Number(value) - 1]) fail('Unknown directory selection.');
        options.output = resolve(/^\d+$/.test(value) ? known[Number(value) - 1] : value);
      }
      options.output = realpathSync(options.output);
      if (!lstatSync(options.output).isDirectory()) fail('Export destination must be an existing directory.');
      const token = hash({ operation: 'export-directory', settings, output: options.output });
      log(`Proposed default: ${displayText(options.output)}. Existing files will not be moved or deleted; previous directories remain listed.`);
      log(`Confirmation token: ${token}`);
      if (options.dryRun) return 0;
      if (options.confirm) { if (options.confirm !== token) fail('Confirmation token does not match the current configuration plan.'); }
      else {
        if (!interactive) fail('Review config --output <directory> --dry-run, then pass its --confirm token.');
        if (await ask('Type SET EXPORT DIRECTORY to save this local setting: ') !== 'SET EXPORT DIRECTORY') { log('Cancelled; configuration unchanged.'); return 0; }
      }
      const changed = writeExportDirectory(options.output, undefined, hash(settings));
      log(changed ? 'Default export directory saved.' : 'Default export directory unchanged.'); return 0;
    }
    const mutation = ['archive', 'delete'].includes(options.action);
    if (mutation && platform !== 'win32') fail('Archive/delete are currently supported only on Windows; list, plan, and export remain available.');
    if (options.batch) {
      if (!options.directory && interactive && !options.confirm) {
        const settings = readExportSettings(), known = [settings.directory, ...settings.previousDirectories].filter(Boolean);
        if (known.length > 1) {
          known.forEach((path, i) => log(`  ${i + 1}. ${displayText(path)}`));
          const value = (await ask('Export directory number (Enter uses current, q cancels): '))?.trim();
          if (value == null || value === 'q') return 0;
          if (value && (!/^[1-9]\d*$/.test(value) || !known[Number(value) - 1])) fail('Unknown export directory selection.');
          options.directory = known[value ? Number(value) - 1 : 0];
        }
      }
      options.directory = options.directory ?? readExportDirectory();
      if (!options.directory) fail('Export directory is not configured; use --in <directory>.');
      options.directory = realpathSync(options.directory);
      if (options.batch === true) {
        if (!interactive) fail('An explicit batch ID is required; use agent codex history batches --in <directory>.');
        const batches = listBatches(options.directory);
        batches.forEach((batch, i) => log(`${i + 1}. ${batch.id}  ${batch.entries.length} sessions  ${displayText(JSON.stringify(batch.selection))}`));
        const choice = (await ask('Export batch number (Enter cancels): '))?.trim();
        if (!choice) return 0;
        if (!/^[1-9]\d*$/.test(choice) || !batches[Number(choice) - 1]) fail('Unknown export batch selection.');
        options.batch = batches[Number(choice) - 1].id;
      }
      log(`Export batch: ${options.batch}; directory: ${displayText(options.directory)}`);
    }
    if (options.action !== 'list' && !options.batch && !options.id && !Number.isFinite(options.before)) {
      if (options.confirm) fail('An explicit selection is required with --confirm.');
      if (!interactive) { log('Error: A UUID or date/week selection is required. Run agent codex session help.'); return 2; }
      const selection = (await ask(`Selection: UUID, YYYY-MM-DD, or Nw${options.operation === 'delete' ? ', or exported to choose an export batch' : ''} (Enter cancels): `))?.trim();
      if (!selection) { log('Cancelled; nothing changed.'); return 0; }
      if (selection === 'exported' && options.operation === 'delete') return runSessions(
        [...(options.action === 'plan' ? ['plan'] : []), 'delete', '--exported'], { home, platform, interactive, log, ask, inspect, closed, cli });
      const selectedArgs = UUID.test(selection) ? [selection] : ['--before', selection];
      try {
        options = parseSessionArgs([options.action, ...(options.action === 'plan' ? [options.operation] : []), ...selectedArgs,
          ...(options.output ? ['--output', options.output] : []), ...(options.attachmentRoot ? ['--attachments-from', options.attachmentRoot] : []),
          ...(options.after ? ['--after', options.after] : [])], now);
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
    const buildPlan = state => options.batch ? planExportedDeletion(state, options.directory, options.batch) : selectPlan(state, options);
    const plan = await buildPlan(snapshot);
    printPlan(plan, log);
    if (plan.problems.length) return 1;
    if (options.operation === 'export' && !options.output) options.output = readExportDirectory() ?? undefined;
    if (options.confirm && options.confirm !== confirmationToken(plan, options)) fail('Confirmation token does not match the current operation plan.');
    const excluded = options.batch && plan.skipped.some(group => !group.alreadyAbsent);
    if (options.action === 'plan') {
      if (options.operation !== 'export' || options.output) log(`Confirmation token: ${confirmationToken(plan, options)}`);
      else log('Specify --output or configure an export directory to obtain a confirmation token.');
      log('Read-only preview. The operation will rebuild and recheck this plan.'); return 0;
    }
    if (!plan.sessions.length) { log('No eligible sessions; nothing changed.'); return excluded ? 3 : 0; }
    if (!interactive && !options.confirm) fail('This operation requires an interactive terminal or the --confirm token from a reviewed plan; no force bypass is available.');
    if (mutation) {
      closed();
      const version = cli(['--version'], snapshot.home);
      if (version.status !== 0 || version.stdout?.trim() !== reviewedVersion) fail(`Archive/delete require the reviewed ${reviewedVersion}. Nothing changed.`);
    } else if (!options.output) {
      if (!interactive) fail('Export requires --output or a configured default directory.');
      const configured = readExportDirectory();
      const output = configured ?? (await ask('Existing export parent directory (Enter cancels): '))?.trim();
      if (!output) { log('Cancelled; nothing changed.'); return 0; }
      options.output = resolve(output);
      if (!configured && await ask('Type SAVE DEFAULT to remember this directory, or Enter for this export only: ') === 'SAVE DEFAULT') writeExportDirectory(options.output);
    }
    if (options.action === 'export') {
      log(`Export parent: ${displayText(options.output)}`);
      if (options.attachmentRoot) log(`Approved structured local attachment root: ${displayText(options.attachmentRoot)}. Current file bytes may differ from the original attachment.`);
    }
    log(options.action === 'export' ? 'Export includes private history. Originals stay intact; no import/restore is provided.'
      : 'Keep all clients and background writers closed until completion. Delete is permanent. Archive retains rollout bytes; the app may clean up associated managed worktrees. Preserve worktree changes first.');
    const confirmation = `${options.action.toUpperCase()} ${options.id ?? `${plan.sessions.length} ${plan.fingerprint.slice(0, 8)}`}`;
    const token = confirmationToken(plan, options);
    log(`Confirmation token: ${token}`);
    if (!options.confirm && await ask(`Type ${confirmation} to ${options.action} all ${plan.sessions.length} listed session(s): `) !== confirmation) {
      log('Cancelled; nothing changed.'); return 0;
    }
    if (mutation) closed();
    let current = await inspect(home);
    const fresh = await buildPlan(current);
    if (fresh.fingerprint !== plan.fingerprint || fresh.problems.length) fail('The operation plan changed. Nothing changed by this operation; review a new plan.');
    if (options.action === 'export') {
      const result = await exportSessions(current, plan, options.output, { inspect, log,
        selection: options.id ? { id: options.id } : { before: new Date(options.before).toISOString() },
        attachmentRoots: options.attachmentRoot ? [realpathSync(options.attachmentRoot)] : [] });
      log(`Review deletion with: agent codex session plan delete --exported ${result.batch.id} --in "${displayText(options.output)}"`);
      let review = options.after === 'review-delete';
      if (!options.after && interactive && !options.confirm) review = ['2', 'review-delete'].includes((await ask('Next: 1 keep originals (default), 2 review deletion of this export: '))?.trim());
      if (review) {
        const confirmInteractively = interactive && !options.confirm;
        const next = await runSessions([...(confirmInteractively ? [] : ['plan']), 'delete', '--exported', result.batch.id, '--in', options.output],
          { home, platform, interactive: confirmInteractively, log, ask, inspect, closed, cli });
        return next || (result.partial ? 3 : 0);
      }
      return result.partial ? 3 : 0;
    }
    for (const group of plan.groups) {
      if (options.batch) {
        const exported = await planExportedDeletion(current, options.directory, options.batch, group.root);
        if (exported.batchDigest !== plan.batchDigest || exported.problems.length || exported.groups.length !== 1 || exported.groups[0].fingerprint !== group.fingerprint) fail('Exported deletion guard changed; stopped before the next official operation.');
      }
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
    return excluded ? 3 : 0;
  } catch (error) {
    // OS/SQLite/child stderr can contain private paths, settings, and history content.
    log(`Error: ${error instanceof SessionError || error instanceof ExportError ? displayText(error.message) : `Session operation failed (${errorTag(error)}). Check permissions, free space, and the supported storage layout; no automatic retry was attempted.`}`);
    if (operationStarted) log(`The official operation was started; completion may be partial. Verified roots: ${completed.join(', ') || 'none'}. Inspect remaining sessions before retrying.`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runSessions(process.argv.slice(2));
}
