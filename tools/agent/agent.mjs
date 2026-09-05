#!/usr/bin/env node

// @ai-dotfiles agent-dev-runtime managed

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const HOME_PATH = resolve(process.env.AGENT_DEV_HOME || homedir());
const CONFIG_PATH = resolve(process.env.AGENT_DEV_CONFIG || join(HOME_PATH, ".agents", "development.json"));
const SKILL_MANAGER = resolve(process.env.AGENT_DEV_SKILL_MANAGER || join(SCRIPT_DIR, "manage-skill-links.mjs"));
const MARKETPLACE_MANAGER = resolve(
  process.env.AGENT_DEV_MARKETPLACE_MANAGER
    || join(SCRIPT_DIR, "agent-runtime", "plugin-tools", "scripts", "assemble-agent-marketplace.mjs"),
);
const LOCAL_PLUGIN_MANAGER = resolve(
  process.env.AGENT_DEV_LOCAL_PLUGIN_MANAGER
    || join(SCRIPT_DIR, "agent-runtime", "plugin-tools", "scripts", "manage-local-agent-plugin.mjs"),
);
const TOP_LEVEL_KEYS = new Set(["$schema", "schemaVersion", "skills", "plugins", "marketplaces"]);
const SKILL_KEYS = new Set(["repository", "skillRoot", "installedSkill", "sourceUrl"]);
const PLUGIN_KEYS = new Set(["repository", "pluginRoot", "developmentConfig", "runner", "versionPolicy"]);
const MARKETPLACE_KEYS = new Set(["root", "name", "displayName", "mode", "plugins", "skills"]);
const MARKETPLACE_PLUGIN_KEYS = new Set(["target", "category"]);
const MARKETPLACE_SKILL_KEYS = new Set(["target"]);
const STANDALONE_MARKETPLACE_KEYS = new Set(["$schema", "schemaVersion", "name", "displayName", "plugins", "skills"]);
const STANDALONE_MARKETPLACE_PLUGIN_KEYS = new Set(["source", "category"]);
const STANDALONE_MARKETPLACE_SKILL_KEYS = new Set(["source", "sourceUrl"]);
const MANAGED_MARKETPLACE_KEYS = new Set([
  "$schema",
  "schemaVersion",
  "managedBy",
  "name",
  "displayName",
  "plugins",
  "skills",
  "configurationDigest",
]);
const MANAGED_MARKETPLACE_PLUGIN_KEYS = new Set(["name", "category"]);
const MANAGED_MARKETPLACE_SKILL_KEYS = new Set(["name", "sourceUrl"]);
const MARKETPLACE_SKILL_STATE_ENTRY_KEYS = new Set(["marketplace", "digest"]);
const MARKETPLACE_SKILL_CATALOG_KEYS = new Set(["$comment", "schemaVersion", "marketplace", "skills"]);
const MARKETPLACE_SKILL_CATALOG_IDENTITY_KEYS = new Set(["name", "displayName"]);
const MARKETPLACE_SKILL_CATALOG_ENTRY_KEYS = new Set(["name", "path", "digest", "sourceUrl"]);
const MARKETPLACE_NAME_PATTERN = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u;
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MANAGED_MARKETPLACE_CONFIG = "ai-dotfiles/agent-dev";
const MARKETPLACE_CONFIG_RELATIVE_PATH = join(".agents", "marketplace-development", "config.json");
const MARKETPLACE_LOCK_RELATIVE_PATH = join(".agents", "marketplace-development", "agent-dev-sync.lock");
const LEGACY_MARKETPLACE_DEVELOPMENT_RELATIVE_PATH = join(".agents", "plugin-marketplace-development");
const MARKETPLACE_SKILL_CATALOG_RELATIVE_PATH = join(".agents", "skills", "catalog.json");
const MARKETPLACE_SKILL_STATE_PATH = join(HOME_PATH, ".agents", "marketplace-skill-state.json");
const MARKETPLACE_SKILL_LOCK_PATH = join(HOME_PATH, ".agents", ".marketplace-skill.lock");
const MARKETPLACE_SKILL_STATE_MARKER = "@ai-dotfiles agent-marketplace-skill-state v1";
const MARKETPLACE_SKILL_CATALOG_MARKER = "@plugin-creator-agent-plugins managed-skill-catalog v1";

const HELP = `Manage local Agent Skill, Agent Plugin, and Marketplace development

Usage:
  agent dev
  agent dev skill check
  agent dev skill sync
  agent dev plugin check [<name>]
  agent dev plugin sync [<name>]
  agent dev marketplace configure [<name>]
  agent dev marketplace setup [<name>]
  agent dev marketplace check [<name>] [--plugin <target> | --skill <target>]
  agent dev marketplace sync [<name>] [--plugin <target> | --skill <target>]
  agent marketplace list [<marketplace>]
  agent marketplace skill list [<marketplace>]
  agent marketplace skill install <skill> [<marketplace>]
  agent marketplace skill update <skill> [<marketplace>]
  agent marketplace skill remove <skill>

Alias:
  mp     Short for marketplace in both "agent mp ..." and "agent dev mp ...".

Behavior:
  check  Validate or detect drift without changing managed state.
  sync   Reconcile the selected derived state from its source of truth.
  list   List standalone Skills in a configured Marketplace.
  install, update, remove
         Manage verified standalone Skill copies under ~/.agents/skills.
  configure, setup
         Interactively edit local development configuration without syncing.

Plugin sync installs from a repository-owned local Marketplace. Marketplace sync
assembles a separate shared distribution. Neither command makes an installed or
distributed copy the editable source. Plugin sync refuses to run while a
same-named user-scoped skill entry is active.

Configuration:
  ~/.agents/development.json
  ~/.agents/marketplace-skill-state.json (managed Skill installation state)

Marketplace configure uses a nine-item action menu with number and letter
shortcuts. It can add, edit, or remove Marketplace targets, local plugin and
Skill targets, and Marketplace assignments. Submenus accept b to go back, and
input forms accept :back to discard only that operation. When only one
Marketplace exists, selection is automatic. With multiple Marketplaces,
configure selects one working target for the session.

Marketplace --plugin or --skill reads the existing managed Marketplace,
preserves other entries, and checks or syncs one local target. It does not
claim that other distributed copies are current.

Consumer Marketplace connections allow Skill listing and installation but
reject development checks and synchronization until their mode is changed.

Running without a mutating subcommand displays help or configured target names
and does not change links, plugin installations, or Marketplace distributions.`;

function fail(message, exitCode = 1) {
  const error = new Error(message);
  error.exitCode = exitCode;
  throw error;
}

class BackToConfigureMenu extends Error {}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertKnownKeys(value, keys, label) {
  if (!isObject(value)) fail(`${label} must be a JSON object.`);
  const unknown = Object.keys(value).filter((key) => !keys.has(key));
  if (unknown.length > 0) fail(`${label} has unknown fields: ${unknown.join(", ")}.`);
}

function assertTargetName(name, label) {
  if (typeof name !== "string" || name.trim() === "" || /[\r\n]/u.test(name)) {
    fail(`${label} names must be non-empty and single-line.`);
  }
}

function normalizeText(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} must be a non-empty string.`);
  return value.trim();
}

function validateMarketplaceName(value, label) {
  const name = normalizeText(value, label);
  if (name.length > 64 || !MARKETPLACE_NAME_PATTERN.test(name)) {
    fail(`${label} must use the Agent Plugin name form and be at most 64 characters.`);
  }
  return name;
}

function validateSkillName(value, label) {
  const name = normalizeText(value, label);
  if (name.length > 64 || !SKILL_NAME_PATTERN.test(name)) {
    fail(`${label} must use lowercase letters, numbers, and single hyphens, and be at most 64 characters.`);
  }
  return name;
}

function validateSourceUrl(value, label) {
  const sourceUrl = normalizeText(value, label);
  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    fail(`${label} must be an absolute HTTP or HTTPS URL.`);
  }
  if (
    !["http:", "https:"].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
  ) {
    fail(`${label} must be an HTTP or HTTPS URL without credentials, query parameters, or a fragment.`);
  }
  return sourceUrl;
}

function isMarketplaceName(value) {
  return typeof value === "string" && value.length <= 64 && MARKETPLACE_NAME_PATTERN.test(value);
}

function displayPath(pathValue) {
  const absolute = resolve(pathValue);
  const fromHome = relative(HOME_PATH, absolute);
  if (fromHome === "") return "~";
  if (!fromHome.startsWith("..") && !isAbsolute(fromHome)) return `~/${fromHome.replaceAll("\\", "/")}`;
  return `[external]/${basename(absolute)}`;
}

function expandPath(pathValue, label) {
  if (typeof pathValue !== "string" || pathValue.trim() === "") fail(`${label} must be a non-empty path string.`);
  if (pathValue === "~") return HOME_PATH;
  if (pathValue.startsWith("~/") || pathValue.startsWith("~\\")) return resolve(HOME_PATH, pathValue.slice(2));
  if (!isAbsolute(pathValue)) fail(`${label} must be absolute or start with ~/.`);
  return resolve(pathValue);
}

function sameOrWithin(parent, candidate) {
  const fromParent = relative(parent, candidate);
  return fromParent === "" || (!fromParent.startsWith("..") && !isAbsolute(fromParent));
}

function resolveRepositoryPath(repository, pathValue, label, type = "file") {
  if (typeof pathValue !== "string" || pathValue.trim() === "" || isAbsolute(pathValue)) {
    fail(`${label} must be a non-empty repository-relative path.`);
  }
  const candidate = resolve(repository, pathValue);
  if (!sameOrWithin(repository, candidate)) fail(`${label} escapes the repository.`);
  if (!existsSync(candidate)) fail(`${label} does not exist: ${pathValue}`);
  const resolvedCandidate = realpathSync(candidate);
  if (!sameOrWithin(repository, resolvedCandidate)) fail(`${label} resolves outside the repository.`);
  const stats = statSync(resolvedCandidate);
  if (type === "file" && !stats.isFile()) fail(`${label} must point to a file.`);
  if (type === "directory" && !stats.isDirectory()) fail(`${label} must point to a directory.`);
  return resolvedCandidate;
}

function readJson(pathValue, label) {
  let source;
  try {
    source = readFileSync(pathValue, "utf8");
  } catch (error) {
    fail(`Could not read ${label}: ${error.code || error.message}`);
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function jsonDigest(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function pathKey(pathValue) {
  const normalized = resolve(pathValue);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function writeAtomic(pathValue, content) {
  const directory = dirname(pathValue);
  mkdirSync(directory, { recursive: true });
  const temporary = join(directory, `.agent-write-${process.pid}-${randomUUID()}.tmp`);
  const backup = join(directory, `.agent-write-${process.pid}-${randomUUID()}.bak`);
  const existed = existsSync(pathValue);
  if (existed && !lstatSync(pathValue).isFile()) fail(`Refusing to replace a non-file: ${displayPath(pathValue)}`);
  writeFileSync(temporary, content, { encoding: "utf8", flag: "wx" });
  try {
    if (existed) renameSync(pathValue, backup);
    try {
      renameSync(temporary, pathValue);
    } catch (error) {
      if (existed && existsSync(backup)) renameSync(backup, pathValue);
      throw error;
    }
    if (existed) rmSync(backup, { force: true });
  } finally {
    rmSync(temporary, { force: true });
  }
}

function emptyConfiguration() {
  return {
    $schema: "./development.schema.json",
    schemaVersion: 2,
    skills: {},
    plugins: {},
    marketplaces: {},
  };
}

function validateConfiguration(config) {
  assertKnownKeys(config, TOP_LEVEL_KEYS, "development.json");
  if (config.schemaVersion !== 2) {
    fail("development.json.schemaVersion must be 2. Replace or recreate the local configuration before continuing.");
  }
  if (config.$schema !== undefined) normalizeText(config.$schema, "development.json.$schema");
  config.skills ??= {};
  if (!Object.hasOwn(config, "plugins")) fail("development.json.plugins is required.");
  if (!Object.hasOwn(config, "marketplaces")) fail("development.json.marketplaces is required.");
  const skills = config.skills ?? {};
  const plugins = config.plugins;
  const marketplaces = config.marketplaces;
  if (!isObject(skills)) fail("development.json.skills must be an object.");
  if (!isObject(plugins)) fail("development.json.plugins must be an object.");
  if (!isObject(marketplaces)) fail("development.json.marketplaces must be an object.");
  for (const [name, entry] of Object.entries(skills)) {
    assertTargetName(name, "Skill target");
    assertKnownKeys(entry, SKILL_KEYS, `skills.${name}`);
    const hasRepository = entry.repository !== undefined || entry.skillRoot !== undefined;
    const hasInstalledSkill = entry.installedSkill !== undefined;
    if (hasRepository === hasInstalledSkill) {
      fail(`skills.${name} requires either repository with skillRoot, or installedSkill.`);
    }
    if (hasRepository) {
      normalizeText(entry.repository, `skills.${name}.repository`);
      normalizeText(entry.skillRoot, `skills.${name}.skillRoot`);
    } else validateSkillName(entry.installedSkill, `skills.${name}.installedSkill`);
    if (entry.sourceUrl !== undefined) validateSourceUrl(entry.sourceUrl, `skills.${name}.sourceUrl`);
  }
  for (const [name, entry] of Object.entries(plugins)) {
    assertTargetName(name, "Plugin target");
    assertKnownKeys(entry, PLUGIN_KEYS, `plugins.${name}`);
    normalizeText(entry.repository, `plugins.${name}.repository`);
    const hasPluginRoot = entry.pluginRoot !== undefined;
    const hasDevelopmentConfig = entry.developmentConfig !== undefined;
    if (hasPluginRoot === hasDevelopmentConfig) {
      fail(`plugins.${name} requires exactly one of pluginRoot or developmentConfig.`);
    }
    if (hasPluginRoot) normalizeText(entry.pluginRoot, `plugins.${name}.pluginRoot`);
    if (hasDevelopmentConfig) normalizeText(entry.developmentConfig, `plugins.${name}.developmentConfig`);
    if (entry.runner !== undefined) normalizeText(entry.runner, `plugins.${name}.runner`);
    if (entry.runner !== undefined && !hasDevelopmentConfig) {
      fail(`plugins.${name}.runner requires developmentConfig.`);
    }
    if (entry.versionPolicy !== undefined) {
      if (!hasPluginRoot) fail(`plugins.${name}.versionPolicy requires pluginRoot.`);
      if (!["bump", "keep"].includes(entry.versionPolicy)) {
        fail(`plugins.${name}.versionPolicy must be bump or keep.`);
      }
    }
  }
  for (const [name, entry] of Object.entries(marketplaces)) {
    assertTargetName(name, "Marketplace target");
    assertKnownKeys(entry, MARKETPLACE_KEYS, `marketplaces.${name}`);
    normalizeText(entry.root, `marketplaces.${name}.root`);
    validateMarketplaceName(entry.name, `marketplaces.${name}.name`);
    normalizeText(entry.displayName, `marketplaces.${name}.displayName`);
    if (!["authoritative", "contributor", "consumer"].includes(entry.mode)) {
      fail(`marketplaces.${name}.mode must be authoritative, contributor, or consumer.`);
    }
    if (!Array.isArray(entry.plugins)) fail(`marketplaces.${name}.plugins must be an array.`);
    entry.skills ??= [];
    if (!Array.isArray(entry.skills)) fail(`marketplaces.${name}.skills must be an array.`);
    const targets = new Set();
    for (const [index, plugin] of entry.plugins.entries()) {
      assertKnownKeys(plugin, MARKETPLACE_PLUGIN_KEYS, `marketplaces.${name}.plugins[${index}]`);
      const target = normalizeText(plugin.target, `marketplaces.${name}.plugins[${index}].target`);
      normalizeText(plugin.category, `marketplaces.${name}.plugins[${index}].category`);
      if (!Object.hasOwn(plugins, target)) {
        fail(`marketplaces.${name}.plugins[${index}].target refers to an unknown plugin target: ${target}.`);
      }
      if (targets.has(target)) fail(`marketplaces.${name} contains duplicate plugin target: ${target}.`);
      targets.add(target);
    }
    const skillTargets = new Set();
    for (const [index, skill] of entry.skills.entries()) {
      assertKnownKeys(skill, MARKETPLACE_SKILL_KEYS, `marketplaces.${name}.skills[${index}]`);
      const target = normalizeText(skill.target, `marketplaces.${name}.skills[${index}].target`);
      if (!Object.hasOwn(skills, target)) {
        fail(`marketplaces.${name}.skills[${index}].target refers to an unknown skill target: ${target}.`);
      }
      if (skillTargets.has(target)) fail(`marketplaces.${name} contains duplicate skill target: ${target}.`);
      skillTargets.add(target);
    }
  }
  return { skills, plugins, marketplaces };
}

function readConfiguration({ allowMissing = false } = {}) {
  if (!existsSync(CONFIG_PATH)) {
    if (allowMissing) return emptyConfiguration();
    fail(`Could not read ${displayPath(CONFIG_PATH)}: ENOENT. Run agent dev marketplace configure to create it.`);
  }
  const config = readJson(CONFIG_PATH, displayPath(CONFIG_PATH));
  validateConfiguration(config);
  return config;
}

function configuredPath(pathValue) {
  const absolute = resolve(pathValue);
  const fromHome = relative(HOME_PATH, absolute);
  if (fromHome === "") return "~";
  if (!fromHome.startsWith("..") && !isAbsolute(fromHome)) return `~/${fromHome.replaceAll("\\", "/")}`;
  return absolute;
}

function repositoryRootFor(sourceRoot) {
  let candidate = sourceRoot;
  while (true) {
    if (existsSync(join(candidate, ".git"))) return candidate;
    const parent = dirname(candidate);
    if (parent === candidate) return sourceRoot;
    candidate = parent;
  }
}

function skillFrontmatter(skillRoot, label) {
  const file = join(skillRoot, "SKILL.md");
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch (error) {
    fail(`Could not read ${label}/SKILL.md: ${error.code || error.message}`);
  }
  const lines = source.split(/\r?\n/u);
  if (lines[0]?.trim() !== "---") fail(`${label}/SKILL.md must start with YAML frontmatter.`);
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) fail(`${label}/SKILL.md has unclosed YAML frontmatter.`);
  const values = {};
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*?)\s*$/u.exec(line);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  const name = validateSkillName(values.name, `${label}/SKILL.md name`);
  if (!values.description) fail(`${label}/SKILL.md description must be non-empty.`);
  return { name, frontmatter: lines.slice(1, end) };
}

function skillSourceContext(name, entry) {
  let skillRoot;
  let boundary;
  if (entry.installedSkill) {
    const installedRoot = join(HOME_PATH, ".agents", "skills");
    const candidate = resolve(installedRoot, entry.installedSkill);
    if (!sameOrWithin(installedRoot, candidate)) fail(`skills.${name}.installedSkill escapes ~/.agents/skills.`);
    if (!existsSync(candidate)) fail(`Installed Skill does not exist: ${entry.installedSkill}.`);
    skillRoot = realpathSync(candidate);
    if (!statSync(skillRoot).isDirectory()) fail(`Installed Skill is not a directory: ${entry.installedSkill}.`);
    boundary = skillRoot;
  } else {
    const repository = expandPath(entry.repository, `skills.${name}.repository`);
    if (!existsSync(repository) || !statSync(repository).isDirectory()) fail(`Skill repository does not exist: ${name}.`);
    const realRepository = realpathSync(repository);
    skillRoot = resolveRepositoryPath(realRepository, entry.skillRoot, `skills.${name}.skillRoot`, "directory");
    boundary = realRepository;
  }
  const manifest = skillFrontmatter(skillRoot, `skills.${name}`);
  if (entry.installedSkill && entry.installedSkill !== manifest.name) {
    fail(`skills.${name}.installedSkill must match the name in SKILL.md: ${manifest.name}.`);
  }
  if (!entry.installedSkill && basename(skillRoot) !== manifest.name) {
    fail(`skills.${name}.skillRoot directory name must match the name in SKILL.md: ${manifest.name}.`);
  }
  return { skillRoot, name: manifest.name, boundary, sourceUrl: entry.sourceUrl };
}

function uniqueTargetName(preferred, plugins) {
  if (!Object.hasOwn(plugins, preferred)) return preferred;
  let suffix = 2;
  while (Object.hasOwn(plugins, `${preferred}-${suffix}`)) suffix += 1;
  return `${preferred}-${suffix}`;
}

function validateStandaloneDefinition(config, label) {
  if (!isObject(config)) fail(`${label} must be a JSON object.`);
  if (Object.keys(config).some((key) => !STANDALONE_MARKETPLACE_KEYS.has(key))) {
    fail(`${label} has unsupported fields.`);
  }
  if (![1, 2].includes(config.schemaVersion)) fail(`${label}.schemaVersion must be 1 or 2 for standalone import.`);
  validateMarketplaceName(config.name, `${label}.name`);
  normalizeText(config.displayName, `${label}.displayName`);
  if (!Array.isArray(config.plugins)) fail(`${label}.plugins must be an array.`);
  for (const [index, plugin] of config.plugins.entries()) {
    assertKnownKeys(plugin, STANDALONE_MARKETPLACE_PLUGIN_KEYS, `${label}.plugins[${index}]`);
    normalizeText(plugin.source, `${label}.plugins[${index}].source`);
    normalizeText(plugin.category, `${label}.plugins[${index}].category`);
  }
  if (config.schemaVersion === 1 && config.skills !== undefined) {
    fail(`${label}.skills requires schemaVersion 2.`);
  }
  if (config.skills !== undefined && !Array.isArray(config.skills)) fail(`${label}.skills must be an array.`);
  for (const [index, skill] of (config.skills ?? []).entries()) {
    assertKnownKeys(skill, STANDALONE_MARKETPLACE_SKILL_KEYS, `${label}.skills[${index}]`);
    normalizeText(skill.source, `${label}.skills[${index}].source`);
    if (skill.sourceUrl !== undefined) validateSourceUrl(skill.sourceUrl, `${label}.skills[${index}].sourceUrl`);
  }
  return config;
}

function validateManagedMarketplaceReference(config, label) {
  assertKnownKeys(config, MANAGED_MARKETPLACE_KEYS, label);
  if (config.schemaVersion !== 2 || config.managedBy !== MANAGED_MARKETPLACE_CONFIG) {
    fail(`${label} is not managed by agent dev.`);
  }
  validateMarketplaceName(config.name, `${label}.name`);
  normalizeText(config.displayName, `${label}.displayName`);
  if (!Array.isArray(config.plugins)) fail(`${label}.plugins must be an array.`);
  const names = new Set();
  for (const [index, plugin] of config.plugins.entries()) {
    assertKnownKeys(plugin, MANAGED_MARKETPLACE_PLUGIN_KEYS, `${label}.plugins[${index}]`);
    const name = validateMarketplaceName(plugin.name, `${label}.plugins[${index}].name`);
    normalizeText(plugin.category, `${label}.plugins[${index}].category`);
    if (names.has(name)) fail(`${label} contains duplicate plugin name: ${name}.`);
    names.add(name);
  }
  if (config.skills !== undefined && !Array.isArray(config.skills)) fail(`${label}.skills must be an array.`);
  const skillNames = new Set();
  for (const [index, skill] of (config.skills ?? []).entries()) {
    assertKnownKeys(skill, MANAGED_MARKETPLACE_SKILL_KEYS, `${label}.skills[${index}]`);
    const name = validateSkillName(skill.name, `${label}.skills[${index}].name`);
    if (skill.sourceUrl !== undefined) validateSourceUrl(skill.sourceUrl, `${label}.skills[${index}].sourceUrl`);
    if (skillNames.has(name)) fail(`${label} contains duplicate Skill name: ${name}.`);
    skillNames.add(name);
  }
  const { configurationDigest, ...core } = config;
  if (configurationDigest !== jsonDigest(core)) fail(`${label} was changed outside agent dev.`);
  return config;
}

function importStandaloneMarketplace(name, rootValue, config) {
  const root = expandPath(rootValue, `marketplaces.${name}.root`);
  const standalone = validateStandaloneDefinition(
    readJson(join(root, MARKETPLACE_CONFIG_RELATIVE_PATH), `Marketplace ${name} configuration`),
    `Marketplace ${name} configuration`,
  );
  const sourceTargets = new Map();
  for (const [target, entry] of Object.entries(config.plugins)) {
    const context = pluginSourceContext(target, entry);
    sourceTargets.set(pathKey(context.pluginRoot), target);
  }
  const assignments = [];
  for (const plugin of standalone.plugins) {
    const source = resolve(root, plugin.source);
    if (sameOrWithin(join(root, "plugins"), source)) {
      fail(`Marketplace ${name} has a plugin source inside its generated plugins directory.`);
    }
    if (!existsSync(source) || !statSync(source).isDirectory()) {
      fail(`Marketplace ${name} has an unavailable plugin source.`);
    }
    const realSource = realpathSync(source);
    let target = sourceTargets.get(pathKey(realSource));
    if (!target) {
      const manifest = readJson(join(realSource, "plugin.json"), `Marketplace ${name} plugin manifest`);
      const pluginName = validateMarketplaceName(manifest.name, `Marketplace ${name} plugin name`);
      target = uniqueTargetName(pluginName, config.plugins);
      const repository = realpathSync(repositoryRootFor(realSource));
      const pluginRoot = relative(repository, realSource);
      config.plugins[target] = {
        repository: configuredPath(repository),
        pluginRoot: pluginRoot === "" ? "." : pluginRoot.replaceAll("\\", "/"),
      };
      sourceTargets.set(pathKey(realSource), target);
    }
    assignments.push({ target, category: plugin.category });
  }
  const skillSourceTargets = new Map();
  for (const [target, entry] of Object.entries(config.skills ?? {})) {
    const context = skillSourceContext(target, entry);
    skillSourceTargets.set(pathKey(context.skillRoot), target);
  }
  const skillAssignments = [];
  for (const skill of standalone.skills ?? []) {
    const source = resolve(root, skill.source);
    if (sameOrWithin(join(root, "skills"), source)) {
      fail(`Marketplace ${name} has a Skill source inside its generated skills directory.`);
    }
    if (!existsSync(source) || !statSync(source).isDirectory()) {
      fail(`Marketplace ${name} has an unavailable Skill source.`);
    }
    const realSource = realpathSync(source);
    let target = skillSourceTargets.get(pathKey(realSource));
    if (!target) {
      const skillName = skillFrontmatter(realSource, `Marketplace ${name} Skill`).name;
      target = uniqueTargetName(skillName, config.skills);
      const repository = realpathSync(repositoryRootFor(realSource));
      const skillRoot = relative(repository, realSource);
      config.skills[target] = {
        repository: configuredPath(repository),
        skillRoot: skillRoot === "" ? "." : skillRoot.replaceAll("\\", "/"),
        ...(skill.sourceUrl ? { sourceUrl: skill.sourceUrl } : {}),
      };
      skillSourceTargets.set(pathKey(realSource), target);
    }
    skillAssignments.push({ target });
  }
  return {
    root: rootValue,
    name: standalone.name,
    displayName: standalone.displayName,
    mode: "authoritative",
    plugins: assignments,
    skills: skillAssignments,
  };
}

function importExistingMarketplace(name, rootValue, config) {
  const root = expandPath(rootValue, `marketplaces.${name}.root`);
  assertMarketplaceLayoutCurrent(root, name);
  const pathValue = join(root, MARKETPLACE_CONFIG_RELATIVE_PATH);
  const current = readJson(pathValue, `Marketplace ${name} configuration`);
  if (current.managedBy !== MANAGED_MARKETPLACE_CONFIG) {
    return importStandaloneMarketplace(name, rootValue, config);
  }
  const managed = validateManagedMarketplaceReference(current, `Marketplace ${name} configuration`);
  return {
    root: rootValue,
    name: managed.name,
    displayName: managed.displayName,
    mode: "consumer",
    plugins: [],
    skills: [],
  };
}

function readConfigurationForConfigure() {
  if (!existsSync(CONFIG_PATH)) return emptyConfiguration();
  const config = readJson(CONFIG_PATH, displayPath(CONFIG_PATH));
  validateConfiguration(config);
  return config;
}

function selectTarget(entries, requestedName, label) {
  const names = Object.keys(entries).sort((left, right) => left.localeCompare(right, "en"));
  if (requestedName !== undefined) {
    if (!Object.hasOwn(entries, requestedName)) {
      fail(`Unknown ${label}: ${requestedName}. Configured: ${names.join(", ") || "(none)"}.`, 2);
    }
    return [requestedName, entries[requestedName]];
  }
  if (names.length === 1) return [names[0], entries[names[0]]];
  if (names.length === 0) fail(`No ${label} targets are configured.`, 2);
  fail(`Choose a ${label}: ${names.join(", ")}.`, 2);
}

function sanitizeOutput(value, replacements) {
  let result = String(value ?? "");
  const variants = [];
  for (const [pathValue, label] of replacements) {
    const absolute = resolve(pathValue);
    variants.push([absolute, label], [absolute.replaceAll("\\", "/"), label], [`\\\\?\\${absolute}`, label]);
  }
  variants.sort((left, right) => right[0].length - left[0].length);
  for (const [pathValue, label] of variants) result = result.replaceAll(pathValue, label);
  return result;
}

function runNode(script, args, replacements) {
  if (!existsSync(script) || !statSync(script).isFile()) fail(`Required manager is missing: ${displayPath(script)}`);
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    shell: false,
    stdio: ["inherit", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) fail(sanitizeOutput(result.error.message, replacements));
  if (result.stdout) process.stdout.write(sanitizeOutput(result.stdout, replacements));
  if (result.stderr) process.stderr.write(sanitizeOutput(result.stderr, replacements));
  return result.status ?? 1;
}

function pluginContext(name, entry, { includePluginRoot = false, includeRunner = true } = {}) {
  if (!entry.developmentConfig) fail(`Plugin target ${name} does not define a repository development configuration.`);
  const repository = expandPath(entry.repository, `plugins.${name}.repository`);
  if (!existsSync(repository) || !statSync(repository).isDirectory()) fail(`Plugin repository does not exist: ${name}.`);
  const realRepository = realpathSync(repository);
  const config = resolveRepositoryPath(
    realRepository,
    entry.developmentConfig,
    `plugins.${name}.developmentConfig`,
  );
  const runner = includeRunner
    ? resolveRepositoryPath(realRepository, entry.runner ?? "scripts/local-plugin.mjs", `plugins.${name}.runner`)
    : null;
  if (!includePluginRoot) return { repository: realRepository, config, runner };
  const repositoryConfig = readJson(config, `plugins.${name}.developmentConfig`);
  const pluginRoot = resolveRepositoryPath(
    realRepository,
    repositoryConfig.pluginRoot,
    `plugins.${name}.developmentConfig pluginRoot`,
    "directory",
  );
  return { repository: realRepository, config, runner, pluginRoot };
}

function pluginSourceContext(name, entry) {
  if (entry.developmentConfig) {
    return pluginContext(name, entry, { includePluginRoot: true, includeRunner: false });
  }
  const repository = expandPath(entry.repository, `plugins.${name}.repository`);
  if (!existsSync(repository) || !statSync(repository).isDirectory()) fail(`Plugin repository does not exist: ${name}.`);
  const realRepository = realpathSync(repository);
  const pluginRoot = resolveRepositoryPath(realRepository, entry.pluginRoot, `plugins.${name}.pluginRoot`, "directory");
  return { repository: realRepository, pluginRoot };
}

function containedSkillNames(pluginRoot) {
  const skillsRoot = join(pluginRoot, "skills");
  if (!existsSync(skillsRoot) || !statSync(skillsRoot).isDirectory()) return [];
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(skillsRoot, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"));
}

function activeUserSkillEntries(pluginRoot) {
  const userSkillsRoot = join(HOME_PATH, ".agents", "skills");
  let activeNames;
  try {
    activeNames = new Set(readdirSync(userSkillsRoot));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return containedSkillNames(pluginRoot).filter((name) => activeNames.has(name));
}

function handleSkill(action) {
  return runNode(SKILL_MANAGER, [action], [[HOME_PATH, "~"]]);
}

function handlePlugin(action, requestedName, config) {
  const [name, entry] = selectTarget(config.plugins, requestedName, "plugin");
  const repositoryManaged = entry.developmentConfig !== undefined;
  const context = repositoryManaged
    ? pluginContext(name, entry, { includePluginRoot: action === "sync" })
    : pluginSourceContext(name, entry);
  if (action === "sync") {
    if (!repositoryManaged && entry.versionPolicy === undefined) {
      fail(
        `Direct plugin target ${name} requires versionPolicy "bump" or "keep" before plugin sync. `
        + "This explicit choice also enables Codex installation for the target.",
        2,
      );
    }
    const conflicts = activeUserSkillEntries(context.pluginRoot);
    if (conflicts.length > 0) {
      fail(
        `Plugin ${name} has active user-scoped entries for: ${conflicts.join(", ")}. `
        + "Disable those entries or use an isolated user environment before plugin sync.",
      );
    }
  }
  if (!repositoryManaged) {
    if (action === "check") {
      console.log(`Direct plugin check: ${name} (portable package only; no repository-specific checks)`);
    }
    const args = [action === "check" ? "validate" : "install", context.pluginRoot];
    if (action === "sync") args.push(entry.versionPolicy === "bump" ? "--bump-version" : "--keep-version");
    return runNode(
      LOCAL_PLUGIN_MANAGER,
      args,
      [[context.repository, `<plugin:${name}>`], [HOME_PATH, "~"]],
    );
  }
  return runNode(
    context.runner,
    [action === "check" ? "validate" : "install", "--config", context.config],
    [[context.repository, `<plugin:${name}>`], [HOME_PATH, "~"]],
  );
}

function marketplaceMaterialization(name, entry, config, {
  root = null,
  requestedPlugin = null,
  requestedSkill = null,
  currentMirror = null,
} = {}) {
  if (requestedPlugin !== null && requestedSkill !== null) fail("Select either one plugin or one Skill, not both.");
  const scoped = requestedPlugin !== null || requestedSkill !== null;
  const effectivePlugins = [];
  const mirrorPlugins = [];
  const effectiveSkills = [];
  const mirrorSkills = [];
  const replacements = [];
  const pluginNames = new Set();
  const targetPluginNames = new Map();
  const skillNames = new Set();
  const targetSkillNames = new Map();
  const pluginAssignments = !scoped
    ? entry.plugins
    : requestedPlugin === null ? [] : entry.plugins.filter((assignment) => assignment.target === requestedPlugin);
  for (const assignment of pluginAssignments) {
    const context = pluginSourceContext(assignment.target, config.plugins[assignment.target]);
    const manifest = readJson(join(context.pluginRoot, "plugin.json"), `plugins.${assignment.target} plugin.json`);
    const pluginName = validateMarketplaceName(manifest.name, `plugins.${assignment.target} plugin.json.name`);
    if (pluginNames.has(pluginName)) {
      fail(`Marketplace ${name} resolves more than one target to plugin name ${pluginName}.`);
    }
    pluginNames.add(pluginName);
    targetPluginNames.set(assignment.target, pluginName);
    effectivePlugins.push({ source: context.pluginRoot, category: assignment.category });
    mirrorPlugins.push({ name: pluginName, category: assignment.category });
    replacements.push([context.repository, `<plugin:${assignment.target}>`]);
  }
  const skillAssignments = !scoped
    ? entry.skills
    : requestedSkill === null ? [] : entry.skills.filter((assignment) => assignment.target === requestedSkill);
  for (const assignment of skillAssignments) {
    const context = skillSourceContext(assignment.target, config.skills[assignment.target]);
    if (skillNames.has(context.name)) {
      fail(`Marketplace ${name} resolves more than one target to Skill name ${context.name}.`);
    }
    skillNames.add(context.name);
    targetSkillNames.set(assignment.target, context.name);
    effectiveSkills.push({
      source: context.skillRoot,
      ...(context.sourceUrl ? { sourceUrl: context.sourceUrl } : {}),
    });
    mirrorSkills.push({
      name: context.name,
      ...(context.sourceUrl ? { sourceUrl: context.sourceUrl } : {}),
    });
    replacements.push([context.boundary, `<skill:${assignment.target}>`]);
  }
  let finalEffectivePlugins = effectivePlugins;
  let finalMirrorPlugins = mirrorPlugins;
  let finalEffectiveSkills = effectiveSkills;
  let finalMirrorSkills = mirrorSkills;
  if (scoped) {
    if (!currentMirror || !root) fail("A scoped Marketplace operation requires an existing managed Marketplace.");
    if (currentMirror.name !== entry.name || currentMirror.displayName !== entry.displayName) {
      fail(`Marketplace ${name} identity differs from the connected Marketplace.`);
    }
    finalMirrorPlugins = (currentMirror.plugins ?? []).map((plugin) => ({ ...plugin }));
    finalMirrorSkills = (currentMirror.skills ?? []).map((skill) => ({ ...skill }));
    if (requestedPlugin !== null) {
      const selectedName = targetPluginNames.get(requestedPlugin);
      const selected = mirrorPlugins[0];
      const selectedIndex = finalMirrorPlugins.findIndex((plugin) => plugin.name === selectedName);
      if (selectedIndex < 0) finalMirrorPlugins.push(selected);
      else finalMirrorPlugins[selectedIndex] = selected;
    } else {
      const selectedName = targetSkillNames.get(requestedSkill);
      const selected = mirrorSkills[0];
      const selectedIndex = finalMirrorSkills.findIndex((skill) => skill.name === selectedName);
      if (selectedIndex < 0) finalMirrorSkills.push(selected);
      else finalMirrorSkills[selectedIndex] = selected;
    }
    finalEffectivePlugins = finalMirrorPlugins.map((plugin) => ({
      source: requestedPlugin !== null && plugin.name === targetPluginNames.get(requestedPlugin)
        ? effectivePlugins[0].source
        : join(root, "plugins", plugin.name),
      category: plugin.category,
    }));
    finalEffectiveSkills = finalMirrorSkills.map((skill) => ({
      source: requestedSkill !== null && skill.name === targetSkillNames.get(requestedSkill)
        ? effectiveSkills[0].source
        : join(root, "skills", skill.name),
      ...(skill.sourceUrl ? { sourceUrl: skill.sourceUrl } : {}),
    }));
  }
  const effective = {
    schemaVersion: 2,
    name: entry.name,
    displayName: entry.displayName,
    plugins: finalEffectivePlugins,
    skills: finalEffectiveSkills,
  };
  const mirrorCore = {
    $schema: "./schema.json",
    schemaVersion: 2,
    managedBy: MANAGED_MARKETPLACE_CONFIG,
    name: entry.name,
    displayName: entry.displayName,
    plugins: finalMirrorPlugins,
    skills: finalMirrorSkills,
  };
  return {
    effective,
    mirror: { ...mirrorCore, configurationDigest: jsonDigest(mirrorCore) },
    replacements,
    targetPluginNames,
    targetSkillNames,
  };
}

function matchesStandaloneMarketplace(root, current, effective) {
  if (!isObject(current) || ![1, 2].includes(current.schemaVersion)) return false;
  if (Object.keys(current).some((key) => !STANDALONE_MARKETPLACE_KEYS.has(key))) return false;
  if (current.name !== effective.name || current.displayName !== effective.displayName) return false;
  if (!Array.isArray(current.plugins) || current.plugins.length !== effective.plugins.length) return false;
  const expected = new Map(effective.plugins.map((plugin) => [pathKey(plugin.source), plugin.category]));
  if (expected.size !== effective.plugins.length) return false;
  for (const plugin of current.plugins) {
    if (!isObject(plugin) || Object.keys(plugin).some((key) => !STANDALONE_MARKETPLACE_PLUGIN_KEYS.has(key))) return false;
    if (typeof plugin.source !== "string" || typeof plugin.category !== "string") return false;
    const source = pathKey(isAbsolute(plugin.source) ? plugin.source : resolve(root, plugin.source));
    if (expected.get(source) !== plugin.category) return false;
    expected.delete(source);
  }
  if (expected.size !== 0) return false;
  const currentSkills = current.skills ?? [];
  if (currentSkills.length !== effective.skills.length) return false;
  const expectedSkills = new Map(effective.skills.map((skill) => [
    pathKey(skill.source),
    skill.sourceUrl ?? null,
  ]));
  if (expectedSkills.size !== effective.skills.length) return false;
  for (const skill of currentSkills) {
    if (!isObject(skill) || Object.keys(skill).some((key) => !STANDALONE_MARKETPLACE_SKILL_KEYS.has(key))) return false;
    if (typeof skill.source !== "string") return false;
    const source = pathKey(isAbsolute(skill.source) ? skill.source : resolve(root, skill.source));
    if (expectedSkills.get(source) !== (skill.sourceUrl ?? null)) return false;
    expectedSkills.delete(source);
  }
  return expectedSkills.size === 0;
}

function inspectMarketplaceMirror(root, expected, effective) {
  const pathValue = join(root, MARKETPLACE_CONFIG_RELATIVE_PATH);
  if (!existsSync(pathValue)) return { status: "missing", path: pathValue };
  if (!lstatSync(pathValue).isFile()) return { status: "unmanaged", path: pathValue };
  const current = readJson(pathValue, "Marketplace reference configuration");
  if (matchesStandaloneMarketplace(root, current, effective)) {
    return { status: "adoptable", path: pathValue };
  }
  if (!isObject(current) || current.managedBy !== MANAGED_MARKETPLACE_CONFIG || current.schemaVersion !== 2) {
    return { status: "unmanaged", path: pathValue };
  }
  const { configurationDigest, ...core } = current;
  if (configurationDigest !== jsonDigest(core)) return { status: "modified", path: pathValue };
  return {
    status: canonicalJson(current) === canonicalJson(expected) ? "current" : "outdated",
    path: pathValue,
  };
}

function readManagedMarketplaceMirror(root, name) {
  assertMarketplaceLayoutCurrent(root, name);
  const pathValue = join(root, MARKETPLACE_CONFIG_RELATIVE_PATH);
  if (!existsSync(pathValue) || !lstatSync(pathValue).isFile()) {
    fail(`Marketplace ${name} has no managed reference configuration. Run a full sync to initialize it.`);
  }
  return validateManagedMarketplaceReference(
    readJson(pathValue, `Marketplace ${name} reference configuration`),
    `Marketplace ${name} reference configuration`,
  );
}

function hasMarketplaceArtifacts(root) {
  return [
    join(root, ".agents", "marketplace-development", "schema.json"),
    join(root, ".agents", "marketplace-development", "state.json"),
    join(root, ".agents", "plugins", "marketplace.json"),
    join(root, ".agents", "skills", "catalog.json"),
    join(root, "plugins"),
    join(root, "skills"),
  ].some((pathValue) => existsSync(pathValue));
}

function acquireMarketplaceLock(root, name) {
  const lockPath = join(root, MARKETPLACE_LOCK_RELATIVE_PATH);
  mkdirSync(dirname(lockPath), { recursive: true });
  try {
    mkdirSync(lockPath);
  } catch (error) {
    if (error.code === "EEXIST") {
      fail(`Marketplace ${name} is locked by another sync. If no sync is running, remove the stale lock directory.`);
    }
    throw error;
  }
  return lockPath;
}

function assertMarketplaceUnlocked(root, name) {
  if (existsSync(join(root, MARKETPLACE_LOCK_RELATIVE_PATH))) {
    fail(`Marketplace ${name} is being synchronized. Retry check after that operation finishes.`);
  }
}

function releaseMarketplaceLock(lockPath) {
  rmSync(lockPath, { recursive: true, force: true });
}

function assertMarketplaceLayoutCurrent(root, name) {
  if (!existsSync(join(root, LEGACY_MARKETPLACE_DEVELOPMENT_RELATIVE_PATH))) return;
  fail(
    `Marketplace ${name} still uses .agents/plugin-marketplace-development. `
    + "Rename that directory to .agents/marketplace-development before continuing.",
  );
}

function handleMarketplace(action, requestedName, requestedPlugin, requestedSkill, config) {
  const [name, entry] = selectTarget(config.marketplaces, requestedName, "marketplace");
  if (requestedPlugin !== undefined && requestedSkill !== undefined) {
    fail("Specify either --plugin or --skill, not both.", 2);
  }
  if (entry.mode === "consumer") {
    fail(
      `Marketplace ${name} is consumer-only. Use agent marketplace skill commands to browse or install Skills, `
      + "or change the Marketplace management mode before development operations.",
      2,
    );
  }
  if (entry.mode === "contributor" && requestedPlugin === undefined && requestedSkill === undefined) {
    fail(`Marketplace ${name} is contributor-managed. Specify --plugin or --skill for check or sync.`, 2);
  }
  if (requestedPlugin !== undefined && !entry.plugins.some((plugin) => plugin.target === requestedPlugin)) {
    const available = entry.plugins.map((plugin) => plugin.target).sort((left, right) => left.localeCompare(right, "en"));
    fail(
      `Plugin target ${requestedPlugin} is not assigned to Marketplace ${name}. Assigned: ${available.join(", ") || "(none)"}.`,
      2,
    );
  }
  if (requestedSkill !== undefined && !entry.skills.some((skill) => skill.target === requestedSkill)) {
    const available = entry.skills.map((skill) => skill.target).sort((left, right) => left.localeCompare(right, "en"));
    fail(
      `Skill target ${requestedSkill} is not assigned to Marketplace ${name}. Assigned: ${available.join(", ") || "(none)"}.`,
      2,
    );
  }
  const root = expandPath(entry.root, `marketplaces.${name}.root`);
  assertMarketplaceLayoutCurrent(root, name);
  const lockPath = action === "sync" ? acquireMarketplaceLock(root, name) : null;
  if (action === "check") assertMarketplaceUnlocked(root, name);
  let operationError;
  try {
    const scoped = requestedPlugin !== undefined || requestedSkill !== undefined;
    const currentMirror = scoped ? readManagedMarketplaceMirror(root, name) : null;
    const materialized = marketplaceMaterialization(name, entry, config, {
      root,
      requestedPlugin: requestedPlugin ?? null,
      requestedSkill: requestedSkill ?? null,
      currentMirror,
    });
    const mirrorState = inspectMarketplaceMirror(root, materialized.mirror, materialized.effective);
    if (action === "sync" && mirrorState.status === "unmanaged") {
      fail(`Refusing to replace a Marketplace configuration not managed by agent dev: ${name}.`);
    }
    if (action === "sync" && mirrorState.status === "modified") {
      fail(`Refusing to replace a Marketplace configuration changed outside agent dev: ${name}.`);
    }
    if (action === "sync" && mirrorState.status === "missing" && hasMarketplaceArtifacts(root)) {
      fail(`Refusing to adopt existing Marketplace artifacts without an agent dev configuration: ${name}.`);
    }
    const temporaryRoot = mkdtempSync(join(tmpdir(), "agent-dev-marketplace-"));
    const temporaryConfig = join(temporaryRoot, "config.json");
    writeFileSync(temporaryConfig, jsonText(materialized.effective), "utf8");
    let status;
    try {
      const managerArguments = [action, root, "--config", temporaryConfig];
      if (requestedPlugin !== undefined) {
        managerArguments.push("--plugin", materialized.targetPluginNames.get(requestedPlugin), "--merge");
      } else if (requestedSkill !== undefined) {
        managerArguments.push("--skill", materialized.targetSkillNames.get(requestedSkill), "--merge");
      }
      status = runNode(
        MARKETPLACE_MANAGER,
        managerArguments,
        [
          ...materialized.replacements,
          [temporaryRoot, "[temporary]"],
          [root, `<marketplace:${name}>`],
          [HOME_PATH, "~"],
        ],
      );
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }

    if (action === "check") {
      if (mirrorState.status !== "current") {
        const detail = mirrorState.status === "missing" ? "Missing" : "Changed";
        console.error(`${detail}: ${MARKETPLACE_CONFIG_RELATIVE_PATH.replaceAll("\\", "/")}`);
        return 1;
      }
      return status;
    }
    if (status !== 0) return status;
    if (mirrorState.status !== "current") {
      writeAtomic(mirrorState.path, jsonText(materialized.mirror));
      const change = mirrorState.status === "missing" ? "Created" : "Updated";
      console.log(`${change}: ${MARKETPLACE_CONFIG_RELATIVE_PATH.replaceAll("\\", "/")}`);
    }
    return 0;
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    if (lockPath) {
      try {
        releaseMarketplaceLock(lockPath);
      } catch (error) {
        if (!operationError) throw error;
        operationError.message += `\nAdditionally, the Marketplace sync lock could not be removed: ${error.message}`;
      }
    }
  }
}

function treeDigestSync(root) {
  const hash = createHash("sha256");
  const realRoot = realpathSync(root);
  function visit(directory, relativeDirectory) {
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const relativePath = join(relativeDirectory, entry.name).replaceAll("\\", "/");
      const target = join(directory, entry.name);
      const stats = lstatSync(target);
      if (stats.isDirectory()) {
        hash.update(`d\0${relativePath}\0${stats.mode & 0o777}\0`);
        visit(target, join(relativeDirectory, entry.name));
      } else if (stats.isFile()) {
        hash.update(`f\0${relativePath}\0${stats.mode & 0o777}\0`);
        hash.update(readFileSync(target));
        hash.update("\0");
      } else if (stats.isSymbolicLink()) {
        const linkTarget = readlinkSync(target);
        let resolvedTarget;
        try {
          resolvedTarget = realpathSync(target);
        } catch (error) {
          fail(`Skill ${displayPath(root)} contains an unreadable symbolic link: ${relativePath} (${error.code || error.message}).`);
        }
        if (isAbsolute(linkTarget) || !sameOrWithin(realRoot, resolvedTarget)) {
          fail(`Skill ${displayPath(root)} contains a symbolic link outside its root: ${relativePath}.`);
        }
        hash.update(`l\0${relativePath}\0${linkTarget}\0`);
      } else fail(`Unsupported filesystem entry in Skill ${displayPath(root)}: ${relativePath}`);
    }
  }
  visit(root, "");
  return `sha256:${hash.digest("hex")}`;
}

function readMarketplaceSkillState() {
  if (!existsSync(MARKETPLACE_SKILL_STATE_PATH)) {
    return { $comment: MARKETPLACE_SKILL_STATE_MARKER, schemaVersion: 1, skills: {} };
  }
  const state = readJson(MARKETPLACE_SKILL_STATE_PATH, displayPath(MARKETPLACE_SKILL_STATE_PATH));
  if (
    !isObject(state)
    || state.$comment !== MARKETPLACE_SKILL_STATE_MARKER
    || state.schemaVersion !== 1
    || !isObject(state.skills)
  ) fail(`Refusing invalid or unmanaged Marketplace Skill state: ${displayPath(MARKETPLACE_SKILL_STATE_PATH)}.`);
  for (const [name, entry] of Object.entries(state.skills)) {
    validateSkillName(name, "Installed Marketplace Skill name");
    assertKnownKeys(entry, MARKETPLACE_SKILL_STATE_ENTRY_KEYS, `state.skills.${name}`);
    assertTargetName(entry.marketplace, `state.skills.${name}.marketplace`);
    if (!/^sha256:[0-9a-f]{64}$/u.test(entry.digest)) fail(`state.skills.${name}.digest is invalid.`);
  }
  return state;
}

function readMarketplaceSkillCatalog(localName, entry, { verifySkill = null } = {}) {
  const root = expandPath(entry.root, `marketplaces.${localName}.root`);
  assertMarketplaceLayoutCurrent(root, localName);
  const catalogPath = join(root, MARKETPLACE_SKILL_CATALOG_RELATIVE_PATH);
  const catalog = readJson(catalogPath, `Marketplace ${localName} Skill catalog`);
  assertKnownKeys(catalog, MARKETPLACE_SKILL_CATALOG_KEYS, `Marketplace ${localName} Skill catalog`);
  if (catalog.$comment !== MARKETPLACE_SKILL_CATALOG_MARKER || catalog.schemaVersion !== 1) {
    fail(`Marketplace ${localName} has an unsupported Skill catalog.`);
  }
  assertKnownKeys(catalog.marketplace, MARKETPLACE_SKILL_CATALOG_IDENTITY_KEYS, `Marketplace ${localName} Skill catalog marketplace`);
  if (catalog.marketplace.name !== entry.name) fail(`Marketplace ${localName} Skill catalog identity does not match local configuration.`);
  normalizeText(catalog.marketplace.displayName, `Marketplace ${localName} Skill catalog displayName`);
  if (!Array.isArray(catalog.skills)) fail(`Marketplace ${localName} Skill catalog skills must be an array.`);
  const names = new Set();
  const skillRoot = join(root, "skills");
  const skills = catalog.skills.map((skill, index) => {
    assertKnownKeys(skill, MARKETPLACE_SKILL_CATALOG_ENTRY_KEYS, `Marketplace ${localName} Skill catalog skills[${index}]`);
    const name = validateSkillName(skill.name, `Marketplace ${localName} Skill name`);
    if (names.has(name)) fail(`Marketplace ${localName} Skill catalog contains duplicate name: ${name}.`);
    names.add(name);
    const catalogPathValue = normalizeText(skill.path, `Marketplace ${localName} Skill ${name} path`);
    if (catalogPathValue !== `../../skills/${name}`) {
      fail(`Marketplace ${localName} Skill ${name} path must be ../../skills/${name}.`);
    }
    if (!/^sha256:[0-9a-f]{64}$/u.test(skill.digest)) fail(`Marketplace ${localName} Skill ${name} digest is invalid.`);
    if (skill.sourceUrl !== undefined) validateSourceUrl(skill.sourceUrl, `Marketplace ${localName} Skill ${name} sourceUrl`);
    const source = resolve(dirname(catalogPath), catalogPathValue);
    if (verifySkill === name) {
      if (!existsSync(skillRoot) || !lstatSync(skillRoot).isDirectory()) {
        fail(`Marketplace ${localName} skills directory is missing or is not a directory.`);
      }
      if (!existsSync(source) || !lstatSync(source).isDirectory()) {
        fail(`Marketplace ${localName} Skill copy is missing or is not a directory: ${name}.`);
      }
      const realSource = realpathSync(source);
      if (!sameOrWithin(realpathSync(skillRoot), realSource)) {
        fail(`Marketplace ${localName} Skill ${name} resolves outside its skills directory.`);
      }
      if (treeDigestSync(source) !== skill.digest) {
        fail(`Marketplace ${localName} Skill copy does not match its catalog digest: ${name}.`);
      }
    }
    return { ...skill, source };
  });
  return skills;
}

function selectConsumerMarketplace(config, requestedName, preferredName = null) {
  if (requestedName !== undefined) return selectTarget(config.marketplaces, requestedName, "marketplace");
  if (preferredName && Object.hasOwn(config.marketplaces, preferredName)) {
    return [preferredName, config.marketplaces[preferredName]];
  }
  if (preferredName) fail(`The recorded Marketplace is no longer configured: ${preferredName}.`, 2);
  return selectTarget(config.marketplaces, undefined, "marketplace");
}

function acquireMarketplaceSkillLock() {
  mkdirSync(dirname(MARKETPLACE_SKILL_LOCK_PATH), { recursive: true });
  try {
    mkdirSync(MARKETPLACE_SKILL_LOCK_PATH);
  } catch (error) {
    if (error.code === "EEXIST") {
      fail("Another Marketplace Skill change is in progress. If none is running, remove the stale ~/.agents/.marketplace-skill.lock directory.");
    }
    throw error;
  }
  return MARKETPLACE_SKILL_LOCK_PATH;
}

function replaceManagedSkillDirectory(source, destination, name, state, stateEntry) {
  const agentsRoot = join(HOME_PATH, ".agents");
  mkdirSync(dirname(destination), { recursive: true });
  const staged = join(agentsRoot, `.marketplace-skill-${process.pid}-${randomUUID()}.tmp`);
  const backup = join(agentsRoot, `.marketplace-skill-${process.pid}-${randomUUID()}.bak`);
  const existed = existsSync(destination);
  let replaced = false;
  cpSync(source, staged, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true });
  try {
    if (treeDigestSync(staged) !== stateEntry.digest) fail(`Copied Skill differs from the Marketplace source: ${name}.`);
    if (existed) renameSync(destination, backup);
    renameSync(staged, destination);
    replaced = true;
    state.skills[name] = stateEntry;
    try {
      writeAtomic(MARKETPLACE_SKILL_STATE_PATH, jsonText(state));
    } catch (error) {
      rmSync(destination, { recursive: true, force: true });
      if (existed) renameSync(backup, destination);
      throw error;
    }
    if (existed) rmSync(backup, { recursive: true, force: true });
  } finally {
    if (!replaced || existsSync(staged)) rmSync(staged, { recursive: true, force: true });
  }
}

function handleConsumerMarketplaceSkillMutation(action, skillName, requestedMarketplace, config) {
  const state = readMarketplaceSkillState();
  const name = validateSkillName(skillName, "Skill name");
  const existingState = Object.hasOwn(state.skills, name) ? state.skills[name] : null;
  if (action === "remove") {
    if (!existingState) fail(`Skill ${name} is not managed by agent marketplace.`, 2);
    const destination = join(HOME_PATH, ".agents", "skills", name);
    if (!existsSync(destination) || !statSync(destination).isDirectory()) fail(`Managed Skill directory is missing: ${name}.`);
    if (treeDigestSync(destination) !== existingState.digest) {
      fail(`Refusing to remove locally changed Skill: ${name}. Preserve or revert the changes first.`);
    }
    const backup = join(HOME_PATH, ".agents", `.marketplace-skill-${process.pid}-${randomUUID()}.bak`);
    renameSync(destination, backup);
    delete state.skills[name];
    try {
      writeAtomic(MARKETPLACE_SKILL_STATE_PATH, jsonText(state));
    } catch (error) {
      renameSync(backup, destination);
      throw error;
    }
    rmSync(backup, { recursive: true, force: true });
    console.log(`Removed Marketplace Skill: ${name}`);
    return 0;
  }

  const preferredMarketplace = action === "update" ? existingState?.marketplace : null;
  if (action === "update" && !existingState) fail(`Skill ${name} is not managed by agent marketplace.`, 2);
  const [marketplaceName, marketplace] = selectConsumerMarketplace(config, requestedMarketplace, preferredMarketplace);
  const skills = readMarketplaceSkillCatalog(marketplaceName, marketplace, { verifySkill: name });
  const skill = skills.find((candidate) => candidate.name === name);
  if (!skill) fail(`Marketplace ${marketplaceName} does not contain Skill ${name}.`, 2);
  const destination = join(HOME_PATH, ".agents", "skills", name);
  const nextStateEntry = {
    marketplace: marketplaceName,
    digest: skill.digest,
  };
  if (existsSync(destination)) {
    if (!statSync(destination).isDirectory()) fail(`Skill destination is not a directory: ${name}.`);
    if (!existingState) fail(`Refusing to replace an unmanaged Skill: ${name}. Remove or relocate it explicitly first.`);
    const currentDigest = treeDigestSync(destination);
    if (currentDigest !== existingState.digest) fail(`Refusing to replace locally changed Skill: ${name}.`);
    if (currentDigest === skill.digest) {
      if (existingState.marketplace !== marketplaceName || existingState.digest !== skill.digest) {
        state.skills[name] = nextStateEntry;
        writeAtomic(MARKETPLACE_SKILL_STATE_PATH, jsonText(state));
        console.log(`Updated Marketplace Skill metadata: ${name}`);
        return 0;
      }
      console.log(`Marketplace Skill is current: ${name}`);
      return 0;
    }
  } else if (action === "update") fail(`Managed Skill directory is missing: ${name}. Use install after resolving its state.`);
  replaceManagedSkillDirectory(skill.source, destination, name, state, nextStateEntry);
  console.log(`${existingState ? "Updated" : "Installed"} Marketplace Skill: ${name}`);
  return 0;
}

function handleConsumerMarketplaceSkill(action, skillName, requestedMarketplace, config) {
  if (action === "list") {
    const [marketplaceName, marketplace] = selectConsumerMarketplace(config, requestedMarketplace);
    const skills = readMarketplaceSkillCatalog(marketplaceName, marketplace);
    if (skills.length === 0) console.log("No standalone Skills are available.");
    for (const skill of skills) console.log(`${skill.name}${skill.sourceUrl ? `  ${skill.sourceUrl}` : ""}`);
    return 0;
  }

  const lockPath = acquireMarketplaceSkillLock();
  let operationError;
  try {
    return handleConsumerMarketplaceSkillMutation(action, skillName, requestedMarketplace, config);
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      rmSync(lockPath, { recursive: true });
    } catch (error) {
      if (!operationError) throw error;
      operationError.message += `\nAdditionally, the Marketplace Skill lock could not be removed: ${error.message}`;
    }
  }
}

async function askConfigurationValue(input, prompt) {
  const value = (await input.question(prompt)).trim();
  if (value.toLowerCase() === ":back") throw new BackToConfigureMenu();
  return value;
}

async function askRequired(input, prompt) {
  while (true) {
    const value = await askConfigurationValue(input, prompt);
    if (value !== "") return value;
    console.log("A value is required.");
  }
}

function createPromptReader() {
  const reader = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const lines = reader[Symbol.asyncIterator]();
  return {
    async question(prompt) {
      process.stdout.write(prompt);
      const next = await lines.next();
      if (next.done) fail("Interactive input ended before configuration was saved.");
      return next.value;
    },
    close() {
      reader.close();
    },
  };
}

async function askReplacement(input, prompt, current) {
  const value = await askConfigurationValue(input, `${prompt} (Enter keeps the current value): `);
  return value === "" ? current : value;
}

async function askDefault(input, prompt, defaultValue) {
  const value = await askConfigurationValue(input, `${prompt} (Enter uses ${defaultValue}): `);
  return value === "" ? defaultValue : value;
}

async function confirm(input, prompt) {
  return (await askConfigurationValue(input, `${prompt} [y/N]: `)).toLowerCase() === "y";
}

async function chooseName(input, names, label, preferredName) {
  if (names.length === 0) {
    console.log(`No ${label} is configured.`);
    return null;
  }
  if (preferredName && names.includes(preferredName)) return preferredName;
  if (names.length === 1) return names[0];
  console.log(`\nChoose ${label}:`);
  names.forEach((name, index) => console.log(`  ${index + 1}. ${name}`));
  console.log("  b. Back");
  while (true) {
    const answer = (await input.question("Selection: ")).trim();
    if (["b", "back"].includes(answer.toLowerCase())) return null;
    const selected = Number(answer);
    if (Number.isInteger(selected) && selected >= 1 && selected <= names.length) return names[selected - 1];
    console.log("Choose one of the listed numbers.");
  }
}

function replaceConfiguration(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, source);
}

async function runConfigurationOperation(input, config, label, operation) {
  const draft = JSON.parse(JSON.stringify(config));
  try {
    const result = await operation(draft);
    replaceConfiguration(config, draft);
    return result;
  } catch (error) {
    if (error instanceof BackToConfigureMenu) {
      console.log(`Cancelled ${label}; no changes from this operation were kept.`);
      return null;
    }
    if (error.exitCode === undefined) throw error;
    console.log(
      `Could not complete ${label}; no changes from this operation were kept.\n`
      + sanitizeOutput(error.message, [[HOME_PATH, "~"]]),
    );
    return null;
  }
}

function sortedNames(entries) {
  return Object.keys(entries).sort((left, right) => left.localeCompare(right, "en"));
}

function printConfigurationSummary(config) {
  console.log("\nSkill targets:");
  for (const name of sortedNames(config.skills)) {
    const entry = config.skills[name];
    const detail = entry.installedSkill ? `installed snapshot: ${entry.installedSkill}` : "repository source";
    console.log(`  - ${name} (${detail}${entry.sourceUrl ? ", source URL recorded" : ""})`);
  }
  if (Object.keys(config.skills).length === 0) console.log("  (none)");
  console.log("Plugin targets:");
  for (const name of sortedNames(config.plugins)) {
    const entry = config.plugins[name];
    const detail = entry.developmentConfig
      ? "repository-managed"
      : `direct, plugin sync: ${entry.versionPolicy ?? "disabled"}`;
    console.log(`  - ${name} (${detail})`);
  }
  if (Object.keys(config.plugins).length === 0) console.log("  (none)");
  console.log("Marketplace targets:");
  for (const name of sortedNames(config.marketplaces)) {
    const entry = config.marketplaces[name];
    console.log(
      `  - ${name}: ${entry.name} (${entry.mode}, ${entry.plugins.length} local plugins, ${entry.skills.length} local Skills)`,
    );
  }
  if (Object.keys(config.marketplaces).length === 0) console.log("  (none)");
}

async function addMarketplace(input, config, suggestedName) {
  const name = suggestedName && !Object.hasOwn(config.marketplaces, suggestedName)
    ? await askDefault(input, "Local Marketplace target name", suggestedName)
    : await askRequired(input, "Local Marketplace target name: ");
  assertTargetName(name, "Marketplace target");
  if (Object.hasOwn(config.marketplaces, name)) {
    console.log(`Marketplace target already exists: ${name}`);
    return null;
  }
  const root = await askRequired(input, "Marketplace root path: ");
  const identifier = isMarketplaceName(name)
    ? await askDefault(input, "Marketplace identifier", name)
    : await askRequired(input, "Marketplace identifier: ");
  const marketplaceName = validateMarketplaceName(
    identifier,
    "Marketplace identifier",
  );
  const displayName = await askRequired(input, "Marketplace display name: ");
  config.marketplaces[name] = {
    root,
    name: marketplaceName,
    displayName,
    mode: "authoritative",
    plugins: [],
    skills: [],
  };
  console.log(`Added Marketplace target: ${name}`);
  return name;
}

async function connectMarketplace(input, config, suggestedName) {
  const name = suggestedName && !Object.hasOwn(config.marketplaces, suggestedName)
    ? await askDefault(input, "Local Marketplace target name", suggestedName)
    : await askRequired(input, "Local Marketplace target name: ");
  assertTargetName(name, "Marketplace target");
  if (Object.hasOwn(config.marketplaces, name)) {
    console.log(`Marketplace target already exists: ${name}`);
    return null;
  }
  const root = await askRequired(input, "Existing Marketplace root path: ");
  config.marketplaces[name] = importExistingMarketplace(name, root, config);
  console.log(`Connected existing Marketplace: ${name}`);
  if (config.marketplaces[name].mode === "consumer") {
    console.log("This connection can browse and install Skills but cannot update the Marketplace until its management mode is changed.");
  }
  return name;
}

async function editMarketplace(input, config, preferredName) {
  const name = await chooseName(input, sortedNames(config.marketplaces), "Marketplace target", preferredName);
  if (!name) return;
  const entry = config.marketplaces[name];
  entry.root = await askReplacement(input, "Marketplace root path", entry.root);
  entry.name = validateMarketplaceName(
    await askReplacement(input, "Marketplace identifier", entry.name),
    "Marketplace identifier",
  );
  entry.displayName = await askReplacement(input, "Marketplace display name", entry.displayName);
  console.log(`Updated Marketplace target: ${name}`);
}

async function chooseMarketplaceMode(input, currentMode) {
  const currentLabel = currentMode === "authoritative"
    ? "complete Marketplace on this machine"
    : currentMode === "contributor" ? "selected content as a contributor" : "browse and install only";
  while (true) {
    console.log(`How will this Marketplace be maintained? (current: ${currentLabel})
  1/a. Manage the complete Marketplace from this machine
       Local assignments are the source of truth for every plugin and Skill.
  2/c. Update selected content as a contributor
       Other contributors' Marketplace entries are preserved.
  3/r. Browse and install only
       Development checks and synchronization cannot write to this Marketplace.`);
    const value = (await askConfigurationValue(input, "Selection (Enter keeps current): ")).toLowerCase();
    if (value === "") return currentMode;
    if (["1", "authoritative", "a"].includes(value)) return "authoritative";
    if (["2", "contributor", "c"].includes(value)) return "contributor";
    if (["3", "consumer", "read-only", "r"].includes(value)) return "consumer";
    console.log("Choose 1, 2, or 3.");
  }
}

async function changeMarketplaceMode(input, config, preferredName) {
  const name = await chooseName(input, sortedNames(config.marketplaces), "Marketplace target", preferredName);
  if (!name) return;
  const entry = config.marketplaces[name];
  const mode = await chooseMarketplaceMode(input, entry.mode);
  if (mode === entry.mode) {
    console.log(`Marketplace ${name} is already ${mode}.`);
    return;
  }

  if (mode === "authoritative") {
    const root = expandPath(entry.root, `marketplaces.${name}.root`);
    const currentMirror = readManagedMarketplaceMirror(root, name);
    const local = marketplaceMaterialization(name, entry, config);
    const localPluginNames = new Set(local.mirror.plugins.map((plugin) => plugin.name));
    const missingPlugins = currentMirror.plugins
      .map((plugin) => plugin.name)
      .filter((pluginName) => !localPluginNames.has(pluginName));
    const localSkillNames = new Set(local.mirror.skills.map((skill) => skill.name));
    const missingSkills = (currentMirror.skills ?? [])
      .map((skill) => skill.name)
      .filter((skillName) => !localSkillNames.has(skillName));
    if (missingPlugins.length > 0 || missingSkills.length > 0) {
      if (missingSkills.length === 0) {
        console.log(`Cannot switch to authoritative; local sources are missing: ${missingPlugins.join(", ")}.`);
        return;
      }
      const details = [
        missingPlugins.length > 0 ? `plugins: ${missingPlugins.join(", ")}` : null,
        missingSkills.length > 0 ? `Skills: ${missingSkills.join(", ")}` : null,
      ].filter(Boolean).join("; ");
      console.log(`Cannot switch to authoritative; local sources are missing (${details}).`);
      return;
    }
    if (!await confirm(input, "Use the local plugin and Skill assignments as the complete Marketplace source of truth?")) {
      console.log(`Kept ${entry.mode} mode.`);
      return;
    }
  } else if (entry.mode === "authoritative") {
    let checkStatus;
    try {
      checkStatus = handleMarketplace("check", name, undefined, undefined, config);
    } catch (error) {
      console.log(`Cannot switch to ${mode} because the complete Marketplace check could not run: ${sanitizeOutput(error.message, [[HOME_PATH, "~"]])}`);
      return;
    }
    if (checkStatus !== 0) {
      console.log(`Cannot switch to ${mode} because the complete Marketplace is not synchronized. Run a full sync, then try again.`);
      return;
    }
    const prompt = mode === "contributor"
      ? "Require --plugin or --skill and stop treating local assignments as the complete Marketplace?"
      : "Disable Marketplace development operations on this machine and keep only browsing and installation?";
    if (!await confirm(input, prompt)) {
      console.log("Kept authoritative mode.");
      return;
    }
  } else {
    const prompt = mode === "consumer"
      ? "Disable Marketplace development operations on this machine?"
      : "Allow scoped Marketplace updates from this machine?";
    if (!await confirm(input, prompt)) return;
  }

  entry.mode = mode;
  console.log(`Changed Marketplace ${name} mode to ${mode}.`);
  if (mode === "contributor") {
    console.log("Existing plugin and Skill assignments remain local update targets; remove any this machine should no longer publish.");
  } else if (mode === "consumer") {
    console.log("Existing assignments are retained but cannot be checked or synchronized in consumer mode.");
  }
}

async function removeMarketplace(input, config, preferredName) {
  const name = await chooseName(input, sortedNames(config.marketplaces), "Marketplace target", preferredName);
  if (!name || !await confirm(input, `Remove ${name} from local configuration only?`)) return false;
  delete config.marketplaces[name];
  console.log(`Removed Marketplace target: ${name}. Distribution files were not deleted.`);
  return preferredName === name;
}

async function addPluginTarget(input, config) {
  const name = await askRequired(input, "Local plugin target name: ");
  assertTargetName(name, "Plugin target");
  if (Object.hasOwn(config.plugins, name)) {
    console.log(`Plugin target already exists: ${name}`);
    return;
  }
  const repository = await askRequired(input, "Plugin repository path: ");
  const mode = await choosePluginTargetType(input);
  if (mode === "repository-managed") {
    const developmentConfig = await askRequired(input, "Repository development configuration path: ");
    const runner = await askConfigurationValue(
      input,
      "Repository runner path (Enter uses scripts/local-plugin.mjs): ",
    );
    config.plugins[name] = {
      repository,
      developmentConfig,
      ...(runner ? { runner } : {}),
    };
  } else {
    const pluginRoot = await askRequired(input, "Portable plugin root path: ");
    const versionPolicy = await chooseDirectVersionPolicy(input);
    config.plugins[name] = { repository, pluginRoot, ...(versionPolicy ? { versionPolicy } : {}) };
  }
  console.log(`Added plugin target: ${name}`);
  return name;
}

async function chooseSkillTargetType(input, currentMode = null) {
  const currentLabel = currentMode === "repository"
    ? "local project folder"
    : currentMode === "installed-snapshot" ? "installed Skill snapshot" : null;
  while (true) {
    console.log(`Where should this Skill come from?${currentLabel ? ` (current: ${currentLabel})` : ""}
  1/r. Use a local project folder
       Treats the repository copy as the editable source of truth.
  2/i. Snapshot an installed Skill
       Copies one explicitly selected ~/.agents/skills entry for reuse on other machines.`);
    const value = (await askConfigurationValue(
      input,
      `Selection${currentMode ? " (Enter keeps current)" : ""}: `,
    )).toLowerCase();
    if (value === "" && currentMode) return currentMode;
    if (["1", "repository", "repo", "r"].includes(value)) return "repository";
    if (["2", "installed-snapshot", "installed", "snapshot", "i"].includes(value)) return "installed-snapshot";
    console.log("Choose 1 or 2.");
  }
}

function suggestedSkillSourceUrl(skillRoot) {
  const { frontmatter } = skillFrontmatter(skillRoot, "Installed Skill");
  const metadataStart = frontmatter.findIndex((line) => /^metadata:\s*$/u.test(line));
  if (metadataStart < 0) return null;
  const metadataLines = [];
  for (const line of frontmatter.slice(metadataStart + 1)) {
    if (/^\S/u.test(line)) break;
    metadataLines.push(line);
  }
  const match = /^\s+github-repo:\s*(['"]?)(https?:\/\/[^\s'"]+)\1\s*$/mu.exec(metadataLines.join("\n"));
  if (!match) return null;
  try {
    return validateSourceUrl(match[2], "Installed Skill github-repo");
  } catch {
    return null;
  }
}

async function askSourceUrl(input, { current = null, suggested = null } = {}) {
  const detail = current
    ? ` (Enter keeps ${current}; type none to remove)`
    : suggested ? ` (Enter uses ${suggested}; type none to skip)` : " (optional; Enter skips)";
  const value = await askConfigurationValue(input, `Original source URL${detail}: `);
  if (value.toLowerCase() === "none") return null;
  if (value === "") return current ?? suggested;
  return validateSourceUrl(value, "Original source URL");
}

async function addSkillTarget(input, config) {
  const name = await askRequired(input, "Local Skill target name: ");
  assertTargetName(name, "Skill target");
  if (Object.hasOwn(config.skills, name)) {
    console.log(`Skill target already exists: ${name}`);
    return;
  }
  const mode = await chooseSkillTargetType(input);
  let entry;
  let suggested = null;
  if (mode === "repository") {
    entry = {
      repository: await askRequired(input, "Skill repository path: "),
      skillRoot: await askRequired(input, "Skill directory path inside the repository: "),
    };
  } else {
    const installedSkill = validateSkillName(
      await askRequired(input, "Installed Skill name under ~/.agents/skills: "),
      "Installed Skill name",
    );
    entry = { installedSkill };
    const context = skillSourceContext(name, entry);
    suggested = suggestedSkillSourceUrl(context.skillRoot);
  }
  const sourceUrl = await askSourceUrl(input, { suggested });
  if (sourceUrl) entry.sourceUrl = sourceUrl;
  skillSourceContext(name, entry);
  config.skills[name] = entry;
  console.log(`Added Skill target: ${name}`);
  return name;
}

async function editSkillTarget(input, config) {
  const name = await chooseName(input, sortedNames(config.skills), "Skill target");
  if (!name) return;
  const entry = config.skills[name];
  const currentMode = entry.installedSkill ? "installed-snapshot" : "repository";
  const mode = await chooseSkillTargetType(input, currentMode);
  if (mode === "repository") {
    entry.repository = currentMode === "repository"
      ? await askReplacement(input, "Skill repository path", entry.repository)
      : await askRequired(input, "Skill repository path: ");
    entry.skillRoot = currentMode === "repository"
      ? await askReplacement(input, "Skill directory path inside the repository", entry.skillRoot)
      : await askRequired(input, "Skill directory path inside the repository: ");
    delete entry.installedSkill;
  } else {
    entry.installedSkill = currentMode === "installed-snapshot"
      ? validateSkillName(
        await askReplacement(input, "Installed Skill name under ~/.agents/skills", entry.installedSkill),
        "Installed Skill name",
      )
      : validateSkillName(
        await askRequired(input, "Installed Skill name under ~/.agents/skills: "),
        "Installed Skill name",
      );
    delete entry.repository;
    delete entry.skillRoot;
  }
  const suggested = mode === "installed-snapshot" && !entry.sourceUrl
    ? suggestedSkillSourceUrl(skillSourceContext(name, entry).skillRoot)
    : null;
  const sourceUrl = await askSourceUrl(input, { current: entry.sourceUrl ?? null, suggested });
  if (sourceUrl) entry.sourceUrl = sourceUrl;
  else delete entry.sourceUrl;
  skillSourceContext(name, entry);
  console.log(`Updated Skill target: ${name}`);
}

async function removeSkillTarget(input, config) {
  const name = await chooseName(input, sortedNames(config.skills), "Skill target");
  if (!name) return;
  const usedBy = sortedNames(config.marketplaces).filter((marketplace) => (
    config.marketplaces[marketplace].skills.some((skill) => skill.target === name)
  ));
  if (usedBy.length > 0) {
    console.log(`Cannot remove ${name}; it is assigned to: ${usedBy.join(", ")}.`);
    return;
  }
  if (!await confirm(input, `Remove Skill target ${name}?`)) return;
  delete config.skills[name];
  console.log(`Removed Skill target: ${name}`);
}

async function choosePluginTargetType(input, currentMode = null) {
  const currentLabel = currentMode === "repository-managed"
    ? "repository settings"
    : currentMode === "direct" ? "plugin directory directly" : null;
  while (true) {
    console.log(`How should this plugin be managed?${currentLabel ? ` (current: ${currentLabel})` : ""}
  1/r. Use repository settings
       Runs the repository's validation and installation configuration.
  2/d. Use the plugin directory directly
       Uses the shared plugin tools without repository management files.`);
    const value = (await askConfigurationValue(
      input,
      `Selection${currentMode ? " (Enter keeps current)" : ""}: `,
    )).toLowerCase();
    if (value === "" && currentMode) return currentMode;
    if (["1", "repository-managed", "repository", "r"].includes(value)) return "repository-managed";
    if (["2", "direct", "d"].includes(value)) return "direct";
    console.log("Choose 1 or 2.");
  }
}

async function chooseDirectVersionPolicy(input, currentPolicy = null) {
  const current = currentPolicy ?? "disabled";
  while (true) {
    console.log(`How should plugin sync handle this plugin? (current: ${current})
  1/k. Keep the current version
       Install using the version already in plugin.json.
  2/b. Create a local development version
       Add or replace the +agent.<timestamp> version suffix before installation.
  3/n. Leave plugin sync disabled
       Validation and Marketplace distribution remain available.`);
    const value = (await askConfigurationValue(
      input,
      "Selection (Enter keeps current): ",
    )).toLowerCase();
    if (value === "") return currentPolicy;
    if (["1", "keep", "k"].includes(value)) return "keep";
    if (["2", "bump", "b"].includes(value)) return "bump";
    if (["3", "disabled", "disable", "none", "n"].includes(value)) return null;
    console.log("Choose 1, 2, or 3.");
  }
}

async function editPluginTarget(input, config) {
  const name = await chooseName(input, sortedNames(config.plugins), "plugin target");
  if (!name) return;
  const entry = config.plugins[name];
  entry.repository = await askReplacement(input, "Plugin repository path", entry.repository);
  const currentMode = entry.developmentConfig ? "repository-managed" : "direct";
  const mode = await choosePluginTargetType(input, currentMode);
  if (mode === "repository-managed") {
    if (currentMode === "repository-managed") {
      entry.developmentConfig = await askReplacement(
        input,
        "Repository development configuration path",
        entry.developmentConfig,
      );
    } else {
      entry.developmentConfig = await askRequired(input, "Repository development configuration path: ");
      delete entry.pluginRoot;
      delete entry.versionPolicy;
    }
    const runner = await askConfigurationValue(
      input,
      "Repository runner path (Enter keeps current; 'default' removes override): ",
    );
    if (runner === "default") delete entry.runner;
    else if (runner !== "") entry.runner = runner;
  } else {
    entry.pluginRoot = currentMode === "direct"
      ? await askReplacement(input, "Portable plugin root path", entry.pluginRoot)
      : await askRequired(input, "Portable plugin root path: ");
    const versionPolicy = await chooseDirectVersionPolicy(input, entry.versionPolicy ?? null);
    if (versionPolicy) entry.versionPolicy = versionPolicy;
    else delete entry.versionPolicy;
    delete entry.developmentConfig;
    delete entry.runner;
  }
  console.log(`Updated plugin target: ${name}`);
}

async function removePluginTarget(input, config) {
  const name = await chooseName(input, sortedNames(config.plugins), "plugin target");
  if (!name) return;
  const usedBy = sortedNames(config.marketplaces).filter((marketplace) => (
    config.marketplaces[marketplace].plugins.some((plugin) => plugin.target === name)
  ));
  if (usedBy.length > 0) {
    console.log(`Cannot remove ${name}; it is assigned to: ${usedBy.join(", ")}.`);
    return;
  }
  if (!await confirm(input, `Remove plugin target ${name}?`)) return;
  delete config.plugins[name];
  console.log(`Removed plugin target: ${name}`);
}

async function setMarketplacePlugin(input, config, preferredMarketplace) {
  const marketplace = await chooseName(
    input,
    sortedNames(config.marketplaces),
    "Marketplace target",
    preferredMarketplace,
  );
  if (!marketplace) return;
  const targets = sortedNames(config.plugins);
  console.log("\nChoose plugin target:");
  targets.forEach((name, index) => console.log(`  ${index + 1}. ${name}`));
  console.log("  n. Add new plugin target");
  console.log("  b. Back");
  let target;
  while (!target) {
    const answer = (await input.question("Selection: ")).trim().toLowerCase();
    if (["b", "back"].includes(answer)) return;
    if (["n", "new"].includes(answer)) {
      target = await addPluginTarget(input, config);
      if (!target) return;
      break;
    }
    const selected = Number(answer);
    if (Number.isInteger(selected) && selected >= 1 && selected <= targets.length) {
      target = targets[selected - 1];
      break;
    }
    console.log("Choose a listed plugin target, n, or b.");
  }
  if (!target) return;
  const entries = config.marketplaces[marketplace].plugins;
  const existing = entries.find((plugin) => plugin.target === target);
  const category = existing
    ? await askReplacement(input, "Plugin category", existing.category)
    : await askRequired(input, "Plugin category: ");
  if (existing) existing.category = category;
  else entries.push({ target, category });
  console.log(`${existing ? "Updated" : "Added"} Marketplace plugin: ${marketplace} <- ${target}`);
}

async function removeMarketplacePlugin(input, config, preferredMarketplace) {
  const marketplace = await chooseName(
    input,
    sortedNames(config.marketplaces),
    "Marketplace target",
    preferredMarketplace,
  );
  if (!marketplace) return;
  const entries = config.marketplaces[marketplace].plugins;
  const target = await chooseName(input, entries.map((plugin) => plugin.target), "Marketplace plugin");
  if (!target || !await confirm(input, `Remove ${target} from Marketplace ${marketplace}?`)) return;
  config.marketplaces[marketplace].plugins = entries.filter((plugin) => plugin.target !== target);
  console.log(`Removed Marketplace plugin: ${marketplace} <- ${target}`);
}

async function setMarketplaceSkill(input, config, preferredMarketplace) {
  const marketplace = await chooseName(
    input,
    sortedNames(config.marketplaces),
    "Marketplace target",
    preferredMarketplace,
  );
  if (!marketplace) return;
  const targets = sortedNames(config.skills);
  console.log("\nChoose Skill target:");
  targets.forEach((name, index) => console.log(`  ${index + 1}. ${name}`));
  console.log("  n. Add new Skill target");
  console.log("  b. Back");
  let target;
  while (!target) {
    const answer = (await input.question("Selection: ")).trim().toLowerCase();
    if (["b", "back"].includes(answer)) return;
    if (["n", "new"].includes(answer)) {
      target = await addSkillTarget(input, config);
      if (!target) return;
      break;
    }
    const selected = Number(answer);
    if (Number.isInteger(selected) && selected >= 1 && selected <= targets.length) {
      target = targets[selected - 1];
      break;
    }
    console.log("Choose a listed Skill target, n, or b.");
  }
  const entries = config.marketplaces[marketplace].skills;
  if (entries.some((skill) => skill.target === target)) {
    console.log(`Marketplace Skill is already assigned: ${marketplace} <- ${target}`);
    return;
  }
  entries.push({ target });
  console.log(`Added Marketplace Skill: ${marketplace} <- ${target}`);
}

async function removeMarketplaceSkill(input, config, preferredMarketplace) {
  const marketplace = await chooseName(
    input,
    sortedNames(config.marketplaces),
    "Marketplace target",
    preferredMarketplace,
  );
  if (!marketplace) return;
  const entries = config.marketplaces[marketplace].skills;
  const target = await chooseName(input, entries.map((skill) => skill.target), "Marketplace Skill");
  if (!target || !await confirm(input, `Remove ${target} from Marketplace ${marketplace}?`)) return;
  config.marketplaces[marketplace].skills = entries.filter((skill) => skill.target !== target);
  console.log(`Removed Marketplace Skill: ${marketplace} <- ${target}`);
}

async function setMarketplaceContent(input, config, preferredMarketplace) {
  while (true) {
    console.log(`\nAdd or update Marketplace content:
  1/p. Plugin
  2/s. Standalone Skill
  b. Back`);
    const action = (await input.question("Selection: ")).trim().toLowerCase();
    if (["1", "p", "plugin"].includes(action)) {
      return setMarketplacePlugin(input, config, preferredMarketplace);
    }
    if (["2", "s", "skill"].includes(action)) {
      return setMarketplaceSkill(input, config, preferredMarketplace);
    }
    if (["b", "back"].includes(action)) return;
    console.log("Choose 1, 2, or b.");
  }
}

async function managePluginTargets(input, config) {
  while (true) {
    console.log(`\nManage plugin targets:
  1/a. Add plugin target
  2/e. Edit plugin target
  b. Back`);
    const action = (await input.question("Selection: ")).trim().toLowerCase();
    if (["1", "a", "add"].includes(action)) {
      await runConfigurationOperation(input, config, "adding a plugin target", (draft) => (
        addPluginTarget(input, draft)
      ));
    } else if (["2", "e", "edit"].includes(action)) {
      await runConfigurationOperation(input, config, "editing a plugin target", (draft) => (
        editPluginTarget(input, draft)
      ));
    } else if (["b", "back"].includes(action)) return;
    else console.log("Choose a listed action.");
  }
}

async function manageSkillTargets(input, config) {
  while (true) {
    console.log(`\nManage Skill targets:
  1/a. Add Skill target
  2/e. Edit Skill target
  b. Back`);
    const action = (await input.question("Selection: ")).trim().toLowerCase();
    if (["1", "a", "add"].includes(action)) {
      await runConfigurationOperation(input, config, "adding a Skill target", (draft) => (
        addSkillTarget(input, draft)
      ));
    } else if (["2", "e", "edit"].includes(action)) {
      await runConfigurationOperation(input, config, "editing a Skill target", (draft) => (
        editSkillTarget(input, draft)
      ));
    } else if (["b", "back"].includes(action)) return;
    else console.log("Choose a listed action.");
  }
}

async function manageLocalTargets(input, config) {
  while (true) {
    console.log(`\nManage local source targets:
  1/p. Plugin targets
  2/s. Standalone Skill targets
  b. Back`);
    const action = (await input.question("Selection: ")).trim().toLowerCase();
    if (["1", "p", "plugin", "plugins"].includes(action)) await managePluginTargets(input, config);
    else if (["2", "s", "skill", "skills"].includes(action)) await manageSkillTargets(input, config);
    else if (["b", "back"].includes(action)) return;
    else console.log("Choose 1, 2, or b.");
  }
}

async function removeConfiguration(input, config, preferredMarketplace) {
  let currentMarketplace = preferredMarketplace;
  while (true) {
    console.log(`\nRemove from local configuration:
  1/p. Remove plugin from Marketplace
  2/s. Remove Skill from Marketplace
  3/m. Remove Marketplace
  4/t. Remove plugin target
  5/k. Remove Skill target
  b. Back`);
    const action = (await input.question("Selection: ")).trim().toLowerCase();
    if (["1", "p", "plugin"].includes(action)) {
      await runConfigurationOperation(input, config, "removing a Marketplace plugin", (draft) => (
        removeMarketplacePlugin(input, draft, currentMarketplace)
      ));
    } else if (["2", "s", "skill"].includes(action)) {
      await runConfigurationOperation(input, config, "removing a Marketplace Skill", (draft) => (
        removeMarketplaceSkill(input, draft, currentMarketplace)
      ));
    } else if (["3", "m", "marketplace"].includes(action)) {
      const removedCurrent = await runConfigurationOperation(
        input,
        config,
        "removing a Marketplace",
        (draft) => removeMarketplace(input, draft, currentMarketplace),
      );
      if (removedCurrent) currentMarketplace = undefined;
    } else if (["4", "t", "target", "plugin-target"].includes(action)) {
      await runConfigurationOperation(input, config, "removing a plugin target", (draft) => (
        removePluginTarget(input, draft)
      ));
    } else if (["5", "k", "skill-target"].includes(action)) {
      await runConfigurationOperation(input, config, "removing a Skill target", (draft) => (
        removeSkillTarget(input, draft)
      ));
    } else if (["b", "back"].includes(action)) return currentMarketplace;
    else console.log("Choose a listed action.");
  }
}

async function handleConfigure(requestedName) {
  const existed = existsSync(CONFIG_PATH);
  const original = readConfigurationForConfigure();
  const config = JSON.parse(JSON.stringify(original));
  const input = createPromptReader();
  try {
    const marketplaceNames = sortedNames(config.marketplaces);
    if (requestedName !== undefined && !marketplaceNames.includes(requestedName)) {
      fail(`Unknown marketplace: ${requestedName}. Configured: ${marketplaceNames.join(", ") || "(none)"}.`, 2);
    }
    let preferredMarketplace = requestedName
      ?? await chooseName(input, marketplaceNames, "Marketplace target");
    while (true) {
      console.log(`
Configure local development${preferredMarketplace ? ` (Marketplace: ${preferredMarketplace})` : ""}:
  1/a. Add Marketplace
  2/c. Connect existing Marketplace
  3/m. Switch Marketplace
  4. Add or update Marketplace content (p: plugin, k: Skill)
  5/e. Edit Marketplace
  6/o. Change Marketplace management mode
  7/t. Manage local source targets
  8/r. Remove...
  9/v. View configuration summary
  s. Save and exit
  q. Cancel without saving

Enter :back in an input form to discard that operation.`);
      const action = (await input.question("Selection: ")).trim().toLowerCase();
      if (["1", "a", "add"].includes(action)) {
        preferredMarketplace = await runConfigurationOperation(
          input,
          config,
          "adding a Marketplace",
          (draft) => addMarketplace(input, draft, preferredMarketplace),
        ) ?? preferredMarketplace;
      } else if (["2", "c", "connect"].includes(action)) {
        preferredMarketplace = await runConfigurationOperation(
          input,
          config,
          "connecting a Marketplace",
          (draft) => connectMarketplace(input, draft, preferredMarketplace),
        ) ?? preferredMarketplace;
      } else if (["3", "m", "marketplace"].includes(action)) {
        preferredMarketplace = await chooseName(
          input,
          sortedNames(config.marketplaces),
          "Marketplace target",
        ) ?? preferredMarketplace;
      } else if (["4", "content"].includes(action)) {
        await runConfigurationOperation(input, config, "adding or updating Marketplace content", (draft) => (
          setMarketplaceContent(input, draft, preferredMarketplace)
        ));
      } else if (["p", "plugin"].includes(action)) {
        await runConfigurationOperation(input, config, "adding or updating a Marketplace plugin", (draft) => (
          setMarketplacePlugin(input, draft, preferredMarketplace)
        ));
      } else if (["k", "skill"].includes(action)) {
        await runConfigurationOperation(input, config, "adding or updating a Marketplace Skill", (draft) => (
          setMarketplaceSkill(input, draft, preferredMarketplace)
        ));
      } else if (["5", "e", "edit"].includes(action)) {
        await runConfigurationOperation(input, config, "editing a Marketplace", (draft) => (
          editMarketplace(input, draft, preferredMarketplace)
        ));
      } else if (["6", "o", "mode"].includes(action)) {
        await runConfigurationOperation(input, config, "changing Marketplace management mode", (draft) => (
          changeMarketplaceMode(input, draft, preferredMarketplace)
        ));
      } else if (["7", "t", "targets"].includes(action)) {
        await manageLocalTargets(input, config);
      } else if (["8", "r", "remove"].includes(action)) {
        preferredMarketplace = await removeConfiguration(input, config, preferredMarketplace);
      } else if (["9", "v", "view", "summary"].includes(action)) printConfigurationSummary(config);
      else if (action === "q") {
        console.log("Configuration was not changed.");
        return 0;
      } else if (action === "s") {
        validateConfiguration(config);
        if (existed && canonicalJson(config) === canonicalJson(original)) {
          console.log("Configuration is current.");
        } else {
          writeAtomic(CONFIG_PATH, jsonText(config));
          console.log(`${existed ? "Updated" : "Created"}: ${displayPath(CONFIG_PATH)}`);
        }
        console.log("Run agent dev marketplace check or sync explicitly when ready.");
        return 0;
      } else console.log("Choose a listed action.");
    }
  } finally {
    input.close();
  }
}

function printTargets(config) {
  console.log(`Skills:       ${Object.keys(config.skills).sort().join(", ") || "(none)"}`);
  console.log(`Plugins:      ${Object.keys(config.plugins).sort().join(", ") || "(none)"}`);
  console.log(`Marketplaces: ${Object.keys(config.marketplaces).sort().join(", ") || "(none)"}`);
  console.log("");
  console.log(HELP);
}

function parseInvocation(argv) {
  if (argv.length === 0 || ["-h", "--help", "help"].includes(argv[0])) return { help: true };
  const command = argv[0] === "mp" ? "marketplace" : argv[0];
  if (command === "marketplace") {
    const rest = argv.slice(1);
    if (rest[0] === "list") {
      if (rest.length > 2) fail(`Unexpected argument: ${rest[2]}.`, 2);
      return { consumerMarketplace: true, action: "list", target: rest[1] };
    }
    if (rest[0] !== "skill") fail('Choose "skill" or "list" for marketplace.', 2);
    const action = rest[1];
    if (!["list", "install", "update", "remove"].includes(action)) {
      fail("Choose list, install, update, or remove for marketplace skill.", 2);
    }
    if (action === "list") {
      if (rest.length > 3) fail(`Unexpected argument: ${rest[3]}.`, 2);
      return { consumerMarketplace: true, action, target: rest[2] };
    }
    const skillName = rest[2];
    if (!skillName || skillName.startsWith("--")) fail(`${action} requires a Skill name.`, 2);
    if (action === "remove") {
      if (rest.length > 3) fail("marketplace skill remove does not accept a Marketplace name.", 2);
      return { consumerMarketplace: true, action, skillName };
    }
    if (rest.length > 4) fail(`Unexpected argument: ${rest[4]}.`, 2);
    return { consumerMarketplace: true, action, skillName, target: rest[3] };
  }
  if (command !== "dev") fail(`Unknown command: ${argv[0]}.`, 2);
  if (argv.length === 1) return { summary: true };
  const domain = argv[1] === "mp" ? "marketplace" : argv[1];
  const action = argv[2];
  if (!["skill", "plugin", "marketplace"].includes(domain)) fail(`Unknown development target: ${domain ?? "(missing)"}.`, 2);
  const marketplaceConfiguration = domain === "marketplace" && ["configure", "setup"].includes(action);
  if (!["check", "sync"].includes(action) && !marketplaceConfiguration) {
    fail(`Choose check or sync for ${domain}${domain === "marketplace" ? ", or configure" : ""}.`, 2);
  }
  const rest = argv.slice(3);
  if (domain === "skill") {
    if (rest.length > 0) fail("skill does not accept a target name.", 2);
    return { domain, action };
  }
  if (domain === "plugin" || marketplaceConfiguration) {
    if (rest.length > 1) fail(`Unexpected argument: ${rest[1]}.`, 2);
    if (rest[0]?.startsWith("--")) fail(`Unknown option: ${rest[0]}.`, 2);
    return { domain, action: action === "setup" ? "configure" : action, target: rest[0] };
  }

  let target;
  let pluginTarget;
  let skillTarget;
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === "--plugin") {
      if (pluginTarget !== undefined) fail("--plugin may be specified only once.", 2);
      pluginTarget = rest[index + 1];
      if (!pluginTarget || pluginTarget.startsWith("--")) fail("--plugin requires a local plugin target name.", 2);
      index += 1;
    } else if (argument === "--skill") {
      if (skillTarget !== undefined) fail("--skill may be specified only once.", 2);
      skillTarget = rest[index + 1];
      if (!skillTarget || skillTarget.startsWith("--")) fail("--skill requires a local Skill target name.", 2);
      index += 1;
    } else if (argument.startsWith("--")) fail(`Unknown option: ${argument}.`, 2);
    else if (target === undefined) target = argument;
    else fail(`Unexpected argument: ${argument}.`, 2);
  }
  if (pluginTarget !== undefined && skillTarget !== undefined) fail("Specify either --plugin or --skill, not both.", 2);
  return { domain, action, target, pluginTarget, skillTarget };
}

async function main() {
  const invocation = parseInvocation(process.argv.slice(2));
  if (invocation.help) console.log(HELP);
  else if (invocation.consumerMarketplace) {
    const config = invocation.action === "remove" ? null : readConfiguration();
    process.exitCode = handleConsumerMarketplaceSkill(
      invocation.action,
      invocation.skillName,
      invocation.target,
      config,
    );
  }
  else {
    if (invocation.domain === "skill") process.exitCode = handleSkill(invocation.action);
    else if (invocation.domain === "marketplace" && invocation.action === "configure") {
      process.exitCode = await handleConfigure(invocation.target);
    }
    else {
      const config = readConfiguration();
      if (invocation.summary) printTargets(config);
      else if (invocation.domain === "plugin") process.exitCode = handlePlugin(invocation.action, invocation.target, config);
      else process.exitCode = handleMarketplace(
        invocation.action,
        invocation.target,
        invocation.pluginTarget,
        invocation.skillTarget,
        config,
      );
    }
  }
}

try {
  await main();
} catch (error) {
  console.error(`agent: ${sanitizeOutput(error.message, [[HOME_PATH, "~"]])}`);
  if (error.exitCode === 2) console.error("\nRun agent --help for usage.");
  process.exitCode = error.exitCode ?? 1;
}
