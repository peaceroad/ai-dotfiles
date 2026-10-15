// @ai-dotfiles agent-dev-runtime managed
// Read-only history evidence shared by the Python TOML inspector and Node CLI.
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRolloutIndex, ownedRollouts } from './session-export-content.mjs';
import { exists, regularFile, filesystemPath, rolloutIdentity, UUID, jsonLines } from './session-export-storage.mjs';
import { withRolloutBudget } from './session-rollout-io.mjs';
import { validateHistoryPrefix } from './session-lineage.mjs';
import { knownPermissionContext } from './session-record-schema.mjs';

const pick = (v, keys) => Object.fromEntries(keys.filter(k => Object.hasOwn(v ?? {}, k)).map(k => [k, v[k]]));
const contextKeys = ['turn_id', 'cwd', 'approval_policy', 'approvals_reviewer', 'sandbox_policy', 'permission_profile'];
const pathKey = p => { const s = filesystemPath(String(p)).replaceAll('\\', '/').replace(/\/$/, ''); return process.platform === 'win32' ? s.toLowerCase() : s; };
const reject = reason => { throw Object.assign(new Error(reason), { reason }); };
function failure(error) {
  if (error.reason) return { status: error.reason === 'session-id-mismatch' || error.reason === 'duplicate-session-meta' ? 'invalid' : 'unavailable', reason: error.reason };
  if (['EACCES', 'EPERM'].includes(error.code)) return { status: 'denied', reason: 'history-read' };
  const code = /^([A-Z_]+):/.exec(error.message ?? '')?.[1];
  return { status: 'invalid', reason: code ? code.toLowerCase().replaceAll('_', '-') : 'invalid-or-incomplete-history' };
}
async function indexedRows(home, thread) {
  const names = readdirSync(home);
  if (process.env.CODEX_SQLITE_HOME || names.some(n => /^state_\d+\.sqlite$/.test(n) && n !== 'state_5.sqlite')) reject('unsupported-database-layout');
  const config = join(home, 'config.toml');
  if (exists(config)) {
    if (regularFile(config, home).size > 1024 * 1024) reject('unsupported-config-size');
    if (/\b(?:sqlite_home|(?:experimental_)?thread_store|state_db)\b/.test(readFileSync(config, 'utf8'))) reject('unsupported-database-layout');
  }
  const path = join(home, 'state_5.sqlite');
  if (!exists(path)) return null;
  regularFile(path, home);
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec('BEGIN');
    const columns = new Set(db.prepare('PRAGMA table_info(threads)').all().map(c => c.name));
    if (['id', 'rollout_path', 'archived'].some(c => !columns.has(c))) reject('unsupported-state-schema');
    const optional = ['title', 'cwd', 'updated_at_ms', 'updated_at', 'recency_at_ms'].map(c => columns.has(c) ? c : `NULL AS ${c}`);
    const query = db.prepare(`SELECT id, rollout_path, archived, ${optional.join(',')} FROM threads${thread ? ' WHERE id = ? COLLATE BINARY' : ''}`);
    const rows = thread ? query.all(thread) : query.all();
    db.exec('COMMIT');
    const byId = new Map();
    for (const row of rows) {
      if (!byId.has(row.id)) byId.set(row.id, []);
      byId.get(row.id).push(row);
    }
    return byId;
  } finally { db.close(); }
}
function selectedPath(home, id, rows, index) {
  if (rows) {
    const matching = rows.get(id) ?? [];
    if (matching.length !== 1) reject(matching.length ? 'ambiguous-session' : 'missing-indexed-session');
    const stored = matching[0].rollout_path;
    if (typeof stored !== 'string' || !stored) reject('missing-indexed-rollout');
    let path = filesystemPath(stored);
    if (!exists(path) && path.endsWith('.jsonl') && exists(path + '.zst')) path += '.zst';
    const identity = rolloutIdentity(path);
    const candidates = index.get(identity?.rollout) ?? [];
    if (identity?.thread !== id || !candidates.some(p => pathKey(p) === pathKey(path))) reject('missing-indexed-rollout');
    if (candidates.length !== 1) reject('ambiguous-session');
    regularFile(path, home);
    return path;
  }
  const candidates = ownedRollouts(index, id);
  if (candidates.length !== 1) reject(candidates.length ? 'ambiguous-session' : 'missing-session');
  regularFile(candidates[0], home);
  return candidates[0];
}

export const permissionSessionEvidence = options => withRolloutBudget(() => sessionEvidence(options));
async function sessionEvidence({ home, thread, turn, project }) {
  if (!thread) return { status: 'unavailable', reason: 'no-thread-id' };
  if (!UUID.test(thread) || turn && !UUID.test(turn)) return { status: 'unavailable', reason: 'invalid-identity' };
  thread = thread.toLowerCase(); turn = turn?.toLowerCase();
  try {
    home = realpathSync(filesystemPath(home));
    const index = createRolloutIndex(home)(), rows = await indexedRows(home, thread);
    const path = selectedPath(home, thread, rows, index), seen = new Set();
    let contextCount = 0, contextBytes = 0;
    async function readChain(path, boundary) {
      const identity = rolloutIdentity(path);
      if (seen.has(identity.rollout) || seen.size >= 128) reject('cyclic-or-deep-history');
      seen.add(identity.rollout);
      let meta, selected, matches = 0, foreignContext = false;
      const inspectRecord = record => {
        const value = record.value, payload = value?.payload;
        if (!meta) {
          if (value?.type !== 'session_meta' || !UUID.test(payload?.id ?? '') || payload.id.toLowerCase() !== identity.thread) reject('session-id-mismatch');
          meta = payload;
          if (meta.history_mode != null && !['legacy', 'paginated'].includes(meta.history_mode)) reject('unsupported-history-mode');
          if (meta.history_base != null) {
            const base = meta.history_base;
            if (!UUID.test(base.thread_id ?? '') || ['end_byte_offset', 'end_ordinal_exclusive'].some(key =>
              !Number.isSafeInteger(base[key]) || base[key] <= 0 || !/^[1-9]\d*$/.test(record.numberTokens?.get(base)?.[key] ?? ''))) reject('invalid-inherited-boundary');
          }
        } else if (value?.type === 'session_meta') reject('duplicate-session-meta');
        if (value?.type === 'event_msg' && payload?.type === 'thread_rolled_back') reject('rollback-history-needs-projection');
        if (value?.type === 'turn_context') {
          if (!payload || typeof payload !== 'object' || Array.isArray(payload)) reject('unsupported-turn-context');
          const projected = pick(payload, contextKeys);
          if (!knownPermissionContext(projected, record.numberTokens, payload)) reject('unsupported-turn-context');
          const bytes = Buffer.byteLength(JSON.stringify(projected));
          contextCount++; contextBytes += bytes;
          if (contextCount > 10000 || bytes > 65536 || contextBytes > 16 * 1024 * 1024) reject('permission-evidence-limit');
          if (identity.thread !== thread) foreignContext = true;
          else if (!turn || projected.turn_id?.toLowerCase() === turn) {
            matches++;
            selected = { path, turn: { line: record.line, timestamp: value.timestamp, ...projected } };
          }
        }
      };
      if (boundary) {
        // Extract evidence from the exact bytes whose schema/boundary is checked.
        // The shared reader still drains compressed input through its final frame.
        const checked = await validateHistoryPrefix(path, { root: home, owner: identity.thread,
          endByte: boundary.end_byte_offset, endOrdinal: boundary.end_ordinal_exclusive, onRecord: inspectRecord });
        if (checked.status !== 'verified') reject('unsupported-inherited-history');
      } else {
        for await (const record of jsonLines(path, { root: home, numberTokens: true })) inspectRecord(record);
      }
      if (!meta) reject('session-id-mismatch');
      if (meta.history_base != null) {
        const base = meta.history_base;
        const inherited = index.get(base.thread_id.toLowerCase());
        if (inherited?.length !== 1) reject(inherited?.length ? 'ambiguous-inherited-history' : 'missing-inherited-history');
        const parent = await readChain(inherited[0], base);
        selected ??= parent.selected;
        matches += parent.matches;
        foreignContext ||= parent.foreignContext;
      }
      return { meta, selected, matches, foreignContext };
    }
    const { meta, selected, matches, foreignContext } = await readChain(path);
    const freshRows = await indexedRows(home, thread);
    if ((rows === null) !== (freshRows === null) || rows && JSON.stringify(rows.get(thread)) !== JSON.stringify(freshRows.get(thread))) reject('session-index-changed');
    // Parent permissions do not describe the child's execution. An inherited
    // generation with the same logical owner may still supply its recorded turn.
    if (turn && matches > 1) reject('ambiguous-turn');
    return { path, status: selected ? 'read' : 'unavailable',
      ...(!selected ? { reason: foreignContext ? 'inherited-context-only' : 'missing-turn-context' } : {}),
      selection: turn ? 'exact-turn' : 'latest-recorded-turn', session: pick(meta, ['id', 'cwd', 'cli_version', 'originator']),
      turn: selected?.turn ?? null, ...(selected && selected.path !== path ? { evidencePath: selected.path } : {}),
      projectMatches: pathKey(selected?.turn.cwd ?? meta.cwd ?? '') === pathKey(project) };
  } catch (error) { return failure(error); }
}

export const recentPermissionSessions = options => withRolloutBudget(() => recentSessions(options));
async function recentSessions({ home, limit = 12 }) {
  try {
    home = realpathSync(filesystemPath(home));
    const rows = await indexedRows(home);
    if (!rows) return { sessions: [], notes: ['State index is unavailable; use manual entry.'], activitySource: 'state-index' };
    const index = createRolloutIndex(home)();
    const active = [...rows.values()].flat().filter(r => r.archived === 0 && UUID.test(r.id ?? '') && typeof r.cwd === 'string' && r.cwd)
      .sort((a, b) => (b.recency_at_ms ?? b.updated_at_ms ?? b.updated_at * 1000) - (a.recency_at_ms ?? a.updated_at_ms ?? a.updated_at * 1000));
    const sessions = []; let skipped = 0;
    for (const row of active) {
      try {
        const path = selectedPath(home, row.id, rows, index);
        if (relative(join(home, 'sessions'), path).startsWith(`..${sep}`)) reject('not-active-rollout');
        const stamp = row.recency_at_ms ?? row.updated_at_ms ?? row.updated_at * 1000;
        if (!Number.isFinite(stamp) || stamp <= 0) reject('missing-recency');
        sessions.push({ id: row.id, project: row.cwd, title: row.title || '(untitled)', updatedAt: new Date(stamp).toISOString() });
        if (sessions.length === limit) break;
      } catch { skipped++; }
    }
    return { sessions, notes: skipped ? [`${skipped} unsupported indexed sessions skipped.`] : [], activitySource: 'state-index', sourceDirectory: 'sessions' };
  } catch { return { sessions: [], notes: ['Session index discovery failed; use manual entry.'], activitySource: 'state-index' }; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let input = '';
    for await (const chunk of process.stdin) { input += chunk; if (input.length > 65536) reject('input-too-large'); }
    const options = JSON.parse(input);
    const result = options.recent ? await recentPermissionSessions(options) : await permissionSessionEvidence(options);
    console.log(JSON.stringify(result));
  } catch { console.log(JSON.stringify({ status: 'unavailable', reason: 'history-helper-failed' })); process.exitCode = 1; }
}
