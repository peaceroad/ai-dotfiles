import { test } from 'node:test';
import assert from 'node:assert/strict';
import childProcess, { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { syncBuiltinESMExports } from 'node:module';
import { PassThrough, Writable } from 'node:stream';
import fs, { cpSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, renameSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshot, editBundle, openStore, measuredCall, saveJson, readJson, readRecord, digest, applyBundle } from './records.mjs';
import { loadExperiment, callPlan, checkOutput, compareRows, improve } from './experiment.mjs';
import { createEventReader, codexArguments, codexInvoker } from './codex-adapter.mjs';
import { hostInvoker, readHostInput, hostInputSlice } from './host-adapter.mjs';
import { run, report, applyRecord, hostOperation } from './agent-eval.mjs';

function temp(t) {
  const root = mkdtempSync(join(tmpdir(), 'agent-eval-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
const budget = { maxCalls: 30, maxMs: 60000, callTimeoutMs: 1000 };
const completed = output => ({ status: 'completed', output, usage: { input_tokens: 10, output_tokens: 3 } });
const cases = () => [
  { id: 'primary', group: 'primary-family', split: 'explore', input: 'Return the requested primary result.', checks: [{ kind: 'json-equals', pointer: '/value', value: 'correct' }], calibration: [{ output: '{"value":"correct"}', pass: true }, { output: '{"value":"wrong"}', pass: false }] },
  { id: 'preserve', group: 'preserve-family', split: 'select', input: 'Preserve established behavior.', checks: [{ kind: 'json-equals', pointer: '/value', value: 'correct' }], calibration: [{ output: '{"value":"correct"}', pass: true }, { output: '', pass: false }] },
];
function fixture(root, overrides = {}) {
  for (const [name, content] of [['target', 'BASE'], ['method', 'METHOD'], ['candidate', 'BETTER']]) {
    mkdirSync(join(root, name)); writeFileSync(join(root, name, 'SKILL.md'), content);
  }
  return { schema: 1, mode: 'improve', goal: 'Improve the synthetic target without regressions.', target: { root: './target', files: ['SKILL.md'] },
    method: { root: './method', files: ['SKILL.md'] }, editable: ['SKILL.md'], budget, maxCandidates: 2, cases: cases(), runtime: { model: 'synthetic-test' }, ...overrides };
}
function fake() {
  let calls = 0;
  const prompts = [];
  const invoke = async req => {
    calls++; prompts.push(req.prompt);
    const data = JSON.parse(req.prompt.slice(req.prompt.lastIndexOf('\n') + 1));
    if (data.history) return completed(JSON.stringify({ action: data.history.length > 1 ? 'stop' : 'candidate', parent: data.history[0].hash,
      hypothesis: 'Synthetic behavior change.', edits: [{ path: 'SKILL.md', content: 'BETTER' }] }));
    if (data.skill) return completed(JSON.stringify({ value: data.task.includes('Preserve') || data.skill['SKILL.md'] === 'BETTER' ? 'correct' : 'wrong' }));
    return completed('{"pass":true,"evidence":"Synthetic judge"}');
  };
  return { invoke, prompts, get calls() { return calls; } };
}

function mockCodex(t, respond) {
  const version = t.mock.method(childProcess, 'spawnSync', (binary, args) => {
    assert.equal(binary, process.execPath); assert.deepEqual(args, ['--version']);
    return { status: 0, stdout: 'synthetic-codex-test\n' };
  });
  const spawn = t.mock.method(childProcess, 'spawn', (binary, args) => {
    assert.equal(binary, process.execPath); assert.equal(args[0], 'exec');
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.unref = () => {};
    let prompt = '';
    child.stdin = new Writable({
      write(chunk, encoding, done) { prompt += chunk.toString(); done(); },
      final(done) {
        queueMicrotask(() => {
          const response = respond(prompt);
          for (const chunk of response.chunks || []) child.stdout.write(chunk);
          if (response.error) child.emit('error', new Error(response.error));
          else child.emit('close', response.code ?? 0, null);
        });
        done();
      },
    });
    return child;
  });
  syncBuiltinESMExports();
  t.after(() => { spawn.mock.restore(); version.mock.restore(); syncBuiltinESMExports(); });
}

const cliMessage = text => ({ type: 'item.completed', item: { type: 'agent_message', text } });
const cliTurn = { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
const cliChunks = events => [Buffer.from(events.map(JSON.stringify).join('\n'))];

test('CLI commands execute through a linked script directory as well as the source', t => {
  const root = temp(t), source = fileURLToPath(new URL('.', import.meta.url)), linked = join(root, 'linked-scripts');
  symlinkSync(source, linked, process.platform === 'win32' ? 'junction' : 'dir');
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  for (const directory of [source, linked]) {
    const help = spawnSync(process.execPath, [join(directory, 'agent-eval.mjs'), '--help'], { encoding: 'utf8', env });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /^Agent Eval/);
    const capabilities = spawnSync(process.execPath, [join(directory, 'agent-eval.mjs'), 'capabilities'], { encoding: 'utf8', env });
    assert.equal(capabilities.status, 0, capabilities.stderr);
    assert.deepEqual(Object.keys(JSON.parse(capabilities.stdout)), ['host', 'codex-cli']);
  }
});

test('bundle content is frozen and traversal and undeclared/executable edits are refused', t => {
  const root = temp(t); fixture(root);
  const initial = snapshot({ root: 'target', files: ['SKILL.md'] }, root);
  writeFileSync(join(root, 'target', 'SKILL.md'), 'CHANGED');
  assert.equal(initial.files['SKILL.md'], 'BASE');
  assert.throws(() => snapshot({ root: 'target', files: ['../method/SKILL.md'] }, root), /relative/);
  assert.throws(() => editBundle(initial, [{ path: 'other.md', content: 'x' }], ['SKILL.md']), /declared/);
  assert.throws(() => editBundle({ files: { 'script.mjs': 'x' } }, [{ path: 'script.mjs', content: 'y' }], ['script.mjs']), /executable/);
});

test('bundle snapshots retain declared filenames that also name object properties', t => {
  const root = temp(t);
  for (const name of ['__proto__', 'constructor', 'SKILL.md']) writeFileSync(join(root, name), name);
  const bundle = snapshot({ root, files: ['__proto__', 'constructor', 'SKILL.md'] });
  const saved = JSON.parse(JSON.stringify(bundle));
  assert.deepEqual(Object.keys(saved.files).sort(), ['SKILL.md', '__proto__', 'constructor']);
  assert.equal(saved.files.__proto__, '__proto__');
  writeFileSync(join(root, '__proto__'), 'CHANGED');
  assert.notEqual(snapshot({ root, files: ['__proto__', 'constructor', 'SKILL.md'] }).hash, bundle.hash);
});

test('Unicode replacement validation rejects isolated surrogates', () => {
  const parent = { files: { 'SKILL.md': 'BASE' } };
  for (const content of ['\ud800', '\udfff', '\ud800\ud800', '\udfff\ud800', '\ud800X\udc00']) {
    assert.throws(() => editBundle(parent, [{ path: 'SKILL.md', content }], ['SKILL.md']), /Invalid replacement text/);
  }
});

test('BOM snapshots preserve leading and interior text without weakening UTF-8 validation', t => {
  const root = temp(t), path = join(root, 'SKILL.md');
  for (const content of ['\ufeffBASE', '\ufeff\ufeffBASE', 'before\ufeffafter 🧪']) {
    writeFileSync(path, content);
    const bundle = snapshot({ root, files: ['SKILL.md'] });
    assert.equal(bundle.files['SKILL.md'], content);
    assert.equal(bundle.hash, digest({ 'SKILL.md': content }));
  }
  for (const bytes of [Buffer.from([0xc0, 0xaf]), Buffer.from([0xef, 0xbb, 0xbf, 0xff]), Buffer.from('a\0b'), Buffer.alloc(512 * 1024 + 1, 97)]) {
    writeFileSync(path, bytes);
    assert.throws(() => snapshot({ root, files: ['SKILL.md'] }));
  }
});

test('Unicode invalid generated proposals stay unaccepted and are never evaluated', async t => {
  for (const content of ['\ud800', '\udfff']) {
    const root = temp(t), config = fixture(root, { maxCandidates: 1 }), file = join(root, 'experiment.json'), out = join(root, 'out');
    saveJson(file, config);
    let targetCalls = 0, invalidTargetCalls = 0;
    const result = await run(file, out, () => ({ identity: { synthetic: true }, invoke: async request => {
      const data = JSON.parse(request.prompt.split('\n').at(-1));
      if (data.history) return completed(JSON.stringify({ action: 'candidate', parent: data.history[0].hash,
        hypothesis: 'Synthetic malformed Unicode.', edits: [{ path: 'SKILL.md', content }] }));
      targetCalls++;
      if (data.skill['SKILL.md'] !== 'BASE') invalidTargetCalls++;
      return completed('{"value":"correct"}');
    } }));
    const record = readRecord(out);
    assert.equal(result.outcome, 'inconclusive'); assert.equal(result.stopReason, 'invalid-proposals');
    assert.equal(result.selectedHash, record.contract.experiment.target.hash);
    assert.equal(targetCalls, config.cases.length); assert.equal(invalidTargetCalls, 0);
    assert.equal(record.candidates.length, 0);
    assert.equal(record.decisions.filter(d => d.status === 'invalid-candidate').length, 1);
    assert.equal(readFileSync(join(root, 'target', 'SKILL.md'), 'utf8'), 'BASE');
  }
});

test('records reject repositories, simultaneous writers, and changed contracts', t => {
  const root = temp(t), output = join(root, 'records');
  mkdirSync(join(root, 'repo', '.git'), { recursive: true });
  writeFileSync(join(root, 'repo', '.git', 'HEAD'), 'ref: refs/heads/main\n');
  assert.throws(() => openStore(join(root, 'repo', 'ignored'), {}), /outside/);
  const store = openStore(output, { fixed: true });
  assert.throws(() => openStore(output, { fixed: true }), /locked/);
  store.close();
  assert.throws(() => openStore(output, { fixed: false }), /changed/);
  assert.equal(existsSync(join(output, 'run.lock')), false);
});

test('empty Git placeholders do not block private output or hide repository ancestors', t => {
  const root = temp(t), output = join(root, 'private', 'records');
  mkdirSync(join(root, '.git'));
  const store = openStore(output, { fixed: true }); store.close();
  const saved = readFileSync(join(output, 'record.json'), 'utf8');
  mkdirSync(join(root, 'private', '.git'));
  writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  assert.throws(() => openStore(output, { fixed: true }), /outside/);
  assert.equal(readFileSync(join(output, 'record.json'), 'utf8'), saved);
  assert.equal(existsSync(join(output, 'run.lock')), false);
});

test('gitfiles and symlinked repository locations remain refused', t => {
  const root = temp(t), repository = join(root, 'repository');
  mkdirSync(repository);
  writeFileSync(join(repository, '.git'), 'gitdir: ../main/.git/worktrees/example\n');
  assert.throws(() => openStore(join(repository, 'ignored'), {}), /outside/);
  const link = join(root, 'linked');
  symlinkSync(repository, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => openStore(join(link, 'ignored'), {}), /outside/);
  assert.equal(existsSync(join(repository, 'ignored')), false);
});

test('retained records can be read without their original source and reject a changed frozen contract', async t => {
  const root = temp(t), config = fixture(root); config.cases[1].split = 'explore';
  const configFile = join(root, 'experiment.json'), output = join(root, 'out'), retained = join(root, 'retained');
  saveJson(configFile, config);
  const adapter = fake(), first = await run(configFile, output, () => ({ identity: { test: true }, invoke: adapter.invoke }));
  cpSync(output, retained, { recursive: true, errorOnExist: true, force: false });
  assert.equal(readFileSync(join(retained, 'record.json'), 'utf8'), readFileSync(join(output, 'record.json'), 'utf8'));
  renameSync(join(root, 'target'), join(root, 'target-unavailable'));
  renameSync(join(root, 'method'), join(root, 'method-unavailable'));
  assert.deepEqual(report(readRecord(retained)), first);
  const state = readRecord(retained);
  assert.equal(state.contractHash, digest(state.contract));
  assert.equal(state.contract.experiment.target.files['SKILL.md'], 'BASE');
  state.contract.experiment.goal = 'CHANGED'; saveJson(join(retained, 'record.json'), state);
  assert.throws(() => readRecord(retained), /hash changed/);
  assert.throws(() => openStore(retained, readRecord(output).contract), /hash changed/);
  assert.equal(existsSync(join(retained, 'run.lock')), false);
});

test('failed atomic replacement preserves the existing destination and removes its temporary sibling', t => {
  const root = temp(t), destination = join(root, 'blocked.json');
  mkdirSync(destination); writeFileSync(join(destination, 'keep.txt'), 'KEEP');
  assert.throws(() => saveJson(destination, { result: 'never-published' }));
  assert.deepEqual(readdirSync(root), ['blocked.json']);
  assert.equal(readFileSync(join(destination, 'keep.txt'), 'utf8'), 'KEEP');
});

test('save failures do not dispatch unrecorded work or silently repeat a completed execution', async t => {
  const root = temp(t), output = join(root, 'out'); let calls = 0;
  const failure = () => { throw new Error('Synthetic storage failure'); };
  let store = openStore(output, { fixed: true });
  store.save = failure;
  await assert.rejects(measuredCall(store, 'unreserved', 'target', { prompt: 'task' }, async () => { calls++; return completed('ok'); }, budget), /storage failure/);
  assert.equal(calls, 0); assert.equal(readRecord(output).trials.length, 0); store.close();
  store = openStore(output, { fixed: true });
  await assert.rejects(measuredCall(store, 'reserved', 'target', { prompt: 'task' }, async () => {
    calls++; store.save = failure; return completed('ok');
  }, budget), /storage failure/);
  assert.equal(calls, 1); assert.equal(readRecord(output).trials[0].status, 'running'); store.close();
  store = openStore(output, { fixed: true });
  assert.equal(store.state.trials[0].status, 'interrupted');
  const result = await measuredCall(store, 'next', 'target', { prompt: 'next' }, async () => { calls++; return completed('ok'); }, budget);
  assert.equal(result.status, 'budget_stopped'); assert.equal(calls, 1); store.close();
});

test('trial reservations survive interruption and completed calls are not repeated', async t => {
  const root = temp(t); let now = 0, count = 0;
  let store = openStore(join(root, 'record'), {}, { now: () => now });
  const invoke = async () => { count++; return completed('ok'); };
  const req = { prompt: 'task' };
  await measuredCall(store, 'one', 'target', req, invoke, budget);
  await measuredCall(store, 'one', 'target', req, invoke, budget);
  assert.equal(count, 1);
  await assert.rejects(measuredCall(store, 'one', 'target', { prompt: 'other' }, invoke, budget), /different/);
  store.state.trials.push({ key: 'pending', status: 'running', attempted: true }); store.save(); store.close();
  store = openStore(join(root, 'record'), {}, { now: () => now });
  const next = await measuredCall(store, 'two', 'target', req, invoke, budget);
  assert.equal(next.status, 'budget_stopped'); assert.equal(count, 1);
  assert.equal(store.state.trials[1].status, 'interrupted'); store.close();
});

test('time, call and unknown-token budgets stop before further paid work', async t => {
  const root = temp(t); let now = 0;
  const store = openStore(root, {}, { now: () => now });
  const unknown = async () => ({ status: 'runtime_error', reason: 'No usage available.' });
  await measuredCall(store, 'a', 'generator', { prompt: 'a' }, unknown, budget);
  const b = await measuredCall(store, 'b', 'judge', { prompt: 'b' }, unknown, { ...budget, maxTokens: 100 });
  assert.equal(b.status, 'budget_stopped');
  now = 70000;
  const c = await measuredCall(store, 'c', 'target', { prompt: 'c' }, unknown, budget);
  assert.equal(c.status, 'budget_stopped'); store.close();
});

test('calibration includes alternatives and rejects an invalid grader before target execution', async t => {
  const root = temp(t), config = fixture(root);
  config.cases[0].calibration.push({ output: '{"value":"correct","extra":1}', pass: true });
  let spec = loadExperiment(config, root);
  const store = openStore(join(root, 'records'), { spec });
  const adapter = fake();
  spec.cases[0].calibration[0].pass = false;
  const result = await improve(store, 'main', spec, adapter.invoke);
  assert.equal(result.status, 'evaluation-invalid'); assert.equal(adapter.calls, 0); store.close();
  assert.equal(checkOutput('{"nested":{"a/b":2}}', [{ kind: 'json-equals', pointer: '/nested/a~1b', value: 2 }])[0].pass, true);
});

test('bad split groups and budgets fail validation without executing', t => {
  const root = temp(t), config = fixture(root);
  config.cases[1].group = config.cases[0].group;
  assert.throws(() => loadExperiment(config, root), /cross splits/);
  config.cases[1].group = 'other'; config.budget = { ...budget, maxCalls: 0 };
  assert.throws(() => loadExperiment(config, root), /positive/);
});

test('deterministic checks resolve JSON values rather than JavaScript properties', t => {
  const output = '{"rows":["ok"],"a/b":{"~key":null},"":false,"length":7,"01":"object key"}';
  const checks = [
    { kind: 'json-equals', pointer: '/rows/0', value: 'ok' },
    { kind: 'json-equals', pointer: '/a~1b/~0key', value: null },
    { kind: 'json-equals', pointer: '/', value: false },
    { kind: 'json-equals', pointer: '/length', value: 7 },
    { kind: 'json-equals', pointer: '/01', value: 'object key' },
    { kind: 'json-equals', pointer: '/rows/length', value: 1 },
    { kind: 'json-equals', pointer: '/rows/0/0', value: 'o' },
    { kind: 'json-equals', pointer: '/rows/01', value: 'ok' },
    { kind: 'json-equals', pointer: '/missing', value: null },
  ];
  assert.deepEqual(checkOutput(output, checks).map(r => r.pass), [true, true, true, true, true, false, false, false, false]);
  for (const value of [null, false, 0, 'ok', [], { nested: true }]) {
    assert.equal(checkOutput(JSON.stringify(value), [{ kind: 'json-equals', pointer: '', value }])[0].pass, true);
  }
  const mixed = [checks[0], { kind: 'includes', value: 'bad' }, checks[1], { kind: 'excludes', value: 'ok' }];
  assert.deepEqual(checkOutput('bad JSON', mixed).map(r => r.pass), [false, true, false, true]);
  assert.deepEqual(checkOutput('字🧪', [{ kind: 'max-chars', value: 1 }, { kind: 'max-chars', value: 2 }]).map(r => r.pass), [false, true]);
  const root = temp(t), config = fixture(root);
  for (const pointer of ['/bad~2key', '/bad~']) {
    config.cases[0].checks[0].pointer = pointer;
    assert.throws(() => loadExperiment(config, root), /JSON pointer/);
  }
});

test('deep JSON equality completes without recursive stack exhaustion', () => {
  const output = '['.repeat(6000) + '{"value":0,"nested":{"a/b":true}}' + ']'.repeat(6000);
  const expected = JSON.parse('['.repeat(6000) + '{"nested":{"a/b":true},"value":0}' + ']'.repeat(6000));
  assert.equal(checkOutput(output, [{ kind: 'json-equals', pointer: '', value: expected }])[0].pass, true);
  assert.equal(checkOutput(output.replace('"value":0', '"value":1'), [{ kind: 'json-equals', pointer: '', value: expected }])[0].pass, false);
  assert.equal(checkOutput('{"value":[0]}', [{ kind: 'json-equals', pointer: '', value: { value: { 0: 0 } } }])[0].pass, false);
});

test('search records generator separately, accepts a supported candidate, and preserves method/source', async t => {
  const root = temp(t), config = fixture(root);
  // Both development cases select here so improvement is observable in this fixture.
  config.cases[1].split = 'explore';
  const spec = loadExperiment(config, root), store = openStore(join(root, 'records'), { spec });
  const adapter = fake();
  const result = await improve(store, 'main', spec, adapter.invoke);
  assert.equal(result.status, 'accept'); assert.equal(result.bundle.files['SKILL.md'], 'BETTER');
  assert.equal(readFileSync(join(root, 'target', 'SKILL.md'), 'utf8'), 'BASE');
  assert.equal(readFileSync(join(root, 'method', 'SKILL.md'), 'utf8'), 'METHOD');
  assert.ok(store.state.trials.some(r => r.role === 'generator'));
  assert.equal(store.state.candidates[0].generator, spec.method.hash);
  assert.equal(store.state.observations.length, 0);
  const before = adapter.calls;
  await improve(store, 'main', spec, adapter.invoke);
  assert.equal(adapter.calls, before); store.close();
});

test('selection ties retain current and critical regressions cannot be offset', async t => {
  const a = [{ id: 'a', repeat: 0, status: 'graded', score: 0 }, { id: 'b', repeat: 0, status: 'graded', score: 1 }];
  assert.equal(compareRows(a, a), 'retain');
  assert.equal(compareRows(a, [{ ...a[0], score: 1 }, { ...a[1], score: 0 }]), 'reject');
  assert.equal(compareRows(a, [{ ...a[0], status: 'runtime_error' }, a[1]]), 'inconclusive');
  const root = temp(t), config = fixture(root), spec = loadExperiment(config, root), store = openStore(join(root, 'record'), { spec });
  const result = await improve(store, 'main', spec, fake().invoke);
  assert.equal(result.status, 'retain'); store.close();
});

test('failed executions remain ungraded and cannot be adopted', async t => {
  const root = temp(t), config = fixture(root), spec = loadExperiment(config, root), store = openStore(join(root, 'record'), { spec });
  const result = await improve(store, 'main', spec, async () => ({ status: 'runtime_error', reason: 'Synthetic transport outage.' }));
  assert.equal(result.status, 'inconclusive'); assert.equal(store.state.candidates.length, 0);
  assert.ok(store.state.trials.every(t => t.status === 'runtime_error')); store.close();
});

test('runner resumes the same contract, applies and restores only an accepted bundle', async t => {
  const root = temp(t), config = fixture(root); config.cases[1].split = 'explore';
  const configFile = join(root, 'experiment.json'), out = join(root, 'out'); saveJson(configFile, config);
  const adapter = fake(), factory = () => ({ identity: { test: true }, invoke: adapter.invoke });
  const first = await run(configFile, out, factory), count = adapter.calls;
  assert.equal(first.outcome, 'accept');
  await run(configFile, out, factory); assert.equal(adapter.calls, count);
  const applied = applyRecord(out, join(root, 'target'));
  assert.equal(applied.status, 'source-applied');
  writeFileSync(join(root, 'target', 'unrelated.txt'), 'KEEP');
  assert.equal(applyRecord(out, join(root, 'target'), true).status, 'source-restored');
  assert.equal(readFileSync(join(root, 'target', 'SKILL.md'), 'utf8'), 'BASE');
  assert.equal(readFileSync(join(root, 'target', 'unrelated.txt'), 'utf8'), 'KEEP');
});

test('source conflicts are detected before writing and external edits are retained', t => {
  const root = temp(t); fixture(root);
  const start = snapshot({ root: 'target', files: ['SKILL.md'] }, root);
  const next = editBundle(start, [{ path: 'SKILL.md', content: 'BETTER' }], ['SKILL.md']);
  writeFileSync(join(root, 'target', 'SKILL.md'), 'USER CHANGE');
  assert.throws(() => applyBundle(join(root, 'target'), start, next), /Intervening/);
  assert.equal(readFileSync(join(root, 'target', 'SKILL.md'), 'utf8'), 'USER CHANGE');
});

test('Unicode source conflicts preserve invalid UTF-8 bytes before any replacement', t => {
  const root = temp(t), first = join(root, 'SKILL.md'), other = join(root, 'other.md');
  writeFileSync(first, 'BASE'); writeFileSync(other, '\ufffd');
  const baseline = snapshot({ root, files: ['SKILL.md', 'other.md'] });
  const candidate = editBundle(baseline, [{ path: 'SKILL.md', content: 'BETTER' }], ['SKILL.md']);
  const external = Buffer.from([0xff]);
  writeFileSync(other, external);
  assert.throws(() => applyBundle(root, baseline, candidate), /Intervening edit/);
  assert.equal(readFileSync(first, 'utf8'), 'BASE');
  assert.deepEqual(readFileSync(other), external);
});

test('Unicode source conflicts are rechecked as bytes immediately before replacement', t => {
  const root = temp(t), file = join(root, 'SKILL.md');
  writeFileSync(file, '\ufffd');
  const baseline = snapshot({ root, files: ['SKILL.md'] });
  const candidate = editBundle(baseline, [{ path: 'SKILL.md', content: 'BETTER' }], ['SKILL.md']);
  const external = Buffer.from([0xff]), read = fs.readFileSync;
  let reads = 0;
  const reader = t.mock.method(fs, 'readFileSync', (path, ...args) => {
    if (path === file && ++reads === 2) writeFileSync(file, external);
    return read(path, ...args);
  });
  syncBuiltinESMExports();
  t.after(() => { reader.mock.restore(); syncBuiltinESMExports(); });
  assert.throws(() => applyBundle(root, baseline, candidate), /Concurrent edit/);
  assert.deepEqual(read(file), external);
});

test('Unicode failure recovery restores only byte-identical candidate content', async t => {
  for (const changedExternally of [false, true]) await t.test(changedExternally ? 'preserve-external-bytes' : 'restore-original-bytes', t => {
    const root = temp(t), first = join(root, 'SKILL.md'), second = join(root, 'other.md');
    const original = Buffer.from('\ufeffBASE\r\n'), external = Buffer.from([0xff]);
    writeFileSync(first, original); writeFileSync(second, 'KEEP');
    const baseline = snapshot({ root, files: ['SKILL.md', 'other.md'] });
    const candidate = editBundle(baseline, [{ path: 'SKILL.md', content: '\ufffd' }, { path: 'other.md', content: 'BETTER' }], ['SKILL.md', 'other.md']);
    const rename = fs.renameSync;
    const renamer = t.mock.method(fs, 'renameSync', (from, to) => {
      if (to === second) {
        if (changedExternally) writeFileSync(first, external);
        throw new Error('Synthetic later replacement failure.');
      }
      return rename(from, to);
    });
    syncBuiltinESMExports();
    t.after(() => { renamer.mock.restore(); syncBuiltinESMExports(); });
    assert.throws(() => applyBundle(root, baseline, candidate), /Synthetic later replacement failure/);
    assert.deepEqual(readFileSync(first), changedExternally ? external : original);
    assert.equal(readFileSync(second, 'utf8'), 'KEEP');
    assert.deepEqual(readdirSync(root).sort(), ['SKILL.md', 'other.md']);
  });
});

test('Unicode application preflights every replacement before writing any file', t => {
  const root = temp(t);
  writeFileSync(join(root, 'SKILL.md'), 'BASE'); writeFileSync(join(root, 'other.md'), 'KEEP');
  const baseline = snapshot({ root, files: ['SKILL.md', 'other.md'] });
  const files = { 'SKILL.md': 'BETTER', 'other.md': '\ud800' };
  const writes = t.mock.method(fs, 'writeFileSync');
  syncBuiltinESMExports();
  t.after(() => { writes.mock.restore(); syncBuiltinESMExports(); });
  assert.throws(() => applyBundle(root, baseline, { files, hash: digest(files) }), /Invalid replacement text/);
  assert.equal(writes.mock.callCount(), 0);
  assert.equal(readFileSync(join(root, 'SKILL.md'), 'utf8'), 'BASE');
  assert.equal(readFileSync(join(root, 'other.md'), 'utf8'), 'KEEP');
  assert.deepEqual(readdirSync(root).sort(), ['SKILL.md', 'other.md']);
});

test('Unicode malformed candidates retained by an older controller cannot be applied', async t => {
  const root = temp(t), config = fixture(root); config.cases[1].split = 'explore';
  const file = join(root, 'experiment.json'), out = join(root, 'out'); saveJson(file, config);
  const adapter = fake(); await run(file, out, () => ({ identity: { synthetic: true }, invoke: adapter.invoke }));
  const record = readRecord(out), final = record.decisions.findLast(d => d.prefix === 'main' && d.final);
  // A synthetic legacy record bypasses the new proposal validator, as existing records do.
  final.bundle.files['SKILL.md'] = '\udfff';
  final.bundle.hash = digest(final.bundle.files); final.selectedHash = final.bundle.hash;
  saveJson(join(out, 'record.json'), record);
  assert.throws(() => applyRecord(out, join(root, 'target')), /Invalid replacement text/);
  assert.equal(readFileSync(join(root, 'target', 'SKILL.md'), 'utf8'), 'BASE');
  assert.equal(readRecord(out).application.status, 'application-needs-inspection');
});

test('Unicode valid replacements keep their hash through application and rollback', t => {
  const root = temp(t), path = join(root, 'SKILL.md'); writeFileSync(path, 'BASE\r\n');
  const original = readFileSync(path), baseline = snapshot({ root, files: ['SKILL.md'] });
  for (const content of ['', '日本語 🧪 𠮷 \u{10000} \u{10ffff}', 'literal \\ud800', '\ufffd', 'e\u0301 / é', 'a\r\nb\rc\n']) {
    const candidate = editBundle(baseline, [{ path: 'SKILL.md', content }], ['SKILL.md']);
    applyBundle(root, baseline, candidate);
    assert.deepEqual(readFileSync(path), Buffer.from(content.replace(/\r\n?/g, '\n')));
    assert.equal(snapshot({ root, files: ['SKILL.md'] }).hash, candidate.hash);
    applyBundle(root, candidate, baseline); assert.deepEqual(readFileSync(path), original);
  }
});

test('BOM generated and supplied candidates keep identity through apply and rollback', async t => {
  for (const generated of [false, true]) for (const baselineBOM of [false, true]) for (const candidateBOM of [false, true]) {
    await t.test([generated ? 'generated' : 'supplied', baselineBOM, candidateBOM].join('-'), async t => {
      const root = temp(t), config = fixture(root, { mode: generated ? 'improve' : 'compare', maxCandidates: 1 });
      config.cases[1].split = 'explore';
      if (!generated) config.candidates = [{ root: './candidate', files: ['SKILL.md'] }];
      const baseline = (baselineBOM ? '\ufeff' : '') + 'BASE\r\n';
      const candidate = (candidateBOM ? '\ufeff' : '') + 'BETTER\ufeff🧪\n';
      const source = join(root, 'target', 'SKILL.md');
      writeFileSync(source, baseline); writeFileSync(join(root, 'candidate', 'SKILL.md'), candidate);
      const original = readFileSync(source), file = join(root, 'experiment.json'), out = join(root, 'out');
      saveJson(file, config);
      const result = await run(file, out, () => ({ identity: { synthetic: true }, invoke: async request => {
        const data = JSON.parse(request.prompt.split('\n').at(-1));
        if (data.history) return completed(JSON.stringify({ action: 'candidate', parent: data.history[0].hash,
          hypothesis: 'Synthetic BOM preservation.', edits: [{ path: 'SKILL.md', content: candidate }] }));
        return completed(JSON.stringify({ value: data.skill['SKILL.md'] === baseline ? 'wrong' : 'correct' }));
      } }));
      assert.equal(result.outcome, 'accept');
      assert.equal(applyRecord(out, join(root, 'target')).status, 'source-applied');
      assert.deepEqual(readFileSync(source), Buffer.from(candidate));
      assert.equal(snapshot({ root: join(root, 'target'), files: ['SKILL.md'] }).hash, result.selectedHash);
      assert.equal(applyRecord(out, join(root, 'target'), true).status, 'source-restored');
      assert.deepEqual(readFileSync(source), original);
    });
  }
});

test('adapter records terminal events without retaining reasoning or claiming observed model', () => {
  const reader = createEventReader();
  const records = [
    { type: 'thread.started', thread_id: 'synthetic' },
    { type: 'item.completed', item: { type: 'reasoning', text: 'PRIVATE-REASONING' } },
    { type: 'item.completed', item: { type: 'agent_message', text: 'answer' } },
    { type: 'turn.completed', usage: { input_tokens: 7, output_tokens: 2 } },
  ].map(JSON.stringify).join('\n');
  reader.push(records.slice(0, 40)); reader.push(records.slice(40));
  const out = reader.finish();
  assert.equal(out.output, 'answer'); assert.equal(out.completed, true); assert.equal(out.observedModel, null);
  assert.equal(JSON.stringify(out).includes('PRIVATE-REASONING'), false);
  const args = codexArguments({ model: 'synthetic', reasoningEffort: 'medium' }, 'workspace', 'schema.json');
  assert.ok(args.includes('read-only')); assert.ok(args.includes('approval_policy="never"'));
  assert.ok(!args.some(x => x.includes('bypass') || x === '--ignore-rules'));
});

test('CLI event framing preserves results across arbitrary chunks and unterminated lines', () => {
  const answer = '日本語 🧪\nquoted "text" and \\escape'.repeat(2048);
  const events = [
    '', ' \t', JSON.stringify({ type: 'thread.started', thread_id: 'synthetic' }),
    JSON.stringify(cliMessage('earlier')), 'not-json', JSON.stringify(cliMessage(answer)),
    JSON.stringify(cliTurn),
  ];
  for (const ending of ['\n', '\r\n']) for (const trailing of ['', ending]) {
    const text = events.join(ending) + trailing;
    for (const size of [1, 7, 4096, text.length]) {
      const reader = createEventReader();
      reader.push('');
      for (let offset = 0; offset < text.length; offset += size) reader.push(text.slice(offset, offset + size));
      reader.push('');
      assert.deepEqual(reader.finish(), {
        output: answer, usage: cliTurn.usage, threadId: 'synthetic', completed: true,
        errors: [], eventTypes: ['thread.started', 'item.completed', 'turn.completed'],
        toolActivity: false, observedModel: null, invalidLines: 1,
      });
    }
  }
});

test('malformed CLI events stay unscorable and a failed turn cannot become successful', () => {
  const reader = createEventReader();
  const malformed = [null, [], 1, {}, { type: 4 }, { type: 'item.completed', item: { type: 'agent_message', text: { answer: 'wrong type' } } }];
  for (const event of malformed) reader.push(`${JSON.stringify(event)}\n`);
  reader.push('not-json\n');
  reader.push('{"type":"item.completed","item":{"type":"agent_message","text":"answer"}}\n');
  reader.push('{"type":"turn.failed","error":{"message":"Synthetic failure."}}\n');
  reader.push('{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}\n');
  const result = reader.finish();
  assert.equal(result.invalidLines, malformed.length + 1);
  assert.equal(result.output, 'answer');
  assert.equal(result.completed, false);
  assert.deepEqual(result.errors, ['Synthetic failure.']);
});

test('CLI final response status uses actual invoker events, including empty and absent messages', async t => {
  const root = temp(t); let response;
  mockCodex(t, () => response);
  const adapter = codexInvoker({ model: 'synthetic-test', binary: process.execPath }, root);
  const reasoning = { type: 'item.completed', item: { type: 'reasoning', text: 'PRIVATE-REASONING' } };
  for (const [name, events, status, output, extra = {}] of [
    ['absent', [cliTurn], 'runtime_error', null],
    ['reasoning-only', [reasoning, cliTurn], 'runtime_error', null],
    ['empty', [cliMessage(''), cliTurn], 'completed', ''],
    ['whitespace', [cliMessage(' '), cliTurn], 'completed', ' '],
    ['normal', [cliMessage('日本語 🧪'), cliTurn], 'completed', '日本語 🧪'],
    ['missing-completion', [cliMessage('OK')], 'runtime_error', 'OK'],
    ['invalid-text', [cliMessage(null), cliTurn], 'runtime_error', null],
    ['failed-turn', [cliMessage('OK'), { type: 'turn.failed', error: { message: 'Failed.' } }, cliTurn], 'runtime_error', 'OK'],
    ['tool-activity', [{ type: 'item.completed', item: { type: 'command_execution' } }, cliMessage('OK'), cliTurn], 'unsupported', 'OK'],
    ['nonzero-exit', [cliMessage('OK'), cliTurn], 'runtime_error', 'OK', { code: 1 }],
    ['process-error', [], 'runtime_error', null, { error: 'Synthetic process error.' }],
  ]) {
    const bytes = cliChunks(events)[0];
    response = { chunks: Array.from(bytes, byte => Buffer.from([byte])), ...extra };
    const result = await adapter.invoke({ prompt: 'Synthetic task.', timeoutMs: 1000 });
    assert.equal(result.status, status, name); assert.equal(result.output, output, name);
    assert.equal(JSON.stringify(result).includes('PRIVATE-REASONING'), false);
    if (name === 'absent' || name === 'reasoning-only') assert.match(result.reason, /final.*message/i);
  }
});

test('CLI missing answers cannot win negative-only checks while explicit empty answers stay scorable', async t => {
  let candidateText;
  mockCodex(t, prompt => {
    const data = JSON.parse(prompt.split('\n').at(-1));
    return { chunks: cliChunks(data.skill['SKILL.md'] === 'BASE' ? [cliMessage('BAD'), cliTurn]
      : candidateText === null ? [cliTurn] : [cliMessage(candidateText), cliTurn]) };
  });
  for (const text of [null, '']) {
    candidateText = text;
    const root = temp(t), config = fixture(root, {
      mode: 'compare', candidates: [{ root: './candidate', files: ['SKILL.md'] }],
      runtime: { model: 'synthetic-test', binary: process.execPath },
      cases: [{ id: 'short-answer', group: 'answer-family', split: 'explore', input: 'Give a short answer without BAD.',
        checks: [{ kind: 'excludes', value: 'BAD' }, { kind: 'max-chars', value: 20 }],
        calibration: [{ output: 'OK', pass: true }, { output: 'BAD', pass: false }] }],
    });
    const file = join(root, 'experiment.json'), out = join(root, 'out'); saveJson(file, config);
    const result = await run(file, out);
    const record = readRecord(out), final = record.decisions.findLast(d => d.prefix === 'main' && d.final);
    assert.equal(result.outcome, text === null ? 'inconclusive' : 'accept');
    const candidate = record.trials.find(trial => JSON.parse(trial.request.prompt.split('\n').at(-1)).skill['SKILL.md'] === 'BETTER');
    assert.equal(candidate.status, text === null ? 'runtime_error' : 'completed'); assert.equal(candidate.output, text);
    if (text === null) {
      assert.equal(result.selectedHash, record.contract.experiment.target.hash);
      const row = record.candidates[0].rows[0];
      assert.equal(row.status, 'runtime_error'); assert.equal(row.score, null); assert.equal(row.checks, undefined);
      assert.ok(final.selected.every(row => row.score === 0));
    }
  }
});

test('nested improvement tasks consume the outer budget and identify the active method', async t => {
  const root = temp(t), inner = fixture(root); inner.cases[1].split = 'explore'; inner.maxCandidates = 1;
  const config = { ...inner, mode: 'compare', target: inner.method, cases: undefined, candidates: [{ root: './candidate', files: ['SKILL.md'] }],
    budget: { ...budget, maxCalls: 7 }, tasks: [{ id: 'improve-one', group: 'task-one', split: 'explore', experiment: inner }] };
  const spec = loadExperiment(config, root), store = openStore(join(root, 'record'), { spec }), adapter = fake();
  await improve(store, 'main', spec, adapter.invoke);
  assert.ok(adapter.calls <= 7);
  assert.ok(adapter.prompts.some(p => p.includes('"method":{"SKILL.md":"METHOD"}')));
  assert.ok(store.state.trials.some(t => t.status === 'budget_stopped'));
  assert.ok(store.state.trials.every(t => !t.key.startsWith('main/proposal'))); store.close();
});

test('self-application compares downstream outcomes and the selected method runs a fresh task', async t => {
  const root = temp(t), inner = fixture(root); inner.cases[1].split = 'explore'; inner.maxCandidates = 1;
  const config = { ...inner, goal: 'SELF', target: inner.method, method: inner.method, maxCandidates: 1, cases: undefined,
    budget: { ...budget, maxCalls: 40 }, tasks: [{ id: 'downstream', group: 'downstream-family', split: 'explore', experiment: inner }] };
  const spec = loadExperiment(config, root), store = openStore(join(root, 'self'), { spec });
  const observedMethods = [];
  const invoke = async req => {
    const d = JSON.parse(req.prompt.slice(req.prompt.lastIndexOf('\n') + 1));
    if (d.history) {
      observedMethods.push(d.method['SKILL.md']);
      const self = d.goal === 'SELF';
      return completed(JSON.stringify({ action: self || d.method['SKILL.md'] === 'METHOD2' ? 'candidate' : 'stop', parent: d.history[0].hash,
        hypothesis: 'Synthetic protocol exercise, not evidence of model improvement.', edits: [{ path: 'SKILL.md', content: self ? 'METHOD2' : 'BETTER' }] }));
    }
    return completed(JSON.stringify({ value: d.task.includes('Preserve') || d.skill['SKILL.md'] === 'BETTER' ? 'correct' : 'wrong' }));
  };
  const result = await improve(store, 'main', spec, invoke);
  assert.equal(result.status, 'accept'); assert.equal(result.bundle.files['SKILL.md'], 'METHOD2');
  assert.ok(observedMethods.includes('METHOD')); assert.ok(observedMethods.includes('METHOD2')); store.close();
  const fresh = loadExperiment(inner, root); fresh.method = result.bundle;
  const next = openStore(join(root, 'next-task'), { spec: fresh });
  assert.equal((await improve(next, 'main', fresh, invoke)).status, 'accept');
  assert.equal(observedMethods.at(-1), 'METHOD2'); next.close();
});

test('a rejected candidate can be an exploration parent without becoming the champion', async t => {
  const root = temp(t), config = fixture(root); config.cases[1].split = 'explore';
  const spec = loadExperiment(config, root), store = openStore(join(root, 'records'), { spec });
  const invoke = async req => {
    const d = JSON.parse(req.prompt.slice(req.prompt.lastIndexOf('\n') + 1));
    if (d.history) return completed(JSON.stringify({ action: 'candidate', parent: d.history.at(-1).hash, hypothesis: 'Synthetic branch.',
      edits: [{ path: 'SKILL.md', content: d.history.length === 1 ? 'WORSE' : 'BETTER' }] }));
    return completed(JSON.stringify({ value: d.skill['SKILL.md'] === 'BETTER' || d.task.includes('Preserve') && d.skill['SKILL.md'] !== 'WORSE' ? 'correct' : 'wrong' }));
  };
  const result = await improve(store, 'main', spec, invoke);
  assert.equal(result.status, 'accept');
  assert.equal(store.state.candidates[0].status, 'reject');
  assert.equal(store.state.candidates[1].parent, store.state.candidates[0].hash);
  assert.equal(readFileSync(join(root, 'target', 'SKILL.md'), 'utf8'), 'BASE'); store.close();
});

test('unconfirmed cleanup prevents subsequent calls and remains distinct from a task failure', async t => {
  const root = temp(t), store = openStore(root, {}); let calls = 0;
  const invoke = async () => { calls++; return { status: 'cleanup_unconfirmed', reason: 'Synthetic descendant still running.' }; };
  await measuredCall(store, 'one', 'target', { prompt: 'one' }, invoke, budget);
  const next = await measuredCall(store, 'two', 'target', { prompt: 'two' }, invoke, budget);
  assert.equal(calls, 1); assert.equal(next.status, 'budget_stopped'); store.close();
});

test('a supplied comparison alternates actual calls, not only cached result access', async t => {
  const root = temp(t), config = fixture(root, { mode: 'compare', candidates: [{ root: './candidate', files: ['SKILL.md'] }] });
  config.cases[1].split = 'explore';
  const spec = loadExperiment(config, root), store = openStore(join(root, 'records'), { spec }), adapter = fake();
  assert.equal((await improve(store, 'main', spec, adapter.invoke)).status, 'accept');
  assert.deepEqual(adapter.prompts.map(p => JSON.parse(p.slice(p.lastIndexOf('\n') + 1)).skill['SKILL.md']), ['BASE', 'BETTER', 'BETTER', 'BASE']);
  store.close();
});

test('missing exploration evidence vetoes adoption even when selection improves', async t => {
  const root = temp(t), config = fixture(root, { mode: 'compare', candidates: [{ root: './candidate', files: ['SKILL.md'] }] });
  const spec = loadExperiment(config, root), store = openStore(join(root, 'records'), { spec });
  const invoke = async req => {
    const d = JSON.parse(req.prompt.slice(req.prompt.lastIndexOf('\n') + 1));
    if (!d.task.includes('Preserve')) return { status: 'runtime_error', reason: 'Synthetic missing preservation evidence.' };
    return completed(JSON.stringify({ value: d.skill['SKILL.md'] === 'BETTER' ? 'correct' : 'wrong' }));
  };
  const result = await improve(store, 'main', spec, invoke);
  assert.equal(result.status, 'inconclusive'); assert.equal(result.selectedHash, spec.target.hash);
  store.close();
});

test('nested tasks cannot silently claim a different model from the outer invoker', t => {
  const root = temp(t), inner = fixture(root);
  const config = { ...inner, mode: 'compare', cases: undefined, runtime: { model: 'different-model' },
    tasks: [{ id: 'downstream', group: 'downstream-family', split: 'explore', experiment: inner }] };
  assert.throws(() => loadExperiment(config, root), /same runtime/);
});

test('candidate proposals receive exploration output but no selection or confirmation answers', async t => {
  const root = temp(t), config = fixture(root);
  config.maxCandidates = 1;
  config.cases.push({ ...cases()[0], id: 'confirm', group: 'confirmation-family', split: 'confirm', input: 'CONFIRMATION-SECRET' });
  config.cases[1].input = 'SELECTION-SECRET';
  const spec = loadExperiment(config, root), store = openStore(join(root, 'records'), { spec }), adapter = fake();
  await improve(store, 'main', spec, adapter.invoke);
  const proposal = adapter.prompts.find(p => p.includes('"history":'));
  assert.ok(proposal.includes('Return the requested primary result.'));
  assert.equal(proposal.includes('SELECTION-SECRET'), false);
  assert.equal(proposal.includes('CONFIRMATION-SECRET'), false);
  store.close();
});

test('host execution resumes reservations without redispatch, duplicates, or invented usage', async t => {
  const root = temp(t), config = fixture(root, { runtime: { adapter: 'host', model: 'host-inherited' } });
  config.cases[1].split = 'explore';
  const configFile = join(root, 'experiment.json'), out = join(root, 'out'); saveJson(configFile, config);
  const adapter = fake();
  let result = await run(configFile, out), dispatches = 0;
  while (result.outcome === 'needs-host-response') {
    const resumed = await run(configFile, out);
    assert.equal(resumed.pending.requestId, result.pending.requestId);
    assert.equal(resumed.reservedCalls, result.reservedCalls);
    const executionId = `synthetic-${++dispatches}`;
    hostOperation(out, 'attach', { requestId: result.pending.requestId, executionId });
    assert.throws(() => hostOperation(out, 'attach', { requestId: result.pending.requestId, executionId: 'another' }), /another execution/);
    const job = readJson(result.pending.requestFile);
    const response = await adapter.invoke(job);
    assert.throws(() => hostOperation(out, 'receive', { requestId: result.pending.requestId, executionId: 'other', ...response }), /attached/);
    hostOperation(out, 'receive', { requestId: result.pending.requestId, executionId, status: response.status, output: response.output });
    result = await run(configFile, out);
    assert.ok(dispatches <= config.budget.maxCalls);
  }
  assert.equal(result.outcome, 'accept');
  assert.equal(result.reservedCalls, dispatches); assert.equal(result.attempted, dispatches);
  assert.equal(result.usage.unknown_trials, dispatches);
  const record = readJson(join(out, 'record.json'));
  assert.equal(record.candidates.length, 1);
  assert.equal(record.decisions.filter(d => d.candidate).length, 1);
  assert.equal(record.trials.filter(t => t.role === 'generator').length, 2);
  assert.equal(readFileSync(join(root, 'target', 'SKILL.md'), 'utf8'), 'BASE');
});

test('host interruption stops further dispatch and preserves an inconclusive outcome', async t => {
  const root = temp(t), config = fixture(root, { runtime: { adapter: 'host', model: 'host-inherited' } });
  const file = join(root, 'experiment.json'), out = join(root, 'out'); saveJson(file, config);
  const pending = await run(file, out);
  assert.equal(pending.attempted, 0); assert.equal(pending.reservedCalls, 1);
  hostOperation(out, 'attach', { requestId: pending.pending.requestId, executionId: 'synthetic' });
  hostOperation(out, 'receive', { requestId: pending.pending.requestId, executionId: 'synthetic', status: 'cleanup_unconfirmed', reason: 'Synthetic unconfirmed interruption.' });
  const result = await run(file, out);
  assert.equal(result.outcome, 'inconclusive'); assert.equal(result.attempted, 1); assert.equal(result.pending, null);
});

test('host configuration cannot silently claim a requested CLI model', t => {
  const root = temp(t), config = fixture(root, { runtime: { adapter: 'host', model: 'specific-model' } });
  assert.throws(() => loadExperiment(config, root), /host-inherited/);
});

test('a never-dispatched host reservation can close without inventing an execution', async t => {
  const root = temp(t), config = fixture(root, { runtime: { adapter: 'host', model: 'host-inherited' } });
  const file = join(root, 'experiment.json'), out = join(root, 'out'); saveJson(file, config);
  const pending = await run(file, out);
  hostOperation(out, 'cancel', { requestId: pending.pending.requestId });
  const result = await run(file, out);
  assert.equal(result.outcome, 'inconclusive'); assert.equal(result.attempted, 0);
  assert.equal(result.outcomes.not_dispatched, 1); assert.equal(result.pending, null);
});

test('a host execution cannot be reused for a fresh comparison case', async t => {
  const root = temp(t), config = fixture(root, { mode: 'compare', runtime: { adapter: 'host', model: 'host-inherited' } });
  const file = join(root, 'experiment.json'), out = join(root, 'out'); saveJson(file, config);
  let result = await run(file, out);
  hostOperation(out, 'attach', { requestId: result.pending.requestId, executionId: 'one' });
  assert.throws(() => hostOperation(out, 'cancel', { requestId: result.pending.requestId }), /attached execution/);
  hostOperation(out, 'receive', { requestId: result.pending.requestId, executionId: 'one', status: 'completed', output: '{"value":"correct"}' });
  result = await run(file, out);
  assert.throws(() => hostOperation(out, 'attach', { requestId: result.pending.requestId, executionId: 'one' }), /another request/);
});

test('unavailable calibration evidence is inconclusive rather than a demonstrated grader defect', async t => {
  const root = temp(t), config = fixture(root);
  config.cases[0].checks = undefined; config.cases[0].rubric = 'Assess whether the requested value is correct.';
  const spec = loadExperiment(config, root), store = openStore(join(root, 'out'), {spec});
  const result = await improve(store, 'main', spec, async () => ({status:'runtime_error',reason:'Synthetic unavailable judge.'}));
  assert.equal(result.status, 'inconclusive');
  assert.equal(store.state.trials.length, 1); assert.equal(store.state.trials[0].role, 'judge');
  assert.equal(store.state.decisions.some(d=>d.status==='evaluation-invalid'), false); store.close();
});

test('host replay retains each invalid proposal once', async t => {
  const root = temp(t), config = fixture(root, { runtime: { adapter: 'host', model: 'host-inherited' } });
  const file = join(root, 'experiment.json'), out = join(root, 'out'); saveJson(file, config);
  let result = await run(file, out), calls = 0, proposals = 0;
  while (result.pending) {
    await run(file, out); // Revisit each suspension boundary without dispatching again.
    const job = readJson(result.pending.requestFile), d = JSON.parse(job.prompt.slice(job.prompt.lastIndexOf('\n') + 1));
    let output = '{"value":"correct"}';
    if (d.history) {
      if (++proposals === 1) {
        assert.deepEqual(d.invalidProposals, []);
        output = 'invalid-proposal';
      } else {
        assert.equal(d.invalidProposals.length, 1);
        assert.equal(d.invalidProposals[0].proposal, 'main/proposal/0');
        assert.ok(d.invalidProposals[0].reason);
        output = '{"action":"stop","hypothesis":"No valid candidate."}';
      }
    }
    const executionId = `synthetic-${++calls}`;
    hostOperation(out, 'attach', { requestId: result.pending.requestId, executionId });
    hostOperation(out, 'receive', { requestId: result.pending.requestId, executionId, status:'completed', output });
    result = await run(file, out);
  }
  assert.equal(result.outcome, 'retain');
  assert.equal(readJson(join(out,'record.json')).decisions.filter(d=>d.status==='invalid-candidate').length,1);
});

test('exhausting every proposal with invalid responses is inconclusive', async t => {
  const root = temp(t), config = fixture(root);
  config.target = { root: './candidate', files: ['SKILL.md'] };
  const spec = loadExperiment(config, root), store = openStore(join(root, 'record'), { spec });
  let proposals = 0;
  const invoke = async req => {
    const data = JSON.parse(req.prompt.slice(req.prompt.lastIndexOf('\n') + 1));
    if (!data.history) return completed('{"value":"correct"}');
    if (++proposals === 1) return completed('not a proposal');
    return completed(JSON.stringify({ action: 'candidate', parent: data.history[0].hash,
      hypothesis: 'Synthetic undeclared edit.', edits: [{ path: 'undeclared.md', content: 'OUT OF SCOPE' }] }));
  };
  let result;
  try { result = await improve(store, 'main', spec, invoke); } finally { store.close(); }
  assert.equal(proposals, config.maxCandidates);
  assert.ok(result.baseline.every(row => row.status === 'graded' && row.score === 1));
  assert.equal(store.state.decisions.filter(decision => decision.status === 'invalid-candidate').length, proposals);
  assert.equal(result.status, 'inconclusive');
  assert.equal(result.selectedHash, spec.target.hash);
});

test('invalid no-change proposals block nested method adoption despite another task improving', async t => {
  const root = temp(t), inner = fixture(root);
  inner.goal = 'Improve the synthetic target.';
  inner.cases[1].split = 'explore';
  const noChange = { ...inner, goal: 'Preserve the already correct target.',
    target: { root: './candidate', files: ['SKILL.md'] } };
  const config = { ...inner, mode: 'compare', target: inner.method, cases: undefined,
    candidates: [{ root: './candidate', files: ['SKILL.md'] }],
    tasks: [
      { id: 'improvement', group: 'improvement-task', split: 'explore', experiment: inner },
      { id: 'no-change', group: 'no-change-task', split: 'explore', experiment: noChange },
    ] };
  const spec = loadExperiment(config, root), store = openStore(join(root, 'record'), { spec });
  const invoke = async req => {
    const data = JSON.parse(req.prompt.slice(req.prompt.lastIndexOf('\n') + 1));
    if (!data.history) return completed(JSON.stringify({
      value: data.task.includes('Preserve') || data.skill['SKILL.md'] === 'BETTER' ? 'correct' : 'wrong',
    }));
    if (data.method['SKILL.md'] === 'BETTER' && data.goal === noChange.goal) return completed('invalid no-change decision');
    return completed(JSON.stringify({ action: data.method['SKILL.md'] === 'METHOD' || data.history.length > 1 ? 'stop' : 'candidate',
      parent: data.history[0].hash, hypothesis: 'Synthetic method behavior.', edits: [{ path: 'SKILL.md', content: 'BETTER' }] }));
  };
  let result;
  try { result = await improve(store, 'main', spec, invoke); } finally { store.close(); }
  const candidate = store.state.candidates.find(value => value.experiment === 'main' && value.hash === spec.candidates[0].hash);
  assert.equal(candidate.rows.find(row => row.id === 'improvement').score, 1);
  assert.equal(result.status, 'inconclusive');
  assert.equal(result.selectedHash, spec.target.hash);
  assert.equal(candidate.rows.find(row => row.id === 'no-change').status, 'incomplete');
});

test('host responses cannot extend deadlines or change the reserved prompt', async t => {
  const root = temp(t), adapter = hostInvoker({ adapter:'host', model:'host-inherited' }, root);
  const request = { trialKey:'trial', prompt:'Original', timeoutMs:1, deadline:Date.now()-1 };
  let pending;
  await assert.rejects(adapter.invoke(request), error => { pending=error.pending; return error.code==='HOST_RESPONSE_PENDING'; });
  const job = readJson(pending.requestFile);
  saveJson(join(pending.requestFile,'..','response.json'), { requestId:pending.requestId,executionId:'synthetic',status:'completed',output:'answer',receivedAt:Date.now() });
  assert.equal((await adapter.invoke(request)).status,'timeout');
  saveJson(pending.requestFile,{...job,prompt:'Changed'});
  await assert.rejects(adapter.invoke(request),/was changed/);
});

test('self-application also suspends and resumes through the shared host ledger', async t => {
  const root = temp(t), inner = fixture(root, {runtime:{adapter:'host',model:'host-inherited'}});
  inner.cases[1].split='explore'; inner.maxCandidates=1;
  const config = { ...inner, goal:'SELF', target:inner.method, method:inner.method, cases:undefined,
    budget:{...budget,maxCalls:40}, maxCandidates:1,
    tasks:[{id:'downstream',group:'downstream-family',split:'explore',experiment:inner}] };
  const file=join(root,'experiment.json'),out=join(root,'out');saveJson(file,config);
  let result=await run(file,out),calls=0;
  while(result.pending) {
    const job=readJson(result.pending.requestFile),d=JSON.parse(job.prompt.slice(job.prompt.lastIndexOf('\n')+1));
    let output;
    if(d.history) output=JSON.stringify({action:d.goal==='SELF'||d.method['SKILL.md']==='METHOD2'?'candidate':'stop',parent:d.history[0].hash,
      hypothesis:'Synthetic self-application.',edits:[{path:'SKILL.md',content:d.goal==='SELF'?'METHOD2':'BETTER'}]});
    else output=JSON.stringify({value:d.task.includes('Preserve')||d.skill['SKILL.md']==='BETTER'?'correct':'wrong'});
    const executionId=`synthetic-${++calls}`;
    hostOperation(out,'attach',{requestId:result.pending.requestId,executionId});
    hostOperation(out,'receive',{requestId:result.pending.requestId,executionId,status:'completed',output});
    result=await run(file,out);assert.ok(calls<=40);
  }
  assert.equal(result.outcome,'accept');assert.equal(result.reservedCalls,calls);
  const record=readJson(join(out,'record.json'));
  assert.equal(record.decisions.findLast(d=>d.prefix==='main'&&d.final).bundle.files['SKILL.md'],'METHOD2');
  assert.equal(new Set(record.candidates.map(c=>`${c.experiment}/${c.hash}`)).size,record.candidates.length);
});

test('target requests preserve task content without disclosing comparison or grading context', async t => {
  const root = temp(t), config = fixture(root, { mode: 'compare' });
  config.goal = 'PRIVATE COMPARISON GOAL';
  config.cases = [cases()[0]];
  config.cases[0].input = 'Explain an evaluation design.';
  config.cases[0].checks[0].value = 'PRIVATE EXPECTED ANSWER';
  config.cases[0].calibration[0].output = '{"value":"PRIVATE EXPECTED ANSWER"}';
  const spec = loadExperiment(config, root), store = openStore(join(root, 'record'), { spec });
  const requests = [];
  try {
    await improve(store, 'main', spec, async request => {
      requests.push(request);
      return completed('{"value":"wrong"}');
    });
  } finally { store.close(); }
  assert.equal(requests.length, 1);
  const { prompt } = requests[0], boundary = prompt.indexOf('\n');
  assert.doesNotMatch(prompt.slice(0, boundary), /\b(eval(?:uation)?|experiment|trial|candidate|baseline|score|rubric)\b/i);
  assert.deepEqual(JSON.parse(prompt.slice(boundary + 1)), {
    skill: { 'SKILL.md': 'BASE' }, task: config.cases[0].input,
  });
  assert.doesNotMatch(prompt, /PRIVATE/);
});

test('host delivery packet preserves long input and excludes execution metadata', async t => {
  const root=temp(t),adapter=hostInvoker({adapter:'host',model:'host-inherited'},root);
  const prompt='Read the whole frozen bundle.\n'+('長い指示の内容。'.repeat(3000));
  let pending;
  await assert.rejects(adapter.invoke({trialKey:'private-trial-identity',prompt,timeoutMs:1000,deadline:Date.now()+1000}),error=>{pending=error.pending;return error.code==='HOST_RESPONSE_PENDING';});
  const input=readHostInput(pending.inputFile,pending.inputHash);
  assert.equal(input.prompt,prompt);assert.deepEqual(Object.keys(input),['prompt','outputSchema']);
  let reconstructed='',offset=0;
  while(offset<input.prompt.length){const part=hostInputSlice(input,offset,1234);reconstructed+=part.promptChunk;offset=part.end;}
  assert.equal(reconstructed,prompt);
  assert.throws(()=>hostInputSlice(input,0,0),/slice requires/);
  assert.equal(JSON.stringify(input).includes('private-trial-identity'),false);
  writeFileSync(pending.inputFile,'{"prompt":"altered","outputSchema":null}\n');
  assert.throws(()=>readHostInput(pending.inputFile,pending.inputHash),/differs/);
});

test('proposal views reduce delivered context while keeping the complete method frozen', async t => {
  const root=temp(t), config=fixture(root);
  writeFileSync(join(root,'method','runtime.md'),'COORDINATOR ONLY');
  config.method.files.push('runtime.md'); config.proposalMethodFiles=['SKILL.md'];
  const spec=loadExperiment(config,root), store=openStore(join(root,'record'),{spec}), model=fake();
  try { await improve(store,'main',spec,model.invoke); } finally { store.close(); }
  const proposal=JSON.parse(model.prompts.find(p=>p.includes('"history"')).split('\n').at(-1));
  assert.deepEqual(proposal.method,{'SKILL.md':'METHOD'});
  assert.equal(proposal.methodView.bundleHash,spec.method.hash);
  assert.deepEqual(proposal.methodView.files,['SKILL.md']);
  assert.equal(spec.method.files['runtime.md'],'COORDINATOR ONLY');
  assert.ok(proposal.remainingMs>0);
  writeFileSync(join(root,'method','runtime.md'),'CHANGED COORDINATOR');
  assert.notEqual(loadExperiment(config,root).method.hash,spec.method.hash);
  assert.throws(()=>openStore(join(root,'record'),{spec:loadExperiment(config,root)}),/changed/);
  for (const names of [[],['SKILL.md','SKILL.md'],['missing.md']]) {
    assert.throws(()=>loadExperiment({...config,proposalMethodFiles:names},root),/proposalMethodFiles/);
  }
  const nested={...config,mode:'compare',method:undefined,proposalMethodFiles:undefined,cases:undefined,target:{root:'./method',files:['SKILL.md']},
    tasks:[{id:'inner',group:'inner',split:'explore',experiment:{...config,proposalMethodFiles:['runtime.md']}}]};
  assert.throws(()=>loadExperiment(nested,root),/proposalMethodFiles/);
});

test('a bound host response can be received and resumed in one command boundary', async t => {
  const root=temp(t), config=fixture(root,{runtime:{adapter:'host',model:'host-inherited'}});
  const file=join(root,'experiment.json'),out=join(root,'out');saveJson(file,config);
  let result=await run(file,out),calls=0;
  while(result.pending) {
    const input=readHostInput(result.pending.inputFile,result.pending.inputHash);
    const data=JSON.parse(input.prompt.split('\n').at(-1)),executionId=`combined-${++calls}`;
    hostOperation(out,'attach',{requestId:result.pending.requestId,executionId});
    const output=data.history?'{"action":"stop","hypothesis":"The existing target meets the cases."}':'{"value":"correct"}';
    result=await run(file,out,undefined,{requestId:result.pending.requestId,executionId,status:'completed',output});
  }
  assert.equal(result.outcome,'retain');assert.equal(calls,3);
  assert.deepEqual(await run(file,out),result);
  assert.equal(readFileSync(join(root,'target','SKILL.md'),'utf8'),'BASE');
});

test('a changed contract is refused before receiving a combined host response', async t => {
  const root=temp(t),config=fixture(root,{runtime:{adapter:'host',model:'host-inherited'}});
  const file=join(root,'experiment.json'),out=join(root,'out');saveJson(file,config);
  const result=await run(file,out),executionId='changed-contract';
  hostOperation(out,'attach',{requestId:result.pending.requestId,executionId});
  saveJson(file,{...config,goal:'Changed experiment goal.'});
  await assert.rejects(run(file,out,undefined,{requestId:result.pending.requestId,executionId,status:'completed',output:'answer'}),/changed/);
  assert.equal(existsSync(join(result.pending.requestFile,'..','response.json')),false);
});

function semanticCases() {
  return cases().map(({ checks, ...c }) => ({ ...c, rubric: 'Pass exactly when the JSON value is correct. Extra fields are allowed.',
    calibration: [...c.calibration, { output: '{"extra":1,"value":"correct"}', pass: true }] }));
}
function batchAnswer(items) {
  return JSON.stringify({ verdicts: items.map(item => ({ id: item.id,
    pass: checkOutput(item.response, [{ kind: 'json-equals', pointer: '/value', value: 'correct' }])[0].pass,
    evidence: 'Synthetic semantic oracle.' })).reverse() });
}

test('batched calibration and result grading share a protocol, retain IDs and resume without duplicates', async t => {
  const root = temp(t), config = fixture(root, { cases: semanticCases(), judgeBatchSize: 8, runtime: { adapter: 'host', model: 'host-inherited' } });
  const file = join(root, 'experiment.json'), out = join(root, 'out'); saveJson(file, config);
  let result = await run(file, out), calls = 0;
  const schemas = [], sizes = [];
  while (result.pending) {
    assert.deepEqual(await run(file, out), result);
    const input = readHostInput(result.pending.inputFile, result.pending.inputHash), data = JSON.parse(input.prompt.split('\n').at(-1));
    let output;
    if (data.items) {
      schemas.push(input.outputSchema); sizes.push(data.items.length);
      for (const item of data.items) assert.deepEqual(Object.keys(item).sort(), ['id', 'response', 'rubric', 'task']);
      assert.deepEqual(data.items.map(x => x.id), data.items.map(x => x.id).sort());
      output = batchAnswer(data.items);
    } else output = data.history ? '{"action":"stop","hypothesis":"No supported change."}' : '{"value":"correct"}';
    const executionId = `batch-${++calls}`;
    hostOperation(out, 'attach', { requestId: result.pending.requestId, executionId });
    result = await run(file, out, undefined, { requestId: result.pending.requestId, executionId, status: 'completed', output });
  }
  assert.equal(result.outcome, 'retain'); assert.equal(calls, 5);
  assert.deepEqual(sizes, [6, 2]); assert.deepEqual(schemas[0], schemas[1]);
  const record = readJson(join(out, 'record.json'));
  const calibration = record.decisions.filter(d => d.phase === 'batch-calibration');
  assert.equal(calibration.length, 1); assert.equal(calibration[0].items.length, 6);
  for (const item of calibration[0].items) assert.equal(item.result.checks[0].pass, item.expected);
  for (const row of record.decisions.at(-1).baseline) { assert.equal(row.score, 1); assert.ok(row.evidence.item); }
  assert.deepEqual(await run(file, out), result);
  saveJson(file, { ...config, judgeBatchSize: 3 });
  await assert.rejects(run(file, out), /changed/);
});

test('missing, duplicate, foreign and malformed batch verdicts cannot pass calibration', async t => {
  const faults = [
    value => { value.verdicts.pop(); },
    value => { value.verdicts[0] = value.verdicts[1]; },
    value => { value.verdicts[0].id = 'foreign'; },
    value => { value.verdicts[0].pass = 'true'; },
    value => { delete value.verdicts[0].evidence; },
    value => { value.unrequested = true; },
  ];
  for (const fault of faults) {
    const root = temp(t), config = fixture(root, { mode: 'compare', cases: semanticCases(), judgeBatchSize: 8 });
    const spec = loadExperiment(config, root), store = openStore(join(root, 'record'), { spec }); let calls = 0;
    try {
      const result = await improve(store, 'main', spec, async request => {
        calls++; const data = JSON.parse(request.prompt.split('\n').at(-1));
        assert.ok(data.items); const value = JSON.parse(batchAnswer(data.items)); fault(value);
        return completed(JSON.stringify(value));
      });
      assert.equal(result.status, 'inconclusive'); assert.equal(calls, 1);
      assert.ok(store.state.decisions[0].items.every(x => x.result.status === 'grading_error'));
    } finally { store.close(); }
  }
});

test('batched wrong labels, unavailable judges and partial actual grades fail closed', async t => {
  for (const fault of ['label', 'runtime', 'actual']) {
    const root = temp(t), config = fixture(root, { mode: 'compare', cases: semanticCases(), judgeBatchSize: 8 });
    const spec = loadExperiment(config, root), store = openStore(join(root, 'record'), { spec }); let calls = 0;
    try {
      const result = await improve(store, 'main', spec, async request => {
        calls++; const data = JSON.parse(request.prompt.split('\n').at(-1));
        if (!data.items) return completed('{"value":"correct"}');
        if (fault === 'runtime') return { status: 'timeout', reason: 'Synthetic timeout.' };
        const value = JSON.parse(batchAnswer(data.items));
        if (fault === 'label') value.verdicts[0].pass = !value.verdicts[0].pass;
        if (fault === 'actual' && calls > 1) value.verdicts.pop();
        return completed(JSON.stringify(value));
      });
      assert.equal(result.status, fault === 'label' ? 'evaluation-invalid' : 'inconclusive');
      assert.equal(calls, fault === 'actual' ? 4 : 1);
      if (fault === 'actual') assert.ok(result.baseline.every(row => row.score === null));
    } finally { store.close(); }
  }
});

test('paired batches preserve version results, regression veto and confirmation', async t => {
  for (const regression of [false, true]) {
    const root = temp(t), cs = semanticCases(); cs[1].split = 'explore';
    cs.push({ ...cs[0], id: 'confirmation', group: 'unseen', split: 'confirm' });
    const config = fixture(root, { mode: 'compare', candidates: [{ root: './candidate', files: ['SKILL.md'] }], cases: cs, judgeBatchSize: 3 });
    const spec = loadExperiment(config, root), store = openStore(join(root, 'record'), { spec });
    try {
      const result = await improve(store, 'main', spec, async request => {
        const data = JSON.parse(request.prompt.split('\n').at(-1));
        if (data.items) return completed(batchAnswer(data.items));
        const candidate = data.skill['SKILL.md'] === 'BETTER', preserve = data.task.includes('Preserve');
        return completed(JSON.stringify({ value: (preserve ? !(regression && candidate) : candidate) ? 'correct' : 'wrong' }));
      });
      assert.equal(result.status, regression ? 'retain' : 'accept');
      const decision = store.state.decisions.find(d => d.candidate);
      assert.equal(decision.status, regression ? 'reject' : 'accept');
      assert.equal(result.confirmation !== null, !regression);
      if (!regression) assert.equal(result.confirmation.candidate[0].score, 1);
    } finally { store.close(); }
  }
});

test('call plans include judges, search and confirmation without requiring the full upper-bound budget', t => {
  const root = temp(t), config = fixture(root, { cases: semanticCases(), judgeBatchSize: 8 });
  config.cases.push({ ...config.cases[0], id: 'confirmation', group: 'unseen', split: 'confirm' });
  let plan = callPlan(loadExperiment(config, root));
  assert.equal(plan.calibration, 2); assert.deepEqual(plan.baseline, { target: 2, judge: 1 });
  assert.deepEqual(plan.perCandidate, { generator: 1, target: 4, judge: 1 });
  assert.deepEqual(plan.confirmation, { target: 2, judge: 1 });
  assert.equal(plan.baselineAndStop, 6); assert.equal(plan.fullSearchUpperBound, 20);
  plan = callPlan(loadExperiment({ ...config, judgeBatchSize: 1, budget: { ...budget, maxCalls: 5 } }, root));
  assert.equal(plan.calibration, 9); assert.equal(plan.fullSearchUpperBound, 35); assert.equal(plan.coversFullSearch, false);
  for (const size of [0, -1, 1.5, '2']) assert.throws(() => loadExperiment({ ...config, judgeBatchSize: size }, root), /judgeBatchSize/);
});

test('chunked semantic calibration and nested tasks share call limits; deterministic checks use no judge calls', async t => {
  const root = temp(t), inner = fixture(root, { cases: semanticCases(), judgeBatchSize: 2 });
  const config = { ...inner, mode: 'compare', judgeBatchSize: undefined, cases: undefined, target: inner.method,
    budget: { ...budget, maxCalls: 1 }, tasks: [{ id: 'inner', group: 'inner', split: 'explore', experiment: inner }] };
  const spec = loadExperiment(config, root), store = openStore(join(root, 'record'), { spec }); let calls = 0;
  try {
    const result = await improve(store, 'main', spec, async request => { calls++; return completed(batchAnswer(JSON.parse(request.prompt.split('\n').at(-1)).items)); });
    assert.equal(result.status, 'inconclusive'); assert.equal(calls, 1);
  } finally { store.close(); }
  assert.throws(() => loadExperiment({ ...config, judgeBatchSize: 2 }, root), /inner experiment/);
  const deterministic = loadExperiment({ ...inner, mode: 'compare', cases: cases() }, root);
  assert.equal(callPlan(deterministic).calibration, 0);
  const another = openStore(join(root, 'deterministic'), { deterministic });
  try {
    await improve(another, 'main', deterministic, async request => { assert.ok(JSON.parse(request.prompt.split('\n').at(-1)).skill); return completed('{"value":"correct"}'); });
    assert.equal(another.state.trials.length, 2);
  } finally { another.close(); }
});

test('CLI termination requires a successful stop request and observed close, including after restart', { skip: process.platform === 'win32' }, async t => {
  for (const scenario of [
    { name: 'accepted-no-close', requested: true, status: 'cleanup_unconfirmed' },
    { name: 'failed-no-close', requested: false, status: 'cleanup_unconfirmed' },
    { name: 'failed-with-close', requested: false, close: true, status: 'cleanup_unconfirmed' },
    { name: 'accepted-with-close', requested: true, close: true, status: 'timeout' },
    { name: 'interrupt-with-close', requested: true, close: true, interrupt: true, status: 'interrupted' },
    { name: 'error-without-close', requested: true, error: true, status: 'cleanup_unconfirmed' },
  ]) await t.test(scenario.name, async t => {
    const root = temp(t), output = join(root, 'record');
    const child = new EventEmitter(); child.pid = 999999;
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.stdin = new Writable({ write(chunk, encoding, done) { done(); } }); child.unref = () => {};
    t.mock.method(childProcess, 'spawnSync', () => ({ status: 0, stdout: 'synthetic-codex-test' }));
    t.mock.method(childProcess, 'spawn', (binary, args, options) => {
      assert.equal(fs.statSync(options.cwd).mode & 0o777, 0o700);
      assert.equal(fs.statSync(join(options.cwd, 'response-schema.json')).mode & 0o777, 0o600);
      return child;
    });
    const kill = t.mock.method(process, 'kill', (pid, signal) => {
      assert.equal(pid, -999999); assert.equal(signal, 'SIGKILL');
      if (!scenario.requested) throw new Error('Synthetic failed stop request.');
      return true;
    });
    syncBuiltinESMExports();
    t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const listeners = ['SIGINT', 'SIGTERM'].map(s => process.listenerCount(s));
    const adapter = codexInvoker({ model: 'synthetic', binary: process.execPath }, join(root, 'work'));
    let store = openStore(output, { synthetic: true });
    const pending = measuredCall(store, 'first', 'target', { prompt: 'Synthetic input.', outputSchema: { type: 'string' } }, adapter.invoke, { ...budget, callTimeoutMs: 1 });
    if (scenario.interrupt) process.emit('SIGINT'); else t.mock.timers.tick(1);
    assert.equal(kill.mock.callCount(), 1);
    if (scenario.close) child.emit('close', null, 'SIGKILL');
    else if (scenario.error) child.emit('error', new Error('Synthetic process error after termination.'));
    else t.mock.timers.tick(2000);
    const first = await pending;
    assert.equal(first.status, scenario.status);
    assert.deepEqual(first.termination, { requestSucceeded: scenario.requested, closeObserved: Boolean(scenario.close) });
    assert.deepEqual(['SIGINT', 'SIGTERM'].map(s => process.listenerCount(s)), listeners);
    if (!scenario.close && !scenario.error) assert.equal(first.reason, 'Termination did not complete.');
    child.emit('close', null, 'SIGKILL'); // Late evidence must not rewrite an already settled receipt.
    assert.equal(first.status, scenario.status);
    store.close(); store = openStore(output, { synthetic: true });
    let calls = 0;
    const next = await measuredCall(store, 'second', 'target', { prompt: 'Synthetic next input.' }, async () => { calls++; return completed('OK'); }, budget);
    assert.equal(calls, scenario.status === 'timeout' ? 1 : 0);
    assert.equal(next.status, scenario.status === 'timeout' ? 'completed' : 'budget_stopped');
    assert.equal(store.state.trials[0].status, scenario.status); store.close();
  });
});

test('new private records, locks, host packets and atomic temporary files use restrictive modes', { skip: process.platform === 'win32' }, async t => {
  const root = temp(t); fs.chmodSync(root, 0o755);
  const previous = process.umask(0o022); t.after(() => process.umask(previous));
  const output = join(root, 'new-parent', 'record');
  const store = openStore(output, { synthetic: true });
  const mode = path => fs.statSync(path).mode & 0o777;
  assert.equal(mode(root), 0o755); assert.equal(mode(join(root, 'new-parent')), 0o700);
  assert.equal(mode(output), 0o700); assert.equal(mode(join(output, 'record.json')), 0o600);
  assert.equal(mode(join(output, 'run.lock')), 0o600);
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (source, target) => { assert.equal(mode(source), 0o600); return rename(source, target); });
  syncBuiltinESMExports(); t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  store.save();
  const adapter = hostInvoker({ adapter: 'host', model: 'host-inherited' }, join(output, 'work'));
  let pending;
  await assert.rejects(adapter.invoke({ trialKey: 'synthetic', prompt: 'Synthetic input.', timeoutMs: 1000, deadline: Date.now() + 1000 }), error => {
    pending = error.pending; return error.code === 'HOST_RESPONSE_PENDING';
  });
  assert.equal(mode(pending.requestFile), 0o600); assert.equal(mode(pending.inputFile), 0o600);
  assert.equal(mode(join(output, 'work')), 0o700); assert.equal(mode(join(output, 'work', 'requests')), 0o700);
  assert.equal(mode(join(pending.requestFile, '..')), 0o700); store.close();
});

test('existing shared output is refused without chmod or record writes and private output resumes', { skip: process.platform === 'win32' }, t => {
  const root = temp(t), shared = join(root, 'shared'); mkdirSync(shared); fs.chmodSync(shared, 0o755);
  assert.throws(() => openStore(shared, {}), /private directory/);
  assert.equal(fs.statSync(shared).mode & 0o777, 0o755); assert.deepEqual(readdirSync(shared), []);
  const out = join(root, 'private'); let store = openStore(out, { same: true }); const id = store.state.id; store.close();
  store = openStore(out, { same: true }); assert.equal(store.state.id, id); store.close();
});

test('JSON equality rejects unsafe integers and nonfinite numbers at configuration and output boundaries', t => {
  const root = temp(t), config = fixture(root, { mode: 'compare' });
  for (const value of [9007199254740992, -9007199254740992, Infinity, -Infinity, NaN, { nested: [9007199254740992] }]) {
    const invalid = { ...config, cases: [{ ...cases()[0], checks: [{ kind: 'json-equals', pointer: '', value }] }] };
    assert.throws(() => loadExperiment(invalid, root), /finite numbers and safe integers/);
  }
  const equal = (output, value, pointer = '') => checkOutput(output, [{ kind: 'json-equals', pointer, value }])[0].pass;
  assert.equal(equal('9007199254740993', 9007199254740992), false);
  assert.equal(equal('-9007199254740993', -9007199254740992), false);
  assert.equal(equal('1e400', Infinity), false);
  assert.equal(equal('{"n":9007199254740993,"answer":"OK"}', 'OK', '/answer'), false);
  for (const value of [Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 0, 1, -1, 0.5, 0.1, { nested: [1, 0.25] }]) {
    assert.equal(equal(JSON.stringify(value), value), true);
  }
  assert.equal(equal('1.00000000000000001', 1), true); // Deliberately documented binary64 decimal semantics.
  assert.equal(equal('1e-400', 0), true); // Underflow likewise needs a string for exact decimal claims.
  assert.equal(equal('"9007199254740993"', '9007199254740993'), true);
  assert.equal(equal('"9007199254740993"', '9007199254740992'), false);
});

test('unsafe numeric calibration cannot start target work; supported strings remain precisely comparable', async t => {
  for (const asString of [false, true]) {
    const root = temp(t), value = asString ? '9007199254740992' : 1;
    const c = { ...cases()[0], checks: [{ kind: 'json-equals', pointer: '/id', value }],
      calibration: [{ output: asString ? '{"id":"9007199254740992"}' : '{"id":9007199254740993}', pass: true }, { output: '{"id":0}', pass: false }] };
    const config = fixture(root, { mode: 'compare', cases: [c], candidates: [{ root: './candidate', files: ['SKILL.md'] }] });
    const spec = loadExperiment(config, root), store = openStore(join(root, 'out'), { spec }); let calls = 0;
    const result = await improve(store, 'main', spec, async () => { calls++; return completed('{"id":"9007199254740993"}'); });
    assert.equal(result.status, asString ? 'retain' : 'evaluation-invalid'); assert.equal(calls, asString ? 2 : 0);
    store.close();
  }
});

test('incomplete baseline and paired phases stop further calls by default and resume without retry', async t => {
  for (const paired of [false, true]) for (const status of ['runtime_error', 'unsupported', 'timeout']) {
    const root = temp(t), config = fixture(root, { mode: 'compare', repeats: 3, ...(paired ? { candidates: [{ root: './candidate', files: ['SKILL.md'] }] } : {}) });
    const file = join(root, 'experiment.json'), out = join(root, 'out'); saveJson(file, config); let calls = 0;
    const factory = () => ({ identity: { synthetic: true }, invoke: async () => { calls++; return { status, reason: 'Synthetic missing result.' }; } });
    const result = await run(file, out, factory);
    assert.equal(result.outcome, 'inconclusive'); assert.equal(calls, 1); assert.equal(result.attempted, 1);
    assert.deepEqual(await run(file, out, factory), result); assert.equal(calls, 1);
    const record = readRecord(out); assert.equal(record.trials[0].reason, 'Synthetic missing result.');
    assert.equal(record.trials.length, 1);
  }
});

test('failed individual grading stops subsequent target calls but a graded task failure remains valid evidence', async t => {
  for (const failure of [true, false]) {
    const root = temp(t), config = fixture(root, { mode: 'compare', cases: semanticCases() });
    const spec = loadExperiment(config, root), store = openStore(join(root, 'record'), { spec }); let targets = 0;
    const result = await improve(store, 'main', spec, async request => {
      const data = JSON.parse(request.prompt.split('\n').at(-1));
      if (data.skill) { targets++; return completed('ACTUAL'); }
      if (data.response === 'ACTUAL') return completed(failure ? 'invalid verdict' : '{"pass":false,"evidence":"Synthetic task failure."}');
      return completed(JSON.stringify({ pass: data.response.includes('correct'), evidence: 'Synthetic calibration.' }));
    });
    assert.equal(targets, failure ? 1 : config.cases.length);
    assert.equal(result.status, failure ? 'inconclusive' : 'retain'); store.close();
  }
});

test('an incomplete target suppresses otherwise pending batched judge work', async t => {
  const root = temp(t), config = fixture(root, { mode: 'compare', cases: semanticCases(), judgeBatchSize: 8 });
  const spec = loadExperiment(config, root), store = openStore(join(root, 'record'), { spec }); let calls = 0, targets = 0;
  const result = await improve(store, 'main', spec, async request => {
    calls++; const data = JSON.parse(request.prompt.split('\n').at(-1));
    if (data.items) return completed(batchAnswer(data.items));
    targets++; return targets === 1 ? completed('{"value":"correct"}') : { status: 'runtime_error', reason: 'Synthetic unavailable target.' };
  });
  assert.equal(result.status, 'inconclusive'); assert.equal(calls, 3); assert.equal(targets, 2);
  assert.match(result.baseline.find(row => row.status === 'grading_error').reason, /Grading skipped/);
  assert.equal(store.state.trials.filter(t => t.role === 'judge').length, 1); store.close();
});

test('explicit diagnostic continuation is frozen, bounded and cannot bypass unresolved cleanup', async t => {
  for (const status of ['runtime_error', 'cleanup_unconfirmed']) {
    const root = temp(t), config = fixture(root, { mode: 'compare', repeats: 2, diagnosticContinuation: 'Inspect whether the synthetic transport failure affects other cases.' });
    const file = join(root, 'experiment.json'), out = join(root, 'out'); saveJson(file, config); let calls = 0;
    const factory = () => ({ identity: { synthetic: true }, invoke: async () => { calls++; return { status, reason: 'Synthetic diagnostic failure.' }; } });
    const result = await run(file, out, factory);
    assert.equal(result.outcome, 'inconclusive'); assert.equal(calls, status === 'runtime_error' ? 4 : 1);
    const record = readRecord(out);
    assert.equal(record.contract.experiment.diagnosticContinuation, config.diagnosticContinuation);
    assert.equal(record.decisions.at(-1).diagnosticContinuation, config.diagnosticContinuation);
    assert.deepEqual(await run(file, out, factory), result);
    saveJson(file, { ...config, diagnosticContinuation: 'Different diagnostic purpose.' });
    await assert.rejects(run(file, out, factory), /changed/);
    for (const reason of ['', ' ', true, null]) assert.throws(() => loadExperiment({ ...config, diagnosticContinuation: reason }, root), /diagnosticContinuation/);
  }
});

test('a failed later paired result preserves earlier observations and prevents remaining cases or candidates', async t => {
  for (const failureAt of [2, 3]) {
    const root = temp(t), config = fixture(root, { mode: 'compare', repeats: 2, candidates: [{ root: './candidate', files: ['SKILL.md'] }] });
    const spec = loadExperiment(config, root), store = openStore(join(root, 'record'), { spec }); let calls = 0;
    const result = await improve(store, 'main', spec, async () => ++calls === failureAt ? { status: 'runtime_error', reason: 'Synthetic partial pair.' } : completed('{"value":"correct"}'));
    assert.equal(result.status, 'inconclusive'); assert.equal(calls, failureAt);
    assert.equal(result.selectedHash, spec.target.hash);
    assert.equal(store.state.trials.filter(t => t.status === 'completed').length, failureAt - 1);
    assert.equal(store.state.trials.at(-1).reason, 'Synthetic partial pair.');
    assert.equal(store.state.candidates.length, 1); assert.equal(store.state.candidates[0].status, 'inconclusive'); store.close();
  }
});

test('diagnostic continuation remains within the original call budget and can collect pending grades', async t => {
  for (const maxCalls of [2, 10]) {
    const root = temp(t), config = fixture(root, { mode: 'compare', cases: semanticCases(), judgeBatchSize: 8,
      diagnosticContinuation: 'Inspect the successful target alongside a failed target.', budget: { ...budget, maxCalls } });
    const spec = loadExperiment(config, root), store = openStore(join(root, 'record'), { spec }); let calls = 0, targets = 0;
    const result = await improve(store, 'main', spec, async request => {
      calls++; const data = JSON.parse(request.prompt.split('\n').at(-1));
      if (data.items) return completed(batchAnswer(data.items));
      targets++; return targets === 1 ? completed('{"value":"correct"}') : { status: 'runtime_error', reason: 'Synthetic target failure.' };
    });
    assert.equal(result.status, 'inconclusive'); assert.equal(calls, maxCalls === 2 ? 2 : 4);
    if (maxCalls === 10) assert.ok(result.baseline.some(row => row.status === 'graded'));
    else assert.equal(store.state.trials.filter(t => t.attempted).length, 2);
    store.close();
  }
});

test('host-reported infrastructure failure settles the reservation and does not dispatch another worker', async t => {
  const root = temp(t), config = fixture(root, { runtime: { adapter: 'host', model: 'host-inherited' } });
  const file = join(root, 'experiment.json'), out = join(root, 'out'); saveJson(file, config);
  const pending = await run(file, out);
  hostOperation(out, 'attach', { requestId: pending.pending.requestId, executionId: 'synthetic-failed-worker' });
  const result = await run(file, out, undefined, { requestId: pending.pending.requestId, executionId: 'synthetic-failed-worker', status: 'runtime_error', reason: 'Synthetic transport unavailable.' });
  assert.equal(result.outcome, 'inconclusive'); assert.equal(result.reservedCalls, 1); assert.equal(result.pending, null);
  assert.deepEqual(await run(file, out), result); assert.equal(readRecord(out).trials.length, 1);
});

test('a wrong calibration label stops later batches and preserves the observed evaluator defect', async t => {
  const root = temp(t), config = fixture(root, { mode: 'compare', cases: semanticCases(), judgeBatchSize: 2 });
  const spec = loadExperiment(config, root), store = openStore(join(root, 'record'), { spec }); let calls = 0;
  const result = await improve(store, 'main', spec, async request => {
    calls++; const value = JSON.parse(batchAnswer(JSON.parse(request.prompt.split('\n').at(-1)).items));
    value.verdicts[0].pass = !value.verdicts[0].pass; return completed(JSON.stringify(value));
  });
  assert.equal(result.status, 'evaluation-invalid'); assert.equal(calls, 1);
  const decision = store.state.decisions.find(d => d.phase === 'batch-calibration');
  assert.ok(decision.items.some(item => item.result.status === 'graded' && item.result.checks[0].pass !== item.expected));
  assert.ok(decision.items.some(item => item.result.status === 'grading_error')); store.close();
});

test('repeated grading stops at disagreement unless continued observations were explicitly requested', async t => {
  for (const diagnostics of [false, true]) {
    const root = temp(t), config = fixture(root, { mode: 'compare', cases: semanticCases(), judgeRepeats: 3,
      ...(diagnostics ? { diagnosticContinuation: 'Measure the remaining declared judgments after disagreement.' } : {}) });
    const spec = loadExperiment(config, root), store = openStore(join(root, 'record'), { spec }); let actualJudgments = 0, targets = 0;
    const result = await improve(store, 'main', spec, async request => {
      const data = JSON.parse(request.prompt.split('\n').at(-1));
      if (data.skill) { targets++; return completed('ACTUAL'); }
      const actual = data.response === 'ACTUAL';
      if (actual) actualJudgments++;
      return completed(JSON.stringify({ pass: actual ? actualJudgments % 3 !== 2 : data.response.includes('correct'), evidence: 'Synthetic repeated judgment.' }));
    });
    assert.equal(result.status, 'inconclusive'); assert.equal(targets, diagnostics ? 2 : 1);
    assert.equal(actualJudgments, diagnostics ? 6 : 2); store.close();
  }
});

test('known-wrong repeated calibration stops at its first mismatch without leaking expected labels', async t => {
  for (const expected of [true, false]) for (const wrongAt of [1, 2, 3]) for (const diagnostics of [false, true]) {
    const cs = semanticCases();
    if (!expected) cs[0].calibration = [{ output: 'wrong', pass: false }, { output: 'correct', pass: true }];
    const root = temp(t), config = fixture(root, { mode: 'compare', cases: cs, judgeRepeats: 3,
      ...(diagnostics ? { diagnosticContinuation: 'Collect remaining diagnostic outputs.' } : {}) });
    const spec = loadExperiment(config, root), store = openStore(join(root, 'record'), { spec }); let calls = 0;
    const result = await improve(store, 'main', spec, async request => {
      calls++; const packet = JSON.parse(request.prompt.split('\n').at(-1));
      assert.deepEqual(Object.keys(packet).sort(), ['response', 'rubric', 'task']);
      if (calls > wrongAt) return { status: 'runtime_error', reason: 'A forbidden later call would hide the known defect.' };
      return completed(JSON.stringify({ pass: calls === wrongAt ? !expected : expected, evidence: 'Synthetic known-label boundary.' }));
    });
    assert.equal(result.status, 'evaluation-invalid'); assert.equal(calls, wrongAt);
    const decision = store.state.decisions.find(d => d.status === 'evaluation-invalid' && !d.final);
    assert.equal(decision.result.checks[0].pass, !expected);
    assert.equal(decision.result.judgments.length, wrongAt);
    assert.equal((await improve(store, 'main', spec, () => { throw new Error('Unexpected retry.'); })).status, 'evaluation-invalid');
    store.close();
  }
});

test('outer diagnostics stop on inner invalid calibration or judge packets and keep the inner evidence', async t => {
  for (const failure of ['wrong-calibration', 'invalid-single-calibration', 'invalid-batch-calibration', 'invalid-single-actual', 'invalid-batch-actual']) {
    const root = temp(t), inner = fixture(root, { cases: semanticCases(), judgeRepeats: undefined,
      judgeBatchSize: failure.includes('batch') ? 2 : 1, diagnosticContinuation: 'Inspect remaining inner outputs.' });
    const config = { schema: 1, mode: 'compare', goal: 'Synthetic nested stop boundary.', target: inner.method, runtime: inner.runtime,
      budget: { ...budget, maxCalls: 100 }, diagnosticContinuation: 'Inspect remaining outer tasks.',
      tasks: ['first', 'second'].map(id => ({ id, group: id, split: 'explore', experiment: { ...inner, budget: { ...budget, maxCalls: 100 } } })) };
    const spec = loadExperiment(config, root), store = openStore(join(root, 'record'), { spec }); let calls = 0, targets = 0;
    const invoke = async request => {
      calls++; const packet = JSON.parse(request.prompt.split('\n').at(-1));
      if (packet.skill) { targets++; return completed('ACTUAL'); }
      const actual = packet.response === 'ACTUAL' || Boolean(packet.items?.some(item => item.response === 'ACTUAL'));
      if (failure === 'wrong-calibration') return completed('{"pass":false,"evidence":"Synthetic wrong label."}');
      if (actual === failure.endsWith('actual')) return completed('invalid judge packet');
      if (packet.items) return completed(batchAnswer(packet.items));
      return completed(JSON.stringify({ pass: packet.response.includes('correct'), evidence: 'Synthetic calibration.' }));
    };
    const result = await improve(store, 'main', spec, invoke);
    assert.equal(result.status, 'inconclusive'); assert.equal(result.baseline.length, 1, failure);
    assert.equal(result.baseline[0].id, 'first');
    const innerResult = result.baseline[0].evidence.result;
    if (failure === 'wrong-calibration') assert.equal(innerResult.status, 'evaluation-invalid');
    else assert.ok(store.state.trials.some(trial => trial.invalidVerdict === true));
    assert.ok(store.state.decisions.some(decision => decision.prefix === result.baseline[0].evidence.experiment));
    assert.equal(targets, failure.endsWith('actual') ? failure.includes('batch') ? 2 : 1 : 0);
    const before = calls;
    await improve(store, 'main', spec, invoke); assert.equal(calls, before); store.close();
  }
});

test('outer diagnostics may still inspect another task after an ordinary inner transport failure', async t => {
  const root = temp(t), inner = fixture(root);
  const config = { schema: 1, mode: 'compare', goal: 'Synthetic nested diagnostic preservation.', target: inner.method,
    runtime: inner.runtime, budget, diagnosticContinuation: 'Check whether other tasks also have a transport failure.',
    tasks: ['first', 'second'].map(id => ({ id, group: id, split: 'explore', experiment: inner })) };
  const spec = loadExperiment(config, root), store = openStore(join(root, 'record'), { spec }); let calls = 0;
  const result = await improve(store, 'main', spec, async () => { calls++; return { status: 'runtime_error', reason: 'Synthetic transport failure.' }; });
  assert.equal(result.status, 'inconclusive'); assert.equal(result.baseline.length, 2); assert.equal(calls, 2);
  assert.ok(store.state.trials.every(trial => trial.reason === 'Synthetic transport failure.' && !trial.invalidVerdict)); store.close();
});
