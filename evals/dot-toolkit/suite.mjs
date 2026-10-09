import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const repository = resolve(directory, '../..');
const read = name => JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
export const cases = read('cases.json');
export const criteria = read('criteria.json');
export const manifest = read('manifest.json');
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const referenceList = value => Array.isArray(value) && value.every(nonempty);
const references = value => referenceList(value) && value.length > 0;
const verdicts = ['pass', 'fail', 'not_run', 'unobservable'];
const modes = ['file-inspection', 'main-dot', 'simulation', 'delegated', 'codex'];
// This bundle is the acceptance target, independently of the editable manifest.
const requiredSources = [
  'plugins/dot-toolkit/plugin.json',
  'plugins/dot-toolkit/skills/dot-guidelines/SKILL.md',
  'dot/AGENTS.md',
  'dot/dot-setup.md',
];

export function checkDefinitions(definitions = { cases, criteria, manifest }) {
  const { cases, criteria, manifest } = definitions;
  assert(Array.isArray(cases) && cases.length > 0, 'Case definitions must be a nonempty array');
  assert(object(criteria?.cases) && object(criteria.stages) && object(criteria.verdicts), 'Invalid criteria definition');
  assert.deepEqual(Object.keys(criteria.verdicts).sort(), [...verdicts].sort(), 'Unknown or missing verdict definitions');
  assert(Object.values(criteria.verdicts).every(nonempty), 'Verdict descriptions must be nonempty strings');
  assert.equal(new Set(cases.map(c => c.id)).size, cases.length);
  assert.deepEqual(Object.keys(criteria.cases).sort(), cases.map(c => c.id).sort());
  assert.deepEqual(Object.keys(criteria.stages), ['placement', 'current-loading', 'implicit-selection', 'continuity']);
  for (const [name, stage] of Object.entries(criteria.stages)) {
    assert(object(stage) && modes.includes(stage.mode), `Invalid stage mode: ${name}`);
    for (const field of ['preconditions', 'checks']) {
      assert(Array.isArray(stage[field]) && stage[field].length > 0, `Stage ${name} needs ${field}`);
      assert(stage[field].every(id => typeof id === 'string' && /^[a-z][A-Za-z0-9]*$/.test(id) && !Object.hasOwn(Object.prototype, id)), `Invalid ${field} identifier: ${name}`);
    }
    const conditions = [...stage.preconditions, ...stage.checks];
    assert.equal(new Set(conditions).size, conditions.length, `Duplicate stage condition: ${name}`);
  }
  for (const c of cases) {
    assert.match(c.id, /^[a-z]+(?:-[a-z]+)*$/);
    assert(['main-dot', 'simulation'].includes(c.mode));
    assert(nonempty(c.input));
    assert(criteria.cases[c.id].pass.length && criteria.cases[c.id].fail.length);
    if (c.mode === 'main-dot') {
      assert(!/dot-guidelines|SKILL\.md|AGENTS\.md|INDEX\.md|\/workspace\//.test(c.input));
      for (const skill of criteria.cases[c.id].skills) assert(!c.input.includes(skill));
    }
    if (c.fixture) {
      assert.equal(c.mode, 'simulation');
      assert.equal(criteria.fixtures[c.fixture]?.kind, 'synthetic-only');
    }
  }
  assert(object(manifest), 'Invalid source manifest');
  assert.match(manifest.sourceCommit, /^[a-f0-9]{40}$/);
  assert.equal(manifest.behavioralRuns, 'not_run');
  assert(Array.isArray(manifest.targets) && manifest.targets.every(object), 'Invalid source targets');
  const paths = manifest.targets.map(target => target.path);
  assert.equal(new Set(paths).size, paths.length, 'Source target paths must be unique');
  assert.deepEqual([...paths].sort(), [...requiredSources].sort(), 'Source targets must contain exactly the four required files');
  for (const target of manifest.targets) {
    assert.match(target.path, /^(plugins\/dot-toolkit\/|dot\/)/);
    assert(!target.path.split('/').some(part => !part || part === '.' || part === '..'));
    assert.match(target.sha256, /^[a-f0-9]{64}$/);
    assert(Number.isInteger(target.bytes) && target.bytes > 0);
  }
}

export function checkPinnedSources() {
  checkDefinitions();
  for (const target of manifest.targets) {
    const bytes = execFileSync('git', ['show', `${manifest.sourceCommit}:${target.path}`], { cwd: repository });
    assert.equal(bytes.length, target.bytes, `Pinned source size differs: ${target.path}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), target.sha256, `Pinned source hash differs: ${target.path}`);
  }
}

export function checkCurrentSources(root = repository) {
  checkDefinitions();
  for (const target of manifest.targets) {
    let bytes;
    try { bytes = readFileSync(resolve(root, target.path)); }
    catch { throw new Error(`Current candidate source is missing or unreadable: ${target.path}`); }
    assert.equal(bytes.length, target.bytes, `Current candidate differs from the declared target: ${target.path}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), target.sha256, `Current candidate differs from the declared target: ${target.path}`);
  }
}

// This validates a human/observer's record, not the truth or authenticity of its evidence.
// Even an accepted pass claim is not a behavioral verdict issued by this program.
export function validateRecord(record) {
  assert(object(record), 'An observation record must be an object');
  assert(typeof record.stage === 'string' && Object.hasOwn(criteria.stages, record.stage), 'Unknown evidence stage');
  const stage = criteria.stages[record.stage];
  assert(verdicts.includes(record.verdict), 'Unknown verdict');
  assert(['not_run', 'completed'].includes(record.execution), 'Unknown execution status');
  assert(modes.includes(record.mode), 'Unknown execution mode');
  assert(nonempty(record.reason), 'A reason is required');
  // Validate all supplied fields before deciding which observations support a verdict.
  // Partial records are useful, but malformed or unknown entries are never evidence.
  for (const field of ['taskReference', 'boundaryDescription']) {
    if (Object.hasOwn(record, field)) assert(nonempty(record[field]), `Invalid ${field}`);
  }
  if (Object.hasOwn(record, 'review')) {
    assert(object(record.review), 'Review must be an object');
    assert(nonempty(record.review.reviewer) && references(record.review.evidenceRefs), 'A review needs a reviewer and evidence references');
    assert.equal(typeof record.review.referencesInspected, 'boolean', 'Review inspection status must be boolean');
  }
  for (const field of ['preconditions', 'checks']) {
    if (!Object.hasOwn(record, field)) continue;
    assert(object(record[field]), `${field} must be an object`);
    for (const [name, item] of Object.entries(record[field])) {
      assert(stage[field].includes(name), `Unknown ${field} entry: ${name}`);
      assert(object(item), `${field}.${name} must be an object`);
      assert(verdicts.includes(item.result), `Unknown result: ${field}.${name}`);
      assert(['observed', 'self-report'].includes(item.basis), `Unknown basis: ${field}.${name}`);
      if (Object.hasOwn(item, 'evidenceRefs')) assert(referenceList(item.evidenceRefs), `Invalid evidence references: ${field}.${name}`);
      if (item.basis === 'observed' && ['pass', 'fail'].includes(item.result)) {
        assert(references(item.evidenceRefs), `Observed pass/fail needs evidence references: ${field}.${name}`);
      }
    }
  }
  if (record.execution === 'not_run') {
    assert.equal(record.verdict, 'not_run', 'An unrun trial cannot claim a result');
  } else {
    assert.notEqual(record.verdict, 'not_run', 'A completed observation needs its actual verdict');
    assert(nonempty(record.review?.reviewer) && references(record.review?.evidenceRefs), 'A completed observation requires an explicit review and evidence references');
    assert.equal(record.review.referencesInspected, true, 'The observer must inspect the referenced evidence');
    if (record.verdict === 'pass' || record.verdict === 'fail') {
      assert.equal(record.mode, stage.mode, 'This execution mode cannot establish the requested stage');
      if (record.stage !== 'placement') assert(nonempty(record.taskReference), 'Identify the actual task being assessed');
      const observed = (collection, name, result) => {
        const item = object(collection) && Object.hasOwn(collection, name) ? collection[name] : undefined;
        return item?.result === result && item?.basis === 'observed' && references(item?.evidenceRefs);
      };
      for (const name of stage.preconditions) assert(observed(record.preconditions, name, 'pass'), `Unestablished precondition: ${name}`);
      if (record.verdict === 'pass') {
        for (const name of stage.checks) assert(observed(record.checks, name, 'pass'), `Missing observed pass: ${name}`);
      } else {
        assert(stage.checks.some(name => observed(record.checks, name, 'fail')), 'A failure claim needs an observed violation');
      }
      if (record.stage === 'continuity') assert(nonempty(record.boundaryDescription), 'Identify the boundary actually observed');
    }
  }
  return { recordStructure: 'valid', reportedVerdict: record.verdict, behavioralVerification: 'not_performed_by_checker' };
}

function main(args) {
  if (args.length === 1 && args[0] === 'check') {
    checkPinnedSources();
    checkCurrentSources();
    console.log('Definitions, pinned public-source bytes, and current candidate identity verified. No model or live-environment test ran.');
  } else if (args.length === 2 && args[0] === 'input') {
    const item = cases.find(c => c.id === args[1]);
    assert(item, 'Unknown case ID');
    assert.equal(item.mode, 'main-dot', 'Simulation cases must not be presented as live main-dot trials');
    process.stdout.write(item.input + '\n');
  } else if (args.length === 2 && args[0] === 'validate-record') {
    let record;
    try { record = JSON.parse(readFileSync(args[1], 'utf8')); }
    catch { throw new Error('Unable to read or parse the observation record. Record contents were not printed.'); }
    console.log(JSON.stringify(validateRecord(record)));
  } else throw new Error('Usage: node evals/dot-toolkit/suite.mjs check | input <main-dot-case-id> | validate-record <private-record.json>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
