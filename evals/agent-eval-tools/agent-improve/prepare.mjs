#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveJson, outsideRepositories } from '../../../plugins/agent-eval-tools/skills/agent-improve/scripts/records.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
if (!out || process.argv.includes('--help')) {
  console.log('Usage: node evals/agent-eval-tools/agent-improve/prepare.mjs <new-private-directory>\nCreates local comparison, improvement, no-change, invalid-grader and self-application inputs. Makes no model calls.');
  process.exit(out ? 0 : 1);
}
outsideRepositories(out);
if (existsSync(out)) throw new Error('Use a new private directory; existing evidence is not overwritten.');
mkdirSync(out, { recursive: true });
const compare = JSON.parse(readFileSync(join(here, 'compare.json'), 'utf8'));
compare.target.root = join(here, 'fixtures/current');
compare.candidates[0].root = join(here, 'fixtures/candidate');
const method = { root: resolve(here, '../../../plugins/agent-eval-tools/skills/agent-improve'), files: ['SKILL.md', 'references/experiments.md', 'references/measurement.md', 'references/improvement.md', 'references/runtime.md', 'references/host-execution.md'] };
const proposalMethodFiles = ['SKILL.md', 'references/experiments.md', 'references/improvement.md'];
const improve = { ...compare, mode: 'improve', method, proposalMethodFiles, candidates: [], editable: ['SKILL.md'], maxCandidates: 2,
  budget: { maxCalls: 16, maxMs: 1200000, callTimeoutMs: 180000 } };
const noChange = structuredClone(improve); noChange.target.root = join(here, 'fixtures/candidate');
const invalidGrader = structuredClone(improve);
invalidGrader.cases[0].checks = [{ kind: 'includes', value: '{"action":"proceed"}' }];
const self = { schema: 1, mode: 'improve', goal: 'Improve the method using the referenced development evidence; preserve correct no-change decisions. This is an exploratory mechanics trial, not protected held-out RSI evidence.',
  target: method, method, proposalMethodFiles, editable: ['SKILL.md', 'references/experiments.md', 'references/improvement.md'], maxCandidates: 1,
  runtime: compare.runtime, budget: { maxCalls: 80, maxMs: 3600000, callTimeoutMs: 180000 },
  evidence: 'Add a scoped excerpt and run references from prior development trials before running this self-application experiment.',
  tasks: [
    { id: 'scope-improvement', group: 'scope-task', split: 'explore', experiment: improve },
    { id: 'preserve-correct-target', group: 'preservation-task', split: 'explore', experiment: noChange },
  ] };
for (const [name, config] of Object.entries({ compare, improve, 'no-change': noChange, 'invalid-grader': invalidGrader, self })) saveJson(join(out, `${name}.json`), config);
console.log('Prepared five local configurations. Review model, budgets, and retained evidence before live execution.');
