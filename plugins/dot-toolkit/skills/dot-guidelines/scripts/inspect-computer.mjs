#!/usr/bin/env node
import { CODEX, AGENTS, INDEX, MANIFESTS, SKILLS, PLUGINS, PLUGIN_MANIFESTS, addAccessFailure, run } from './lib.mjs';

// Fixed locations only: no directory listing, environment dump, private-file read,
// probing of unrelated runtimes, write test, or automatic migration.
const locations = [
  [CODEX, 'directory', 'configuration'],
  [AGENTS, 'directory', 'configuration'],
  [SKILLS, 'directory', 'skills'],
  [PLUGINS, 'directory', 'plugins'],
  [PLUGIN_MANIFESTS, 'directory', 'state'],
  [`${AGENTS}/skills-state`, 'directory', 'state'],
  [MANIFESTS, 'directory', 'state'],
  [`${CODEX}/AGENTS-private.md`, 'file', 'optional_private'],
  [INDEX, 'file', 'selection'],
];
// Explicit migration inspection only. These are source-presence checks, not
// alternate active roots, content verification, or an instruction lookup.
const migrationLocations = [
  ['.codex', 'directory', 'migration_source'],
  ['.agents', 'directory', 'migration_source'],
  ['.codex/AGENTS-private.md', 'file', 'migration_source'],
  ['.agents/skills-state/INDEX.md', 'file', 'migration_source'],
  ['.agents/skills-state/manifests', 'directory', 'migration_source'],
  ['.agents/plugins-state/manifests', 'directory', 'migration_source'],
  ['AGENTS.md', 'file', 'legacy'],
  ['.codex/dot-setup.md', 'file', 'legacy'],
  ['.agents/skills/INDEX.md', 'file', 'legacy'],
  ['.agents/skills/skills-manifest.json', 'file', 'legacy'],
];
run('inspect-computer', process.argv.slice(2), (options, result, access) => {
  result.scope.mode = options.migrationSource ? 'migration_source_presence' : 'normal_layout_presence';
  result.data = { runtime: { name: 'node', version: process.versions.node, supported: true }, locations: [],
    privateContents: 'not_read', writable: 'not_tested', legacyContents: 'not_read' };
  for (const [target, expectedType, role] of options.migrationSource ? migrationLocations : locations) {
    let state = 'present';
    try { access.stat(target, expectedType); }
    catch (error) {
      state = error.missing ? 'missing' : 'unverified';
      if (!error.missing) addAccessFailure(result, error, target);
    }
    result.data.locations.push({ path: target, expectedType, role, state });
  }
}, 'complete');
