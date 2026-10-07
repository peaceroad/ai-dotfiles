#!/usr/bin/env node
// @ai-dotfiles agent-dev-runtime managed

import { lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FORMAT, MAX_MANIFEST_BYTES, UUID, filesystemPath, rolloutIdentity, regularFile, exists, fingerprint as hash, snapshotDigest, indexedHistoryCoverage, verifyIndexedHistory, boardCoverage, attachmentMetadataCoverage, safeText as displayText, ExportError, digestFile, digestChunks, writeVerifiedFile, listBundles, readBundle, verifyBundle, syncExportBundle, syncExportFile, syncExportDirectory, readExportSettings, readExportDirectory, writeExportDirectory, jsonLines, inspectRollout, pathIdentity } from './session-export-storage.mjs';
import { collectDependencies, collectOwnedRollouts, ownedRollouts, ownedHistoryIds, checkDependencySources, checkAttachmentSources, createRolloutIndex, renderConversation } from './session-export-content.mjs';
import { LINEAGE_POLICY, validateSavedLineage } from './session-lineage.mjs';
import { ROLLOUT_POLICY, rolloutChunks, rolloutCodec, digestRollout, assertZstdRuntime, withRolloutBudget } from './session-rollout-io.mjs';
import { openBoardReader } from './session-message-board.mjs';
import { openAttachmentMetadataReader } from './session-attachment-metadata.mjs';
import { writeBatch, readBatch, listBatches, sourceIdentity, openHistoryReader } from './session-export-batches.mjs';
import { ProcessError, assertClientsClosed as checkClientsClosed } from './manage-codex-processes.mjs';
import { createProgress } from './session-progress.mjs';
import { SidebarCacheError, inspectSidebarRefresh, requestSidebarRefresh, sidebarRefreshError } from './session-sidebar-cache.mjs';

const bytes = value => `${(value / 1024 ** 2).toFixed(2)} MiB`;
class SessionError extends Error {}
const fail = message => { throw new SessionError(message); };
// Extend only after source review and isolated startup/deletion acceptance tests.
export const MAINTENANCE_CLI_VERSIONS = Object.freeze(['0.159.2', '0.160.1']);
const RETAINED_RAW_WARNINGS = new Set([
  'rendering/multiple-record-representations', 'rendering/unsupported-content-part',
  'rendering/unsupported-message-content', 'rendering/no-supported-messages',
  'attachment/unverified-file-mention', 'attachment/empty-embedded-media',
  'attachment/invalid-embedded-media-encoding', 'attachment/unsupported-embedded-media',
  'attachment/local-reference-missing-at-export',
]);
const errorTag = error => [
  /^[A-Z_]+$/.test(error?.code ?? '') ? error.code : null,
  Number.isInteger(error?.errcode) ? `SQLite ${error.errcode}` : null,
].filter(Boolean).join(', ') || 'unknown error';

export { displayText };

const isHelp = value => ['help', '--help', '-h'].includes(value);
const actionHelp = {
  list: `Usage: agent codex session list [--before DATE|Nw] [--limit N]
Example: agent codex session list --before 4w --limit 0
Read-only metadata, largest rollouts first. Default limit: 20; 0 means all.
Updated time is not last-viewed time; sizes exclude shared databases and attachments.`,
  plan: `Usage: agent codex session plan [archive|delete|export] <UUID | --before DATE|Nw>
       agent codex session plan delete --exported <batch-id> --in <directory>
Example: agent codex session plan export --before 4w --output <directory>
Read-only preview; omitted operation means delete. Export accepts --output and --attachments-from.
Delete plans scan rollout metadata for fork references. Exported deletion also verifies saved and live content.
The confirmation token binds the selected state, operation, and destination.`,
  export: `Usage: agent codex session export <UUID | --before DATE|Nw> [--output <directory>] [--after keep|review-delete]
Example: agent codex session export --before 4w --output <directory> --after keep
Save private reference copies; originals remain. This is not an importable backup.
New exports use v3: original .jsonl or .jsonl.zst bytes plus readable conversation.md.
Root-owned agent message boards are saved separately as message-board.jsonl.
Thread attachment metadata is saved as attachment-metadata.jsonl; linked payloads are not followed.
Saved files are flushed to the OS before publication/reuse and confirmed exported deletion.
Flush failures block deletion. Windows directory sync and physical power-loss durability are not guaranteed.
Compressed history requires Node.js 26.10.0 or later (stable release); old v2 snapshots remain readable.
Unknown paginated schemas retain raw bytes with warnings and block exported deletion.
The output parent must exist, outside Codex storage and Git repositories.
--output overrides the configured destination for this run.
Structured local media within CODEX_HOME/attachments are collected automatically.
--attachments-from <directory> permits supported structured references within an external directory.
--after keep skips the follow-up question; review-delete opens a separate deletion review.
For non-interactive use: review plan export with the same options, then add --confirm <token>.
With --confirm, review-delete prints a plan only. Deletion needs its own confirmation.
Saved marks publication; Export batch marks its receipt. Exit 3 means coverage warnings.
Close writers during export. After warnings, inspect agent codex history check <snapshot-key> --in <directory>.`,
  delete: `Usage: agent codex session delete <UUID | --before DATE|Nw> [--confirm <token>]
       agent codex session delete --exported [batch-id] [--in <directory>] [--confirm <token>]
Example: agent codex session delete --exported --in <directory>
Permanently delete original sessions and selected descendants using the official CLI.
Exported copies remain. No restore, automatic retry, --force, or --yes bypass is provided.
Use --exported to review one saved batch; do not replace it with a new date selection.
Without a batch ID, a terminal picker opens. --confirm requires an explicit batch ID.
For non-interactive use: review plan delete with the same selection, then pass its token.
Requires Windows, PowerShell 7, compatible CLI/storage, and closed clients/background writers.
Inspect blockers with agent codex process status from an external terminal.
Deletion preflight scans active/archived rollout metadata, including unindexed history.
Eligible referencing forks are deleted before their ancestors within the same reviewed run.
References outside the eligible deletion set retain the ancestor; referencing session IDs are shown.
Unreadable/corrupt reference metadata or coexisting plain/zstd variants block deletion.
Compressed history requires v3 export and a v2 batch receipt; direct archive/delete is unsupported.
Verified deletion schedules a full local app sidebar scan on its next startup when the cache is supported.
Exported deletion requires owned-rollout indexed history coverage; older snapshots must be exported again.
Roots with message-board content require a matching board export; direct deletion is blocked.
The same protection applies to thread attachment metadata.
Confirmed exported deletion flushes saved files to the OS; a flush error stops before deletion.
Protected, changed, or incompletely exported families remain excluded; exit 3 reports exclusions or sidebar refresh issues.`,
  archive: `Usage: agent codex session archive <UUID | --before DATE|Nw> [--confirm <token>]
Example: agent codex session archive --before 4w
Archive sessions and eligible descendants using the official CLI. Rollout bytes remain on disk.
Preserve needed worktree changes first; the app may separately clean managed worktrees.
For non-interactive use: review plan archive with the same selection, then pass its token.
Requires Windows, PowerShell 7, compatible CLI/storage, and closed clients/background writers.
Inspect blockers with agent codex process status from an external terminal.
Protected families and families with newer descendants are excluded.`,
  config: `Usage: agent codex session config [--output <directory>] [--dry-run | --confirm <token>]
Example: agent codex session config --output <directory> --dry-run
Inspect or change the default export destination. The directory must already exist.
Without options, a terminal offers current/previous destinations; redirected use only displays them.
Changing this setting never moves or deletes saved files. --output on export overrides one run.
For non-interactive changes: review --dry-run, then replace it with --confirm <config-token>.`,
  'refresh-sidebar': `Usage: agent codex session refresh-sidebar [--dry-run | --confirm <token>]
Example: agent codex session refresh-sidebar
Schedule a full local sidebar catalog reconciliation on the app's next startup.
Use this when deleted sessions still appear after restarting Codex.
Requires Windows and closed Codex/ChatGPT clients and background writers.
The app's cache format must pass schema checks. Existing reconciliation state is backed up.
Only the local cache scan marker and checkpoint change; the app performs the actual scan.
No thread history, catalog entry, project, or worktree is deleted by this command.
For non-interactive use: review --dry-run, then pass its --confirm token.`,
};
const actions = Object.keys(actionHelp);

function help(log, action) {
  if (action) {
    log(`${actionHelp[action]}

Requires Node.js 24.${['config', 'refresh-sidebar'].includes(action) ? ' This action does not inspect session history.' : ' Requires the supported local storage format; session mutation/export is experimental.'}
${['config', 'refresh-sidebar'].includes(action) ? 'Changes require their own confirmation.' : 'Dates use UTC midnight; Nw means N * 7 days before invocation, fixed for the run.'}
Exit codes: 0 completed/cancelled, 1 blocked/failed, 2 invalid arguments${['delete', 'export'].includes(action) ? ', 3 warnings/exclusions' : ''}.
Full requirements and safety boundaries: agent codex session help`);
    return;
  }
  log(`Inspect, archive, delete, or export local Codex sessions, including spawned descendants.
Experimental local storage integration; compatibility checks do not guarantee future Codex formats.
Usage: agent codex session <list|plan|archive|delete|export|config|refresh-sidebar> [arguments]
Standalone: node <runtime>/codex/manage-codex-sessions.mjs <command> [arguments]

  list [--before DATE|Nw] [--limit N]
  plan [archive|delete|export] <selection>    Read-only preview (default: delete).
  archive <selection>                      Archive using the official CLI.
  delete <selection>                       Permanently delete using the official CLI.
  export <selection> [--output <directory>] Save one reference folder per session snapshot.
  delete --exported [batch-id] [--in <directory>]  Review/delete exactly one export batch.
  config [--output <directory>] [--dry-run | --confirm <token>]  Inspect/change destinations.
  refresh-sidebar [--dry-run | --confirm <token>]  Schedule a full app sidebar scan.
  help                                    Show this help.
  <action> --help                          Show focused help without starting an operation.

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
list and plan are read-only; no server is started. Delete plans scan rollout metadata for fork
references. plan delete --exported also verifies saved files against live history bodies.
Sizes cover indexed rollout files only, not shared databases, attachments, or guaranteed savings.
Updated time is not last-viewed time. Use --limit 0 to list all matching sessions.
Titles can contain private information; review output before sharing it.

Requires Node.js 24 with node:sqlite and the reviewed state_5.sqlite layout.
Compressed reading/export/deletion requires Node.js 26.10.0 or later (stable release).
Rollout reading is streamed: 8 GiB stored, 32 GiB decoded per file, 128 MiB window/record,
10 minutes per read. Export/verification budgets: 64 GiB input, 256 GiB decoded,
64 GiB output (cumulative passes). Exceeding a limit stops; no unlimited fallback.
New v3 exports retain physical bytes and decoded hashes; v2 snapshots stay readable.
Coexisting plain/zstd variants are not supported. Re-export changed physical history.
Unknown paginated schemas warn and exclude exported deletion for either codec.
CODEX_HOME is respected (default: ~/.codex). Custom SQLite locations are unsupported.
Archive/delete require Windows, PowerShell 7, and a compatible Codex CLI.
Archive/delete startup profiles: codex-cli ${MAINTENANCE_CLI_VERSIONS.join(', ')}; unverified versions stop.
The local invocation disables daemon reuse, background migration and compression without
changing config. Remote execution environments are unsupported. The CLI must also advertise
the selected command with <SESSION> and, for delete, --force.
Required storage columns and protection data must remain readable; unknown formats block operations.
Fully close all Codex/ChatGPT clients, IDE integrations, and background writers first.
Use agent codex process status to inspect blockers; close/stop require separate terminal confirmation.
Keep them closed until completion. Concurrent writers and remote users are unsupported.
Pinned/sectioned sessions, unfinished goals, automation references, and unknown state block deletion.
Export preserves JSONL, a readable conversation, inherited prefixes, and supported embedded media.
Structured references within CODEX_HOME/attachments are collected automatically. File mentions
are not followed. External local media require --attachments-from <directory> (current bytes,
not necessarily historical originals).
Coverage warnings remain visible; export completion does not imply full history or attachment recovery.
Paginated/inherited history needs verified byte/ordinal coverage before exported deletion.
Lineage policy rollout-prefix-v2 covers reviewed ordinary turn payloads, including nested fields.
Older lineage policies remain readable but require a fresh export before deletion.
Unknown schemas are saved with a lineage warning and excluded from exported deletion.
Warnings identify the session, reason, and first source record; manifests retain every warning.
Preparation is shown as progress; Saved marks a published snapshot; Export batch marks its receipt.
No project copy, network downloads, import, or restore. Use agent codex history to read saved exports.
Default-destination setting: ~/.agents/ai-dotfiles/codex-session-export.json (AGENT_CODEX_EXPORT_CONFIG overrides its path).
config remembers previous destinations but never moves files. Interactive config can select one.
--in selects an old or relocated export directory; --output overrides this export only.
Export receipts live in batches/ and use relative snapshot paths; keep them with the snapshots.
Batch deletion excludes changed/protected families, missing snapshots, unresolved inherited history,
and existing uncollected external attachments. Verified raw history permits rendering/media warnings;
attachments absent at export must remain absent. Unknown warning types exclude the family.
Both saved and live bytes are rechecked. Receipts do not authorize deletion or guarantee restoration.
Indexed history includes every owned rollout ID and the legacy session ID. Older v2 snapshots
remain readable, but require a fresh export with this coverage before exported deletion.
After verified deletion, a compatible app sidebar cache is scheduled for a full scan on next startup.
Use refresh-sidebar to schedule the same scan for already deleted sessions. Unsupported caches
remain unchanged and are reported separately; this does not undo completed deletion.
Progress updates one line in a terminal; redirected logs report phase boundaries and at most
one intermediate update per 30 seconds. Warnings and completed results remain as ordinary lines.
The output parent must exist, outside CODEX_HOME and outside Git repositories. Originals stay intact.
No --force/--yes bypass, automatic retry, direct source-file deletion, or source database repair.
Deletion success requires absent index entries, owned rollouts, owned indexed history rows and board content.
Board exports retain root-owned channels, posts, subscriptions and tombstones with exact tagged integers.
Old snapshots without board coverage require re-export if the source still has board content.
An unreadable inventory or unknown post-operation state cannot establish success. Rechecking an absent
exported family also requires intact ownership metadata; residual data or missing evidence is reported.
Exit codes: 0 completed/cancelled, 1 blocked/failed, 2 invalid arguments,
3 export coverage warnings, excluded deletion families, or a sidebar refresh issue (verified absence is not a warning).`);
}

export function parseSessionArgs(args, now = Date.now()) {
  const [action = 'help', ...rest] = args;
  if (isHelp(action) && !rest.length) return { action: 'help' };
  if (isHelp(action) && rest.length === 1 && actions.includes(rest[0])) return { action: 'help', topic: rest[0] };
  if (actions.includes(action) && rest.length === 1 && isHelp(rest[0])) return { action: 'help', topic: action };
  const tokenValue = value => {
    if (!/^[0-9a-f]{64}$/.test(value)) fail('--confirm requires the 64-character lowercase hexadecimal token printed by the matching plan. Replace any placeholder with that token.');
    return value;
  };
  const requireValue = (key, values, index) => {
    const value = values[index];
    if (!value?.trim() || value.startsWith('--')) fail(`${key} requires a value. Run agent codex session ${action} --help.`);
    return value;
  };
  if (['config', 'refresh-sidebar'].includes(action)) {
    const options = { action }, seen = new Set();
    for (let i = 0; i < rest.length; i++) {
      const key = rest[i];
      if (!['--dry-run', '--confirm', ...(action === 'config' ? ['--output'] : [])].includes(key)) fail(`Unknown option. Run agent codex session ${action} --help.`);
      if (seen.has(key)) fail(`Repeated option: ${key}. Specify it once.`); seen.add(key);
      if (key === '--dry-run') options.dryRun = true;
      else {
        const value = requireValue(key, rest, ++i);
        if (key === '--output') options.output = resolve(value);
        else options.confirm = tokenValue(value);
      }
    }
    if (action === 'config' && !options.output && (options.dryRun || options.confirm)) fail('Configuration confirmation requires an output directory.');
    if (options.dryRun && options.confirm) fail('--confirm cannot accompany --dry-run.');
    return options;
  }
  if (!actions.includes(action)) fail('Unknown command. Run agent codex session help.');
  const operation = action === 'plan' ? (['archive', 'delete', 'export'].includes(rest[0]) ? rest.shift() : 'delete') : action;
  const options = { action, operation, limit: 20, before: Infinity };
  if (UUID.test(rest[0] ?? '') && action !== 'list') options.id = rest.shift().toLowerCase();
  const seen = new Set();
  const allowed = {
    '--before': true, '--older-than-weeks': true, '--limit': action === 'list',
    '--output': operation === 'export', '--attachments-from': operation === 'export',
    '--in': operation === 'delete', '--exported': operation === 'delete',
    '--after': action === 'export', '--confirm': ['export', 'delete', 'archive'].includes(action),
  };
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (!Object.hasOwn(allowed, key)) {
      // Do not echo arbitrary arguments: they may contain private paths or data.
      const label = /^--[a-z][a-z-]{0,40}$/.test(key) ? `: ${key}` : '';
      fail(`Unknown option or unexpected argument${label}. Run agent codex session ${action} --help.`);
    }
    if (!allowed[key]) fail(`${key} is not available for ${action}${action === 'plan' ? ` ${operation}` : ''}. Run agent codex session ${action} --help.`);
    if (seen.has(key)) fail(`Repeated option: ${key}. Specify it once.`);
    seen.add(key);
    if (key === '--exported') {
      options.batch = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
      if (options.batch !== true && !/^[a-zA-Z0-9_-]+$/.test(options.batch)) fail('Invalid export batch ID.');
      continue;
    }
    let value = requireValue(key, rest, ++i);
    if (key === '--before' && /^[1-9]\d*$/.test(value) && /^weeks?$/i.test(rest[i + 1] ?? '')) value += rest[++i];
    if (key === '--limit') {
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) fail('--limit requires a nonnegative integer; use 0 for all matching sessions.');
      options.limit = Number(value);
    }
    else if (key === '--before' || key === '--older-than-weeks') options.before = parseCutoff(key === '--older-than-weeks' ? `${value}w` : value, now);
    else if (key === '--output') options.output = resolve(value);
    else if (key === '--attachments-from') options.attachmentRoot = resolve(value);
    else if (key === '--in') options.directory = resolve(value);
    else if (key === '--after') {
      if (!['keep', 'review-delete'].includes(value)) fail('--after requires keep or review-delete.');
      options.after = value;
    }
    else if (key === '--confirm') options.confirm = tokenValue(value);
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
export async function inspectSessions(home, { progress = () => {} } = {}) {
  const { DatabaseSync } = await import('node:sqlite');
  home = filesystemPath(realpathSync(filesystemPath(home)));
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
    if (exists(join(home, name)) && /\b(?:sqlite_home|(?:experimental_)?thread_store|state_db)\b/.test(readFileSync(join(home, name), 'utf8'))) {
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
    const requiredColumns = (table, required) => {
      const columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name));
      const missing = required.filter(name => !columns.has(name));
      if (missing.length) fail(`Unsupported state_5.sqlite schema: ${table} is missing required column(s): ${missing.join(', ')}. Metadata inspection stopped.`);
      return columns;
    };
    const columns = requiredColumns('threads', ['id', 'rollout_path', 'name', 'title', 'updated_at',
      'updated_at_ms', 'recency_at_ms', 'archived', 'is_pinned', 'thread_section_id', 'history_mode']);
    requiredColumns('thread_spawn_edges', ['parent_thread_id', 'child_thread_id']);
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
        // Migration bookkeeping is not a current pin. Current DB pins and
        // legacy pin lists remain authoritative protection evidence.
        if (key === 'app-server-migrated-pinned-thread-ids-by-host') continue;
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
  progress('Inspect indexed session files', 0, rows.length);
  let inspected = 0;
  const sessions = rows.map(row => {
    const reasons = [...(protectedIds.get(row.id) ?? [])];
    if (!['legacy', 'paginated'].includes(row.history_mode)) reasons.push('invalid-history-mode');
    if (!UUID.test(row.id)) issues.push('Invalid session identifier in index.');
    if (![0, 1].includes(row.is_pinned) || ![0, 1].includes(row.archived)) reasons.push('invalid-metadata');
    if (row.is_pinned) reasons.push('pinned');
    if (row.thread_section_id) reasons.push('sidebar-section');
    const updated = row.updated_at_ms ?? row.updated_at * 1000;
    if (!Number.isSafeInteger(updated) || !Number.isFinite(new Date(updated).getTime())) reasons.push('invalid-date');
    let size = null, modified = null, path = filesystemPath(row.rollout_path);
    try {
      // Only the exact compressed sibling of the DB-selected generation may be used.
      if (path.endsWith('.jsonl') && !exists(path) && exists(`${path}.zst`)) path += '.zst';
      const rel = relative(home, path);
      if (!isAbsolute(path) || isAbsolute(rel) || !['sessions', 'archived_sessions'].includes(rel.split(sep)[0])) fail('outside-storage');
      // No junctions/symlinks in the path, or shared hard-linked rollout files.
      let part = home;
      for (const name of rel.split(sep).slice(0, -1)) {
        part = join(part, name);
        if (!checkedDirectories.has(part)) {
          const stat = lstatSync(part);
          if (!stat.isDirectory() || stat.isSymbolicLink()) fail('linked-directory');
          checkedDirectories.add(part);
        }
      }
      const stat = lstatSync(path);
      const canonical = filesystemPath(realpathSync(path)), expected = resolve(path);
      const samePath = process.platform === 'win32' ? canonical.toLowerCase() === expected.toLowerCase() : canonical === expected;
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail('linked-or-nonregular-file');
      if (rolloutIdentity(path)?.thread !== row.id.toLowerCase() || !/\.jsonl(?:\.zst)?$/.test(path)) fail('filename-session-mismatch');
      if (rolloutCodec(path) === 'zstd') assertZstdRuntime();
      if (!samePath) fail('redirected-path');
      const key = process.platform === 'win32' ? path.toLowerCase() : path;
      if (paths.has(key)) issues.push('Multiple sessions reference the same rollout.');
      paths.add(key);
      size = stat.size; modified = stat.mtimeMs;
    } catch (error) { reasons.push(`rollout-unavailable-or-unsafe(${error instanceof SessionError || error instanceof ExportError ? error.message : errorTag(error)})`); }
    progress('Inspect indexed session files', ++inspected, rows.length);
    return { id: row.id, title: row.name || row.title || '(untitled)', updated,
      recency: row.recency_at_ms, archived: Boolean(row.archived), historyMode: row.history_mode, size, modified,
      path, project: row.project_id ? projects.get(row.project_id) ?? { id: row.project_id, name: null, roots: [] } : null,
      cwd: row.cwd, reasons: reasons.sort() };
  });
  return { home, sessions, edges, issues: [...new Set([...issues, ...protectionIssues])].sort(), exportIssues: [...new Set(issues)].sort() };
}

export const inspectDeletionReferences = (...args) => withRolloutBudget(() => inspectDeletionReferencesWithinBudget(...args));
async function inspectDeletionReferencesWithinBudget(snapshot, { progress = () => {} } = {}) {
  const references = [], issues = [];
  let boardOwners, attachmentMetadataOwners;
  try {
    const reader = await openBoardReader(snapshot.home);
    try { boardOwners = reader.owners(); reader.check(); } finally { reader.close(); }
  }
  catch (error) {
    const reason = error instanceof SessionError || error instanceof ExportError ? error.message : errorTag(error);
    issues.push(`Agent message-board data could not be inspected: ${reason}; deletion is blocked.`);
  }
  try {
    const reader = await openAttachmentMetadataReader(snapshot.home);
    try { attachmentMetadataOwners = reader.owners(); reader.check(); } finally { reader.close(); }
  } catch (error) {
    const reason = error instanceof ExportError ? error.message : errorTag(error);
    issues.push(`Attachment metadata could not be inspected: ${reason}; deletion is blocked.`);
  }
  const owners = new Map(snapshot.sessions.map(row => [rolloutIdentity(row.path)?.rollout ?? row.id, row.id]));
  const indexedPaths = new Map(snapshot.sessions.map(row => [row.id, row.path]));
  const deletionIssuesBySession = new Map();
  let inspectingId, deletionRollouts;
  try {
    // Scan both history directories, including rollouts absent from the state index.
    // history_base identifies a rollout; forked_from_id alone does not imply a dependency.
    const rollouts = deletionRollouts = createRolloutIndex(snapshot.home)();
    for (const [id, paths] of rollouts) for (const path of paths) {
      const identity = rolloutIdentity(path);
      if (indexedPaths.has(identity.thread)) owners.set(id, identity.thread);
    }
    let checked = 0;
    progress('Inspect fork history references', 0, rollouts.size);
    for (const [rolloutId, paths] of rollouts) {
      inspectingId = rolloutId;
      for (const path of paths) regularFile(path, snapshot.home);
      if (paths.length !== 1) fail('ROLLOUT_VARIANTS_AMBIGUOUS: duplicate or coexisting plain/zstd history; deletion is blocked.');
      for (const path of paths) {
        // Process metadata once and drain compressed JSONL to its strict terminus.
        const compressed = rolloutCodec(path) === 'zstd';
        let first = true;
        for await (const { value } of jsonLines(path, { root: snapshot.home })) {
          if (!first) continue;
          first = false;
          const identity = rolloutIdentity(path);
          if (compressed && value.type !== 'session_meta') fail('Compressed history has no session metadata; deletion is blocked.');
          if (value.type === 'session_meta' && value.payload?.id?.toLowerCase() !== identity.thread) fail('Rollout metadata does not match its filename; deletion is blocked.');
          if (identity.thread !== identity.rollout && (value.type !== 'session_meta' || value.payload?.id?.toLowerCase() !== identity.thread)) fail('Rollover metadata does not match its filename; deletion is blocked.');
          const owner = value.type === 'session_meta' ? value.payload?.id?.toLowerCase() : null;
          if (indexedPaths.has(owner) && resolve(indexedPaths.get(owner)).toLowerCase() !== resolve(path).toLowerCase()) {
            if (!deletionIssuesBySession.has(owner)) deletionIssuesBySession.set(owner, []);
            deletionIssuesBySession.get(owner).push(path);
          }
          if (value.type === 'session_meta' && value.payload?.history_base) {
            const source = value.payload.id, target = value.payload.history_base.thread_id;
            if (!UUID.test(source ?? '') || !UUID.test(target ?? '')) fail('Invalid fork history reference; deletion is blocked.');
            if (target.toLowerCase() !== rolloutId) references.push({ source: source.toLowerCase(), rollout: owners.get(rolloutId) ?? rolloutId, target: owners.get(target.toLowerCase()) ?? target.toLowerCase() });
          }
          if (!compressed) break;
        }
        if (compressed && first) fail('Compressed history has no session metadata; deletion is blocked.');
      }
      progress('Inspect fork history references', ++checked, rollouts.size);
    }
  } catch (error) {
    const reason = error instanceof SessionError || error instanceof ExportError ? error.message : errorTag(error);
    issues.push(`Fork history references could not be inspected${inspectingId ? ` for rollout ${inspectingId}` : ''}: ${reason}; deletion is blocked.`);
  }
  references.sort((a, b) => a.target.localeCompare(b.target) || a.rollout.localeCompare(b.rollout) || a.source.localeCompare(b.source));
  return { ...snapshot, deletionReferences: references, deletionIssues: issues, deletionIssuesBySession, deletionRollouts, boardOwners, attachmentMetadataOwners };
}

function indexSnapshot(snapshot) {
  const byId = new Map(snapshot.sessions.map(row => [row.id, row]));
  const children = new Map(), parents = new Map(), referencesByTarget = new Map();
  for (const { parent, child } of snapshot.edges) {
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(child);
    if (!parents.has(child)) parents.set(child, []);
    parents.get(child).push(parent);
  }
  for (const reference of snapshot.deletionReferences ?? []) {
    if (!referencesByTarget.has(reference.target)) referencesByTarget.set(reference.target, []);
    referencesByTarget.get(reference.target).push(reference);
  }
  return { byId, children, parents, referencesByTarget };
}

export function makePlan(snapshot, root, operation = 'delete', index = indexSnapshot(snapshot)) {
  const { byId, children, referencesByTarget } = index;
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
  if (operation === 'delete') {
    problems.push(...snapshot.deletionIssues ?? []);
    if (!index.verifyOwnedRollouts) for (const id of selected) if (snapshot.attachmentMetadataOwners?.has(id)) problems.push(`Session ${id} owns attachment metadata; use verified exported deletion.`);
    if (!index.verifyOwnedRollouts) for (const id of selected) if (snapshot.boardOwners?.has(id)) problems.push(`Session ${id} owns agent message-board data; use verified exported deletion to preserve and compare it.`);
    if (!index.verifyOwnedRollouts) for (const id of selected) if (snapshot.deletionIssuesBySession?.has(id)) problems.push('Additional rollout files belong to this session; use verified exported deletion to cover all files deleted by Codex.');
    for (const id of selected) for (const reference of index.checkExternalReferences === false ? [] : referencesByTarget.get(id) ?? []) {
      if (!selected.has(reference.rollout)) {
        problems.push(`Retain session ${reference.target}: fork session ${reference.source} (rollout ${reference.rollout}) outside this deletion family still references its history. Review and export the referencing session separately before considering its deletion.`);
      }
    }
  }
  const ids = [...selected].sort();
  const sessions = ids.map(id => byId.get(id)).filter(Boolean);
  for (const row of sessions) for (const reason of row.reasons) {
    if (operation !== 'export' || /^(invalid-|rollout-)/.test(reason)) problems.push(`${row.id}: ${reason}`);
  }
  if (operation !== 'export' && !index.verifyOwnedRollouts && sessions.some(row => rolloutCodec(row.path) === 'zstd')) {
    problems.push('Compressed history requires verified exported deletion; direct archive/delete is unsupported.');
  }
  // Include edges, private paths, timestamps, titles, sizes, and protection reasons in revalidation.
  const fingerprint = hash({ home: snapshot.home, root, sessions,
    edges: ids.flatMap(parent => (children.get(parent) ?? []).map(child => ({ parent, child }))), problems });
  return { root, sessions, problems, fingerprint, size: sessions.reduce((sum, row) => sum + (row.size ?? 0), 0) };
}

function orderDeletionGroups(snapshot, groups, skipped) {
  if (!groups.length || !snapshot.deletionReferences?.length) return groups;
  const remaining = new Map(groups.map(group => [group.root, group]));
  const owners = new Map(groups.flatMap(group => group.sessions.map(row => [row.id, group.root])));
  const prerequisites = new Map([...remaining.keys()].map(root => [root, new Set()]));
  const dependents = new Map([...remaining.keys()].map(root => [root, new Map()]));
  const excluded = new Map();
  const retain = (root, references) => {
    if (!excluded.has(root)) excluded.set(root, new Set());
    for (const reference of references) excluded.get(root).add(`Retain session ${reference.target}: fork session ${reference.source} (rollout ${reference.rollout}) is outside the eligible deletion set and still references its history. Review and export the referencing session separately before considering its deletion.`);
  };
  // Build once: only fully eligible groups can satisfy a dependency.
  for (const reference of snapshot.deletionReferences ?? []) {
    const target = owners.get(reference.target), source = owners.get(reference.rollout);
    if (target === source || !remaining.has(target)) continue;
    if (!remaining.has(source)) { retain(target, [reference]); continue; }
    prerequisites.get(target).add(source);
    const targets = dependents.get(source);
    if (!targets.has(target)) targets.set(target, []);
    targets.get(target).push(reference);
  }
  // Propagate each exclusion once, instead of rescanning every reference at each depth.
  const blocked = [...excluded.keys()];
  for (let head = 0; head < blocked.length; head++) {
    const root = blocked[head];
    remaining.delete(root);
    for (const [target, references] of dependents.get(root)) {
      if (!excluded.has(target)) blocked.push(target);
      retain(target, references);
    }
  }
  for (const [root, reasons] of excluded) skipped.push({ root, problems: [...reasons] });
  const pending = [...remaining.keys()].filter(root => !prerequisites.get(root).size).sort();
  const ordered = [];
  for (let head = 0; head < pending.length; head++) {
    const root = pending[head];
    ordered.push(remaining.get(root)); remaining.delete(root);
    for (const target of dependents.get(root).keys()) {
      if (!remaining.has(target)) continue;
      prerequisites.get(target).delete(root);
      if (!prerequisites.get(target).size) pending.push(target);
    }
  }
  for (const root of remaining.keys()) skipped.push({ root, problems: [
    'Retain this family: a cyclic fork history dependency prevents safe sequential deletion.',
  ] });
  return ordered;
}

export function selectPlan(snapshot, options) {
  const operation = options.operation ?? 'delete';
  const index = indexSnapshot(snapshot);
  if (operation === 'delete' && !options.id) index.checkExternalReferences = false;
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
  const problems = [...(operation === 'export' ? snapshot.exportIssues ?? snapshot.issues : snapshot.issues),
    ...(operation === 'delete' ? snapshot.deletionIssues ?? [] : [])];
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
  if (operation === 'delete') groups.splice(0, groups.length, ...orderDeletionGroups(snapshot, groups, skipped));
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
    log(`${row.id}  ${date}  ${row.size === null ? 'size unknown' : bytes(row.size)}  ${row.archived ? 'archived' : 'saved'}  ${rolloutCodec(row.path) === 'zstd' ? 'zstd (decoded size unverified)' : 'jsonl'}${row.reasons.length ? `  protected: ${row.reasons.join(', ')}` : ''}`);
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

function printExclusions(plan, log) {
  const skipped = plan.skipped ?? [];
  if (!skipped.length) return;
  let absent = 0;
  const reasons = new Map();
  for (const group of skipped) {
    if (group.alreadyAbsent) { absent++; continue; }
    for (const reason of new Set(group.problems)) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  log(`Selection summary: ${skipped.length - absent} excluded family(s); ${absent} already absent family(s). Excluded families were not changed.`);
  for (const [reason, count] of reasons) log(`  ${count} family(s): ${displayText(reason)}`);
}

async function writeCountedLines(input, path, progress) {
  let records = 0;
  function* lines() { for (const line of input) { records++; yield line; } }
  return { ...await writeVerifiedFile(Readable.from(lines(), { objectMode: false }), path, progress), records };
}

export const exportSessions = (...args) => withRolloutBudget(() => exportSessionsWithinBudget(...args));
async function exportSessionsWithinBudget(snapshot, plan, output, { inspect = inspectSessions, log = console.log, attachmentRoots = [], selection = null } = {}) {
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
  let reader, boards, attachmentMetadata;
  const staged = [], folders = [], skipped = [], entries = [];
  const warningSessionsByReason = new Map();
  let warningSessions = 0;
  const context = { session: null, phase: 'inspect saved snapshots' };
  const progress = createProgress(log);
  log = progress.log;
  const getIndex = createRolloutIndex(snapshot.home);
  // Codex-owned attachments are in scope for a session export. External roots
  // still require the explicit --attachments-from boundary.
  const ownedAttachments = join(snapshot.home, 'attachments');
  if (exists(ownedAttachments)) {
    const stat = lstatSync(ownedAttachments);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Codex attachment storage is not a regular directory.');
    attachmentRoots = [...attachmentRoots, ownedAttachments];
  }
  const edgesBySession = new Map(plan.sessions.map(row => [row.id, []]));
  for (const edge of snapshot.edges) {
    edgesBySession.get(edge.parent)?.push(edge);
    if (edge.child !== edge.parent) edgesBySession.get(edge.child)?.push(edge);
  }
  const existing = new Map();
  try {
    progress.phase('Inspect saved snapshot metadata');
    for (const bundle of listBundles(destination)) {
      const key = `${bundle.manifest.session.id}:${bundle.manifest.contentDigest}`;
      if (!existing.has(key)) existing.set(key, bundle);
    }
    context.phase = 'read indexed history';
    progress.phase('Read indexed history');
    reader = await openHistoryReader(snapshot.home, plan.sessions);
    context.phase = 'read agent message boards';
    progress.phase('Read agent message boards');
    boards = await openBoardReader(snapshot.home);
    context.phase = 'read attachment metadata';
    progress.phase('Read attachment metadata');
    attachmentMetadata = await openAttachmentMetadataReader(snapshot.home);
    let prepared = 0;
    for (const row of plan.sessions) {
      progress.phase('Prepare session exports', prepared, plan.sessions.length);
      context.session = row.id; context.phase = 'create staging directory';
      const folder = mkdtempSync(join(destination, `.incomplete-${row.id}-`));
      const stage = { folder, checks: [], manifest: null }; staged.push(stage);
      writeFileSync(join(folder, 'README.txt'), 'PRIVATE SESSION EXPORT\nOnly a published snapshot directory with manifest.json complete=true marks a completed write; .incomplete directories are not complete. Inspect coverage and warnings separately.\nThis is reference material, not current instructions or an importable backup.\nNo project/worktree copy, remote downloads, or attachment paths mentioned only in prose are collected.\nRaw history may contain credentials and other sensitive information. Do not publish it.\n', { flag: 'wx', mode: 0o600 });
      context.phase = 'copy rollout';
      progress.phase('Copy and verify rollout', prepared, plan.sessions.length);
      const primary = rolloutCodec(row.path) === 'zstd' ? 'rollout.jsonl.zst' : 'rollout.jsonl';
      if ((getIndex().get(rolloutIdentity(row.path).rollout) ?? []).length !== 1) fail('ROLLOUT_VARIANTS_AMBIGUOUS: duplicate or coexisting plain/zstd history must be resolved before export.');
      const rollout = await writeVerifiedFile(Readable.from(rolloutChunks(row.path, { root: snapshot.home, physical: true })), join(folder, primary), read => progress.bytes(read, row.size));
      if (rollout.bytes !== row.size) fail('Source rollout size changed during export. The bundle is incomplete; no source data was removed.');
      const historyIds = ownedHistoryIds(row, getIndex);
      let history = null;
      if (reader.present) {
        context.phase = 'copy indexed history';
        progress.phase('Copy and verify indexed history', prepared, plan.sessions.length);
        history = await writeCountedLines(reader.lines(historyIds), join(folder, 'history.jsonl'), read => progress.bytes(read));
      }
      let messageBoard = null;
      if (boards.present) {
        context.phase = 'copy agent message board';
        progress.phase('Copy and verify agent message board', prepared, plan.sessions.length);
        messageBoard = await writeCountedLines(boards.lines(row.id), join(folder, 'message-board.jsonl'), read => progress.bytes(read));
      }
      let metadataFile = null;
      if (attachmentMetadata.present) {
        context.phase = 'copy attachment metadata';
        progress.phase('Copy and verify attachment metadata', prepared, plan.sessions.length);
        metadataFile = await writeCountedLines(attachmentMetadata.lines(row.id), join(folder, 'attachment-metadata.jsonl'), read => progress.bytes(read));
      }
      context.phase = 'collect inherited history';
      progress.phase('Collect inherited history', prepared, plan.sessions.length);
      const inherited = await collectDependencies(folder, row, snapshot, getIndex, read => progress.bytes(read));
      await collectOwnedRollouts(folder, row, snapshot, getIndex, inherited, read => progress.bytes(read));
      context.phase = 'validate history boundaries';
      progress.phase('Validate history boundaries', prepared, plan.sessions.length);
      const lineage = await validateSavedLineage(folder, inherited.sources, row.id, row.historyMode, (read, size) => progress.bytes(read, size));
      if (lineage.status !== 'verified') {
        const segment = lineage.rollouts.find(segment => segment.issues?.length)
          ?? lineage.boundaries.find(segment => segment.issues?.length);
        const issue = segment?.issues[0];
        inherited.warnings.push({ kind: 'history', reason: 'lineage-boundary-unverified',
          ...(issue ? { origin: `${segment.file}:${issue.line}` } : {}),
          message: `Raw history is saved, but its schemas, ordinals or inherited dependencies could not be fully verified.${issue ? ` First issue: ${issue.reason}.` : ''} Exported deletion is blocked.` });
      }
      stage.checks = inherited.checks;
      stage.rolloutIds = inherited.sources.map(source => source.id);
      context.phase = 'render conversation and attachments';
      progress.phase('Render conversation and attachments', prepared, plan.sessions.length);
      const rendered = await renderConversation(folder, row, inherited.sources, { attachmentRoots, progress: read => progress.bytes(read) });
      stage.attachments = rendered.sourceChecks;
      stage.source = { path: row.path, sha256: rollout.sha256 };
      const warnings = [...inherited.warnings, ...rendered.warnings];
      // Aggregate repeated warnings, retaining the first generated record location for diagnosis.
      const warningGroups = new Map();
      for (const warning of warnings) {
        const key = `${warning.kind}:${warning.reason}`;
        const group = warningGroups.get(key);
        if (group) group.count++;
        else warningGroups.set(key, { warning, count: 1 });
      }
      if (warningGroups.size) warningSessions++;
      for (const { warning, count } of warningGroups.values()) {
        const reason = `${warning.kind}/${warning.reason}`;
        warningSessionsByReason.set(reason, (warningSessionsByReason.get(reason) ?? 0) + 1);
        log(`Warning: session ${row.id}; ${warning.kind}/${warning.reason}; count ${count}${warning.origin ? `; first source ${warning.origin}` : ''}${warning.message ? `; ${warning.message}` : ''}`);
      }
      const files = [rollout, ...(history ? [history] : []), ...(messageBoard ? [messageBoard] : []), ...(metadataFile ? [metadataFile] : []), ...inherited.files, ...rendered.files];
      const session = { id: row.id, title: row.title, updated: row.updated, archived: row.archived,
        historyMode: row.historyMode, project: row.project ?? null, cwd: row.cwd ?? null };
      const spawnEdges = edgesBySession.get(row.id);
      const sourceArtifacts = [];
      const sourcePaths = new Map(inherited.checks.map(check => [check.file, check.source]));
      sourcePaths.set(primary, row.path);
      for (const source of inherited.sources.filter(source => !source.file.startsWith('dependencies/'))) {
        const sourcePath = sourcePaths.get(source.file);
        const decoded = await inspectRollout(source.path, folder, read => progress.bytes(read), row.id);
        sourceArtifacts.push({ threadId: row.id, rolloutId: source.id,
          sourcePath: relative(snapshot.home, sourcePath).split(sep).join('/'), retainedFile: source.file,
          retention: 'full-physical', ...decoded });
      }
      sourceArtifacts.sort((a, b) => a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : 0);
      stage.manifest = { format: FORMAT, schemaVersion: 3, complete: true, restorable: false,
        exportedAt: new Date().toISOString(), session, files,
        coverage: { history: inherited.warnings.length ? 'partial' : 'collected', attachments: 'supported-inputs-only', conversation: 'record-view-not-exact-ui',
          indexedHistory: indexedHistoryCoverage(historyIds, reader.present), messageBoard: boardCoverage(row.id, boards.present),
          attachmentMetadata: attachmentMetadataCoverage(row.id, attachmentMetadata.present), lineage },
        sources: inherited.sources.map(({ path, ...source }) => source), attachments: rendered.attachments, warnings,
        spawnEdges, sourceArtifacts, artifactSetDigest: hash(sourceArtifacts),
        validation: { policy: ROLLOUT_POLICY, decoder: 'node-zstd-strict', node: process.versions.node } };
      stage.manifest.contentDigest = snapshotDigest(stage.manifest);
      progress.phase('Prepare session exports', ++prepared, plan.sessions.length);
    }
    context.session = null; context.phase = 'revalidate source state';
    progress.phase('Reinspect source session metadata');
    const fresh = await inspect(snapshot.home, { progress: (label, done, total) => progress.phase(label, done, total) });
    if ((fresh.exportIssues ?? fresh.issues).length) fail('Source state could not be revalidated; inspect storage configuration and protection diagnostics before exporting again.');
    const freshRollouts = createRolloutIndex(snapshot.home);
    reader.check();
    const index = indexSnapshot(fresh);
    for (const group of plan.groups) {
      context.session = group.root;
      if (makePlan(fresh, group.root, 'export', index).fingerprint !== group.fingerprint) fail('Source sessions changed during export. The bundle is incomplete; no source data was removed.');
    }
    let verified = 0;
    for (const stage of staged) {
      progress.phase('Reverify source exports', verified, staged.length);
      context.session = stage.manifest.session.id; context.phase = 'verify source rollout';
      if (hash(ownedRollouts(getIndex(), stage.manifest.session.id).toSorted()) !== hash(ownedRollouts(freshRollouts(), stage.manifest.session.id).toSorted())) fail('Owned rollout files changed during export.');
      for (const id of stage.rolloutIds) {
        if (hash((getIndex().get(id) ?? []).toSorted()) !== hash((freshRollouts().get(id) ?? []).toSorted())) fail('Inherited rollout candidates changed during export.');
      }
      if (await digestRollout(stage.source.path, snapshot.home, read => progress.bytes(read)) !== stage.source.sha256) fail('Source rollout content changed during export.');
      context.phase = 'verify inherited history';
      await checkDependencySources(stage.checks, snapshot.home, read => progress.bytes(read));
      context.phase = 'verify local attachments';
      await checkAttachmentSources(stage.attachments, read => progress.bytes(read));
      progress.phase('Reverify source exports', ++verified, staged.length);
    }
    context.session = null; context.phase = 'revalidate agent message boards';
    boards.check();
    context.phase = 'revalidate attachment metadata';
    attachmentMetadata.check();
    let published = 0;
    for (const stage of staged) {
      progress.phase('Publish verified exports', published, staged.length);
      context.session = stage.manifest.session.id; context.phase = 'publish snapshot';
      const duplicate = existing.get(`${stage.manifest.session.id}:${stage.manifest.contentDigest}`);
      if (duplicate) {
        await verifyBundle(duplicate, (read, size) => progress.bytes(read, size));
        // Only the exact private staging directory created by this invocation is removed.
        if (relative(destination, stage.folder).includes(sep) || !basename(stage.folder).startsWith('.incomplete-')) fail('Invalid staging directory.');
        rmSync(stage.folder, { recursive: true }); stage.removed = true;
        entries.push({ id: stage.manifest.session.id, key: duplicate.key, digest: stage.manifest.contentDigest,
          artifactSetDigest: stage.manifest.artifactSetDigest, policy: ROLLOUT_POLICY });
        syncExportBundle(duplicate);
        skipped.push(duplicate.folder); log(`Unchanged: ${stage.manifest.session.id}`);
        progress.phase('Publish verified exports', ++published, staged.length); continue;
      }
      const manifestText = `${JSON.stringify(stage.manifest, null, 2)}\n`;
      if (Buffer.byteLength(manifestText) > MAX_MANIFEST_BYTES) fail('Export manifest exceeds the supported size.');
      writeFileSync(join(stage.folder, 'manifest.json'), manifestText, { flag: 'wx', mode: 0o600 });
      const final = join(destination, `${stage.manifest.exportedAt.replace(/[:.]/g, '-')}_${stage.manifest.session.id}_${basename(stage.folder).slice(-6)}`);
      syncExportBundle({ folder: stage.folder, manifest: stage.manifest });
      renameSync(stage.folder, final); stage.published = true; folders.push(final);
      syncExportDirectory(destination);
      entries.push({ id: stage.manifest.session.id, key: basename(final), digest: stage.manifest.contentDigest,
        artifactSetDigest: stage.manifest.artifactSetDigest, policy: ROLLOUT_POLICY });
      log(`Saved: ${displayText(final)}`);
      progress.phase('Publish verified exports', ++published, staged.length);
    }
    const partial = warningSessions > 0;
    context.session = null; context.phase = 'write batch receipt';
    progress.phase('Write export batch receipt');
    const batch = writeBatch(destination, snapshot, plan, entries, selection);
    log(`Export batch: ${batch.id}`);
    log(`Export complete: ${folders.length} saved; ${skipped.length} unchanged. Coverage warnings: ${partial ? 'yes; inspect each manifest' : 'none detected (supported input formats only)'}. Originals were not changed.`);
    if (partial) {
      log(`Coverage summary: ${warningSessions} session(s) with warnings.`);
      for (const [reason, count] of warningSessionsByReason) log(`  ${count} session(s): ${displayText(reason)}`);
      log('Next: agent codex history check <snapshot-key> --in <export-directory> to inspect a saved snapshot and its warnings. Replace placeholders with the Saved folder name and export directory.');
    }
    return { folders, skipped, partial, batch };
  } catch (error) {
    for (const stage of staged.filter(stage => !stage.published && !stage.removed)) log(`Incomplete export retained: ${displayText(stage.folder)}. Not published for search.`);
    if (folders.length) log(`Already published: ${folders.length} session export(s). No automatic rollback.`);
    const hint = {
      ENOSPC: 'Insufficient filesystem free space.', EDQUOT: 'Storage quota exceeded.',
      EACCES: 'Access denied; check file permissions.', EPERM: 'Operation refused; check file permissions and locks.',
      ENOENT: 'A required file or directory is missing.', EIO: 'Filesystem I/O failed; check drive availability.',
    }[error?.code] ?? 'Check permissions, free space, and the supported storage layout.';
    const reason = error instanceof SessionError || error instanceof ExportError ? error.message
      : `Storage operation failed (${errorTag(error)}). ${hint}`;
    throw new ExportError(`Export failed (${context.session ? `session ${context.session}; ` : ''}phase ${context.phase}${error?.exportSource ? `; source ${error.exportSource}` : ''}): ${reason}`, { cause: error });
  } finally { progress.clear(); reader?.close(); boards?.close(); attachmentMetadata?.close(); }
}

// Tokens bind the selected data and destination, not a moving relative cutoff.
export function confirmationToken(plan, options) {
  return hash({ operation: plan.operation, groups: plan.groups.map(group => group.fingerprint), skipped: plan.skipped, problems: plan.problems,
    batch: plan.batchDigest ?? null, directory: options.directory ?? null,
    output: plan.operation === 'export' ? options.output ?? null : null,
    attachmentRoot: options.attachmentRoot ?? null });
}

export const planExportedDeletion = (...args) => withRolloutBudget(() => planExportedDeletionWithinBudget(...args));
async function planExportedDeletionWithinBudget(snapshot, directory, batchId, onlyRoot, { log = () => {} } = {}) {
  const batch = readBatch(directory, batchId);
  if (batch.source !== sourceIdentity(snapshot.home)) fail('Export batch belongs to a different Codex home.');
  const entries = new Map(batch.entries.map(entry => [entry.id, entry]));
  const groups = [], skipped = [];
  let absentHistory, boards, attachmentMetadata;
  const progress = createProgress(log);
  log = progress.log;
  try {
    if (!snapshot.deletionReferences) snapshot = await inspectDeletionReferences(snapshot,
      { progress: (label, done, total) => progress.phase(label, done, total) });
    const index = indexSnapshot(snapshot);
    // The reference scan just built this inventory. Reuse only within this fresh
    // snapshot; each inspection after confirmation or mutation rebuilds it.
    const getIndex = snapshot.deletionRollouts ? () => snapshot.deletionRollouts : createRolloutIndex(snapshot.home);
    index.verifyOwnedRollouts = true;
    boards = await openBoardReader(snapshot.home);
    attachmentMetadata = await openAttachmentMetadataReader(snapshot.home);
    const currentAttachmentOwners = attachmentMetadata.owners();
    const currentBoardOwners = boards.owners();
    index.checkExternalReferences = false;
    const selected = onlyRoot ? batch.groups.filter(group => group.root === onlyRoot) : batch.groups;
    let checked = 0;
    progress.phase('Verify exported deletion families', 0, selected.length);
    for (const saved of selected) {
      const present = saved.ids.filter(id => index.byId.has(id));
      try {
        if (!present.length) {
          if (saved.ids.some(id => currentAttachmentOwners.has(id))) fail('Absent from the local index, but attachment metadata remains; deletion is not verified.');
          if (saved.ids.some(id => currentBoardOwners.has(id))) fail('Absent from the local index, but agent message-board data remains; deletion is not verified.');
          const remaining = saved.ids.filter(id => ownedRollouts(getIndex(), id).length);
          if (remaining.length) fail(`Absent from the local index, but owned rollout files remain for session(s): ${remaining.join(', ')}. Review residual history; deletion is not verified.`);
          // This branch authorizes no mutation. Digest-bound ownership metadata
          // suffices to query residual DB rows without rehashing saved bodies.
          const ids = saved.ids.flatMap(id => {
            const entry = entries.get(id), bundle = readBundle(directory, entry.key);
            if (!bundle || bundle.manifest.session.id !== id || bundle.manifest.contentDigest !== entry.digest
              || snapshotDigest(bundle.manifest) !== entry.digest || !bundle.manifest.coverage?.indexedHistory) {
              fail('Absent from the local index, but saved ownership metadata is unavailable or changed; indexed history absence cannot be verified.');
            }
            verifyIndexedHistory(bundle.manifest);
            return bundle.manifest.coverage.indexedHistory.ids;
          });
          absentHistory ??= await openHistoryReader(snapshot.home, []);
          if (absentHistory.hasRows(ids)) fail('Absent from the local index, but owned indexed history rows remain. Review residual history; deletion is not verified.');
          skipped.push({ root: saved.root, alreadyAbsent: true, problems: ['Already absent from the local index; no owned rollout files or indexed history rows remain.'] });
          continue;
        }
        const exported = makePlan(snapshot, saved.root, 'export', index);
        if (exported.fingerprint !== saved.fingerprint) fail('Source session metadata or descendant membership changed after export.');
        const group = makePlan(snapshot, saved.root, 'delete', index);
        if (group.problems.length) fail(group.problems.join(' '));
        const reader = await openHistoryReader(snapshot.home, group.sessions);
        try {
          for (const row of group.sessions) {
            const entry = entries.get(row.id), bundle = entry && readBundle(directory, entry.key);
            if (!bundle || bundle.manifest.session.id !== row.id || bundle.manifest.contentDigest !== entry.digest) fail('Required exported snapshot is missing or changed.');
            const historyIds = ownedHistoryIds(row, getIndex);
            const savedHistory = bundle.manifest.coverage?.indexedHistory;
            if (!savedHistory) fail('Export lacks owned-rollout indexed history coverage; export again before deletion.');
            if (hash(savedHistory) !== hash(indexedHistoryCoverage(historyIds, reader.present))) fail('Indexed history coverage or owned rollout IDs changed; export again before deletion.');
            const savedMetadata = bundle.manifest.coverage?.attachmentMetadata;
            if (savedMetadata) {
              if (hash(savedMetadata) !== hash(attachmentMetadataCoverage(row.id, attachmentMetadata.present))) fail('Attachment metadata coverage changed; export again before deletion.');
              if (attachmentMetadata.present) {
                const file = bundle.manifest.files.find(file => file.file === 'attachment-metadata.jsonl');
                if (await digestChunks(attachmentMetadata.lines(row.id), read => progress.bytes(read, file.bytes)) !== file.sha256) fail('Attachment metadata changed after export; export again before deletion.');
              }
            } else if (currentAttachmentOwners.has(row.id)) fail('Export lacks attachment metadata coverage; export again before deletion.');
            const savedBoard = bundle.manifest.coverage?.messageBoard;
            if (savedBoard) {
              if (hash(savedBoard) !== hash(boardCoverage(row.id, boards.present))) fail('Agent message-board coverage changed; export again before deletion.');
            } else if (currentBoardOwners.has(row.id)) fail('Export lacks agent message-board coverage; export again before deletion.');
            const warnings = bundle.manifest.warnings;
            // Rendering limitations and bytes already absent from embedded media do
            // not lose additional data when the exact raw history is retained.
            if (!Array.isArray(warnings) || warnings.some(w => !RETAINED_RAW_WARNINGS.has(`${w.kind}/${w.reason}`))) fail('Export has unresolved history or external attachment warnings; excluded from batch deletion.');
            for (const warning of warnings) if (warning.reason === 'local-reference-missing-at-export') {
              if (typeof warning.source !== 'string' || !isAbsolute(warning.source) || exists(warning.source)) fail('A previously absent attachment is now present or its absence evidence is invalid; export again before deletion.');
            }
            const savedLineage = bundle.manifest.coverage?.lineage;
            // Missing/unsupported coverage can only reject a candidate. Eligible candidates
            // still require all file hashes and a fresh semantic boundary calculation.
            if (savedLineage?.policy !== LINEAGE_POLICY || savedLineage.status !== 'verified') fail('Export lacks verified history boundary coverage; export again with supported history records before deletion.');
            await verifyBundle(bundle, (read, size) => progress.bytes(read, size));
            const lineage = await validateSavedLineage(bundle.folder, bundle.manifest.sources, row.id, row.historyMode, (read, size) => progress.bytes(read, size));
            if (hash(lineage) !== hash(savedLineage)) fail('Saved history boundary coverage does not match the saved records; export again before deletion.');
            if (bundle.manifest.schemaVersion === 3) {
              if (batch.schemaVersion !== 2 || entry.policy !== ROLLOUT_POLICY || entry.artifactSetDigest !== bundle.manifest.artifactSetDigest) fail('Export batch lacks physical rollout coverage; export again before deletion.');
              const actual = ownedRollouts(getIndex(), row.id).map(path => pathIdentity(path)).sort();
              const artifacts = bundle.manifest.sourceArtifacts;
              const savedPaths = artifacts.map(a => pathIdentity(join(snapshot.home, a.sourcePath))).sort();
              if (hash(actual) !== hash(savedPaths)) fail('Owned physical rollout inventory changed after export; export again before deletion.');
              for (const artifact of artifacts) {
                const source = join(snapshot.home, artifact.sourcePath);
                if (rolloutIdentity(source)?.rollout !== artifact.rolloutId || regularFile(source, snapshot.home).size !== artifact.storedBytes
                  || await digestRollout(source, snapshot.home, read => progress.bytes(read)) !== artifact.storedSha256) fail('Source physical rollout content changed after export.');
              }
            } else {
              if (ownedRollouts(getIndex(), row.id).some(path => rolloutCodec(path) === 'zstd')) fail('Compressed deletion requires a v3 export.');
              for (const source of snapshot.deletionIssuesBySession?.get(row.id) ?? []) {
                const file = bundle.manifest.files.find(file => file.file === `rollouts/${rolloutIdentity(source).rollout}.jsonl`);
                if (!file || await digestFile(source, read => progress.bytes(read, file.bytes)) !== file.sha256) fail('Additional rollout is missing from the export or changed after export.');
              }
              const rollout = bundle.manifest.files.find(file => file.file === 'rollout.jsonl');
              if (await digestFile(row.path, read => progress.bytes(read, row.size)) !== rollout.sha256) fail('Source rollout content changed after export.');
            }
            const history = bundle.manifest.files.find(file => file.file === 'history.jsonl');
            if (reader.present !== !!history || (history && await digestChunks(reader.lines(historyIds), read => progress.bytes(read, history.bytes)) !== history.sha256)) fail('Indexed history changed after export.');
            if (savedBoard && boards.present) {
              const file = bundle.manifest.files.find(file => file.file === 'message-board.jsonl');
              if (await digestChunks(boards.lines(row.id), read => progress.bytes(read, file.bytes)) !== file.sha256) fail('Agent message-board changed after export; export again before deletion.');
            }
          }
          reader.check();
        } finally { reader.close(); }
        groups.push(group);
      } catch (error) {
        skipped.push({ root: saved.root, problems: [error instanceof SessionError || error instanceof ExportError ? error.message : 'Export verification failed; inspect saved files and source state.'] });
      } finally { progress.phase('Verify exported deletion families', ++checked, selected.length); }
    }
    absentHistory?.check(); boards.check(); attachmentMetadata.check();
    groups.splice(0, groups.length, ...orderDeletionGroups(snapshot, groups, skipped));
    const sessions = groups.flatMap(group => group.sessions), problems = [...snapshot.issues, ...(snapshot.deletionIssues ?? [])];
    if (new Set(sessions.map(row => row.id)).size !== sessions.length) problems.push('Overlapping descendant groups.');
    return { operation: 'delete', groups, sessions, problems, skipped, batchDigest: batch.digest,
      size: groups.reduce((sum, group) => sum + group.size, 0),
      fingerprint: hash({ batch: batch.digest, groups: groups.map(group => group.fingerprint), skipped, problems }) };
  } finally { absentHistory?.close(); boards?.close(); attachmentMetadata?.close(); progress.clear(); }
}

// Only the reviewed Windows process check and CLI invocation are enabled for archive/delete.
// Inspection works on other platforms; do not claim an untested quiescence check is safe.
export function assertClientsClosed({ platform = process.platform, spawn = spawnSync } = {}) {
  return checkClientsClosed({ platform, spawn });
}

export function runOfficialCodex(args, home, spawn = spawnSync, expectedVersion) {
  if (['archive', 'delete'].includes(args[0]) && args[1] !== '--help') {
    assertMaintenanceCli(expectedVersion);
    args = ['--no-daemon', '-c', 'features.local_thread_store_compression=false',
      '-c', 'features.background_paginated_rollout_migration=false', ...args];
  }
  // Fixed command name and validated UUID only; no user strings are interpolated into shell code.
  return spawn('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
    "$ErrorActionPreference='Stop'; $arguments=@(ConvertFrom-Json $env:AGENT_CODEX_SESSION_ARGS); $command=Get-Command codex -ErrorAction Stop; if($env:AGENT_CODEX_EXPECTED_VERSION) { $version=(& $command --version | Out-String).Trim(); if($LASTEXITCODE -ne 0 -or $version -cne $env:AGENT_CODEX_EXPECTED_VERSION) { [Console]::Error.WriteLine('AGENT_CODEX_VERSION_GUARD'); exit 91 } }; & $command @arguments; exit $LASTEXITCODE"],
  { cwd: home, env: { ...process.env, CODEX_HOME: home, AGENT_CODEX_SESSION_ARGS: JSON.stringify(args), AGENT_CODEX_EXPECTED_VERSION: expectedVersion ?? '' }, encoding: 'utf8', timeout: expectedVersion ? 120000 : 60000, windowsHide: true });
}

function cliProbe(args, home, cli, context) {
  let result;
  try { result = cli(args, home); } catch (error) {
    fail(`Codex CLI ${context} could not run (${errorTag(error)}). The next archive/delete operation was not started.`);
  }
  if (result?.error || result?.status !== 0) {
    const diagnostic = safeCliDiagnostic(result?.stderr);
    fail(`Codex CLI ${context} failed (${officialFailureReason(result)})${diagnostic ? `; sanitized stderr: ${diagnostic}` : ''}. Check that codex and PowerShell 7 are available. The next archive/delete operation was not started.`);
  }
  return result;
}

function safeCliDiagnostic(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const text = displayText(value.slice(0, 1200)
    .replace(/\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' '))
    .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, '[session ID]')
    .replace(/\b[0-9a-f]{32,}\b/gi, '[token]')
    .replace(/(?:[A-Za-z]:[\\/]|\\\\)[^\s"'<>]+/g, '[path]')
    .replace(/(^|\s)\/(?:[^\s"'<>/]+\/)*[^\s"'<>/]*/g, '$1[path]')
    .replace(/\s+/g, ' ').trim();
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

function officialFailureReason(result) {
  if (result?.error) return errorTag(result.error);
  if (Number.isInteger(result?.status)) return `exit ${result.status}`;
  if (typeof result?.signal === 'string') return `signal ${result.signal}`;
  return 'interrupted or timed out';
}

function cliVersion(home, cli) {
  const version = cliProbe(['--version'], home, cli, 'version check').stdout?.trim();
  // Keep arbitrary child output (including private paths and terminal controls) out of diagnostics.
  if (typeof version !== 'string' || version.length > 128 ||
      !/^codex-cli \d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/.test(version)) {
    fail('Codex CLI returned an unrecognized version response. Check the codex command on PATH. The next archive/delete operation was not started.');
  }
  return version;
}

function assertMaintenanceCli(version) {
  // Startup override propagation and local connection tested with disposable homes.
  // Add versions only after the opt-in session-cli-compatibility test passes.
  if (!MAINTENANCE_CLI_VERSIONS.some(candidate => version === `codex-cli ${candidate}`)) fail(`Codex CLI startup safety is not verified for this version. Archive/delete are blocked. Verified versions: ${MAINTENANCE_CLI_VERSIONS.join(', ')}. Update agent for additional verified profiles; export and saved-history reading remain available.`);
  if (process.env.CODEX_EXEC_SERVER_URL) fail('Remote execution environments are unsupported for session maintenance; use a local terminal.');
}

export function inspectCliCompatibility(action, home, cli = runOfficialCodex, log = () => {}) {
  if (!['archive', 'delete'].includes(action)) fail('Unsupported CLI compatibility operation.');
  const version = cliVersion(home, cli);
  log(`Codex CLI detected: ${version}`);
  assertMaintenanceCli(version);
  const result = cliProbe([action, '--help'], home, cli, `${action} capability check (${version})`);
  const text = typeof result.stdout === 'string' ? result.stdout : '';
  // Match the selected command's own usage and an option declaration, not prose or global help.
  const usage = new RegExp(`^Usage: codex ${action} \\[OPTIONS\\] <(?:SESSION|SESSION_ID)>[ \\t]*$`, 'm');
  const force = /^\s+--force(?:[ \t]|\r?$)/m;
  if (!usage.test(text.replaceAll('\r\n', '\n')) || (action === 'delete' && !force.test(text))) {
    fail(`Codex CLI ${version} does not advertise the required interface: codex ${action} <SESSION>${action === 'delete' ? ' --force' : ''}. The next archive/delete operation was not started.`);
  }
  log(`Codex CLI compatibility: ${action} command available; verified local startup profile, migration and compression disabled for this invocation.`);
  return version;
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
  let options, reviewedPlan, operationStarted = false, sidebarRefreshAttempted = false, sidebarAttention = false;
  const completed = [];
  const progress = createProgress(log);
  log = progress.log;
  const prompt = ask;
  ask = question => { progress.clear(); return prompt(question); };
  const now = Date.now();
  try { options = parseSessionArgs(args, now); } catch (error) { log(`Error: ${error.message}`); return 2; }
  if (options.action === 'help') { help(log, options.topic); return 0; }
  try {
    if (options.action === 'refresh-sidebar') {
      if (platform !== 'win32') fail('Sidebar refresh is currently supported only on Windows.');
      const plan = await inspectSidebarRefresh(home);
      if (!plan.available) { log('No supported local sidebar cache is present; nothing changed.'); return 0; }
      log('Proposed action: schedule a full local sidebar scan on the next Codex startup. No history or worktree will be deleted.');
      log(`Confirmation token: ${plan.token}`);
      if (options.confirm && options.confirm !== plan.token) fail('Sidebar refresh confirmation token does not match the current plan.');
      if (options.dryRun) { log('Read-only preview. Close clients before applying this plan.'); return 0; }
      if (plan.pending) { log('A full sidebar scan is already pending; start Codex and let its catalog scan finish.'); return 0; }
      closed();
      if (!options.confirm) {
        if (!interactive) fail('Review refresh-sidebar --dry-run, then pass its --confirm token.');
        if ((await ask('Type REFRESH SIDEBAR to schedule the scan (Enter cancels): '))?.trim() !== 'REFRESH SIDEBAR') { log('Cancelled; nothing changed.'); return 0; }
      }
      try {
        await requestSidebarRefresh(home, { closed, expectedToken: plan.token });
      } catch (error) { fail(sidebarRefreshError(error)); }
      log('Sidebar refresh scheduled. Previous scan state was backed up under CODEX_HOME/backups/sidebar-refresh.');
      log('Next: start Codex and allow the full local catalog scan to finish. Scheduling is not proof that reconciliation has completed.');
      return 0;
    }
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
        if ((await ask('Type SET EXPORT DIRECTORY to save this local setting: '))?.trim() !== 'SET EXPORT DIRECTORY') { log('Cancelled; configuration unchanged.'); return 0; }
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
    let inspectedCliVersion;
    if (mutation) {
      if (!interactive && !options.confirm) fail('This operation requires an interactive terminal or the --confirm token from a reviewed plan; no force bypass is available.');
      progress.phase('Check running Codex/ChatGPT processes'); closed();
      progress.phase('Check Codex CLI compatibility');
      inspectedCliVersion = inspectCliCompatibility(options.action, home, cli, log);
    }
    progress.phase('Inspect local session metadata');
    const inspectState = async () => {
      const state = await inspect(home, { progress: (label, done, total) => progress.phase(label, done, total) });
      return options.operation === 'delete' ? inspectDeletionReferences(state,
        { progress: (label, done, total) => progress.phase(label, done, total) }) : state;
    };
    const snapshot = await inspectState();
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
    const buildPlan = state => options.batch ? planExportedDeletion(state, options.directory, options.batch, undefined, { log }) : selectPlan(state, options);
    progress.phase('Build operation plan');
    const plan = await buildPlan(snapshot);
    reviewedPlan = plan;
    printPlan(plan, log);
    if (plan.problems.length) { log('Stopped before execution: resolve the plan problems above, then review a new plan.'); return 1; }
    if (options.operation === 'export' && !options.output) options.output = readExportDirectory() ?? undefined;
    if (options.confirm && options.confirm !== confirmationToken(plan, options)) fail('Confirmation token does not match the current operation plan.');
    const excluded = options.batch && plan.skipped.some(group => !group.alreadyAbsent);
    if (options.action === 'plan') {
      if (options.operation !== 'export' || options.output) log(`Confirmation token: ${confirmationToken(plan, options)}`);
      else log('Specify --output or configure an export directory to obtain a confirmation token.');
      log('Read-only preview. The operation will rebuild and recheck this plan.'); return 0;
    }
    if (!plan.sessions.length) { log('No eligible sessions; nothing changed.'); printExclusions(plan, log); return excluded ? 3 : 0; }
    if (!interactive && !options.confirm) fail('This operation requires an interactive terminal or the --confirm token from a reviewed plan; no force bypass is available.');
    if (!mutation && !options.output) {
      if (!interactive) fail('Export requires --output or a configured default directory.');
      const configured = readExportDirectory();
      const output = configured ?? (await ask('Existing export parent directory (Enter cancels): '))?.trim();
      if (!output) { log('Cancelled; nothing changed.'); return 0; }
      options.output = resolve(output);
      if (!configured && (await ask('Type SAVE DEFAULT to remember this directory, or Enter for this export only: '))?.trim() === 'SAVE DEFAULT') writeExportDirectory(options.output);
    }
    if (options.action === 'export') {
      log(`Export parent: ${displayText(options.output)}`);
      if (options.attachmentRoot) log(`Approved structured local attachment root: ${displayText(options.attachmentRoot)}. Current file bytes may differ from the original attachment.`);
    }
    log(options.action === 'export' ? 'Export includes private history. Originals stay intact; no import/restore is provided.'
      : 'Keep all clients and background writers closed until completion. Delete is permanent. Archive retains rollout bytes; the app may clean up associated managed worktrees. Preserve worktree changes first.');
    if (options.action === 'delete') log('Verified deletion also schedules a full local app sidebar scan when its cache format is supported.');
    const confirmation = `${options.action.toUpperCase()} ${options.id ?? `${plan.sessions.length} ${plan.fingerprint.slice(0, 8)}`}`;
    const token = confirmationToken(plan, options);
    log(`Confirmation token: ${token}`);
    if (!options.confirm && (await ask(`Type ${confirmation} to ${options.action} all ${plan.sessions.length} listed session(s): `))?.trim() !== confirmation) {
      log('Cancelled; nothing changed.'); return 0;
    }
    if (mutation) closed();
    progress.phase('Reinspect session metadata after confirmation');
    let current = await inspectState();
    const fresh = await buildPlan(current);
    if (fresh.fingerprint !== plan.fingerprint || fresh.problems.length) fail('The operation plan changed. Nothing changed by this operation; review a new plan.');
    if (options.action === 'export') {
      const result = await exportSessions(current, plan, options.output, { inspect, log,
        selection: options.id ? { id: options.id } : { before: new Date(options.before).toISOString() },
        attachmentRoots: options.attachmentRoot ? [realpathSync(options.attachmentRoot)] : [] });
      printExclusions(plan, log);
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
      let check;
      if (options.batch) {
        const exported = await planExportedDeletion(current, options.directory, options.batch, group.root, { log });
        if (exported.batchDigest !== plan.batchDigest || exported.problems.length || exported.groups.length !== 1) fail('Exported deletion guard changed; stopped before the next official operation.');
        check = exported.groups[0];
        progress.phase('Synchronize saved exports before deletion');
        const batch = readBatch(options.directory, options.batch);
        if (batch.digest !== exported.batchDigest) fail('Export batch changed before synchronization; review a new plan.');
        const ids = new Set(group.sessions.map(row => row.id));
        for (const entry of batch.entries.filter(entry => ids.has(entry.id))) {
          const bundle = readBundle(options.directory, entry.key);
          if (!bundle || bundle.manifest.session.id !== entry.id || snapshotDigest(bundle.manifest) !== entry.digest
            || bundle.manifest.contentDigest !== entry.digest) fail('Saved export changed before synchronization; review a new plan.');
          syncExportBundle(bundle);
        }
        syncExportFile(join(options.directory, 'batches', `${options.batch}.json`), options.directory);
        syncExportDirectory(join(options.directory, 'batches'));
        syncExportDirectory(options.directory);
      } else check = makePlan(current, group.root, options.action);
      if (check.fingerprint !== group.fingerprint || check.problems.length) fail('A remaining family changed. Stopped; inspect a new plan.');
      const deletedHistoryIds = options.action === 'delete'
        ? group.sessions.flatMap(row => ownedHistoryIds(row, () => current.deletionRollouts)) : [];
      closed();
      if (cli !== runOfficialCodex) {
        const currentCliVersion = cliVersion(snapshot.home, cli);
        if (currentCliVersion !== inspectedCliVersion) fail(`Codex CLI changed from ${inspectedCliVersion} to ${currentCliVersion}. Stopped before the next family; review a new plan.`);
      }
      const previouslyStarted = operationStarted;
      operationStarted = true;
      log(`Starting ${options.action}: ${group.root} (${group.sessions.length} session(s))`);
      const operationArgs = [options.action, group.root, ...(options.action === 'delete' ? ['--force'] : [])];
      const result = cli === runOfficialCodex
        ? runOfficialCodex(operationArgs, snapshot.home, spawnSync, inspectedCliVersion)
        : cli(operationArgs, snapshot.home);
      if (result.status === 91 && result.stderr?.trim() === 'AGENT_CODEX_VERSION_GUARD') {
        operationStarted = previouslyStarted;
        fail('Codex CLI version changed or could not be verified. Stopped before this family; review a new plan.');
      }
      if (result.status !== 0) {
        const diagnostic = safeCliDiagnostic(result.stderr);
        fail(`Official operation failed (${officialFailureReason(result)})${diagnostic ? `; sanitized Codex CLI stderr: ${diagnostic}` : ''}. Some sessions may already be changed. No retry was attempted.`);
      }
      progress.phase('Verify session state after official operation');
      current = await inspectState();
      if (current.issues.length) fail('Official operation returned success but session state could not be verified. Inspect storage and protection diagnostics; no retry was attempted.');
      const byId = new Map(current.sessions.map(row => [row.id, row]));
      if (options.action === 'delete' && (!current.deletionRollouts || current.deletionIssues.length)) fail(`Deletion returned success but remaining storage could not be verified. ${current.deletionIssues.join(' ')} No retry was attempted.`);
      const incomplete = group.sessions.find(row => options.action === 'delete'
        ? byId.has(row.id) || exists(row.path) || ownedRollouts(current.deletionRollouts, row.id).length || current.boardOwners?.has(row.id) || current.attachmentMetadataOwners?.has(row.id)
        : !byId.get(row.id)?.archived || byId.get(row.id)?.size !== row.size || byId.get(row.id)?.size === null ||
          relative(snapshot.home, byId.get(row.id).path).split(sep)[0] !== 'archived_sessions' || (!row.archived && exists(row.path)));
      if (incomplete) fail(`Official operation returned success but descendant verification is incomplete for session ${incomplete.id}. No retry was attempted.`);
      if (options.action === 'delete') {
        const reader = await openHistoryReader(current.home, []);
        try {
          if (reader.hasRows(deletedHistoryIds)) fail('Official deletion returned success but owned indexed history rows remain. No retry was attempted.');
          reader.check();
        } finally { reader.close(); }
      }
      completed.push(group.root);
      log(`Verified ${options.action}: ${group.root}`);
      if (options.action === 'delete' && !sidebarRefreshAttempted) {
        sidebarRefreshAttempted = true;
        try {
          const refresh = await requestSidebarRefresh(home, { closed });
          if (refresh.available) log('Sidebar refresh pending: Codex will reconcile the local catalog on its next startup.');
        } catch (error) {
          sidebarAttention = true;
          log(`Warning: deletion was verified, but ${sidebarRefreshError(error)}`);
          log('Next: review agent codex session refresh-sidebar --dry-run from an external terminal.');
        }
      }
    }
    log(`${options.action === 'delete' ? 'Deleted' : 'Archived'} and verified: ${plan.sessions.length} indexed session(s). No project file or shared database was manually removed.`);
    printExclusions(plan, log);
    if (excluded) log('Next: review the exclusion reasons above. To inspect this same batch again, use agent codex session plan delete --exported <batch-id> --in <export-directory>. Do not substitute a new date selector.');
    return excluded || sidebarAttention ? 3 : 0;
  } catch (error) {
    // OS/SQLite/child stderr can contain private paths, settings, and history content.
    if (error instanceof ProcessError) log(`Error: ${error.message}`);
    else log(`Error: ${error instanceof SessionError || error instanceof ExportError || error instanceof SidebarCacheError ? displayText(error.message) : `Session operation failed (${errorTag(error)}). Check permissions, free space, and the supported storage layout; no automatic retry was attempted.`}`);
    if (operationStarted) log(`The official operation was started; completion may be partial. Verified roots: ${completed.join(', ') || 'none'}. Inspect remaining sessions before retrying.`);
    if (reviewedPlan) printExclusions(reviewedPlan, log);
    if (operationStarted) log(`Next: agent codex session list --limit 0, then review a fresh ${options.action} plan for the remaining intended targets.`);
    return 1;
  } finally { progress.clear(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runSessions(process.argv.slice(2));
}
