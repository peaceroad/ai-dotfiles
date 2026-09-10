import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { exportSessions, selectPlan, parseSessionArgs, runSessions } from './manage-codex-sessions.mjs';
import { FORMAT, listBundles, verifyBundle, readExportDirectory, readExportSettings, writeExportDirectory, bundleFile, jsonLines } from './session-export-storage.mjs';
import { runHistory, parseHistoryArgs } from './manage-codex-history.mjs';

const id = '00000000-0000-4000-8000-000000000001';
const ancestor = '00000000-0000-4000-8000-000000000002';
const line = value => `${JSON.stringify(value)}\n`;
const meta = (id, history_base) => ({ type: 'session_meta', payload: { id, history_mode: 'paginated', ...(history_base ? { history_base } : {}) } });
const msg = (text, extra = []) => ({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }, ...extra] } });
function setup(t) {
  const root = mkdtempSync(join(tmpdir(), 'codex-export-fixture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'source'), output = join(root, 'saved');
  mkdirSync(join(home, 'sessions'), { recursive: true }); mkdirSync(output);
  const path = join(home, 'sessions', `${id}.jsonl`);
  const db = new DatabaseSync(join(home, 'thread_history_1.sqlite'));
  for (const name of ['thread_items', 'thread_turns', 'thread_realtime_items', 'thread_history_projection_state']) db.exec(`CREATE TABLE ${name} (thread_id TEXT, rollout_ordinal INTEGER, item_json TEXT)`);
  db.close();
  writeFileSync(path, line(meta(id)) + line(msg('日本語 keyword')));
  const snapshot = () => ({ home, edges: [], issues: [], exportIssues: [], sessions: [{ id, path, title: 'Fixture session', updated: 100000,
    archived: false, historyMode: 'paginated', size: statSync(path).size, modified: statSync(path).mtimeMs, reasons: [],
    cwd: 'fixture-project', project: { id: 'project-1', name: 'Example project', roots: ['fixture-project'] } }] });
  const save = (options = {}) => {
    const current = snapshot();
    return exportSessions(current, selectPlan(current, parseSessionArgs(['export', id])), output, { inspect: snapshot, log() {}, ...options });
  };
  return { root, home, output, path, snapshot, save };
}

test('embedded user media is extracted, literal file mentions and tool outputs are not followed', async t => {
  const f = setup(t), data = Buffer.from('fixture image bytes').toString('base64');
  writeFileSync(f.path, line(meta(id)) + line(msg('Files mentioned by the user: secret.txt', [
    { type: 'input_image', image_url: `data:image/png;base64,${data}` },
    { type: 'input_image', image_url: `data:image/png;base64,${data}` },
    { type: 'local_image', path: join(f.root, 'private.txt') },
  ])) + line({ type: 'response_item', payload: { type: 'function_call_output', output: 'DO NOT COLLECT THIS FILE' } }));
  const result = await f.save(); assert.equal(result.partial, true);
  const [bundle] = listBundles(f.output); await verifyBundle(bundle);
  assert.equal(bundle.manifest.attachments.length, 2);
  assert.equal(readdirSync(join(bundle.folder, 'attachments')).length, 1);
  assert.equal(readFileSync(join(bundle.folder, bundle.manifest.attachments[0].file), 'utf8'), 'fixture image bytes');
  assert.ok(bundle.manifest.warnings.some(w => w.reason === 'unverified-file-mention'));
  assert.ok(bundle.manifest.warnings.some(w => w.reason === 'local-reference-not-collected'));
  assert.doesNotMatch(readFileSync(join(bundle.folder, 'conversation.md'), 'utf8'), /DO NOT COLLECT/);
});

test('approved structured local media is current-file evidence, never an assumed historical original', async t => {
  const f = setup(t), local = join(f.root, 'local'); mkdirSync(local);
  const path = join(local, 'photo.png'); writeFileSync(path, 'current image');
  writeFileSync(f.path, line(meta(id)) + line(msg('Attached', [{ type: 'local_image', path }])));
  await f.save({ attachmentRoots: [local] });
  const [bundle] = listBundles(f.output);
  assert.equal(bundle.manifest.attachments[0].provenance, 'current-local-file-not-historical-original');
  assert.equal(readFileSync(join(bundle.folder, bundle.manifest.attachments[0].file), 'utf8'), 'current image');
});

test('core TurnItems and legacy user media are retained without hiding response-only messages', async t => {
  const f = setup(t), data = Buffer.from('audio fixture').toString('base64');
  writeFileSync(f.path, line(meta(id)) + line({ type: 'event_msg', payload: { type: 'item_completed', item: {
    type: 'UserMessage', id: 'user-1', content: [{ type: 'text', text: 'Core user message' }],
  } } }) + line({ type: 'event_msg', payload: { type: 'item_completed', item: {
    type: 'AgentMessage', id: 'assistant-1', content: [{ type: 'Text', text: 'Core assistant message' }],
  } } }) + line({ type: 'event_msg', payload: { type: 'user_message', message: 'Legacy audio', audio: [`data:audio/wav;base64,${data}`] } })
    + line(msg('Response-only record')));
  await f.save(); const [bundle] = listBundles(f.output);
  const text = readFileSync(join(bundle.folder, 'conversation.md'), 'utf8');
  for (const phrase of ['Core user message', 'Core assistant message', 'Legacy audio', 'Response-only record']) assert.ok(text.includes(phrase));
  assert.equal(bundle.manifest.attachments.length, 1);
  assert.ok(bundle.manifest.warnings.some(w => w.reason === 'multiple-record-representations'));
});

test('source byte changes with unchanged inspection metadata stop publication', async t => {
  const f = setup(t), original = f.snapshot();
  await assert.rejects(f.save({ inspect: () => {
    writeFileSync(f.path, readFileSync(f.path, 'utf8').replace('keyword', 'changed'));
    return original;
  } }), /content changed/);
  assert.deepEqual(listBundles(f.output), []);
});

test('an approved local attachment changed during final inspection stops publication', async t => {
  const f = setup(t), local = join(f.root, 'attachments'); mkdirSync(local);
  const path = join(local, 'image.png'); writeFileSync(path, 'before');
  writeFileSync(f.path, line(meta(id)) + line(msg('local', [{ type: 'local_image', path }])));
  await assert.rejects(f.save({ attachmentRoots: [local], inspect: () => {
    writeFileSync(path, 'after'); return f.snapshot();
  } }), /local attachment changed/);
  assert.deepEqual(listBundles(f.output), []);
});

test('coverage warnings are readable and metadata changes are detected', async t => {
  const f = setup(t);
  writeFileSync(f.path, line(meta(id)) + line(msg('Files mentioned by the user: example.pdf')));
  await f.save(); const [bundle] = listBundles(f.output), output = [];
  assert.equal(await runHistory(['check', '--in', f.output], { log: line => output.push(line) }), 3);
  assert.ok(output.some(line => line.includes('unverified-file-mention')));
  bundle.manifest.coverage.history = 'tampered';
  writeFileSync(join(bundle.folder, 'manifest.json'), JSON.stringify(bundle.manifest));
  assert.equal(await runHistory(['read', bundle.key, '--in', f.output], { log() {} }), 1);
});

test('streamed UTF-8 records retain exact line numbers and byte boundaries across chunks', async t => {
  const f = setup(t), first = line(msg('日本語'.repeat(40000))), second = line(msg('last'));
  writeFileSync(f.path, first + second);
  const records = [];
  for await (const record of jsonLines(f.path)) records.push({ line: record.line, end: record.end });
  assert.deepEqual(records, [{ line: 1, end: Buffer.byteLength(first) }, { line: 2, end: Buffer.byteLength(first + second) }]);
  await assert.rejects(async () => { for await (const record of jsonLines(f.path, { maxLine: 100 })) void record; }, /exceeds/);
});

test('search snippets include late matches and read-only result limits are explicit', async t => {
  const f = setup(t); writeFileSync(f.path, line(meta(id)) + line(msg('x'.repeat(2000) + 'NEEDLE' + 'y'.repeat(2000))));
  await f.save(); const output = [];
  assert.equal(await runHistory(['search', 'needle', '--in', f.output, '--json'], { log: line => output.push(line) }), 0);
  const result = JSON.parse(output[0]).results[0]; assert.match(result.text, /NEEDLE/); assert.ok(result.text.length <= 1202);
  assert.throws(() => parseHistoryArgs(['check', '--limit', '1']), /range/);
  assert.throws(() => parseHistoryArgs(['list', '--in', '--json']), /option/);
});

test('inherited history copies only the referenced byte prefix and remains portable', async t => {
  const f = setup(t);
  const prefix = line(meta(ancestor)) + line(msg('inherited keyword'));
  writeFileSync(join(f.home, 'sessions', `${ancestor}.jsonl`), prefix + line(msg('PRIVATE LATER SIBLING CONTENT')));
  writeFileSync(f.path, line(meta(id, { thread_id: ancestor, end_byte_offset: Buffer.byteLength(prefix), end_ordinal_exclusive: 2 })) + line(msg('own message')));
  const result = await f.save(); assert.equal(result.partial, false);
  const [bundle] = listBundles(f.output);
  const dependency = bundle.manifest.files.find(file => file.file.startsWith('dependencies/'));
  assert.equal(readFileSync(join(bundle.folder, dependency.file), 'utf8'), prefix);
  const text = readFileSync(join(bundle.folder, 'conversation.md'), 'utf8');
  assert.match(text, /inherited keyword/); assert.match(text, /own message/); assert.doesNotMatch(text, /PRIVATE LATER/);
  await verifyBundle(bundle);
});

test('missing dependencies are explicitly partial; cycles and split record boundaries fail closed', async t => {
  const f = setup(t);
  writeFileSync(f.path, line(meta(id, { thread_id: ancestor, end_byte_offset: 100, end_ordinal_exclusive: 2 })) + line(msg('partial')));
  assert.equal((await f.save()).partial, true);
  assert.equal(listBundles(f.output)[0].manifest.coverage.history, 'partial');
  writeFileSync(f.path, line(meta(id, { thread_id: id, end_byte_offset: 100, end_ordinal_exclusive: 2 })));
  await assert.rejects(f.save(), /cyclic/);
  writeFileSync(join(f.home, 'sessions', `${ancestor}.jsonl`), line(meta(ancestor)) + line(msg('source')));
  writeFileSync(f.path, line(meta(id, { thread_id: ancestor, end_byte_offset: 2, end_ordinal_exclusive: 2 })));
  await assert.rejects(f.save(), /splits a record/);
});

test('same content skips a verified snapshot; changed content gets a new immutable snapshot', async t => {
  const f = setup(t); const first = await f.save();
  const second = await f.save(); assert.equal(second.skipped.length, 1); assert.equal(second.folders.length, 0);
  assert.equal(listBundles(f.output).length, 1);
  writeFileSync(f.path, line(meta(id)) + line(msg('changed content')));
  assert.equal((await f.save()).folders.length, 1); assert.equal(listBundles(f.output).length, 2);
  assert.ok(readFileSync(join(first.folders[0], 'conversation.md'), 'utf8').includes('keyword'));
});

test('search, project filters and ranged read use only saved files and expose reference locations', async t => {
  const f = setup(t); await f.save(); const [bundle] = listBundles(f.output);
  rmSync(f.home, { recursive: true });
  const output = [], log = text => output.push(text);
  assert.equal(await runHistory(['search', 'KEYWORD', '--in', f.output, '--project', 'project-1', '--json'], { log }), 0);
  const search = JSON.parse(output.pop()); assert.equal(search.results.length, 1);
  const hit = search.results[0]; assert.equal(hit.key, bundle.key); assert.ok(hit.line > 1);
  assert.equal(await runHistory(['read', hit.key, '--in', f.output, '--from', String(hit.line), '--lines', '1', '--json'], { log }), 0);
  assert.match(JSON.parse(output.pop()).results[0].text, /keyword/);
  assert.equal(await runHistory(['projects', '--in', f.output, '--json'], { log }), 0);
  assert.equal(JSON.parse(output.pop()).results[0].project.id, 'project-1');
  assert.equal(await runHistory(['check', '--in', f.output], { log }), 0);
});

test('tampering stops reads and deduplication; manifest paths cannot escape the bundle', async t => {
  const f = setup(t); await f.save(); const [bundle] = listBundles(f.output);
  assert.throws(() => bundleFile(bundle.folder, '../source/private'), /Unsafe/);
  assert.throws(() => bundleFile(bundle.folder, 'C:/private'), /Unsafe/);
  writeFileSync(join(bundle.folder, 'conversation.md'), 'tampered');
  assert.equal(await runHistory(['read', bundle.key, '--in', f.output], { log() {} }), 1);
  await assert.rejects(f.save(), /integrity/);
});

test('config is a narrow file-only setting; a missing drive is never replaced with another directory', t => {
  const f = setup(t), config = join(f.root, 'settings', 'codex-session-export.json');
  assert.equal(readExportDirectory(config), null);
  writeExportDirectory(f.output, config); assert.equal(readExportDirectory(config), f.output);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(config))), ['schemaVersion', 'directory']);
  assert.throws(() => writeExportDirectory(join(f.root, 'missing-drive'), config));
  assert.equal(readExportDirectory(config), f.output);
  writeFileSync(config, '{"schemaVersion":99,"directory":"unknown"}');
  assert.throws(() => readExportDirectory(config), /Unsupported/);
});

test('unchanged destination settings do not rewrite the configuration', t => {
  const f = setup(t), config = join(f.root, 'config.json');
  assert.equal(writeExportDirectory(f.output, config), true);
  utimesSync(config, 1000000000, 1000000000);
  const before = statSync(config).mtimeMs;
  assert.equal(writeExportDirectory(f.output, config), false);
  assert.equal(statSync(config).mtimeMs, before);
  assert.throws(() => writeExportDirectory(f.output, config, 'stale'), /settings changed/);
});

test('destination changes cannot write a configuration larger than the reader accepts', t => {
  const f = setup(t), config = join(f.root, 'config.json');
  const settings = { schemaVersion: 1, directory: f.output, previousDirectories: [] };
  let original = JSON.stringify(settings);
  for (let i = 0; ; i++) {
    settings.previousDirectories.push(join(f.root, `old-${i}`));
    const text = JSON.stringify(settings);
    if (Buffer.byteLength(text) > 64 * 1024) break;
    original = text;
  }
  writeFileSync(config, original);
  assert.equal(readExportDirectory(config), f.output);
  const before = readdirSync(f.root);
  assert.throws(() => writeExportDirectory(f.root, config), /configuration exceeds/);
  assert.equal(readFileSync(config, 'utf8'), original);
  assert.deepEqual(readdirSync(f.root), before);
});

test('incomplete and v1 bundles are not advertised as complete v2 history', async t => {
  const f = setup(t);
  const legacy = join(f.output, 'old'); mkdirSync(legacy); writeFileSync(join(legacy, 'manifest.json'), JSON.stringify({ schemaVersion: 1, complete: true }));
  const partial = join(f.output, '.incomplete-test'); mkdirSync(partial); writeFileSync(join(partial, 'manifest.json'), JSON.stringify({ format: FORMAT, schemaVersion: 2, complete: true }));
  assert.deepEqual(listBundles(f.output), []);
  assert.throws(() => parseHistoryArgs(['read', '../other']), /snapshot key/);
  assert.throws(() => parseHistoryArgs(['search', 'x', '--lines', '1']), /range/);
  assert.throws(() => parseHistoryArgs(['list', '--limit', '0']), /option/);
});

test('malformed/truncated JSONL is never silently presented as a successful export', async t => {
  const f = setup(t); writeFileSync(f.path, '{"incomplete":true}');
  await assert.rejects(f.save(), /incomplete record/);
  assert.deepEqual(listBundles(f.output), []);
  writeFileSync(f.path, 'not json\n');
  await assert.rejects(async () => { for await (const record of jsonLines(f.path)) void record; });
});

test('destination changes remember previous roots, never move exports, and support reviewed options', async t => {
  const f = setup(t), next = join(f.root, 'next'), config = join(f.root, 'config.json'); mkdirSync(next);
  const previous = process.env.AGENT_CODEX_EXPORT_CONFIG;
  process.env.AGENT_CODEX_EXPORT_CONFIG = config;
  t.after(() => { if (previous === undefined) delete process.env.AGENT_CODEX_EXPORT_CONFIG; else process.env.AGENT_CODEX_EXPORT_CONFIG = previous; });
  writeExportDirectory(f.output);
  const { batch } = await f.save(), logs = [];
  const options = { interactive: false, log: line => logs.push(line), inspect: () => assert.fail(), cli: () => assert.fail(), ask: () => assert.fail() };
  assert.equal(await runSessions(['config', '--output', next, '--dry-run'], options), 0);
  assert.equal(readExportDirectory(), f.output);
  const token = logs.find(line => line.startsWith('Confirmation token: ')).split(': ')[1];
  assert.equal(await runSessions(['config', '--output', next, '--confirm', token], options), 0);
  assert.deepEqual(readExportSettings(), { directory: next, previousDirectories: [f.output] });
  assert.deepEqual(readdirSync(next), []); assert.equal(listBundles(f.output).length, 1);
  logs.length = 0;
  assert.equal(await runHistory(['batches', '--in', f.output, '--json'], { log: line => logs.push(line) }), 0);
  assert.equal(JSON.parse(logs[0]).results[0].id, batch.id);
  assert.equal(await runSessions(['config'], options), 0);
  const unchanged = readFileSync(config, 'utf8');
  assert.equal(await runSessions(['config', '--output', next, '--confirm', token], options), 1);
  assert.equal(readFileSync(config, 'utf8'), unchanged);
  assert.equal(await runSessions(['config'], { ...options, interactive: true, ask: async prompt => prompt.startsWith('Type ') ? 'SET EXPORT DIRECTORY' : '2' }), 0);
  assert.deepEqual(readExportSettings(), { directory: f.output, previousDirectories: [next] });
});

test('configuration can change when the old drive is unavailable and catches changes during confirmation', async t => {
  const f = setup(t), config = join(f.root, 'config.json');
  const previous = process.env.AGENT_CODEX_EXPORT_CONFIG;
  process.env.AGENT_CODEX_EXPORT_CONFIG = config;
  t.after(() => { if (previous === undefined) delete process.env.AGENT_CODEX_EXPORT_CONFIG; else process.env.AGENT_CODEX_EXPORT_CONFIG = previous; });
  const absent = join(f.root, 'absent');
  writeFileSync(config, JSON.stringify({ schemaVersion: 1, directory: absent }));
  assert.equal(await runSessions(['config', '--output', f.output], { interactive: true, log() {}, inspect: () => assert.fail(), ask: async () => 'SET EXPORT DIRECTORY' }), 0);
  assert.deepEqual(readExportSettings().previousDirectories, [absent]);
  assert.equal(await runSessions(['config', '--output', f.root], { interactive: true, log() {}, ask: async () => {
    writeFileSync(config, JSON.stringify({ schemaVersion: 1, directory: f.root })); return 'SET EXPORT DIRECTORY';
  } }), 1);
  assert.equal(readExportDirectory(), f.root);
});

test('unchanged exports create new receipts that reference existing immutable snapshots', async t => {
  const f = setup(t), first = await f.save(), second = await f.save();
  assert.notEqual(first.batch.id, second.batch.id);
  assert.deepEqual(first.batch.entries, second.batch.entries);
  assert.equal(listBundles(f.output).length, 1);
});
