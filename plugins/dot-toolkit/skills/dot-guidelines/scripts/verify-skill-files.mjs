#!/usr/bin/env node
import { MANIFESTS, SKILLS, addAccessFailure, finding, readManifest, run, sha256, validName, validRelative } from './lib.mjs';

function inventory(access, result, base, declared, relative = '') {
  const target = relative ? `${base}/${relative}` : base;
  let entries;
  try { entries = access.list(target); }
  catch (error) { addAccessFailure(result, error, target, 'mismatch', 'skill_directory_missing'); return; }
  for (const entry of entries) {
    const file = relative ? `${relative}/${entry}` : entry;
    const full = `${base}/${file}`;
    if (!validRelative(file)) { finding(result, 'unverified', 'unsupported_path', target); continue; }
    let stat;
    try { stat = access.stat(full); }
    catch (error) { addAccessFailure(result, error, full); continue; }
    if (stat.isDirectory()) {
      if (![...declared].some(name => name.startsWith(`${file}/`))) finding(result, 'mismatch', 'extra_directory', full);
      inventory(access, result, base, declared, file);
    } else if (!declared.has(file)) finding(result, 'mismatch', 'extra_file', full);
  }
}

run('verify-skill-files', process.argv.slice(2), (options, result, access) => {
  const names = [...options.skills];
  result.scope.mode = options.all ? 'all_manifests' : 'named_skills';
  result.scope.skills = names;
  result.data = { skills: [], fileMetadata: 'not_compared', sourceTrust: 'not_verified' };
  if (options.all) {
    let entries;
    try { entries = access.list(MANIFESTS); }
    catch (error) { addAccessFailure(result, error, MANIFESTS, 'unverified', 'manifest_directory_missing'); return; }
    for (const entry of entries) {
      const target = `${MANIFESTS}/${entry}`;
      try { access.stat(target, 'file'); }
      catch (error) { addAccessFailure(result, error, target); continue; }
      const name = entry.endsWith('.json') ? entry.slice(0, -5) : '';
      if (!validName(name)) { finding(result, 'mismatch', 'unexpected_manifest_entry', MANIFESTS); continue; }
      names.push(name);
    }
  }
  for (const name of names) {
    const initial = result.findings.length;
    const manifest = readManifest(access, result, name);
    let checkedFiles = 0;
    if (manifest) {
      const base = `${SKILLS}/${name}`;
      const declared = new Set(manifest.files.map(file => file.path));
      inventory(access, result, base, declared);
      for (const file of manifest.files) {
        const target = `${base}/${file.path}`;
        try {
          const bytes = access.read(target);
          checkedFiles++;
          if (sha256(bytes) !== file.sha256.toLowerCase()) finding(result, 'mismatch', 'modified_file', target);
        } catch (error) { addAccessFailure(result, error, target, 'mismatch', 'missing_file'); }
      }
    }
    const current = result.findings.slice(initial);
    result.data.skills.push({ name, status: current.some(item => item.severity === 'unverified') ? 'unverified' : current.length ? 'mismatch' : 'verified', checkedFiles });
  }
});
