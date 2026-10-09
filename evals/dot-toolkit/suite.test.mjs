import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cases, criteria, manifest, checkDefinitions, checkPinnedSources, checkCurrentSources, validateRecord } from './suite.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const repository = resolve(directory, '../..');
const sourcePaths = [
  'plugins/dot-toolkit/plugin.json',
  'plugins/dot-toolkit/skills/dot-guidelines/SKILL.md',
  'dot/AGENTS.md',
  'dot/dot-setup.md',
];
// Independent acceptance requirements: do not derive these or fixtures from criteria.json.
// Intentional contract changes need review here as well as in the runtime definitions.
const stageContract = {
  placement: {
    mode: 'file-inspection',
    preconditions: ['sourceIdentityKnown'],
    checks: ['expectedBytesMatch', 'requiredReferencesResolve', 'indexManifestAgree'],
  },
  'current-loading': {
    mode: 'main-dot',
    preconditions: ['mainDotConfirmed', 'targetIdentityKnown'],
    checks: ['targetLoaderMatches', 'completeGuidanceBeforeWork', 'taskResultCorrect'],
  },
  'implicit-selection': {
    mode: 'main-dot',
    preconditions: ['mainDotConfirmed', 'targetIdentityKnown', 'unprimedContextConfirmed', 'noLoadingCues', 'catalogVisible'],
    checks: ['targetLoaderMatches', 'completeGuidanceBeforeWork', 'appropriateSkillSelection', 'taskResultCorrect'],
  },
  continuity: {
    mode: 'main-dot',
    preconditions: ['mainDotConfirmed', 'targetIdentityKnown', 'boundaryActuallyObserved'],
    checks: ['targetLoaderMatches', 'sameFilesAcrossBoundary', 'completeGuidanceBeforeWork', 'appropriateSkillSelection', 'taskResultCorrect'],
  },
};

// Every record below is invented test data. No fixture represents an actual agent trial.
const observed = (id, result = 'pass') => ({ result, basis: 'observed', evidenceRefs: [`synthetic-fixture:${id}`] });
function fixture(stage = 'implicit-selection', verdict = 'pass') {
  const contract = stageContract[stage];
  const record = {
    stage, mode: contract.mode, execution: verdict === 'not_run' ? 'not_run' : 'completed', verdict,
    reason: 'Synthetic record for checking the protocol only.',
    taskReference: 'synthetic-fixture:task-input',
    review: { reviewer: 'synthetic-observer', referencesInspected: true, evidenceRefs: ['synthetic-fixture:review'] },
    preconditions: Object.fromEntries(contract.preconditions.map(id => [id, observed(id)])),
    checks: Object.fromEntries(contract.checks.map(id => [id, observed(id)])),
    boundaryDescription: 'Synthetic process restart; not a live event.',
  };
  if (verdict === 'fail') record.checks[contract.checks[0]].result = 'fail';
  return record;
}

function definitions(mutate) {
  const copy = structuredClone({ cases, criteria, manifest });
  mutate(copy);
  return copy;
}

function temporaryDirectory(t) {
  const root = mkdtempSync(join(tmpdir(), 'dot-acceptance-fixture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('case definitions separate natural inputs, criteria, and synthetic-only conditions', () => checkDefinitions());
test('stage definitions preserve the independent acceptance contract', () => {
  assert.deepEqual(Object.keys(criteria.stages).sort(), Object.keys(stageContract).sort());
  for (const [name, expected] of Object.entries(stageContract)) {
    assert.equal(criteria.stages[name].mode, expected.mode, `${name} mode`);
    for (const field of ['preconditions', 'checks']) {
      assert.deepEqual([...criteria.stages[name][field]].sort(), [...expected[field]].sort(), `${name} ${field}`);
    }
  }
});

test('removing any criterion definition fails the independent contract test', t => {
  const root = temporaryDirectory(t);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // Run the isolated contract test as a fresh test process.
  for (const file of ['suite.mjs', 'suite.test.mjs', 'cases.json', 'criteria.json', 'manifest.json']) {
    writeFileSync(join(root, file), readFileSync(join(directory, file)));
  }
  for (const [stage, contract] of Object.entries(stageContract)) {
    for (const field of ['preconditions', 'checks']) {
      for (const name of contract[field]) {
        const mutant = structuredClone(criteria);
        mutant.stages[stage][field] = mutant.stages[stage][field].filter(id => id !== name);
        writeFileSync(join(root, 'criteria.json'), JSON.stringify(mutant));
        const result = spawnSync(process.execPath, [
          '--test', '--test-reporter=tap', '--test-name-pattern=^stage definitions preserve the independent acceptance contract$', join(root, 'suite.test.mjs'),
        ], { encoding: 'utf8', env });
        assert.equal(result.status, 1, `${stage}.${field}.${name}: ${result.stderr}`);
        assert.match(result.stdout, /not ok \d+ - stage definitions preserve the independent acceptance contract/);
      }
    }
  }
});

for (const path of sourcePaths) {
  test(`the source manifest cannot omit ${path}`, () => {
    assert.throws(() => checkDefinitions(definitions(d => {
      d.manifest.targets = d.manifest.targets.filter(target => target.path !== path);
    })), /exactly the four required files/);
  });
}

test('the source manifest rejects duplicate, substituted, and extra targets', () => {
  for (const mutate of [
    d => { d.manifest.targets[3] = d.manifest.targets[0]; },
    d => { d.manifest.targets[3].path = 'dot/unrelated.md'; },
    d => { d.manifest.targets.push({ ...d.manifest.targets[0], path: 'dot/unrelated.md' }); },
  ]) assert.throws(() => checkDefinitions(definitions(mutate)), /unique|exactly the four required files/);
});

test('stage modes and condition lists have valid, unique identifiers', () => {
  for (const mode of [null, [], '', 'unknown']) {
    assert.throws(() => checkDefinitions(definitions(d => { d.criteria.stages.placement.mode = mode; })), /stage mode/);
  }
  for (const field of ['preconditions', 'checks']) {
    for (const list of [null, {}, 'oneCondition', [], [null], [''], ['bad-name'], ['constructor'], ['same', 'same']]) {
      assert.throws(() => checkDefinitions(definitions(d => { d.criteria.stages.placement[field] = list; })), /needs|Invalid|Duplicate/);
    }
  }
  assert.throws(() => checkDefinitions(definitions(d => {
    d.criteria.stages.placement.checks.push('sourceIdentityKnown');
  })), /Duplicate stage condition/);
});

test('result definitions cannot add or remove verdicts or omit their meaning', () => {
  for (const mutate of [
    d => { delete d.criteria.verdicts.fail; },
    d => { d.criteria.verdicts.unknown = 'Not a result.'; },
    d => { d.criteria.verdicts.pass = ''; },
  ]) assert.throws(() => checkDefinitions(definitions(mutate)), /verdict|Verdict/);
});

test('frozen public sources match their recorded commit and hashes', checkPinnedSources);
test('current candidate sources match the declared frozen target', () => checkCurrentSources());

for (const path of sourcePaths) {
  for (const change of ['modified', 'missing']) {
    test(`a ${change} ${path} cannot hide behind a valid frozen snapshot`, t => {
      const root = temporaryDirectory(t);
      for (const source of sourcePaths) {
        const destination = resolve(root, source);
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, readFileSync(resolve(repository, source)));
      }
      checkCurrentSources(root);
      const file = resolve(root, path);
      if (change === 'missing') rmSync(file);
      else {
        const bytes = readFileSync(file);
        bytes[0] ^= 1; // Keep size unchanged so the hash check must detect the edit.
        writeFileSync(file, bytes);
      }
      assert.throws(() => checkCurrentSources(root), /Current candidate/);
    });
  }
}

for (const [stage, contract] of Object.entries(stageContract)) {
  test(`a fully referenced synthetic ${stage} record is structurally valid, not behavior verified`, () => {
    assert.deepEqual(validateRecord(fixture(stage)), {
      recordStructure: 'valid', reportedVerdict: 'pass', behavioralVerification: 'not_performed_by_checker',
    });
  });
  for (const field of ['preconditions', 'checks']) {
    for (const name of contract[field]) {
      for (const change of ['missing', 'fail', 'self-report']) {
        test(`${stage} cannot establish ${field}.${name} with ${change}`, () => {
          for (const verdict of field === 'preconditions' ? ['pass', 'fail'] : ['pass']) {
            const record = fixture(stage, verdict);
            if (change === 'missing') delete record[field][name];
            else if (change === 'fail') record[field][name].result = 'fail';
            else record[field][name].basis = 'self-report';
            assert.throws(() => validateRecord(record), /Unestablished precondition|Missing observed pass/);
          }
        });
      }
    }
  }
  for (const name of contract.checks) {
    test(`${stage} may fail on observed ${name} without the remaining checks`, () => {
      const record = fixture(stage, 'fail');
      record.checks = { [name]: observed(name, 'fail') };
      assert.equal(validateRecord(record).reportedVerdict, 'fail');
      record.checks[name].basis = 'self-report';
      assert.throws(() => validateRecord(record), /observed violation/);
    });
  }
  test(`${stage} may remain unobservable with partial or absent observations`, () => {
    const record = fixture(stage, 'unobservable');
    record.preconditions = { [contract.preconditions[0]]: { result: 'unobservable', basis: 'observed' } };
    record.checks = { [contract.checks[0]]: { result: 'pass', basis: 'self-report', evidenceRefs: [] } };
    assert.equal(validateRecord(record).reportedVerdict, 'unobservable');
    delete record.preconditions;
    delete record.checks;
    assert.equal(validateRecord(record).reportedVerdict, 'unobservable');
  });
}

test('an unrun trial stays unrun with optional, well-formed partial observations', () => {
  const record = { stage: 'implicit-selection', mode: 'main-dot', execution: 'not_run', verdict: 'not_run', reason: 'Not attempted.' };
  assert.equal(validateRecord(record).reportedVerdict, 'not_run');
  record.checks = { taskResultCorrect: { result: 'not_run', basis: 'observed', evidenceRefs: [] } };
  assert.equal(validateRecord(record).reportedVerdict, 'not_run');
  assert.throws(() => validateRecord({ ...record, verdict: 'pass' }), /unrun trial/);
  assert.throws(() => validateRecord({ ...record, execution: 'completed' }), /completed observation/);
});

test('inherited keys and non-string stage names are not evidence stages', () => {
  for (const stage of ['toString', '__proto__', 'constructor', ['placement']]) {
    assert.throws(() => validateRecord({ ...fixture(), stage }), /Unknown evidence stage/);
  }
});

test('inherited observations cannot support a verdict', () => {
  const record = fixture();
  record.checks = Object.create(record.checks);
  assert.throws(() => validateRecord(record), /Missing observed pass/);
});

for (const missing of ['review', 'preconditions', 'checks']) {
  test(`a pass claim rejects missing ${missing}`, () => {
    const record = fixture(); delete record[missing];
    assert.throws(() => validateRecord(record));
  });
}

for (const verdict of ['pass', 'fail', 'unobservable', 'not_run']) {
  for (const field of ['preconditions', 'checks']) {
    test(`${verdict} validates every supplied ${field} entry before verdict semantics`, () => {
      // For fail records, corrupt a different check from the observed violation.
      const name = stageContract['implicit-selection'][field].at(-1);
      for (const item of [
        null, [], true, 'pass', {},
        { ...observed(name), result: 'unknown' },
        { ...observed(name), result: ['pass'] },
        { ...observed(name), basis: 'unknown' },
        { ...observed(name), basis: ['observed'] },
        ...[null, {}, '', [''], [null], [1], []].map(evidenceRefs => ({ ...observed(name), evidenceRefs })),
        { result: 'fail', basis: 'observed' },
      ]) {
        const record = fixture('implicit-selection', verdict);
        record[field][name] = item;
        assert.throws(() => validateRecord(record), /must be an object|Unknown result|Unknown basis|evidence references/);
      }
    });
    test(`${verdict} rejects malformed ${field} maps and unknown keys`, () => {
      for (const map of [null, [], 'pass', 1]) {
        const record = fixture('implicit-selection', verdict);
        record[field] = map;
        assert.throws(() => validateRecord(record), /must be an object/);
      }
      for (const key of ['misspelledCondition', 'constructor', '__proto__', 'toString']) {
        const record = fixture('implicit-selection', verdict);
        record[field] = { ...record[field], [key]: observed(key) };
        assert.throws(() => validateRecord(record), /Unknown .* entry/);
      }
    });
  }
  test(`${verdict} checks supplied review and reference fields`, () => {
    for (const mutate of [
      r => { r.review = []; },
      r => { r.review.reviewer = ''; },
      r => { r.review.evidenceRefs = [null]; },
      r => { r.review.referencesInspected = 'true'; },
      r => { r.taskReference = 1; },
      r => { r.boundaryDescription = []; },
    ]) {
      const record = fixture('implicit-selection', verdict);
      mutate(record);
      assert.throws(() => validateRecord(record), /Review|review|taskReference|boundaryDescription/);
    }
  });
}

test('entry references may be absent or empty only for non-observed or inconclusive results', () => {
  for (const result of ['pass', 'fail', 'unobservable', 'not_run']) {
    for (const basis of ['observed', 'self-report']) {
      for (const refs of [undefined, [], ['synthetic-fixture:entry']]) {
        const record = fixture('implicit-selection', 'unobservable');
        const item = { result, basis };
        if (refs !== undefined) item.evidenceRefs = refs;
        record.checks = { taskResultCorrect: item };
        if (basis === 'observed' && ['pass', 'fail'].includes(result) && !refs?.length) {
          assert.throws(() => validateRecord(record), /needs evidence references/);
        } else assert.equal(validateRecord(record).reportedVerdict, 'unobservable');
      }
      for (const refs of [null, 'synthetic-fixture:entry', [''], [1]]) {
        const record = fixture('implicit-selection', 'unobservable');
        record.checks = { taskResultCorrect: { result, basis, evidenceRefs: refs } };
        assert.throws(() => validateRecord(record), /Invalid evidence references/);
      }
    }
  }
});

test('record fields use objects, supported enums, and nonempty reasons', () => {
  for (const record of [null, [], 1, 'record']) assert.throws(() => validateRecord(record), /must be an object/);
  for (const [field, value] of [['stage', []], ['verdict', ['pass']], ['execution', 'unknown'], ['mode', 'unknown'], ['reason', ' ']]) {
    assert.throws(() => validateRecord({ ...fixture(), [field]: value }), /Unknown|reason/);
  }
});

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
    record.verdict = 'unobservable';
    assert.equal(validateRecord(record).reportedVerdict, 'unobservable');
  });
}

test('uninspected references cannot support a completed observation', () => {
  for (const verdict of ['pass', 'fail', 'unobservable']) {
    const record = fixture('implicit-selection', verdict);
    record.review.referencesInspected = false;
    assert.throws(() => validateRecord(record), /must inspect/);
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
