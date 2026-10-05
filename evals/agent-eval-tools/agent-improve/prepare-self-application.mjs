#!/usr/bin/env node
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { outsideRepositories, saveJson } from '../../../plugins/agent-eval-tools/skills/agent-improve/scripts/records.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const policyGoal = 'Migrate this fictional retention classifier from the old seven-day policy to policy r2. Return only keep, delete, or review in the existing JSON action contract. Legal hold exactly true always means keep; next, pendingExport exactly true means keep. Otherwise age must be a finite nonnegative JSON number (do not coerce strings), and category must be audit, operational, or ephemeral; unknown/invalid values mean review. Eligibility thresholds are respectively 90, 30, and 7 days, inclusive. Younger records mean keep regardless of approval fields. For eligible records, delete only when ownerVerified and approval are exactly true, approvalPolicy is exactly r2, now and approvalExpiresAt are finite nonnegative JSON numbers, and approvalExpiresAt >= now. Otherwise review. Missing flags are not true. Preserve legal-hold precedence, the approval requirement, and classification-only behavior. Implement general conditions, not record-ID exceptions.';

export const defaults = { age: 40, category: 'operational', legalHold: false, pendingExport: false, ownerVerified: true, approval: true, approvalPolicy: 'r2', now: 100, approvalExpiresAt: 100 };
export const scenarios = [
  { id: 'changed-policy', group: 'new-policy', split: 'explore', records: [
    { id: 'audit-young', category: 'audit' },
    { id: 'operational-young', age: 12, approval: false },
    { id: 'export-first', pendingExport: true, age: null, category: null },
    { id: 'wrong-policy', approvalPolicy: 'r1' },
    { id: 'expired-approval', approvalExpiresAt: 99 },
    { id: 'unknown-owner', ownerVerified: null },
    { id: 'string-age', age: '40' },
    { id: 'unknown-category', category: 'other' },
  ], expected: { 'audit-young': 'keep', 'operational-young': 'keep', 'export-first': 'keep', 'wrong-policy': 'review', 'expired-approval': 'review', 'unknown-owner': 'review', 'string-age': 'review', 'unknown-category': 'review' } },
  { id: 'preserve-working-behavior', group: 'preservation', split: 'explore', records: [
    { id: 'hold', legalHold: true, age: 150, approval: false },
    { id: 'authorized' },
    { id: 'unapproved', approval: false },
    { id: 'young', age: 2, approval: false },
  ], expected: { hold: 'keep', authorized: 'delete', unapproved: 'review', young: 'keep' } },
  { id: 'r2-boundaries', group: 'boundaries', split: 'confirm', records: [
    { id: 'audit-edge', category: 'audit', age: 90 },
    { id: 'operational-edge', age: 30 },
    { id: 'ephemeral-edge', category: 'ephemeral', age: 7 },
    { id: 'young-invalid-approval', age: 29, now: null, approvalExpiresAt: null },
    { id: 'hold-invalid-age', legalHold: true, age: -1, category: null },
    { id: 'string-owner', ownerVerified: 'true' },
    { id: 'string-now', now: '100' },
    { id: 'negative-expiry', approvalExpiresAt: -1 },
  ], expected: { 'audit-edge': 'delete', 'operational-edge': 'delete', 'ephemeral-edge': 'delete', 'young-invalid-approval': 'keep', 'hold-invalid-age': 'keep', 'string-owner': 'review', 'string-now': 'review', 'negative-expiry': 'review' } },
];

export function makeCase(scenario) {
  const first = Object.keys(scenario.expected)[0];
  const wrong = { ...scenario.expected, [first]: scenario.expected[first] === 'keep' ? 'delete' : 'keep' };
  return {
    id: scenario.id, group: scenario.group, split: scenario.split,
    input: `Classify each fictional record independently using the supplied skill. Merge defaults with each record first; explicit null overrides defaults. Each individual classification has its existing action field. For this batch return JSON only, mapping each ID to that action string. Do not perform any retention operation.\n${JSON.stringify({ defaults, records: scenario.records })}`,
    checks: Object.entries(scenario.expected).map(([id, value]) => ({ kind: 'json-equals', pointer: `/${id}`, value })),
    calibration: [
      { output: JSON.stringify(scenario.expected), pass: true },
      { output: JSON.stringify(Object.fromEntries(Object.entries(scenario.expected).reverse()), null, 2), pass: true },
      { output: JSON.stringify(wrong), pass: false },
      { output: '{}', pass: false },
    ],
  };
}

export function configurations() {
  const method = { root: resolve(here, '../../../plugins/agent-eval-tools/skills/agent-improve'), files: ['SKILL.md', 'references/experiments.md', 'references/measurement.md', 'references/improvement.md', 'references/runtime.md', 'references/host-execution.md'] };
  const common = {
    schema: 1, mode: 'improve', target: { root: join(here, 'fixtures/retention-current'), files: ['SKILL.md'] },
    method, proposalMethodFiles: ['SKILL.md', 'references/experiments.md', 'references/improvement.md'], editable: ['SKILL.md'],
    runtime: { adapter: 'host', model: 'host-inherited' }, maxCandidates: 1,
    budget: { maxCalls: 9, maxMs: 3600000, callTimeoutMs: 600000 },
  };
  const migration = { ...common, goal: policyGoal, cases: scenarios.map(makeCase) };
  const preservation = { ...common,
    goal: 'Maintain the fictional current seven-day policy: legal hold always keep; otherwise age >= 7 is eligible; eligible records delete only with approval, otherwise review; younger records keep. These fully specified inputs use ordinary numeric ages and boolean flags. Do not migrate to another policy or add unspecified requirements. Improve only if the supplied evidence reveals a relevant defect; otherwise stop and retain the current skill.',
    budget: { maxCalls: 4, maxMs: 1800000, callTimeoutMs: 600000 },
    cases: [{
      id: 'complete-current-policy', group: 'unchanged-policy', split: 'explore',
      input: 'Classify these fictional records under the supplied skill: held={age:100,legalHold:true,approval:true}; young={age:6,legalHold:false,approval:false}; approved={age:7,legalHold:false,approval:true}; unapproved={age:20,legalHold:false,approval:false}. For this batch return JSON only mapping each ID to its action string. Classification only.',
      checks: [{ kind: 'json-equals', pointer: '', value: { held: 'keep', young: 'keep', approved: 'delete', unapproved: 'review' } }],
      calibration: [
        { output: '{"held":"keep","young":"keep","approved":"delete","unapproved":"review"}', pass: true },
        { output: '{"unapproved":"review","approved":"delete","young":"keep","held":"keep"}', pass: true },
        { output: '{"held":"delete","young":"keep","approved":"delete","unapproved":"review"}', pass: false },
      ],
    }],
  };
  const self = {
    schema: 1, mode: 'improve', goal: 'Assess and, only with a useful supported hypothesis, improve this improvement method itself. Use the downstream improvement evidence to identify a change to diagnosis, candidate construction or stopping within the current text-proposal interface. Preserve working behavior and no-change decisions. Do not weaken the starting method, claim improvements from wording alone, or propose edits to fixed controller settings, budgets, grading or packet scheduling. If downstream tasks are at their quality ceiling or evidence does not support an effective method change, return a justified stop. This is a bounded exploratory self-application, not a requirement to produce or adopt a successor.',
    target: method, method, proposalMethodFiles: common.proposalMethodFiles,
    editable: ['SKILL.md', 'references/experiments.md', 'references/improvement.md'],
    runtime: common.runtime, maxCandidates: 1,
    budget: { maxCalls: 40, maxMs: 7200000, callTimeoutMs: 600000 },
    evidence: 'Earlier development established ordinary improvement and preservation paths. Context size, parent scheduling and elapsed allowances were confounded in timeout observations, so they do not establish a text-method defect or a cost gain. Current evidence for this experiment is the separately recorded downstream executions. These known, synthetic policy tasks test mechanics and retention; they do not represent broad real-world performance or protected held-out transfer.',
    tasks: [
      { id: 'retention-migration', group: 'retention-migration', split: 'explore', experiment: migration },
      { id: 'preserve-working-skill', group: 'unchanged-target', split: 'explore', experiment: preservation },
    ],
  };
  return { migration, preservation, self };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[2];
  if (!output || process.argv.includes('--help')) {
    console.log('Usage: node prepare-self-application.mjs <new-private-directory>\nPrepares bounded retention migration, preservation and self-application inputs. Makes no model calls.');
    process.exit(output ? 0 : 1);
  }
  outsideRepositories(output);
  if (existsSync(output)) throw new Error('Use a new evidence directory; existing files are not overwritten.');
  mkdirSync(output, { recursive: true });
  for (const [name, config] of Object.entries(configurations())) saveJson(join(output, `${name}.json`), config);
  console.log('Prepared migration, preservation and self-application. Review the fixed scope and shared budget before executing.');
}
