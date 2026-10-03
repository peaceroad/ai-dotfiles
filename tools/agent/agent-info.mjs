// @ai-dotfiles agent-dev-runtime managed
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CODEX_TOOLS } from './codex/codex.mjs';

// Shared by the installer and the runtime identity command. Only shipped files
// participate: never read configuration contents, histories, or plugin caches.
export function runtimePayload() {
  const core = '@ai-dotfiles agent-dev-runtime managed';
  const items = [];
  const add = (source, target, marker = core) => items.push({ source, target,
    markers: marker === core ? [core, '@ai-dotfiles agent-command v1'] : [marker, core] });
  for (const name of new Set([...CODEX_TOOLS.flatMap(tool => [tool.file, ...(tool.supportFiles ?? [])]), 'codex.mjs'])) {
    add(`tools/agent/codex/${name}`, `codex/${name}`);
  }
  add('tools/agent/development.schema.json', '../development.schema.json');
  add('tools/agent/manage-skill-links.mjs', 'manage-skill-links.mjs');
  const plugin = 'plugins/agent-plugin-tools/skills/plugin-creator-agent-plugins';
  for (const [name, marker] of [
    ['scripts/manage-local-agent-plugin.mjs', '@plugin-creator-agent-plugins managed-local-runner v1'],
    ['scripts/assemble-agent-marketplace.mjs', '@plugin-creator-agent-plugins managed-marketplace-assembler v1'],
    ['scripts/validate-agent-plugin.mjs', '@plugin-creator-agent-plugins managed-portable-validator v1'],
    ['assets/marketplace-distribution/marketplace-development.schema.json', '@plugin-creator-agent-plugins managed-marketplace-schema v2'],
  ]) add(`${plugin}/${name}`, `plugin-tools/${name}`, marker);
  add('tools/agent/agent-info.mjs', 'agent-info.mjs');
  // Switch the public entry point last during installation.
  add('tools/agent/agent.mjs', 'agent.mjs');
  return items;
}

function displayPath(path) {
  const suffix = relative(homedir(), resolve(path));
  if (!suffix) return '~';
  if (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith('../') && !suffix.startsWith('..\\')) return `~/${suffix.replaceAll('\\', '/')}`;
  return `[custom]/${resolve(path).split(/[\\/]/).at(-1)}`;
}

export function agentInfo() {
  const directory = dirname(fileURLToPath(import.meta.url));
  const root = resolve(directory, '../..');
  const checkout = directory === join(root, 'tools', 'agent') && existsSync(join(root, 'scripts/install-agent.mjs'));
  const digest = createHash('sha256');
  const missing = [];
  for (const item of runtimePayload().sort((a, b) => a.target < b.target ? -1 : a.target > b.target ? 1 : 0)) {
    try {
      const bytes = readFileSync(checkout ? join(root, item.source) : join(directory, item.target));
      digest.update(`${item.target}\0${bytes.length}\0`).update(bytes);
    } catch { missing.push(item.target); }
  }
  return {
    schemaVersion: 1, product: 'ai-dotfiles agent', mode: checkout ? 'checkout' : 'installed',
    runtimeId: missing.length ? null : `sha256:${digest.digest('hex')}`, unavailableFiles: missing,
    entrypoint: displayPath(join(directory, 'agent.mjs')), node: process.version, platform: process.platform,
    developmentConfig: displayPath(process.env.AGENT_DEV_CONFIG || join(process.env.AGENT_DEV_HOME || homedir(), '.agents/ai-dotfiles/development.json')),
    exportConfig: displayPath(process.env.AGENT_CODEX_EXPORT_CONFIG || join(homedir(), '.agents/ai-dotfiles/codex-session-export.json')),
  };
}

export function printAgentInfo({ json = false, versionOnly = false, log = console.log } = {}) {
  const info = agentInfo();
  if (json) log(JSON.stringify(info, null, 2));
  else {
    log(`${info.product} ${info.runtimeId ?? '(runtime identity unavailable)'}`);
    if (!versionOnly) {
      log(`Runtime: ${info.mode}; ${info.entrypoint}`);
      log(`Node.js: ${info.node}; platform: ${info.platform}`);
      log(`Development settings: ${info.developmentConfig}`);
      log(`Export settings: ${info.exportConfig}`);
      log('Runtime ID fingerprints shipped code/schema bytes, not a release version or an integrity guarantee. Settings contents were not read.');
    }
    if (info.unavailableFiles.length) log(`Unreadable runtime files: ${info.unavailableFiles.join(', ')}. Reinstall from the intended checkout.`);
  }
  return info.unavailableFiles.length ? 1 : 0;
}
