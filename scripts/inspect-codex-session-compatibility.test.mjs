import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { zstdCompressSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanHistory, databaseSchemas, inspectExports, validateReportPath } from './inspect-codex-session-compatibility.mjs';
import { paginatedTurn, encodeTurn } from '../tools/agent/codex/fixtures/paginated-turn.mjs';

const id = '00000000-0000-4000-8000-000000000001';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'agent-compatibility-audit-'));
  // Cleanup stays within the exact disposable directory created above.
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'home'), exports = join(root, 'exports');
  mkdirSync(home); mkdirSync(exports); mkdirSync(join(home, 'sessions'));
  return { root, home, exports };
}

test('schema scan reads plain and compressed records without retaining scalar content', async t => {
  const f = fixture(t), records = paginatedTurn();
  const secret = 'PRIVATE_BODY_SHOULD_NEVER_APPEAR';
  records.push({ timestamp: '2000-01-01T00:00:00Z', type: 'event_msg', payload: { type: 'future_event', text: secret, future_field: 7 } });
  const bytes = encodeTurn(records);
  const plain = join(f.home, 'sessions', `rollout-${id}.jsonl`);
  writeFileSync(plain, bytes); writeFileSync(plain + '.zst', zstdCompressSync(bytes));
  const before = readFileSync(plain);
  const result = await scanHistory(f.home);
  assert.equal(result.discovered, 2); assert.equal(result.completed, 2);
  assert.equal(result.compressed, 1); assert.equal(result.complete, true);
  assert.equal(result.unsupportedRecords, 2);
  assert.equal(result.signatures[0].payloadFields.text, 'string');
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.deepEqual(readFileSync(plain), before);
});

test('broken compressed input is incomplete, not an empty successful inventory', async t => {
  const f = fixture(t);
  writeFileSync(join(f.home, 'sessions', `rollout-${id}.jsonl.zst`), Buffer.from('broken'));
  const result = await scanHistory(f.home);
  assert.equal(result.discovered, 1); assert.equal(result.completed, 0);
  assert.equal(result.complete, false); assert.equal(result.errors.length, 1);
});

test('database inspection includes cascade edges but never reads row values', t => {
  const f = fixture(t), db = new DatabaseSync(join(f.home, 'state_5.sqlite'));
  db.exec("CREATE TABLE threads(id TEXT PRIMARY KEY); CREATE TABLE diagnostic(id TEXT, thread_id TEXT REFERENCES threads(id) ON DELETE CASCADE, record BLOB); INSERT INTO threads VALUES ('PRIVATE_ROW');");
  db.close();
  const result = databaseSchemas(f.home);
  const diagnostic = result[0].tables.find(table => table.name === 'diagnostic');
  const threads = result[0].tables.find(table => table.name === 'threads');
  assert.deepEqual(diagnostic.columns.map(column => column.name), ['id', 'thread_id', 'record']);
  assert.equal(diagnostic.foreignKeys[0].on_delete, 'CASCADE');
  assert.deepEqual(threads.columns.map(column => column.name), ['id']);
  assert.deepEqual(threads.foreignKeys, []);
  assert.equal(JSON.stringify(result).includes('PRIVATE_ROW'), false);
});

test('unsupported exports are reported and output cannot overwrite or enter source/git', async t => {
  const f = fixture(t), snapshot = join(f.exports, 'incomplete'); mkdirSync(snapshot);
  writeFileSync(join(snapshot, 'manifest.json'), JSON.stringify({ format: 'unknown', complete: false }));
  const result = await inspectExports(f.exports, true);
  assert.equal(result.complete, false);
  assert.equal(result.snapshots[0].status, 'unsupported-or-incomplete');
  assert.throws(() => validateReportPath(join(f.home, 'report.json'), f.home, f.exports));
  assert.throws(() => validateReportPath(join(f.exports, 'report.json'), f.home, f.exports));
  const report = join(f.root, 'report.json');
  assert.equal(validateReportPath(report, f.home, f.exports), report);
  writeFileSync(report, 'existing');
  assert.throws(() => validateReportPath(report, f.home, f.exports));
  const checkout = join(f.root, 'checkout'); mkdirSync(checkout); mkdirSync(join(checkout, '.git'));
  assert.throws(() => validateReportPath(join(checkout, 'report.json'), f.home, f.exports));
});

test('CLI writes an incomplete private report and refuses to overwrite it on retry', t => {
  const f = fixture(t), reportPath = join(f.root, 'audit.json');
  const args = [fileURLToPath(new URL('./inspect-codex-session-compatibility.mjs', import.meta.url)),
    '--codex-home', f.home, '--export-root', f.exports, '--report', reportPath, '--scan-history'];
  const first = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(first.status, 2, first.stderr);
  const saved = readFileSync(reportPath, 'utf8'), report = JSON.parse(saved);
  assert.equal(report.metadata.status, 'unreadable');
  assert.equal(report.complete, false); assert.equal(report.deletionAuthorized, false);
  assert.equal(report.history.discovered, 0);
  assert.equal(saved.includes('\r'), false);
  assert.equal(first.stdout.includes(f.root), false);
  const retry = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(retry.status, 1); assert.match(retry.stderr, /REPORT_ALREADY_EXISTS/);
  assert.equal(readFileSync(reportPath, 'utf8'), saved);
});

test('source-only CLI scans history without an export destination and refuses export options', t => {
  const f = fixture(t), reportPath = join(f.root, 'source-audit.json');
  writeFileSync(join(f.home, 'sessions', `rollout-${id}.jsonl.zst`), zstdCompressSync(encodeTurn(paginatedTurn())));
  const args = [fileURLToPath(new URL('./inspect-codex-session-compatibility.mjs', import.meta.url)),
    '--codex-home', f.home, '--source-only', '--report', reportPath, '--scan-history'];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(result.status, 2, result.stderr); // Synthetic home has no state database.
  const saved = readFileSync(reportPath, 'utf8'), report = JSON.parse(saved);
  assert.equal(report.scope, 'source-only');
  assert.deepEqual(report.exports, { status: 'not-requested', reason: 'source-only' });
  assert.equal(report.history.completed, 1);
  assert.equal(report.history.unsupportedRecords, 0);
  assert.equal(report.deletionAuthorized, false);
  assert.throws(() => validateReportPath(join(f.home, 'report.json'), f.home));
  for (const options of [['--export-root', join(f.root, 'disconnected')], ['--verify-exports']]) {
    const conflict = spawnSync(process.execPath, [...args, ...options], { encoding: 'utf8' });
    assert.equal(conflict.status, 1);
    assert.match(conflict.stderr, /SOURCE_ONLY_CONFLICTS_WITH_EXPORT_OPTIONS/);
    assert.equal(readFileSync(reportPath, 'utf8'), saved);
  }
});
