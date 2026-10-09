import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cases, criteria, manifest, checkDefinitions, checkPinnedSources, checkCurrentSources, validateRecord } from './suite.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Every record below is invented test data. No fixture represents an actual agent trial.
function fixture(stage = 'implicit-selection') {
  const observed = id => ({ result: 'pass', basis: 'observed', evidenceRefs: [`synthetic-fixture:${id}`] });
  return {
    stage, mode: criteria.stages[stage].mode, execution: 'completed', verdict: 'pass',
    reason: 'Synthetic record for checking the protocol only.',
    taskReference: 'synthetic-fixture:task-input',
    review: { reviewer: 'synthetic-observer', referencesInspected: true, evidenceRefs: ['synthetic-fixture:review'] },
    preconditions: Object.fromEntries(criteria.stages[stage].preconditions.map(id => [id, observed(id)])),
    checks: Object.fromEntries(criteria.stages[stage].checks.map(id => [id, observed(id)])),
    boundaryDescription: 'Synthetic process restart; not a live event.',
  };
}

test('case definitions separate natural inputs, criteria, and synthetic-only conditions', checkDefinitions);
test('frozen public sources match their recorded commit and hashes', checkPinnedSources);
test('current candidate sources match the declared frozen target', () => checkCurrentSources());

for (const change of ['modified', 'missing']) {
  test(`a ${change} candidate file cannot hide behind a valid frozen snapshot`, t => {
    const root = mkdtempSync(join(tmpdir(), 'dot-acceptance-fixture-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    for (const target of manifest.targets) {
      const destination = resolve(root, target.path);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, readFileSync(resolve(repository, target.path)));
    }
    checkCurrentSources(root);
    const file = resolve(root, 'plugins/dot-toolkit/skills/dot-guidelines/SKILL.md');
    if (change === 'missing') rmSync(file);
    else {
      const bytes = readFileSync(file);
      bytes[0] ^= 1; // Keep size unchanged so the hash check must detect the edit.
      writeFileSync(file, bytes);
    }
    assert.throws(() => checkCurrentSources(root), /Current candidate/);
  });
}

for (const stage of Object.keys(criteria.stages)) {
  test(`a fully referenced synthetic ${stage} record is structurally valid, not behavior verified`, () => {
    assert.deepEqual(validateRecord(fixture(stage)), {
      recordStructure: 'valid', reportedVerdict: 'pass', behavioralVerification: 'not_performed_by_checker',
    });
  });
}

test('an unrun trial stays unrun', () => {
  const record = { stage: 'implicit-selection', mode: 'main-dot', execution: 'not_run', verdict: 'not_run', reason: 'Not attempted.' };
  assert.equal(validateRecord(record).reportedVerdict, 'not_run');
  assert.throws(() => validateRecord({ ...record, verdict: 'pass' }), /unrun trial/);
});

test('inherited object keys are not evidence stages', () => {
  for (const stage of ['toString', '__proto__', 'constructor']) {
    assert.throws(() => validateRecord({ stage, mode: 'main-dot', execution: 'not_run', verdict: 'not_run', reason: 'Synthetic unknown stage.' }), /Unknown evidence stage/);
  }
});

for (const missing of ['review', 'preconditions', 'checks']) {
  test(`a pass claim rejects missing ${missing}`, () => {
    const record = fixture(); delete record[missing];
    assert.throws(() => validateRecord(record));
  });
}

test('a warm or unknown context cannot establish unprimed discovery', () => {
  const record = fixture();
  record.preconditions.unprimedContextConfirmed.result = 'unobservable';
  assert.throws(() => validateRecord(record), /Unestablished precondition/);
  record.verdict = 'unobservable';
  assert.equal(validateRecord(record).reportedVerdict, 'unobservable');
});

for (const mode of ['simulation', 'delegated', 'codex']) {
  test(`${mode} cannot pass as actual main-dot discovery`, () => {
    const record = { ...fixture(), mode };
    assert.throws(() => validateRecord(record), /execution mode/);
  });
}

test('self-reported reading, uninspected references, and absent references cannot support pass', () => {
  for (const mutate of [
    r => { r.checks.completeGuidanceBeforeWork.basis = 'self-report'; },
    r => { r.review.referencesInspected = false; },
    r => { r.checks.completeGuidanceBeforeWork.evidenceRefs = []; },
  ]) {
    const record = fixture(); mutate(record); assert.throws(() => validateRecord(record));
  }
});

test('a known loader mismatch is a failure, not a successful source installation', () => {
  const record = fixture('current-loading');
  record.checks.targetLoaderMatches.result = 'fail';
  assert.throws(() => validateRecord(record), /Missing observed pass/);
  record.verdict = 'fail';
  assert.equal(validateRecord(record).reportedVerdict, 'fail');
});

test('missing observation is not sufficient to claim failure', () => {
  const record = fixture('current-loading');
  record.verdict = 'fail';
  record.checks.completeGuidanceBeforeWork.result = 'unobservable';
  assert.throws(() => validateRecord(record), /observed violation/);
});

test('continuity needs a witnessed and named boundary', () => {
  const record = fixture('continuity');
  delete record.boundaryDescription;
  assert.throws(() => validateRecord(record), /boundary/);
  record.boundaryDescription = 'Synthetic boundary.';
  record.preconditions.boundaryActuallyObserved.result = 'unobservable';
  assert.throws(() => validateRecord(record), /Unestablished precondition/);
});

test('input command returns only a natural request and refuses simulation cases', () => {
  const script = fileURLToPath(new URL('./suite.mjs', import.meta.url));
  for (const c of cases) {
    const result = spawnSync(process.execPath, [script, 'input', c.id], { encoding: 'utf8' });
    if (c.mode === 'main-dot') {
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, c.input + '\n');
    } else {
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
    }
  }
});
