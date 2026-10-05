#!/usr/bin/env node
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { outsideRepositories, saveJson } from '../../../plugins/agent-eval-tools/skills/agent-improve/scripts/records.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const output = process.argv[2];
if (!output || process.argv.includes('--help')) {
  console.log('Usage: node prepare-cache-policy.mjs <new-private-directory>\nPrepares a fictional multi-rule migration with deterministic grading. Makes no model calls.');
  process.exit(output ? 0 : 1);
}
outsideRepositories(output);
if (existsSync(output)) throw new Error('Use a new private directory; existing evidence is not overwritten.');
mkdirSync(output, { recursive: true });

const defaults = { requiresAuth: false, authorized: false, crossTenant: false, corrupt: false, forceRefresh: false, offline: true, allowStale: true, sensitive: false, age: 12, ttl: 10, grace: 5 };
function batch(id, group, split, records, expected) {
  const alternative = Object.fromEntries(Object.entries(expected).reverse());
  const first = Object.keys(expected)[0];
  const wrong = { ...expected, [first]: expected[first] === 'blocked' ? 'reuse' : 'blocked' };
  return {
    id, group, split,
    input: `Classify every fictional record using the supplied skill and policy. Merge common defaults with each record before classifying; explicit null overrides a default. Return JSON only, mapping each ID to its action.\n${JSON.stringify({ defaults, records })}`,
    checks: Object.entries(expected).map(([key, value]) => ({ kind: 'json-equals', pointer: `/${key}`, value })),
    calibration: [
      { output: JSON.stringify(expected), pass: true },
      { output: JSON.stringify(alternative, null, 2), pass: true },
      { output: JSON.stringify(wrong), pass: false },
      { output: '{}', pass: false },
    ],
  };
}

// A request is one model trial, even when it contains several records.
// Keep preservation in a separate case so a new capability cannot hide a regression.
const cases = [
  batch('stale-development', 'stale-capability', 'explore', [
    { id: 'stale' },
    { id: 'fresh-without-grace', age: 8, grace: null },
    { id: 'online', offline: false },
    { id: 'sensitive', sensitive: true },
    { id: 'not-enabled', allowStale: false },
  ], { stale: 'reuse', 'fresh-without-grace': 'reuse', online: 'revalidate', sensitive: 'revalidate', 'not-enabled': 'revalidate' }),
  batch('legacy-preservation', 'legacy-guards', 'explore', [
    { id: 'auth-first', requiresAuth: true, crossTenant: true, corrupt: true },
    { id: 'tenant', crossTenant: true },
    { id: 'integrity', corrupt: true },
    { id: 'forced', forceRefresh: true },
    { id: 'age-unknown', age: null },
    { id: 'ttl-negative', ttl: -1 },
    { id: 'fresh', age: 8 },
  ], { 'auth-first': 'blocked', tenant: 'fetch', integrity: 'fetch', forced: 'fetch', 'age-unknown': 'revalidate', 'ttl-negative': 'revalidate', fresh: 'reuse' }),
  batch('stale-selection', 'stale-boundaries', 'select', [
    { id: 'at-grace', age: 20, ttl: 14, grace: 6 },
    { id: 'past-grace', age: 21, ttl: 14, grace: 6 },
    { id: 'missing-grace', grace: null },
    { id: 'string-grace', grace: '5' },
    { id: 'zero-grace', grace: 0 },
    { id: 'auth-ok-stale', requiresAuth: true, authorized: true },
  ], { 'at-grace': 'reuse', 'past-grace': 'revalidate', 'missing-grace': 'revalidate', 'string-grace': 'revalidate', 'zero-grace': 'revalidate', 'auth-ok-stale': 'reuse' }),
  batch('preservation-confirmation', 'guard-combinations', 'confirm', [
    { id: 'auth-missing-fresh', requiresAuth: true, authorized: null, age: 0, grace: null },
    { id: 'authorized-tenant', requiresAuth: true, authorized: true, crossTenant: true, age: 0 },
    { id: 'force-unknown-age', forceRefresh: true, age: null },
    { id: 'fresh-sensitive', age: 3, ttl: 3, sensitive: true, grace: -1 },
    { id: 'unknown-age', age: '12' },
    { id: 'negative-age', age: -1 },
    { id: 'online-sensitive', offline: false, sensitive: true },
  ], { 'auth-missing-fresh': 'blocked', 'authorized-tenant': 'fetch', 'force-unknown-age': 'fetch', 'fresh-sensitive': 'reuse', 'unknown-age': 'revalidate', 'negative-age': 'revalidate', 'online-sensitive': 'revalidate' }),
];

saveJson(join(output, 'experiment.json'), {
  schema: 1, mode: 'improve',
  goal: 'Migrate this fictional cache skill to a new policy. Preserve the ordered authorization, tenant, integrity, forced-refresh and numeric-validation guards. Preserve fresh reuse whenever valid age <= ttl, regardless of grace or sensitivity. For expired records only, add reuse when offline and allowStale are exactly true, sensitive is not true, grace is a finite nonnegative JSON number, and age <= ttl + grace. All other expired records require revalidation. Missing or non-boolean flags are not true; do not coerce numeric strings. Reconcile both declared text files so the entry point and policy agree. Implement the general rule rather than record-ID exceptions. Classification only, no side effects.',
  target: { root: join(here, 'fixtures/cache-current'), files: ['SKILL.md', 'references/policy.md'] },
  method: { root: resolve(here, '../../../plugins/agent-eval-tools/skills/agent-improve'), files: ['SKILL.md', 'references/experiments.md', 'references/measurement.md', 'references/improvement.md', 'references/runtime.md', 'references/host-execution.md'] },
  proposalMethodFiles: ['SKILL.md', 'references/experiments.md', 'references/improvement.md'],
  editable: ['SKILL.md', 'references/policy.md'],
  runtime: { adapter: 'host', model: 'host-inherited' },
  budget: { maxCalls: 12, maxMs: 2700000, callTimeoutMs: 600000 },
  maxCandidates: 1, cases,
});
console.log('Prepared one migration: separate capability, preservation, selection and confirmation cases; at most twelve model calls. No execution or installation performed.');
