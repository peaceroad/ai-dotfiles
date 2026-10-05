import assert from 'node:assert/strict';
import test from 'node:test';
import { defaults, scenarios, makeCase, configurations } from './prepare-self-application.mjs';
import { loadExperiment, callPlan, checkOutput } from '../../../plugins/agent-eval-tools/skills/agent-improve/scripts/experiment.mjs';

// Independent policy implementation checks the hand-authored scenario labels.
function referencePolicy(record) {
  if (record.legalHold === true || record.pendingExport === true) return 'keep';
  const threshold = new Map([['audit', 90], ['operational', 30], ['ephemeral', 7]]).get(record.category);
  const validNumber = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  if (!validNumber(record.age) || threshold === undefined) return 'review';
  if (record.age < threshold) return 'keep';
  const approvalValid = record.ownerVerified === true && record.approval === true && record.approvalPolicy === 'r2'
    && validNumber(record.now) && validNumber(record.approvalExpiresAt) && record.now <= record.approvalExpiresAt;
  return approvalValid ? 'delete' : 'review';
}

test('retention migration labels and calibration distinguish changed conditions and preserved behavior', () => {
  for (const scenario of scenarios) {
    const actions = Object.fromEntries(scenario.records.map(record => [record.id, referencePolicy({ ...defaults, ...record })]));
    assert.deepEqual(actions, scenario.expected);
    const c = makeCase(scenario);
    const passes = text => { const output = JSON.parse(text); return c.checks.every(check => output[check.pointer.slice(1)] === check.value); };
    for (const sample of c.calibration) assert.equal(passes(sample.output), sample.pass);
    for (const key of Object.keys(actions)) {
      const wrong = { ...actions, [key]: actions[key] === 'keep' ? 'delete' : 'keep' };
      assert.equal(passes(JSON.stringify(wrong)), false, key);
    }
  }
});

test('migration conditions cover boundaries without requiring a particular JSON field order', () => {
  for (const [category, edge] of [['audit', 90], ['operational', 30], ['ephemeral', 7]]) {
    assert.equal(referencePolicy({ ...defaults, category, age: edge - 1, approval: false }), 'keep');
    assert.equal(referencePolicy({ ...defaults, category, age: edge }), 'delete');
    assert.equal(referencePolicy({ ...defaults, category, age: edge, approvalExpiresAt: 99 }), 'review');
  }
  for (const value of [undefined, null, '40', -1]) assert.equal(referencePolicy({ ...defaults, age: value }), 'review');
  assert.equal(referencePolicy({ ...defaults, legalHold: true, age: null, category: null }), 'keep');
});

test('real graders accept every valid calibration alternative and the shared budget covers a full candidate comparison', () => {
  const configs = configurations();
  for (const config of [configs.migration, configs.preservation]) {
    const spec = loadExperiment(config, process.cwd());
    for (const c of spec.cases) for (const sample of c.calibration) {
      assert.equal(checkOutput(sample.output, c.checks).every(x => x.pass), sample.pass);
    }
    assert.equal(callPlan(spec).coversFullSearch, true);
  }
  const spec = loadExperiment(configs.self, process.cwd());
  const innerCalls = spec.tasks.reduce((sum, task) => sum + callPlan(task.experiment).fullSearchUpperBound, 0);
  assert.equal(innerCalls, 13);
  assert.equal(3 * innerCalls + 1, spec.budget.maxCalls);
});
