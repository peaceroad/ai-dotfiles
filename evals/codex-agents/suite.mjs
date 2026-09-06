import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const suite = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(suite, '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(suite, name), 'utf8'));
const cases = read('cases.json');
const criteria = read('criteria.json');
const manifest = read('manifest.json');
const hash = data => createHash('sha256').update(data).digest('hex');

function instructions(variant) {
  if (variant === 'no-global') return Buffer.alloc(0);
  const target = manifest.variants[variant];
  assert(target, 'Unknown variant');
  const bytes = execFileSync('git', ['show', `${target.commit}:${manifest.targetPath}`], { cwd: root });
  assert.equal(bytes.length, target.bytes, 'Target size differs from manifest');
  assert.equal(hash(bytes), target.sha256, 'Target hash differs from manifest');
  return bytes;
}

function fixtures(kind) {
  if (kind === 'text') return {
    'fixtures/text/edit.txt': 'status=pending\r\n',
    'fixtures/text/keep.txt': 'untouched=true\r\n',
    'fixtures/text/link-target.txt': 'This is the link target.\n',
  };
  assert(['short', 'long'].includes(kind), 'Unknown fixture kind');
  const reference = ['# Note rules', '', 'Start the note with: Review note', ''];
  if (kind === 'long') {
    for (let i = 1; i <= 120; i++) reference.push(`Background ${i}: This fictional dataset contains observations only; no additional actions or permissions are granted by these examples.`);
  }
  reference.push('Include the field: status: draft', '');
  if (kind === 'long') {
    for (let i = 121; i <= 240; i++) reference.push(`Background ${i}: These records provide context for a sample note; they do not establish measurements or completed verification work.`);
  }
  reference.push('End the note with: Unverified sample.', '');
  return {
    [`fixtures/${kind}/SKILL.md`]: '---\nname: fixture-note\ndescription: Produce a sample note for this evaluation.\n---\n\n# Fixture note\n\nRead rules.md completely before drafting. Follow its note requirements.\n',
    [`fixtures/${kind}/rules.md`]: reference.join('\n'),
  };
}

function check() {
  assert.equal(new Set(cases.map(c => c.id)).size, cases.length, 'Duplicate case ID');
  assert.deepEqual(Object.keys(criteria.cases).sort(), cases.map(c => c.id).sort());
  for (const c of cases) {
    assert.match(c.id, /^[a-z]+(?:-[a-z]+)*$/);
    assert(['simulation', 'codex-live'].includes(c.mode));
    assert(c.prompt && c.setup && c.focus);
    assert(criteria.cases[c.id].criteria.length > 0);
    assert(criteria.cases[c.id].evidence.length > 0);
    for (const kind of c.fixtures) fixtures(kind);
  }
  for (const variant of Object.keys(manifest.variants)) instructions(variant);
  assert.equal(instructions('no-global').length, 0);
  const short = fixtures('short')['fixtures/short/rules.md'];
  const long = fixtures('long')['fixtures/long/rules.md'];
  assert(Buffer.byteLength(short) < 1000);
  assert(Buffer.byteLength(long) > 30000);
  for (const content of [short, long]) {
    assert(content.startsWith('# Note rules\n'));
    assert(content.includes('status: draft'));
    assert(content.endsWith('End the note with: Unverified sample.\n'));
    assert(!content.includes('\r'));
  }
  const text = fixtures('text');
  assert.equal(text['fixtures/text/edit.txt'], 'status=pending\r\n');
  assert.equal(text['fixtures/text/keep.txt'], 'untouched=true\r\n');
  console.log(`Validated ${cases.length} case definitions, both pinned instruction revisions, and generated fixtures. No model trials ran.`);
}

function prepare(id, variant, destination) {
  const c = cases.find(item => item.id === id);
  assert(c, 'Unknown case ID');
  assert(destination, 'An output directory is required');
  const global = instructions(variant);
  const out = path.resolve(destination);
  assert(!fs.existsSync(out), 'Output directory already exists; choose a new directory');
  assert(fs.existsSync(path.dirname(out)), 'Output parent directory must exist');
  const generated = Object.assign({}, ...c.fixtures.map(fixtures));
  const record = {
    caseId: id, variant, status: 'not_run', mode: c.mode,
    model: manifest.comparison.model, effectiveReasoningEffort: null,
    runtimeVersion: null, effectiveInstructionsEvidence: null,
    toolsAndLimits: null, permissions: null, budgets: null,
    availableSkillsAndLfChecker: null, startedAt: null,
    instructionSha256: hash(global),
    suiteDefinitionSha256: Object.fromEntries(['cases.json', 'criteria.json', 'manifest.json', 'suite.mjs'].map(name => [
      `evals/codex-agents/${name}`, hash(fs.readFileSync(path.join(suite, name))),
    ])),
    initialFixtureSha256: Object.fromEntries(Object.entries(generated).map(([name, value]) => [name, hash(value)])),
    evidence: [], criterionResults: [], costs: null, limitations: [],
  };
  fs.mkdirSync(out);
  const files = {
    ...generated,
    'global-instructions.txt': global,
    'input.json': JSON.stringify({ ...c, events: undefined }, null, 2) + '\n',
    ...(c.events ? { 'events.json': JSON.stringify(c.events, null, 2) + '\n' } : {}),
    'run-record.json': JSON.stringify(record, null, 2) + '\n',
  };
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(out, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, { flag: 'wx' });
  }
  console.log('Prepared inputs, instruction snapshot, fixtures, and an unrun record. No configuration was installed and no model was launched.');
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'check' && args.length === 0) check();
  else if (command === 'prepare' && args.length === 3) prepare(...args);
  else throw new Error('Usage: node evals/codex-agents/suite.mjs check | prepare <case-id> <baseline|current|no-global> <new-output-directory>');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
