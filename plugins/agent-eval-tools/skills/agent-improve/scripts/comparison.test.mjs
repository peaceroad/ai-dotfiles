import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from './records.mjs';
import { loadExperiment, callPlan, improve, compareRows } from './experiment.mjs';
import { validateComparison, judgePair, signTail, summarizePreference } from './comparison.mjs';
import { run, hostOperation } from './agent-eval.mjs';
import { readHostInput } from './host-adapter.mjs';

const comparison = () => ({ rubric: 'Keep the supplied conditions. Prefer the response with an explicit, justified relation between the conditions and the decision. Do not reward length.', policy: 'sign-test', minEffect: 0.2,
  calibration: [
    { input: 'Explain a condition.', a: 'adequate', b: 'clear', winner: 'B', labelSource: 'Synthetic ordering for controller verification only.' },
    { input: 'Allow equivalent explanations.', a: 'clear', b: 'clear', winner: 'tie', labelSource: 'Identical supplied outputs.' },
    { input: 'Explain a condition.', a: '', b: 'wrong', winner: 'both_bad', labelSource: 'Known missing/incorrect synthetic outputs.' },
  ] });
const budget = { maxCalls: 250, maxMs: 60000, callTimeoutMs: 1000 };
const completed = value => ({ status: 'completed', output: value, usage: { input_tokens: 1, output_tokens: 1 } });
const data = request => JSON.parse(request.prompt.slice(request.prompt.lastIndexOf('\n') + 1));
function fixture(t, overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'agent-comparison-test-'));
  for (const [name, text] of [['target', 'BASE'], ['candidate', 'NEW'], ['method', 'METHOD']]) { mkdirSync(join(root, name)); writeFileSync(join(root, name, 'SKILL.md'), text); }
  const base = { schema: 1, mode: 'compare', goal: 'Synthetic controller verification.', runtime: { model: 'synthetic' }, budget,
    target: { root: 'target', files: ['SKILL.md'] }, candidates: [{ root: 'candidate', files: ['SKILL.md'] }], comparison: comparison(),
    cases: Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, group: `g${i}`, split: 'explore', input: `task ${i}`, checks: [{ kind: 'excludes', value: 'wrong' }], calibration: [{ output: 'clear', pass: true }, { output: 'wrong', pass: false }] })) };
  const config = typeof overrides === 'function' ? overrides(base) : { ...base, ...overrides };
  const spec = loadExperiment(config, root), store = openStore(join(root, 'out'), { spec });
  t.after(() => { store.close(); rmSync(root, { recursive: true, force: true }); });
  return { spec, store, root, config };
}
function judge(value) {
  const rank = x => x === 'clear' ? 2 : x === 'adequate' ? 1 : 0;
  const a = rank(value.A), b = rank(value.B);
  return completed(JSON.stringify({ winner: !a && !b ? 'both_bad' : a === b ? 'tie' : a > b ? 'A' : 'B', evidence: 'Synthetic rank; no semantic-model claim.' }));
}
function invoker(request) {
  const value = data(request);
  if (value.skill) return completed(value.skill['SKILL.md'] === 'BASE' ? 'adequate' : 'clear');
  return judge(value);
}

test('comparison calibration requires provenance and meaningful positive/tie/negative coverage', () => {
  assert.ok(validateComparison(comparison()));
  for (const samples of [[], comparison().calibration.slice(0, 1)]) assert.throws(() => validateComparison({ ...comparison(), calibration: samples }), /calibration/);
  assert.throws(() => validateComparison({ ...comparison(), minEffect: 0 }), /minEffect/);
  assert.throws(() => validateComparison({ ...comparison(), policy: 'auto' }), /policy/);
});

test('exact sign probabilities and group aggregation do not manufacture independent evidence', () => {
  assert.equal(signTail(0, 0), 1);
  assert.ok(Math.abs(signTail(6, 0) - 1 / 64) < 1e-14);
  assert.ok(Math.abs(signTail(3, 1) - 5 / 16) < 1e-14);
  assert.ok(signTail(0, 2000) > 0.999999);
  const entries = [{ id: 'a', group: 'same' }, { id: 'b', group: 'same' }];
  const rows = Array.from({ length: 100 }, (_, i) => ({ id: i % 2 ? 'a' : 'b', repeat: i, status: 'graded', winner: 'B', delta: 1 }));
  const result = summarizePreference(rows, entries, comparison());
  assert.equal(result.groups.length, 1); assert.equal(result.pValue, 0.5); assert.equal(result.status, 'inconclusive');
  assert.throws(() => summarizePreference([...rows, rows[0]], entries, comparison()), /Duplicate/);
});

test('two-order comparison detects position preference and resumes without rejudging', async t => {
  const { store } = fixture(t); let calls = 0;
  const biased = () => { calls++; return completed('{"winner":"A","evidence":"Always first."}'); };
  const result = await judgePair(store, 'probe', 'task', 'adequate', 'clear', comparison(), biased, budget);
  assert.equal(result.status, 'unstable'); assert.equal(calls, 2);
  await judgePair(store, 'probe', 'task', 'adequate', 'clear', comparison(), biased, budget);
  assert.equal(calls, 2);
  const stable = await judgePair(store, 'stable', 'task', 'adequate', 'clear', comparison(), invoker, budget);
  assert.equal(stable.winner, 'B'); assert.equal(stable.delta, 1);
  assert.equal(data(store.state.trials.find(x => x.key === 'stable/preference/0').request).A, 'adequate');
  assert.equal(data(store.state.trials.find(x => x.key === 'stable/preference/1').request).A, 'clear');
});

test('ties, both-bad, uncertainty and malformed verdicts cannot become a gain', async t => {
  const { store } = fixture(t);
  for (const winner of ['tie', 'both_bad', 'uncertain']) {
    const row = await judgePair(store, winner, 'task', 'a', 'b', comparison(), () => completed(JSON.stringify({ winner, evidence: 'Known test condition.' })), budget);
    assert.notEqual(summarizePreference([{ id: 'a', repeat: 0, ...row }], [{ id: 'a', group: 'g' }], comparison()).status, 'accept');
  }
  const bad = await judgePair(store, 'bad', 'task', 'a', 'b', comparison(), () => completed('{"winner":"B","evidence":"","extra":1}'), budget);
  assert.equal(bad.status, 'grading_error');
});

test('comparative quality can improve when both versions satisfy absolute requirements', async t => {
  const { store, spec } = fixture(t);
  const plan = callPlan(spec), result = await improve(store, 'main', spec, invoker);
  assert.equal(result.status, 'accept'); assert.equal(result.qualityGain, 1);
  assert.ok(result.baseline.every(r => r.score === 1)); assert.ok(result.selected.every(r => r.score === 1));
  assert.equal(store.state.trials.length, plan.fullSearchUpperBound);
  assert.equal(plan.calibration, 6); assert.equal(plan.perCandidate.judge, 12);
  const calls = store.state.trials.length;
  await improve(store, 'main', spec, () => { throw new Error('Must resume from evidence.'); });
  assert.equal(store.state.trials.length, calls);
});

test('small or explicitly review-only comparisons remain inconclusive', async t => {
  const { store, spec } = fixture(t, { comparison: { ...comparison(), policy: 'review' } });
  const result = await improve(store, 'main', spec, invoker);
  assert.equal(result.status, 'inconclusive'); assert.equal(result.selectedHash, spec.target.hash);
  assert.equal(store.state.decisions.find(d => d.iteration === 0).comparison.effect, 1);
});

test('critical failures veto a taste preference and avoid unnecessary comparison calls', async t => {
  const { store, spec } = fixture(t);
  const result = await improve(store, 'main', spec, req => {
    const value = data(req);
    return value.skill ? completed(value.skill['SKILL.md'] === 'BASE' ? 'adequate' : 'wrong') : judge(value);
  });
  assert.equal(result.selectedHash, spec.target.hash);
  assert.equal(store.state.decisions.find(d => d.iteration === 0).status, 'reject');
  assert.ok(store.state.trials.length < callPlan(spec).fullSearchUpperBound);
});

test('a new atomic regression is detected even when both aggregate cases fail', () => {
  const row = { id: 'same', repeat: 0, status: 'graded', score: 0 };
  assert.equal(compareRows([{ ...row, checks: [{ pass: true }, { pass: false }] }], [{ ...row, checks: [{ pass: false }, { pass: true }] }]), 'reject');
});

test('repeated semantic judgments use the same artifact and block on disagreement', async t => {
  const semantic = { id: 'a', group: 'a', split: 'explore', input: 'task', rubric: 'Must be correct.', calibration: [{ output: 'yes', pass: true }, { output: 'no', pass: false }] };
  const { store, spec } = fixture(t, { candidates: [], comparison: undefined, judgeRepeats: 2, cases: [semantic] });
  let calls = 0;
  const result = await improve(store, 'main', spec, req => {
    calls++; return completed(JSON.stringify({ pass: calls === 1, evidence: 'Inconsistent on the same frozen answer.' }));
  });
  assert.equal(result.status, 'inconclusive'); assert.equal(calls, 2);
  const packets = store.state.trials.map(t => data(t.request));
  assert.equal(packets[0].response, packets[1].response);
  assert.equal(callPlan(spec).calibration, 4);
});

test('comparison confirmation requires fresh comparative support, not tied failures or mere absence of regression', async t => {
  const { spec, store } = fixture(t, config => ({ ...config, cases: [...config.cases, { ...config.cases[0], id: 'confirm', group: 'confirm', split: 'confirm', input: 'confirmation task' }] }));
  const result = await improve(store, 'main', spec, req => {
    const value = data(req);
    return value.skill && value.task === 'confirmation task' ? completed('clear') : invoker(req);
  });
  assert.equal(result.status, 'inconclusive'); assert.equal(result.selectedHash, spec.target.hash);
  assert.equal(result.confirmation.comparison.status, 'retain');
});

test('wrong comparative calibration stops before any target calls', async t => {
  const { store, spec } = fixture(t);
  const result = await improve(store, 'main', spec, () => completed('{"winner":"tie","evidence":"Incorrect calibration."}'));
  assert.equal(result.status, 'evaluation-invalid'); assert.equal(store.state.trials.length, 2);
  assert.ok(store.state.trials.every(t => t.role === 'judge'));
});

test('a budget ending between orderings preserves the first judgment without inventing the second', async t => {
  const { store } = fixture(t); let calls = 0;
  const result = await judgePair(store, 'limited', 'task', 'adequate', 'clear', comparison(), req => { calls++; return invoker(req); }, { ...budget, maxCalls: 1 });
  assert.equal(result.status, 'grading_error'); assert.equal(result.judgments.length, 1); assert.equal(calls, 1);
  assert.equal(store.state.trials.at(-1).status, 'budget_stopped');
});

test('comparative losses cannot disappear inside a positive group average', () => {
  const entries = ['a', 'b', 'c'].map(id => ({ id, group: 'same' }));
  const rows = entries.map(({ id }, i) => ({ id, repeat: 0, status: 'graded', winner: i ? 'B' : 'A', delta: i ? 1 : -1 }));
  assert.equal(summarizePreference(rows, entries, comparison()).status, 'reject');
  assert.throws(() => summarizePreference(rows, entries, comparison(), 0), /settings/);
});

test('adaptive comparative adoption requires confirmation and cannot silently multiply batched judges', t => {
  const { config, root } = fixture(t);
  assert.throws(() => loadExperiment({ ...config, mode: 'improve', method: config.target, editable: ['SKILL.md'] }, root), /confirmation/);
  assert.throws(() => loadExperiment({ ...config, candidates: [...config.candidates, ...config.candidates] }, root), /confirmation/);
  assert.throws(() => loadExperiment({ ...config, judgeBatchSize: 2, judgeRepeats: 2 }, root), /batching/);
});

test('host comparative judgments suspend and resume both orderings exactly once', async t => {
  const { root, config } = fixture(t, { runtime: { adapter: 'host', model: 'host-inherited' } });
  const configFile = join(root, 'experiment.json'), out = join(root, 'host-out');
  writeFileSync(configFile, JSON.stringify(config));
  let result = await run(configFile, out), calls = 0;
  while (result.outcome === 'needs-host-response') {
    const input = readHostInput(result.pending.inputFile, result.pending.inputHash);
    const response = invoker(input), executionId = `synthetic-${calls++}`;
    hostOperation(out, 'attach', { requestId: result.pending.requestId, executionId });
    result = await run(configFile, out, undefined, { requestId: result.pending.requestId, executionId, status: 'completed', output: response.output });
  }
  assert.equal(result.outcome, 'accept'); assert.equal(result.comparison.effect, 1);
  assert.equal(calls, 30); assert.equal(result.attempted, calls);
  assert.equal((await run(configFile, out)).attempted, calls);
});

test('new semantic verdict validation refuses unsupported fields and empty evidence', async t => {
  const c = { id: 'rule', group: 'rule', split: 'explore', input: 'Choose allow or deny.', rubric: 'Follow the supplied rule.', calibration: [{ output: 'allow', pass: true }, { output: 'deny', pass: false }] };
  const { store, spec } = fixture(t, { candidates: [], comparison: undefined, cases: [c] });
  const result = await improve(store, 'main', spec, () => completed('{"pass":true,"evidence":"","override":true}'));
  assert.equal(result.status, 'inconclusive'); assert.equal(store.state.trials.length, 1);
});

test('bad or worse exploration preferences veto otherwise successful selection', async t => {
  const { store, spec } = fixture(t, config => ({ ...config, cases: [{ ...config.cases[0], id: 'explore', group: 'explore', input: 'explore-only' }, ...config.cases.map(c => ({ ...c, split: 'select' }))] }));
  const result = await improve(store, 'main', spec, req => {
    const value = data(req);
    return value.A !== undefined && value.task === 'explore-only' ? completed('{"winner":"both_bad","evidence":"Neither achieves the task."}') : invoker(req);
  });
  assert.equal(result.status, 'inconclusive'); assert.equal(result.selectedHash, spec.target.hash);
});

test('comparative inner tasks measure confirmed downstream gain and send only exploration reasons to proposals', async t => {
  const { store, spec } = fixture(t, config => {
    const inner = { ...config, mode: 'improve', method: { root: 'method', files: ['SKILL.md'] }, editable: ['SKILL.md'], candidates: [], maxCandidates: 2,
      cases: [...config.cases.map(c => ({ ...c, id: `explore-${c.id}` })), ...config.cases.map(c => ({ ...c, id: `select-${c.id}`, group: `select-${c.group}`, split: 'select' })), ...config.cases.map(c => ({ ...c, id: `confirm-${c.id}`, group: `confirm-${c.group}`, split: 'confirm' }))] };
    return { schema: 1, mode: 'compare', goal: 'Measure improvement method.', runtime: config.runtime, budget,
      target: { root: 'method', files: ['SKILL.md'] }, tasks: [{ id: 'task', group: 'task', split: 'explore', experiment: inner }] };
  });
  let generated = 0;
  const result = await improve(store, 'main', spec, req => {
    const value = data(req);
    if (!value.method) return invoker(req);
    if (generated++) {
      const preferences = value.history.flatMap(h => h.explorationPreferences);
      assert.equal(preferences.length, 6); assert.ok(preferences.every(r => r.id.startsWith('explore-')));
      return completed(JSON.stringify({ action: 'stop', parent: '', hypothesis: 'No further change needed.', edits: [] }));
    }
    return completed(JSON.stringify({ action: 'candidate', parent: value.history[0].hash, hypothesis: 'Use the stronger synthetic response.', edits: [{ path: 'SKILL.md', content: 'NEW' }] }));
  });
  assert.equal(result.status, 'retain');
  assert.equal(result.baseline[0].status, 'graded'); assert.equal(result.baseline[0].score, 1);
  assert.equal(result.baseline[0].evidence.result.comparison.effect, 1);
  assert.ok(result.baseline[0].evidence.result.confirmation);
});
