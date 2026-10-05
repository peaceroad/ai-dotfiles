#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, outsideRepositories, saveJson } from '../../../plugins/agent-eval-tools/skills/agent-improve/scripts/records.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const output = process.argv[2];
if (!output || process.argv.includes('--help')) {
  console.log('Usage: node prepare-coexistence.mjs <new-private-directory>\nPrepares controlled catalog trials without model calls or installation.');
  process.exit(output ? 0 : 1);
}
outsideRepositories(output);
if (existsSync(output)) throw new Error('Use a new private directory; existing evidence is not overwritten.');
mkdirSync(output, { recursive: true });
const manifest = JSON.parse(readFileSync(join(here, 'coexistence-cases.json'), 'utf8'));
const roots = {};
const hashes = {};
function recordHashes(root, prefix) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const name = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) recordHashes(join(root, entry.name), name);
    else if (entry.isFile()) hashes[name] = createHash('sha256').update(readFileSync(join(root, entry.name))).digest('hex');
    else throw new Error('Controlled skill copies must contain regular files and directories only.');
  }
}
for (const [name, plugin] of [['prompt-design', 'agent-design-tools'], ['agent-workflow-design', 'agent-design-tools'], ['agent-improve', 'agent-eval-tools']]) {
  const root = join(resolve(output), 'skills', name);
  cpSync(resolve(here, '../../../plugins', plugin, 'skills', name), root, { recursive: true });
  roots[name] = root;
  recordHashes(root, `skills/${name}`);
}
for (const [condition, names] of Object.entries(manifest.conditions)) {
  const catalog = names.map(name => {
    const skill = readFileSync(join(roots[name], 'SKILL.md'), 'utf8');
    const description = skill.match(/^description:\s*(.+)$/m)?.[1];
    if (!description) throw new Error('A declared skill is missing its description.');
    return { name, description, entry: join(roots[name], 'SKILL.md'), entryHash: digest(skill) };
  });
  for (const c of manifest.cases) saveJson(join(output, `${condition}-${c.id}.json`), {
    prompt: `Complete the request below using the supplied catalog as the skill-selection surface for this controlled trial. Select and read only applicable skills and their required references, completely. Do not use other installed skills as substitutes. Reading the frozen skills is permitted; do not edit files, run model experiments, access the network or delegate. Return the requested artifact first, then a short transport report naming the skills and reference files you actually read. The report is self-reported evidence, not a verified read-event log.\n${JSON.stringify({ catalog, request: c.request })}`,
    outputSchema: null,
  });
}
saveJson(join(output, 'manifest.json'), manifest);
saveJson(join(output, 'source-hashes.json'), hashes);
console.log('Prepared four controlled catalog inputs and frozen skill copies. No model calls or installation performed.');
