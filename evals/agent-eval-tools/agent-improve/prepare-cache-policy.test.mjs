import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadExperiment, callPlan, checkOutput, improve } from '../../../plugins/agent-eval-tools/skills/agent-improve/scripts/experiment.mjs';
import { openStore } from '../../../plugins/agent-eval-tools/skills/agent-improve/scripts/records.mjs';

const here = dirname(fileURLToPath(import.meta.url));
function prepared(t) {
  const root = mkdtempSync(join(tmpdir(), 'agent-eval-fixture-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const output = join(root, 'inputs');
  const result = spawnSync(process.execPath, [join(here, 'prepare-cache-policy.mjs'), output], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return { root, output, config: JSON.parse(readFileSync(join(output, 'experiment.json'), 'utf8')) };
}

// Independent executable interpretation of the fictional old and requested
// policies, used to validate fixture labels and controller gates, not models.
function action(record, migrated) {
  const flag = key => record[key] === true;
  const number = key => typeof record[key] === 'number' && Number.isFinite(record[key]) && record[key] >= 0;
  if (flag('requiresAuth') && !flag('authorized')) return 'blocked';
  if (flag('crossTenant') || flag('corrupt') || flag('forceRefresh')) return 'fetch';
  if (!number('age') || !number('ttl')) return 'revalidate';
  if (record.age <= record.ttl) return 'reuse';
  if (migrated && flag('offline') && flag('allowStale') && !flag('sensitive') && number('grace') && record.age <= record.ttl + record.grace) return 'reuse';
  return 'revalidate';
}
function answer(input, migrated) {
  const { defaults, records } = JSON.parse(input.slice(input.lastIndexOf('\n') + 1));
  return Object.fromEntries(records.map(record => [record.id, action({ ...defaults, ...record }, migrated)]));
}
const passes = (output, checks) => checkOutput(JSON.stringify(output), checks).every(check => check.pass);

test('preparation helpers preserve existing experiment inputs', t => {
  const root = mkdtempSync(join(tmpdir(), 'agent-eval-prepare-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const script of ['prepare.mjs', 'prepare-cache-policy.mjs', 'prepare-self-application.mjs', 'prepare-coexistence.mjs']) {
    const output = join(root, script);
    mkdirSync(output);
    const file = join(output, 'compare.json');
    writeFileSync(file, 'USER-REVIEWED CONFIGURATION');
    const result = spawnSync(process.execPath, [join(here, script), output], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, script);
    assert.match(result.stderr, /not overwritten/);
    assert.equal(readFileSync(file, 'utf8'), 'USER-REVIEWED CONFIGURATION');
  }
  const fresh = join(root, 'fresh');
  const result = spawnSync(process.execPath, [join(here, 'prepare.mjs'), fresh], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const name of ['compare', 'improve', 'no-change', 'invalid-grader', 'self']) {
    assert.ok(loadExperiment(JSON.parse(readFileSync(join(fresh, `${name}.json`), 'utf8')), fresh));
  }
});

test('prepared migration labels, alternatives and every single-result mutation agree with the policy', t => {
  const { output, config } = prepared(t), spec = loadExperiment(config, output);
  assert.equal(callPlan(spec).fullSearchUpperBound, 12);
  for (const entry of spec.cases) {
    assert.equal(passes(answer(entry.input, true), entry.checks), true, entry.id);
    assert.equal(passes(answer(entry.input, false), entry.checks), entry.id.includes('preservation'), entry.id);
    for (const sample of entry.calibration) {
      assert.equal(checkOutput(sample.output, entry.checks).every(check => check.pass), sample.pass, entry.id);
    }
    const correct = answer(entry.input, true);
    for (const id of Object.keys(correct)) {
      const changed = { ...correct, [id]: correct[id] === 'blocked' ? 'reuse' : 'blocked' };
      assert.equal(passes(changed, entry.checks), false, `${entry.id}/${id}`);
    }
  }
});

for (const fault of [null, 'auth-first', 'fresh-sensitive']) {
  test(`migration comparison ${fault ? `vetoes a regression in ${fault}` : 'accepts the independently specified policy'}`, async t => {
    const { root, output, config } = prepared(t), candidate = join(root, 'candidate');
    mkdirSync(join(candidate, 'references'), { recursive: true });
    // Marker bundle and deterministic responses exercise controller behavior only.
    writeFileSync(join(candidate, 'SKILL.md'), 'SYNTHETIC MIGRATED POLICY');
    writeFileSync(join(candidate, 'references/policy.md'), 'SYNTHETIC POLICY');
    const spec = loadExperiment({ ...config, mode: 'compare', proposalMethodFiles: undefined, candidates: [{ root: candidate, files: config.target.files }] }, output);
    const store = openStore(join(root, 'run'), { experiment: spec });
    try {
      const result = await improve(store, 'main', spec, async request => {
        const data = JSON.parse(request.prompt.slice(request.prompt.lastIndexOf('\n') + 1));
        const migrated = data.skill['SKILL.md'] === 'SYNTHETIC MIGRATED POLICY';
        const response = answer(data.task, migrated);
        if (migrated && fault && Object.hasOwn(response, fault)) response[fault] = 'revalidate';
        return { status: 'completed', output: JSON.stringify(response), usage: { input_tokens: 1, output_tokens: 1 } };
      });
      if (fault === 'auth-first') {
        assert.equal(result.status, 'retain');
        assert.equal(store.state.candidates[0].status, 'reject');
        assert.equal(result.confirmation, null);
      } else if (fault === 'fresh-sensitive') {
        assert.equal(result.status, 'reject');
        assert.ok(result.confirmation);
      } else assert.equal(result.status, 'accept');
      assert.equal(result.selectedHash === spec.target.hash, Boolean(fault));
      assert.ok(store.state.trials.length <= 8);
    } finally { store.close(); }
  });
}
