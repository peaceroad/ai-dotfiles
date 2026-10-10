#!/usr/bin/env node
import { INDEX, MANIFESTS, SKILLS, addAccessFailure, finding, parseIndex, readManifest, run } from './lib.mjs';

run('check-skill-index', process.argv.slice(2), (_options, result, access) => {
  result.scope.index = INDEX;
  let bytes;
  try { bytes = access.read(INDEX); }
  catch (error) { addAccessFailure(result, error, INDEX, 'unverified', 'index_missing'); return; }
  const parsed = parseIndex(bytes);
  if (parsed.error) {
    finding(result, 'mismatch', parsed.error, INDEX, parsed.line ? `Line ${parsed.line}.` : undefined);
    return;
  }
  result.data = { entries: [], descriptionSemantics: 'not_checked', fileHashes: 'not_checked' };
  for (const entry of parsed.entries) {
    result.data.entries.push({ name: entry.name, path: `${SKILLS}/${entry.name}/SKILL.md`,
      manifest: `${MANIFESTS}/${entry.name}.json`, descriptionLines: entry.descriptionLines });
    readManifest(access, result, entry.name);
    const target = `${SKILLS}/${entry.name}/SKILL.md`;
    try { access.stat(target, 'file'); }
    catch (error) { addAccessFailure(result, error, target, 'mismatch', 'skill_file_missing'); }
  }
});
