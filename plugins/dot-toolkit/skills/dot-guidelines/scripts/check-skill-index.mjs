#!/usr/bin/env node
import { INDEX, selectionTarget, checkPluginIdentity, addAccessFailure, finding, parseIndex, readManifest, run } from './lib.mjs';

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
  const checkedPlugins = new Map();
  for (const entry of parsed.entries) {
    const selected = selectionTarget(entry.name);
    result.data.entries.push({ name: entry.name, path: selected.path,
      manifest: selected.manifest, descriptionLines: entry.descriptionLines });
    if (selected.kind !== 'plugin' || !checkedPlugins.has(selected.name)) {
      const manifest = readManifest(access, result, selected.name, selected.kind);
      if (selected.kind === 'plugin') {
        checkPluginIdentity(access, result, selected.name);
        checkedPlugins.set(selected.name, manifest);
      }
    }
    if (selected.kind === 'plugin') {
      const manifest = checkedPlugins.get(selected.name);
      const relative = selected.packageRelative;
      if (manifest && !manifest.files.some(file => file.path === relative)) {
        finding(result, 'mismatch', 'selected_skill_unrecorded', selected.path);
      }
    }
    const target = selected.path;
    try { access.stat(target, 'file'); }
    catch (error) { addAccessFailure(result, error, target, 'mismatch', 'skill_file_missing'); }
  }
});
