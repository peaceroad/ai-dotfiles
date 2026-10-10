#!/usr/bin/env node
import { INDEX, MANIFESTS, SKILLS, addAccessFailure, run } from './lib.mjs';

// Fixed locations only: no directory listing, environment dump, private-file read,
// probing of unrelated runtimes, write test, or automatic migration.
const locations = [
  ['.codex', 'directory', 'configuration'],
  ['.agents', 'directory', 'configuration'],
  [SKILLS, 'directory', 'skills'],
  ['.agents/skills-state', 'directory', 'state'],
  [MANIFESTS, 'directory', 'state'],
  ['.codex/AGENTS-private.md', 'file', 'optional_private'],
  [INDEX, 'file', 'selection'],
  ['AGENTS.md', 'file', 'legacy'],
  ['.codex/dot-setup.md', 'file', 'legacy'],
  [`${SKILLS}/INDEX.md`, 'file', 'legacy'],
  [`${SKILLS}/skills-manifest.json`, 'file', 'legacy'],
];
run('inspect-computer', process.argv.slice(2), (_options, result, access) => {
  result.data = { runtime: { name: 'node', version: process.versions.node, supported: true }, locations: [],
    privateContents: 'not_read', writable: 'not_tested', legacyContents: 'not_read' };
  for (const [target, expectedType, role] of locations) {
    let state = 'present';
    try { access.stat(target, expectedType); }
    catch (error) {
      state = error.missing ? 'missing' : 'unverified';
      if (!error.missing) addAccessFailure(result, error, target);
    }
    result.data.locations.push({ path: target, expectedType, role, state });
  }
}, 'complete');
