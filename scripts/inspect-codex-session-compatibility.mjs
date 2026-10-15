#!/usr/bin/env node
// Repository-local investigation only. Never starts Codex or authorizes deletion.
import { lstatSync, realpathSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { inspectSessions, MAINTENANCE_CLI_VERSIONS } from '../tools/agent/codex/manage-codex-sessions.mjs';
import { createRolloutIndex } from '../tools/agent/codex/session-export-content.mjs';
import { jsonLines, readBundle, verifyBundle, regularFile, exists } from '../tools/agent/codex/session-export-storage.mjs';
import { historyRecordIssue } from '../tools/agent/codex/session-record-schema.mjs';
import { withRolloutBudget } from '../tools/agent/codex/session-rollout-io.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fail = code => { throw Object.assign(new Error(code), { auditCode: code }); };
const identity = path => { const p = resolve(path); return process.platform === 'win32' ? p.toLowerCase() : p; };
const inside = (root, path) => { const r = relative(identity(root), identity(path)); return !r || (!isAbsolute(r) && r !== '..' && !r.startsWith(`..${sep}`)); };
function realDirectory(path) {
  path = resolve(path);
  for (let p = path; ; p = dirname(p)) {
    const s = lstatSync(p);
    if (!s.isDirectory() || s.isSymbolicLink()) fail('LINKED_OR_INVALID_DIRECTORY');
    if (dirname(p) === p) break;
  }
  return realpathSync(path);
}
export function validateReportPath(path, home, exportRoot) {
  path = resolve(path);
  const parent = realDirectory(dirname(path));
  const destination = join(parent, basename(path));
  if ([home, exportRoot, repository].some(root => root && inside(root, destination))) fail('REPORT_INSIDE_SOURCE_OR_REPOSITORY');
  for (let p = parent; ; p = dirname(p)) {
    if (exists(join(p, '.git'))) fail('REPORT_INSIDE_GIT_CHECKOUT');
    if (dirname(p) === p) break;
  }
  if (exists(path)) fail('REPORT_ALREADY_EXISTS');
  return path;
}
function errorCode(error) {
  if (error.auditCode) return error.auditCode;
  const prefix = /^([A-Z][A-Z_]+):/.exec(error.message ?? '')?.[1];
  return prefix ?? (/^[A-Z][A-Z_0-9]+$/.test(error.code ?? '') ? error.code : 'READ_OR_VALIDATION_FAILED');
}
const kind = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
// Never serialize prompt, tool, path, identifier, or other scalar values.
const fields = v => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().slice(0, 80).map(k => [k.slice(0, 120), kind(v[k])])) : kind(v);
const discriminator = v => typeof v === 'string' && /^[a-z][a-z0-9_]{0,79}$/.test(v) ? v : '[other]';

export async function scanHistory(home, progress = () => {}) {
  const paths = [...createRolloutIndex(home)().values()].flat().sort();
  const result = { scope: 'recognized-rollout-filenames', discovered: paths.length, completed: 0,
    compressed: paths.filter(p => p.endsWith('.zst')).length, records: 0, unsupportedRecords: 0,
    signatures: [], errors: [], detailsTruncated: false, complete: true,
    interpretation: 'Record schema scan only; lineage, ownership and deletion eligibility are not validated.' };
  const signatures = new Map();
  await withRolloutBudget(async () => {
    for (const [index, path] of paths.entries()) {
      try {
        for await (const record of jsonLines(path, { root: home, numberTokens: true })) {
          result.records++;
          const issue = historyRecordIssue(record);
          if (!issue) continue;
          result.unsupportedRecords++;
          const v = record.value;
          const shape = { type: discriminator(v?.type), payloadType: discriminator(v?.payload?.type),
            fields: fields(v), payloadFields: fields(v?.payload), issue };
          const key = JSON.stringify(shape);
          if (!signatures.has(key) && signatures.size < 128) signatures.set(key, { ...shape, count: 0, examples: [] });
          const entry = signatures.get(key);
          if (entry) {
            entry.count++;
            if (entry.examples.length < 3) entry.examples.push({ fileNumber: index + 1, line: record.line });
          } else result.detailsTruncated = true;
        }
        result.completed++;
      } catch (error) {
        const code = errorCode(error);
        result.complete = false;
        if (result.errors.length < 128) result.errors.push({ fileNumber: index + 1, code });
        else result.detailsTruncated = true;
        if (code === 'OPERATION_LIMIT_EXCEEDED') break;
      }
      progress(index + 1, paths.length);
    }
  });
  result.signatures = [...signatures.values()];
  return result;
}

export function databaseSchemas(home) {
  return readdirSync(home).filter(n => /\.sqlite$/.test(n)).sort().map(name => {
    let db;
    try {
      regularFile(join(home, name), home);
      db = new DatabaseSync(join(home, name), { readOnly: true });
      db.exec('BEGIN');
      const columns = db.prepare('SELECT name, type, "notnull", pk FROM pragma_table_info(?)');
      const foreignKeys = db.prepare('SELECT "table", "from", "to", on_delete FROM pragma_foreign_key_list(?)');
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({ name: table }) => ({
        name: table,
        columns: columns.all(table),
        foreignKeys: foreignKeys.all(table),
      }));
      const triggers = db.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type='trigger' ORDER BY name").all();
      db.exec('COMMIT');
      return { name, status: 'read', tables, triggers };
    } catch (error) { return { name, status: 'unreadable', code: errorCode(error) }; }
    finally { db?.close(); }
  });
}

export async function inspectExports(root, verify, progress = () => {}) {
  const result = { scope: 'immediate snapshot directories; batch receipts are not validated',
    integrityRequested: verify, snapshots: [], skippedDirectories: 0, complete: true };
  await withRolloutBudget(async () => {
    for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) { result.complete = false; result.skippedDirectories++; continue; }
      if (!entry.isDirectory() || !exists(join(root, entry.name, 'manifest.json'))) continue;
      const row = { snapshotNumber: result.snapshots.length + 1 };
      result.snapshots.push(row);
      try {
        const bundle = readBundle(root, entry.name);
        if (!bundle) { row.status = 'unsupported-or-incomplete'; result.complete = false; continue; }
        row.schemaVersion = bundle.manifest.schemaVersion;
        row.coverageSections = Object.keys(bundle.manifest.coverage ?? {}).sort();
        row.validationStatus = discriminator(bundle.manifest.validation?.status);
        row.warningCount = bundle.manifest.warnings?.length ?? 0;
        row.status = 'manifest-read-integrity-not-checked';
        if (verify) { await verifyBundle(bundle); row.status = 'integrity-checked'; }
      } catch (error) {
        row.status = 'unreadable-or-invalid'; row.code = errorCode(error); result.complete = false;
        if (row.code === 'OPERATION_LIMIT_EXCEEDED') break;
      }
      progress(result.snapshots.length);
    }
  });
  return result;
}

export async function audit({ home, exportRoot, sourceOnly = false, scan = false, verify = false, progress = () => {} }) {
  if (sourceOnly && (exportRoot || verify)) fail('SOURCE_ONLY_CONFLICTS_WITH_EXPORT_OPTIONS');
  home = realDirectory(home);
  if (!sourceOnly) exportRoot = realDirectory(exportRoot);
  const report = { format: 'ai-dotfiles/codex-session-compatibility-audit', schemaVersion: 1,
    scope: sourceOnly ? 'source-only' : 'source-and-exports',
    nodeVersion: process.versions.node, supportedMaintenanceCliVersions: MAINTENANCE_CLI_VERSIONS,
    cliVersionProbed: false, appVersionProbed: false, deletionAuthorized: false,
    limitations: ['No globally atomic snapshot; close writers before running.',
      'SQLite read-only connections may create WAL/SHM coordination files.',
      'No source rows or conversation text are included. Schema names and field names remain private.',
      'Export integrity does not prove source coverage, durability or restoration.',
      'Only default CODEX_HOME database layout is inspected; custom SQLite locations need separate review.'],
    implementationHashes: {}, complete: true };
  for (const name of ['manage-codex-sessions.mjs', 'session-record-schema.mjs', 'session-rollout-io.mjs']) {
    report.implementationHashes[name] = createHash('sha256').update(readFileSync(join(repository, 'tools/agent/codex', name))).digest('hex');
  }
  try {
    const s = await inspectSessions(home);
    const historyModes = new Map();
    for (const { historyMode } of s.sessions) historyModes.set(historyMode, (historyModes.get(historyMode) ?? 0) + 1);
    report.metadata = { status: 'read', sessions: s.sessions.length, issueCount: s.issues.length,
      exportIssueCount: s.exportIssues.length,
      historyModes: Object.fromEntries(historyModes) };
    if (s.issues.length) report.complete = false;
  } catch (error) { report.metadata = { status: 'unreadable', code: errorCode(error) }; report.complete = false; }
  try {
    report.databases = databaseSchemas(home);
    if (report.databases.some(d => d.status !== 'read')) report.complete = false;
  } catch (error) { report.databases = [{ status: 'unreadable', code: errorCode(error) }]; report.complete = false; }
  if (scan) {
    progress('Scanning history');
    try {
      report.history = await scanHistory(home, (n, total) => { if (n % 25 === 0 || n === total) progress(`History ${n}/${total}`); });
      if (!report.history.complete) report.complete = false;
    } catch (error) { report.history = { complete: false, code: errorCode(error) }; report.complete = false; }
  } else report.history = { status: 'not-requested' };
  if (sourceOnly) report.exports = { status: 'not-requested', reason: 'source-only' };
  else {
    progress('Inspecting saved exports');
    try {
      report.exports = await inspectExports(exportRoot, verify, n => { if (n % 25 === 0) progress(`Exports ${n}`); });
    } catch (error) { report.exports = { complete: false, code: errorCode(error) }; }
    if (!report.exports.complete) report.complete = false;
  }
  return report;
}

async function main() {
  const { values } = parseArgs({ options: {
    help: { type: 'boolean' }, 'codex-home': { type: 'string' }, 'export-root': { type: 'string' },
    report: { type: 'string' }, 'scan-history': { type: 'boolean' }, 'verify-exports': { type: 'boolean' }, 'source-only': { type: 'boolean' },
  } });
  if (values.help) {
    console.log('Usage: node scripts/inspect-codex-session-compatibility.mjs (--export-root <existing-directory> | --source-only) --report <new-file-outside-git> [--scan-history] [--verify-exports] [--codex-home <directory>]\nClose Codex writers first. Uses checkout runtime; never starts Codex, exports or deletes sessions.\n--source-only skips saved exports without accessing their destination; cannot combine with export options.\n--scan-history decodes every recognized rollout using existing bounded readers.\n--verify-exports additionally hashes/validates saved snapshots (may be slow).\nExit 0: requested reads completed; 2: incomplete reads; 1: invocation/report failure.\nA completed audit is not a compatibility pass or deletion authorization. Reports are private.');
    return;
  }
  if (values['source-only'] && (values['export-root'] || values['verify-exports'])) fail('SOURCE_ONLY_CONFLICTS_WITH_EXPORT_OPTIONS');
  if ((!values['export-root'] && !values['source-only']) || !values.report) fail('AUDIT_SCOPE_AND_REPORT_REQUIRED');
  const home = realDirectory(values['codex-home'] || process.env.CODEX_HOME || join(homedir(), '.codex'));
  const exportRoot = values['source-only'] ? undefined : realDirectory(values['export-root']);
  const reportPath = validateReportPath(values.report, home, exportRoot);
  const report = await audit({ home, exportRoot, sourceOnly: values['source-only'], scan: values['scan-history'], verify: values['verify-exports'], progress: text => console.error(text) });
  // Recheck after potentially long reads, then create exclusively without overwriting.
  validateReportPath(reportPath, home, exportRoot);
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(`Private report written to the requested file. Requested reads complete: ${report.complete}.`);
  process.exitCode = report.complete ? 0 : 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Audit stopped: ${errorCode(error)}`); process.exitCode = 1; });
}
