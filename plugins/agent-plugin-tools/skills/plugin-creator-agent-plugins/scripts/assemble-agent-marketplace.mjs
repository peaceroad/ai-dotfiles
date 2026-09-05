#!/usr/bin/env node

// @plugin-creator-agent-plugins managed-marketplace-assembler v1

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  realpath,
  readdir,
  readlink,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SKILL_ROOT = path.dirname(SCRIPT_DIR);
const VALIDATOR = path.join(SCRIPT_DIR, "validate-agent-plugin.mjs");
const SCHEMA_TEMPLATE = path.join(
  SKILL_ROOT,
  "assets",
  "marketplace-distribution",
  "marketplace-development.schema.json",
);
const DEVELOPMENT_DIRECTORY = path.join(".agents", "marketplace-development");
const LEGACY_DEVELOPMENT_DIRECTORY = path.join(".agents", "plugin-marketplace-development");
const CONFIG_RELATIVE_PATH = path.join(DEVELOPMENT_DIRECTORY, "config.json");
const SCHEMA_RELATIVE_PATH = path.join(DEVELOPMENT_DIRECTORY, "schema.json");
const STATE_RELATIVE_PATH = path.join(DEVELOPMENT_DIRECTORY, "state.json");
const CATALOG_RELATIVE_PATH = path.join(".agents", "plugins", "marketplace.json");
const SKILL_CATALOG_RELATIVE_PATH = path.join(".agents", "skills", "catalog.json");
const PLUGINS_RELATIVE_PATH = "plugins";
const SKILLS_RELATIVE_PATH = "skills";
const STATE_MARKER = "@plugin-creator-agent-plugins managed-marketplace-state v1";
const SCHEMA_MARKER = "@plugin-creator-agent-plugins managed-marketplace-schema v2";
const LEGACY_SCHEMA_MARKER = "@plugin-creator-agent-plugins managed-marketplace-schema v1";
const NAME_PATTERN = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u;
const COMMANDS = new Set(["init", "add", "sync", "check"]);
const CONFIG_KEYS = new Set(["$schema", "schemaVersion", "name", "displayName", "plugins", "skills"]);
const PLUGIN_CONFIG_KEYS = new Set(["source", "category"]);
const SKILL_CONFIG_KEYS = new Set(["source", "sourceUrl"]);
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function help() {
  console.log(`Assemble a filesystem-backed Agent Marketplace distribution

Usage:
  node assemble-agent-marketplace.mjs init <marketplace-root> --name <name> --display-name <label> [--plugin <plugin-root> ... --category <category>]
  node assemble-agent-marketplace.mjs add <marketplace-root> <plugin-root> --category <category>
  node assemble-agent-marketplace.mjs sync <marketplace-root> [--config <configuration>] [--plugin <name> | --skill <name>]
  node assemble-agent-marketplace.mjs check <marketplace-root> [--config <configuration>] [--plugin <name> | --skill <name>]

Commands:
  init   Create the human-owned configuration and managed schema. With
         --plugin, validate and add one or more initial plugin sources.
  add    Validate one plugin source and add it to the configuration.
  sync   Validate sources, safely copy configured plugins and standalone
         Skills, and generate their catalogs. Git and publication are not modified.
  check  Validate sources and report distribution drift without writing.

Options:
  --name <name>             Stable Marketplace identifier for init.
  --display-name <label>    Marketplace label shown by Codex for init.
  --plugin <plugin-root>    Initial plugin source; repeatable with init.
  --plugin <name>           Limit sync or check to one configured plugin.
  --skill <name>            Limit sync or check to one configured Skill.
  --merge                   Preserve other Marketplace entries while adding or
                            updating --plugin or --skill. Requires --config and
                            one selected package.
  --category <category>     Category for add or all initial plugins.
  --config <configuration>  Read an alternate assembly definition for sync or
                            check. Relative package sources still resolve from
                            the Marketplace root.
  -h, --help                Show this help.

The Marketplace root may be a local directory, a checked-out Git repository,
or an accessible network filesystem path. Relative package sources are resolved
from that root. Running without arguments displays this help and makes no writes.`);
}

function fail(message) {
  const error = new Error(message);
  error.expected = true;
  throw error;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} must be a non-empty string.`);
  return value.trim();
}

function validateName(value, label) {
  const name = normalizeText(value, label);
  if (name.length > 64 || !NAME_PATTERN.test(name)) {
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

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") return { command: "help" };
  const [command, ...rest] = argv;
  if (!COMMANDS.has(command)) fail(`Unknown command: ${command}`);
  if (rest.length === 0) fail(`Specify the Marketplace root for ${command}.`);

  const options = {
    command,
    root: path.resolve(rest[0]),
    name: null,
    displayName: null,
    category: null,
    config: null,
    plugins: [],
    selectedPlugin: null,
    selectedSkill: null,
    merge: false,
  };
  let index = 1;
  if (command === "add") {
    if (!rest[index] || rest[index].startsWith("--")) fail("Specify the plugin root for add.");
    options.plugins.push(rest[index]);
    index += 1;
  }
  while (index < rest.length) {
    const option = rest[index];
    if (option === "-h" || option === "--help") return { command: "help" };
    if (option === "--merge" && (command === "sync" || command === "check")) {
      options.merge = true;
      index += 1;
      continue;
    }
    const value = rest[index + 1];
    if (!value) fail(`Missing value for ${option}.`);
    if (option === "--name") options.name = value;
    else if (option === "--display-name") options.displayName = value;
    else if (option === "--category") options.category = value;
    else if (option === "--config" && (command === "sync" || command === "check")) {
      options.config = path.resolve(value);
    }
    else if (option === "--plugin" && command === "init") options.plugins.push(value);
    else if (option === "--plugin" && (command === "sync" || command === "check")) {
      if (options.selectedPlugin !== null) fail("--plugin may be specified only once.");
      options.selectedPlugin = validateName(value, "--plugin");
    }
    else if (option === "--skill" && (command === "sync" || command === "check")) {
      if (options.selectedSkill !== null) fail("--skill may be specified only once.");
      options.selectedSkill = validateSkillName(value, "--skill");
    }
    else fail(`Unknown option for ${command}: ${option}`);
    index += 2;
  }

  if (command === "init") {
    options.name = validateName(options.name, "--name");
    options.displayName = normalizeText(options.displayName, "--display-name");
    if (options.plugins.length > 0) options.category = normalizeText(options.category, "--category");
    else if (options.category !== null) fail("--category requires at least one --plugin during init.");
  } else if (command === "add") {
    options.category = normalizeText(options.category, "--category");
    if (options.name !== null || options.displayName !== null) fail("--name and --display-name are valid only with init.");
  } else if (options.name !== null || options.displayName !== null || options.category !== null || options.plugins.length > 0) {
    fail(`${command} accepts only the Marketplace root, optional --config, and one optional --plugin or --skill.`);
  }
  if (options.selectedPlugin !== null && options.selectedSkill !== null) {
    fail("Specify either --plugin or --skill, not both.");
  }
  if (options.merge && (!options.config || (options.selectedPlugin === null && options.selectedSkill === null))) {
    fail("--merge requires --config and either --plugin or --skill.");
  }
  return options;
}

async function pathType(target) {
  try {
    const stats = await lstat(target);
    if (stats.isDirectory()) return "directory";
    if (stats.isFile()) return "file";
    if (stats.isSymbolicLink()) return "link";
    return "other";
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function readJson(file, label) {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") fail(`${label} does not exist: ${file}`);
    throw error;
  }
  try {
    return JSON.parse(text);
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

function normalizeConfigSource(root, source) {
  const resolved = path.resolve(root, source);
  const relative = path.relative(root, resolved);
  if (path.isAbsolute(relative)) return resolved;
  return relative === "" ? "." : relative.replaceAll(path.sep, "/");
}

function resolveConfigSource(root, source) {
  return path.isAbsolute(source) ? path.normalize(source) : path.resolve(root, source);
}

function pathKey(value) {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function reportedErrorPath(error) {
  if (typeof error?.dest === "string") return path.resolve(error.dest);
  if (typeof error?.path === "string") return path.resolve(error.path);
  return undefined;
}

function rerunInstruction(options) {
  const command = options?.command;
  return command && command !== "help"
    ? `then rerun the same ${command} command.`
    : "then rerun the same command.";
}

export function filesystemGuidance(error, options) {
  if (!error || typeof error.code !== "string") return undefined;
  const failedPath = reportedErrorPath(error);
  const root = options?.root;
  const isMarketplacePath = Boolean(
    failedPath
    && root
    && isWithin(pathKey(path.resolve(root)), pathKey(failedPath)),
  );
  const location = failedPath ? `\nReported path: ${failedPath}` : "";
  const retry = rerunInstruction(options);

  if (error.code === "EACCES" || error.code === "EPERM" || error.code === "EROFS") {
    const subject = isMarketplacePath
      ? "The Marketplace destination is not writable."
      : "The reported source or destination is not accessible.";
    return `${subject}${location}\n`
      + "For a network share, connect or authenticate outside this script and verify both share and filesystem permissions. "
      + `This script does not change credentials, mappings, or permissions; restore access and ${retry}`;
  }
  if (error.code === "ENOSPC" || error.code === "EDQUOT") {
    return `The destination has insufficient free space or has reached its storage quota.${location}\n`
      + `Free space or raise the quota, ${retry}`;
  }
  if (error.code === "EBUSY" || error.code === "ENOTEMPTY") {
    return `A file or directory needed for Marketplace replacement is busy or changed concurrently.${location}\n`
      + `Close processes using the path, ensure that no other init, add, or sync command is writing this Marketplace, and ${retry}`;
  }
  if (error.code === "ENOENT") {
    return `A source, destination, or network-share path disappeared during the operation.${location}\n`
      + `Confirm that the path still exists and the share is connected, ensure that no other writer is changing it, and ${retry}`;
  }
  if (["ENETUNREACH", "EHOSTUNREACH", "ECONNRESET", "ETIMEDOUT", "ENOTCONN"].includes(error.code)) {
    return `The network filesystem became unavailable during the operation.${location}\n`
      + `Restore network and share access outside this script, ${retry}`;
  }
  if (error.code === "EIO" || error.code === "UNKNOWN") {
    return `The filesystem reported an I/O failure.${location}\n`
      + `If this path is on a network share, verify the NAS, network, and share connection; ${retry}`;
  }
  return undefined;
}

function addSecondaryFailure(primaryError, action, target, secondaryError) {
  primaryError.secondaryFailures ??= [];
  primaryError.secondaryFailures.push({ action, target, error: secondaryError });
}

async function removeAfterOperation(target, options, primaryError) {
  try {
    await rm(target, options);
  } catch (error) {
    if (!primaryError) throw error;
    addSecondaryFailure(primaryError, "cleanup", target, error);
  }
}

async function restoreBackup(backup, destination, primaryError) {
  try {
    if ((await pathType(backup)) !== null) await rename(backup, destination);
  } catch (error) {
    addSecondaryFailure(primaryError, "rollback", backup, error);
  }
}

function validateConfig(config, root) {
  if (!isObject(config)) fail("The Marketplace development configuration must be an object.");
  if (config.managedBy !== undefined) {
    fail("The Marketplace reference configuration is generated by another workflow. Use that workflow, or pass its materialized source configuration with --config.");
  }
  for (const key of Object.keys(config)) if (!CONFIG_KEYS.has(key)) fail(`Unsupported configuration key: ${key}`);
  if (config.schemaVersion !== 2) fail("config.json.schemaVersion must be 2.");
  config.name = validateName(config.name, "config.json.name");
  config.displayName = normalizeText(config.displayName, "config.json.displayName");
  if (!Array.isArray(config.plugins)) fail("config.json.plugins must be an array.");
  if (!Array.isArray(config.skills)) fail("config.json.skills must be an array.");
  const sources = new Set();
  for (const [index, plugin] of config.plugins.entries()) {
    if (!isObject(plugin)) fail(`config.json.plugins[${index}] must be an object.`);
    for (const key of Object.keys(plugin)) {
      if (!PLUGIN_CONFIG_KEYS.has(key)) fail(`Unsupported plugin configuration key: plugins[${index}].${key}`);
    }
    plugin.source = normalizeText(plugin.source, `plugins[${index}].source`);
    plugin.category = normalizeText(plugin.category, `plugins[${index}].category`);
    const resolved = pathKey(resolveConfigSource(root, plugin.source));
    if (sources.has(resolved)) fail(`Duplicate plugin source: ${plugin.source}`);
    sources.add(resolved);
  }
  const skillSources = new Set();
  for (const [index, skill] of config.skills.entries()) {
    if (!isObject(skill)) fail(`config.json.skills[${index}] must be an object.`);
    for (const key of Object.keys(skill)) {
      if (!SKILL_CONFIG_KEYS.has(key)) fail(`Unsupported Skill configuration key: skills[${index}].${key}`);
    }
    skill.source = normalizeText(skill.source, `skills[${index}].source`);
    if (skill.sourceUrl !== undefined) skill.sourceUrl = validateSourceUrl(skill.sourceUrl, `skills[${index}].sourceUrl`);
    const resolved = pathKey(resolveConfigSource(root, skill.source));
    if (skillSources.has(resolved)) fail(`Duplicate Skill source: ${skill.source}`);
    skillSources.add(resolved);
  }
  return config;
}

function runValidator(pluginRoot) {
  const result = spawnSync(process.execPath, [VALIDATOR, pluginRoot], {
    encoding: "utf8",
    shell: false,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    fail(`Plugin validation failed for ${pluginRoot}.${detail ? `\n${detail}` : ""}`);
  }
}

async function inspectPlugin(root, entry, {
  validate = true,
  includeDigest = true,
  allowGeneratedSource = false,
} = {}) {
  const source = resolveConfigSource(root, entry.source);
  if (!allowGeneratedSource && isWithin(path.join(root, PLUGINS_RELATIVE_PATH), source)) {
    fail(`Plugin source must not be inside the generated plugins directory: ${entry.source}`);
  }
  if ((await pathType(source)) !== "directory") fail(`Plugin source is not a directory: ${entry.source}`);
  if (validate) runValidator(source);
  const manifest = await readJson(path.join(source, "plugin.json"), "plugin.json");
  const name = validateName(manifest.name, `${entry.source}/plugin.json.name`);
  const plugin = { ...entry, source, name };
  if (includeDigest) plugin.digest = await treeDigest(source);
  return plugin;
}

async function inspectPlugins(config, root, inspectionOptions) {
  const plugins = [];
  const names = new Set();
  for (const entry of config.plugins) {
    const plugin = await inspectPlugin(root, entry, inspectionOptions);
    if (names.has(plugin.name)) fail(`Multiple configured sources use the plugin name ${plugin.name}.`);
    names.add(plugin.name);
    plugins.push(plugin);
  }
  return plugins;
}

async function inspectSkill(root, entry, {
  includeDigest = true,
  allowGeneratedSource = false,
} = {}) {
  const source = resolveConfigSource(root, entry.source);
  if (!allowGeneratedSource && isWithin(path.join(root, SKILLS_RELATIVE_PATH), source)) {
    fail(`Skill source must not be inside the generated skills directory: ${entry.source}`);
  }
  if ((await pathType(source)) !== "directory") fail(`Skill source is not a directory: ${entry.source}`);
  const skillFile = path.join(source, "SKILL.md");
  if ((await pathType(skillFile)) !== "file") fail(`Skill source has no SKILL.md: ${entry.source}`);
  const text = await readFile(skillFile, "utf8");
  const lines = text.split(/\r?\n/u);
  if (lines[0]?.trim() !== "---") fail(`${entry.source}/SKILL.md must start with YAML frontmatter.`);
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) fail(`${entry.source}/SKILL.md has unclosed YAML frontmatter.`);
  const frontmatter = lines.slice(1, end);
  const valueFor = (key) => {
    const match = frontmatter
      .map((line) => new RegExp(`^${key}:\\s*(.*?)\\s*$`, "u").exec(line))
      .find(Boolean);
    if (!match) return null;
    const value = match[1];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    return value;
  };
  const name = validateSkillName(valueFor("name"), `${entry.source}/SKILL.md name`);
  if (!valueFor("description")) fail(`${entry.source}/SKILL.md description must be non-empty.`);
  if (path.basename(source) !== name) {
    fail(`Skill source directory name must match the name in SKILL.md: ${entry.source}.`);
  }
  const skill = { ...entry, source, name };
  if (includeDigest) skill.digest = await treeDigest(source);
  return skill;
}

async function inspectSkills(config, root, inspectionOptions) {
  const skills = [];
  const names = new Set();
  for (const entry of config.skills) {
    const skill = await inspectSkill(root, entry, inspectionOptions);
    if (names.has(skill.name)) fail(`Multiple configured sources use the Skill name ${skill.name}.`);
    names.add(skill.name);
    skills.push(skill);
  }
  return skills;
}

async function treeDigest(root) {
  const hash = createHash("sha256");
  const realRoot = await realpath(root);
  async function visit(directory, relativeDirectory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
    for (const entry of entries) {
      const relative = path.join(relativeDirectory, entry.name).replaceAll(path.sep, "/");
      const target = path.join(directory, entry.name);
      const stats = await lstat(target);
      if (stats.isDirectory()) {
        hash.update(`d\0${relative}\0${stats.mode & 0o777}\0`);
        await visit(target, path.join(relativeDirectory, entry.name));
      } else if (stats.isFile()) {
        hash.update(`f\0${relative}\0${stats.mode & 0o777}\0`);
        hash.update(await readFile(target));
        hash.update("\0");
      } else if (stats.isSymbolicLink()) {
        const linkTarget = await readlink(target);
        let resolvedTarget;
        try {
          resolvedTarget = await realpath(target);
        } catch (error) {
          fail(`Package contains an unreadable symbolic link: ${relative} (${error.code || error.message}).`);
        }
        if (path.isAbsolute(linkTarget) || !isWithin(realRoot, resolvedTarget)) {
          fail(`Package contains a symbolic link outside its root: ${relative}.`);
        }
        hash.update(`l\0${relative}\0${linkTarget}\0`);
      } else {
        fail(`Unsupported filesystem entry in plugin ${root}: ${relative}`);
      }
    }
  }
  await visit(root, "");
  return `sha256:${hash.digest("hex")}`;
}

function byteDigest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function marketplaceDocument(config, plugins) {
  return {
    name: config.name,
    interface: { displayName: config.displayName },
    plugins: plugins.map((plugin) => ({
      name: plugin.name,
      source: { source: "local", path: `./plugins/${plugin.name}` },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      category: plugin.category,
    })),
  };
}

function skillCatalogDocument(config, skills) {
  return {
    $comment: "@plugin-creator-agent-plugins managed-skill-catalog v1",
    schemaVersion: 1,
    marketplace: { name: config.name, displayName: config.displayName },
    skills: skills.map((skill) => ({
      name: skill.name,
      path: `../../skills/${skill.name}`,
      digest: skill.digest,
      ...(skill.sourceUrl ? { sourceUrl: skill.sourceUrl } : {}),
    })),
  };
}

async function loadConfiguration(root, configurationPath = null) {
  return validateConfig(
    await readJson(configurationPath ?? path.join(root, CONFIG_RELATIVE_PATH), "Marketplace development configuration"),
    root,
  );
}

async function loadState(root) {
  const file = path.join(root, STATE_RELATIVE_PATH);
  if ((await pathType(file)) === null) return null;
  const state = await readJson(file, "Marketplace generation state");
  if (
    !isObject(state)
    || state.$comment !== STATE_MARKER
    || state.schemaVersion !== 1
    || typeof state.marketplaceDigest !== "string"
    || !isObject(state.plugins)
    || Object.values(state.plugins).some((plugin) => !isObject(plugin) || typeof plugin.digest !== "string")
    || (state.skillCatalogDigest !== undefined && typeof state.skillCatalogDigest !== "string")
    || (state.skills !== undefined && (!isObject(state.skills)
      || Object.values(state.skills).some((skill) => !isObject(skill) || typeof skill.digest !== "string")))
  ) {
    fail(`Refusing an invalid or unmanaged generation state: ${file}`);
  }
  return state;
}

async function assertSchemaManaged(root, templateText) {
  const file = path.join(root, SCHEMA_RELATIVE_PATH);
  const type = await pathType(file);
  if (type === null) return null;
  if (type !== "file") fail(`Managed schema path is not a file: ${file}`);
  const current = await readFile(file, "utf8");
  if (current !== templateText && !current.includes(SCHEMA_MARKER) && !current.includes(LEGACY_SCHEMA_MARKER)) {
    fail(`Refusing to overwrite an unmanaged schema: ${file}`);
  }
  return current;
}

async function assertManagedFileSafe(file, expectedText, previousDigest, label) {
  const type = await pathType(file);
  if (type !== null && type !== "file") fail(`${label} path is not a file: ${file}`);
  if (type === "file") {
    const current = await readFile(file);
    const currentDigest = byteDigest(current);
    if (current.toString("utf8") !== expectedText && previousDigest !== currentDigest) {
      fail(`Refusing to overwrite a ${label} changed outside this assembler: ${file}`);
    }
  }
}

async function assertDestinationsSafe(root, plugins, skills, catalogText, skillCatalogText, state) {
  const pluginDestinationDigests = new Map();
  const skillDestinationDigests = new Map();
  await assertManagedFileSafe(
    path.join(root, CATALOG_RELATIVE_PATH),
    catalogText,
    state?.marketplaceDigest,
    "Marketplace catalog",
  );
  await assertManagedFileSafe(
    path.join(root, SKILL_CATALOG_RELATIVE_PATH),
    skillCatalogText,
    state?.skillCatalogDigest,
    "Skill catalog",
  );

  for (const plugin of plugins) {
    const destination = path.join(root, PLUGINS_RELATIVE_PATH, plugin.name);
    const type = await pathType(destination);
    if (type === null) {
      pluginDestinationDigests.set(plugin.name, null);
      continue;
    }
    if (type !== "directory") fail(`Plugin destination is not a directory: ${destination}`);
    const currentDigest = await treeDigest(destination);
    if (currentDigest !== plugin.digest && state?.plugins?.[plugin.name]?.digest !== currentDigest) {
      fail(`Refusing to overwrite a plugin changed outside this assembler: ${destination}`);
    }
    pluginDestinationDigests.set(plugin.name, currentDigest);
  }
  for (const skill of skills) {
    const destination = path.join(root, SKILLS_RELATIVE_PATH, skill.name);
    const type = await pathType(destination);
    if (type === null) {
      skillDestinationDigests.set(skill.name, null);
      continue;
    }
    if (type !== "directory") fail(`Skill destination is not a directory: ${destination}`);
    const currentDigest = await treeDigest(destination);
    if (currentDigest !== skill.digest && state?.skills?.[skill.name]?.digest !== currentDigest) {
      fail(`Refusing to overwrite a Skill changed outside this assembler: ${destination}`);
    }
    skillDestinationDigests.set(skill.name, currentDigest);
  }
  return { pluginDestinationDigests, skillDestinationDigests };
}

async function writeAtomic(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  const backup = `${file}.bak-${process.pid}-${randomUUID()}`;
  let primaryError;
  try {
    await writeFile(temporary, content);
    const exists = (await pathType(file)) !== null;
    if (exists) await rename(file, backup);
    try {
      await rename(temporary, file);
    } catch (error) {
      if (exists) await restoreBackup(backup, file, error);
      throw error;
    }
    if (exists) await rm(backup, { force: true });
  } catch (error) {
    primaryError ??= error;
    throw error;
  } finally {
    await removeAfterOperation(temporary, { force: true }, primaryError);
  }
}

async function replaceDirectory(staged, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  const backup = `${destination}.bak-${process.pid}-${randomUUID()}`;
  const exists = (await pathType(destination)) !== null;
  if (exists) await rename(destination, backup);
  try {
    await rename(staged, destination);
  } catch (error) {
    if (exists) await restoreBackup(backup, destination, error);
    throw error;
  }
  if (exists) await rm(backup, { recursive: true, force: true });
}

async function runInit(options) {
  const rootType = await pathType(options.root);
  if (rootType !== null && rootType !== "directory") fail(`Marketplace root is not a directory: ${options.root}`);
  await mkdir(options.root, { recursive: true });
  const configPath = path.join(options.root, CONFIG_RELATIVE_PATH);
  if ((await pathType(configPath)) !== null) fail(`${CONFIG_RELATIVE_PATH.replaceAll(path.sep, "/")} already exists.`);

  const entries = options.plugins.map((source) => ({
    source: normalizeConfigSource(options.root, source),
    category: options.category,
  }));
  const config = validateConfig({
    $schema: "./schema.json",
    schemaVersion: 2,
    name: options.name,
    displayName: options.displayName,
    plugins: entries,
    skills: [],
  }, options.root);
  await inspectPlugins(config, options.root, { includeDigest: false });
  const schemaText = await readFile(SCHEMA_TEMPLATE, "utf8");
  const schemaCurrent = await assertSchemaManaged(options.root, schemaText);
  await mkdir(path.dirname(configPath), { recursive: true });
  const schemaPath = path.join(options.root, SCHEMA_RELATIVE_PATH);
  const schemaAction = schemaCurrent === null
    ? "Created"
    : schemaCurrent === schemaText ? "Reused" : "Updated";
  if (schemaCurrent !== schemaText) await writeAtomic(schemaPath, schemaText);
  try {
    await writeFile(configPath, jsonText(config), { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") {
      await removeAfterOperation(configPath, { force: true }, error);
    }
    if (schemaCurrent === null) await removeAfterOperation(schemaPath, { force: true }, error);
    throw error;
  }
  console.log(`Created: ${CONFIG_RELATIVE_PATH.replaceAll(path.sep, "/")}`);
  console.log(`${schemaAction}: ${SCHEMA_RELATIVE_PATH.replaceAll(path.sep, "/")}`);
  if (entries.length > 0) console.log(`Configured plugins: ${entries.length}. Run sync to assemble the Marketplace.`);
}

async function runAdd(options) {
  const config = await loadConfiguration(options.root);
  const entry = {
    source: normalizeConfigSource(options.root, options.plugins[0]),
    category: options.category,
  };
  const inspected = await inspectPlugin(options.root, entry, { includeDigest: false });
  const existing = await inspectPlugins(config, options.root, {
    validate: false,
    includeDigest: false,
  });
  if (existing.some((plugin) => plugin.name === inspected.name)) fail(`Plugin ${inspected.name} is already configured.`);
  config.plugins.push(entry);
  await writeAtomic(path.join(options.root, CONFIG_RELATIVE_PATH), jsonText(config));
  console.log(`Added: ${inspected.name}`);
  console.log("Run sync to update the Marketplace distribution.");
}

async function evaluate(root, configurationPath = null, selectedPlugin = null, selectedSkill = null) {
  const config = await loadConfiguration(root, configurationPath);
  const scoped = Boolean(selectedPlugin || selectedSkill);
  const state = await loadState(root);
  const [catalogPlugins, inspectedSkills] = await Promise.all([
    inspectPlugins(config, root, scoped
      ? { validate: false, includeDigest: false, allowGeneratedSource: true }
      : undefined),
    inspectSkills(config, root, {
      includeDigest: !scoped,
      allowGeneratedSource: scoped,
    }),
  ]);
  let plugins = catalogPlugins;
  if (selectedPlugin) {
    const index = catalogPlugins.findIndex((plugin) => plugin.name === selectedPlugin);
    if (index < 0) {
      fail(`Plugin ${selectedPlugin} is not configured in this Marketplace.`);
    }
    plugins = [await inspectPlugin(root, config.plugins[index])];
  } else if (selectedSkill) plugins = [];
  let catalogSkills = inspectedSkills;
  let skills = catalogSkills;
  if (selectedSkill) {
    const index = catalogSkills.findIndex((skill) => skill.name === selectedSkill);
    if (index < 0) fail(`Skill ${selectedSkill} is not configured in this Marketplace.`);
    const selected = await inspectSkill(root, config.skills[index]);
    catalogSkills = catalogSkills.map((skill) => {
      if (skill.name === selectedSkill) return selected;
      const digest = state?.skills?.[skill.name]?.digest;
      if (!digest) fail(`Skill ${skill.name} has no synchronized digest. Run a full sync first.`);
      return { ...skill, digest };
    });
    skills = [selected];
  } else if (selectedPlugin) {
    catalogSkills = catalogSkills.map((skill) => {
      const digest = state?.skills?.[skill.name]?.digest;
      if (!digest) fail(`Skill ${skill.name} has no synchronized digest. Run a full sync first.`);
      return { ...skill, digest };
    });
    skills = [];
  }
  const catalogText = jsonText(marketplaceDocument(config, catalogPlugins));
  const catalogDigest = byteDigest(catalogText);
  const skillCatalogText = jsonText(skillCatalogDocument(config, catalogSkills));
  const skillCatalogDigest = byteDigest(skillCatalogText);
  const schemaText = await readFile(SCHEMA_TEMPLATE, "utf8");
  return {
    plugins,
    skills,
    catalogText,
    catalogDigest,
    skillCatalogText,
    skillCatalogDigest,
    schemaText,
    state,
  };
}

async function assertMarketplaceLayoutCurrent(root) {
  if ((await pathType(path.join(root, LEGACY_DEVELOPMENT_DIRECTORY))) === null) return;
  fail(
    "This Marketplace still uses .agents/plugin-marketplace-development. "
    + "Rename that directory to .agents/marketplace-development before continuing.",
  );
}

function withoutSelectedCatalogPlugin(document, selectedPlugin, label) {
  if (!isObject(document) || !Array.isArray(document.plugins)) fail(`${label} is not a valid Marketplace catalog.`);
  const selected = document.plugins.filter((plugin) => isObject(plugin) && plugin.name === selectedPlugin);
  if (selected.length > 1) fail(`${label} contains duplicate plugin entries for ${selectedPlugin}.`);
  return {
    ...document,
    plugins: document.plugins.filter((plugin) => !isObject(plugin) || plugin.name !== selectedPlugin),
  };
}

function withoutSelectedCatalogSkill(document, selectedSkill, label) {
  if (!isObject(document) || !Array.isArray(document.skills)) fail(`${label} is not a valid Skill catalog.`);
  const selected = document.skills.filter((skill) => isObject(skill) && skill.name === selectedSkill);
  if (selected.length > 1) fail(`${label} contains duplicate Skill entries for ${selectedSkill}.`);
  return {
    ...document,
    skills: document.skills.filter((skill) => !isObject(skill) || skill.name !== selectedSkill),
  };
}

async function assertScopedBaseline(
  root,
  catalogText,
  catalogDigest,
  skillCatalogText,
  skillCatalogDigest,
  schemaText,
  state,
  {
    merge = false,
    selectedPlugin = null,
    selectedSkill = null,
  } = {}) {
  if (!state) fail("Scoped operation requires an existing full Marketplace sync.");
  const schemaPath = path.join(root, SCHEMA_RELATIVE_PATH);
  if ((await pathType(schemaPath)) !== "file" || await readFile(schemaPath, "utf8") !== schemaText) {
    fail("Marketplace schema is not current. Run a full sync before a scoped operation.");
  }
  const catalogPath = path.join(root, CATALOG_RELATIVE_PATH);
  if ((await pathType(catalogPath)) !== "file") {
    fail("Marketplace catalog structure is not current. Run a full sync before a scoped operation.");
  }
  const currentCatalogText = await readFile(catalogPath, "utf8");
  if (!merge && currentCatalogText !== catalogText) {
    fail("Marketplace catalog structure is not current. Run a full sync before a scoped operation.");
  }
  if (merge) {
    let currentCatalog;
    let expectedCatalog;
    try {
      currentCatalog = JSON.parse(currentCatalogText);
      expectedCatalog = JSON.parse(catalogText);
    } catch {
      fail("Marketplace catalog is not valid JSON. Run a full sync before a scoped operation.");
    }
    const currentRemainder = selectedPlugin
      ? withoutSelectedCatalogPlugin(currentCatalog, selectedPlugin, "Current Marketplace catalog")
      : currentCatalog;
    const expectedRemainder = selectedPlugin
      ? withoutSelectedCatalogPlugin(expectedCatalog, selectedPlugin, "Expected Marketplace catalog")
      : expectedCatalog;
    if (canonicalJson(currentRemainder) !== canonicalJson(expectedRemainder)) {
      fail("Marketplace entries outside the selected plugin changed. Reconnect or retry from the latest Marketplace state.");
    }
  }
  const baselineCatalogDigest = merge ? byteDigest(currentCatalogText) : catalogDigest;
  if (state.marketplaceDigest !== baselineCatalogDigest) {
    fail("Marketplace state does not match the catalog. Run a full sync before a scoped operation.");
  }
  const skillCatalogPath = path.join(root, SKILL_CATALOG_RELATIVE_PATH);
  if ((await pathType(skillCatalogPath)) !== "file") {
    fail("Skill catalog structure is not current. Run a full sync before a scoped operation.");
  }
  const currentSkillCatalogText = await readFile(skillCatalogPath, "utf8");
  if (!merge && !selectedSkill && currentSkillCatalogText !== skillCatalogText) {
    fail("Skill catalog structure is not current. Run a full sync before a scoped operation.");
  }
  if (merge || selectedSkill) {
    let currentSkillCatalog;
    let expectedSkillCatalog;
    try {
      currentSkillCatalog = JSON.parse(currentSkillCatalogText);
      expectedSkillCatalog = JSON.parse(skillCatalogText);
    } catch {
      fail("Skill catalog is not valid JSON. Run a full sync before a scoped operation.");
    }
    const currentRemainder = selectedSkill
      ? withoutSelectedCatalogSkill(currentSkillCatalog, selectedSkill, "Current Skill catalog")
      : currentSkillCatalog;
    const expectedRemainder = selectedSkill
      ? withoutSelectedCatalogSkill(expectedSkillCatalog, selectedSkill, "Expected Skill catalog")
      : expectedSkillCatalog;
    if (canonicalJson(currentRemainder) !== canonicalJson(expectedRemainder)) {
      fail("Skill entries outside the selected target changed. Reconnect or retry from the latest Marketplace state.");
    }
  }
  const baselineSkillCatalogDigest = merge || selectedSkill ? byteDigest(currentSkillCatalogText) : skillCatalogDigest;
  if (state.skillCatalogDigest !== baselineSkillCatalogDigest) {
    fail("Marketplace state does not match the Skill catalog. Run a full sync before a scoped operation.");
  }
}

async function runSync(options) {
  const {
    plugins,
    skills,
    catalogText,
    catalogDigest,
    skillCatalogText,
    skillCatalogDigest,
    schemaText,
    state,
  } = await evaluate(
    options.root,
    options.config,
    options.selectedPlugin,
    options.selectedSkill,
  );
  const selected = options.selectedPlugin ?? options.selectedSkill;
  if (selected) {
    await assertScopedBaseline(
      options.root,
      catalogText,
      catalogDigest,
      skillCatalogText,
      skillCatalogDigest,
      schemaText,
      state,
      {
      merge: options.merge,
      selectedPlugin: options.selectedPlugin,
      selectedSkill: options.selectedSkill,
    });
  }
  const schemaCurrent = await assertSchemaManaged(options.root, schemaText);
  const { pluginDestinationDigests, skillDestinationDigests } = await assertDestinationsSafe(
    options.root,
    plugins,
    skills,
    catalogText,
    skillCatalogText,
    state,
  );

  const stagingRoot = path.join(
    options.root,
    DEVELOPMENT_DIRECTORY,
    `.staging-${process.pid}-${randomUUID()}`,
  );
  const changed = [];
  let primaryError;
  try {
    for (const plugin of plugins) {
      const destination = path.join(options.root, PLUGINS_RELATIVE_PATH, plugin.name);
      if (pluginDestinationDigests.get(plugin.name) === plugin.digest) continue;
      const staged = path.join(stagingRoot, PLUGINS_RELATIVE_PATH, plugin.name);
      await mkdir(path.dirname(staged), { recursive: true });
      await cp(plugin.source, staged, {
        recursive: true,
        force: false,
        errorOnExist: true,
        verbatimSymlinks: true,
      });
      runValidator(staged);
      if (await treeDigest(staged) !== plugin.digest) fail(`Staged plugin copy differs from its source: ${plugin.name}`);
      changed.push({ plugin, staged, destination });
    }

    for (const skill of skills) {
      const destination = path.join(options.root, SKILLS_RELATIVE_PATH, skill.name);
      if (skillDestinationDigests.get(skill.name) === skill.digest) continue;
      const staged = path.join(stagingRoot, SKILLS_RELATIVE_PATH, skill.name);
      await mkdir(path.dirname(staged), { recursive: true });
      await cp(skill.source, staged, {
        recursive: true,
        force: false,
        errorOnExist: true,
        verbatimSymlinks: true,
      });
      const stagedSkill = await inspectSkill(stagingRoot, {
        source: path.relative(stagingRoot, staged),
        ...(skill.sourceUrl ? { sourceUrl: skill.sourceUrl } : {}),
      }, { allowGeneratedSource: true });
      if (stagedSkill.name !== skill.name || stagedSkill.digest !== skill.digest) {
        fail(`Staged Skill copy differs from its source: ${skill.name}`);
      }
      changed.push({ skill, staged, destination });
    }

    for (const item of changed) {
      await replaceDirectory(item.staged, item.destination);
      console.log(item.plugin
        ? `Synced: plugins/${item.plugin.name}`
        : `Synced: skills/${item.skill.name}`);
    }

    if (!selected) {
      const schemaPath = path.join(options.root, SCHEMA_RELATIVE_PATH);
      if (schemaCurrent !== schemaText) {
        await writeAtomic(schemaPath, schemaText);
        console.log(`Updated: ${SCHEMA_RELATIVE_PATH.replaceAll(path.sep, "/")}`);
      }
    }
    if (!selected || options.merge) {
      const catalogPath = path.join(options.root, CATALOG_RELATIVE_PATH);
      if ((await pathType(catalogPath)) !== "file" || await readFile(catalogPath, "utf8") !== catalogText) {
        await writeAtomic(catalogPath, catalogText);
        console.log(`Updated: ${CATALOG_RELATIVE_PATH.replaceAll(path.sep, "/")}`);
      }
    }
    if (!selected || options.merge || options.selectedSkill) {
      const skillCatalogPath = path.join(options.root, SKILL_CATALOG_RELATIVE_PATH);
      if ((await pathType(skillCatalogPath)) !== "file" || await readFile(skillCatalogPath, "utf8") !== skillCatalogText) {
        await writeAtomic(skillCatalogPath, skillCatalogText);
        console.log(`Updated: ${SKILL_CATALOG_RELATIVE_PATH.replaceAll(path.sep, "/")}`);
      }
    }

    const statePlugins = { ...(state?.plugins ?? {}) };
    for (const plugin of plugins) statePlugins[plugin.name] = { digest: plugin.digest };
    const stateSkills = { ...(state?.skills ?? {}) };
    for (const skill of skills) stateSkills[skill.name] = { digest: skill.digest };
    const retainedPlugins = [];
    const retainedSkills = [];
    if (!selected) {
      const configuredNames = new Set(plugins.map((plugin) => plugin.name));
      for (const name of Object.keys(statePlugins).sort()) {
        if (configuredNames.has(name)) continue;
        if ((await pathType(path.join(options.root, PLUGINS_RELATIVE_PATH, name))) === null) {
          delete statePlugins[name];
        } else {
          retainedPlugins.push(name);
        }
      }
      const configuredSkillNames = new Set(skills.map((skill) => skill.name));
      for (const name of Object.keys(stateSkills).sort()) {
        if (configuredSkillNames.has(name)) continue;
        if ((await pathType(path.join(options.root, SKILLS_RELATIVE_PATH, name))) === null) {
          delete stateSkills[name];
        } else {
          retainedSkills.push(name);
        }
      }
    }
    const stateDocument = {
      $comment: STATE_MARKER,
      schemaVersion: 1,
      marketplaceDigest: catalogDigest,
      skillCatalogDigest,
      plugins: statePlugins,
      skills: stateSkills,
    };
    const statePath = path.join(options.root, STATE_RELATIVE_PATH);
    const stateText = jsonText(stateDocument);
    if ((await pathType(statePath)) !== "file" || await readFile(statePath, "utf8") !== stateText) {
      await writeAtomic(statePath, stateText);
      console.log(`Updated: ${STATE_RELATIVE_PATH.replaceAll(path.sep, "/")}`);
    }
    for (const name of retainedPlugins) console.log(`WARNING: Retained unreferenced generated plugin: plugins/${name}`);
    for (const name of retainedSkills) console.log(`WARNING: Retained unreferenced generated Skill: skills/${name}`);
    if (changed.length === 0) console.log("Plugin copies are current; Skill copies are current.");
    console.log(options.selectedPlugin
      ? `Marketplace plugin sync complete: ${options.selectedPlugin}. Other plugin copies were not checked; Skill copies were not checked.`
      : options.selectedSkill
        ? `Marketplace Skill sync complete: ${options.selectedSkill}. Other Marketplace copies were not checked.`
      : "Marketplace sync complete.");
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await removeAfterOperation(stagingRoot, { recursive: true, force: true }, primaryError);
  }
}

async function runCheck(options) {
  const {
    plugins,
    skills,
    catalogText,
    catalogDigest,
    skillCatalogText,
    skillCatalogDigest,
    schemaText,
    state,
  } = await evaluate(
    options.root,
    options.config,
    options.selectedPlugin,
    options.selectedSkill,
  );
  const drift = [];
  const schemaPath = path.join(options.root, SCHEMA_RELATIVE_PATH);
  if ((await pathType(schemaPath)) !== "file" || await readFile(schemaPath, "utf8") !== schemaText) {
    drift.push(`Changed: ${SCHEMA_RELATIVE_PATH.replaceAll(path.sep, "/")}`);
  }
  const catalogPath = path.join(options.root, CATALOG_RELATIVE_PATH);
  if ((await pathType(catalogPath)) !== "file" || await readFile(catalogPath, "utf8") !== catalogText) {
    drift.push(`Changed: ${CATALOG_RELATIVE_PATH.replaceAll(path.sep, "/")}`);
  }
  const skillCatalogPath = path.join(options.root, SKILL_CATALOG_RELATIVE_PATH);
  if ((await pathType(skillCatalogPath)) !== "file" || await readFile(skillCatalogPath, "utf8") !== skillCatalogText) {
    drift.push(`Changed: ${SKILL_CATALOG_RELATIVE_PATH.replaceAll(path.sep, "/")}`);
  }
  for (const plugin of plugins) {
    const destination = path.join(options.root, PLUGINS_RELATIVE_PATH, plugin.name);
    if ((await pathType(destination)) !== "directory" || await treeDigest(destination) !== plugin.digest) {
      drift.push(`Changed: plugins/${plugin.name}`);
    }
  }
  for (const skill of skills) {
    const destination = path.join(options.root, SKILLS_RELATIVE_PATH, skill.name);
    if ((await pathType(destination)) !== "directory" || await treeDigest(destination) !== skill.digest) {
      drift.push(`Changed: skills/${skill.name}`);
    }
  }
  if (!state) drift.push(`Missing: ${STATE_RELATIVE_PATH.replaceAll(path.sep, "/")}`);
  else {
    if (state.marketplaceDigest !== catalogDigest) {
      drift.push(`Changed: ${STATE_RELATIVE_PATH.replaceAll(path.sep, "/")} Marketplace digest`);
    }
    if (state.skillCatalogDigest !== skillCatalogDigest) {
      drift.push(`Changed: ${STATE_RELATIVE_PATH.replaceAll(path.sep, "/")} Skill catalog digest`);
    }
    for (const plugin of plugins) {
      if (state.plugins?.[plugin.name]?.digest !== plugin.digest) {
        drift.push(`Changed: ${STATE_RELATIVE_PATH.replaceAll(path.sep, "/")} ${plugin.name} digest`);
      }
    }
    for (const skill of skills) {
      if (state.skills?.[skill.name]?.digest !== skill.digest) {
        drift.push(`Changed: ${STATE_RELATIVE_PATH.replaceAll(path.sep, "/")} ${skill.name} digest`);
      }
    }
  }
  if (drift.length > 0) {
    for (const message of drift) console.error(message);
    process.exitCode = 1;
    return;
  }
  console.log(options.selectedPlugin
    ? `Marketplace plugin is current: ${options.selectedPlugin}. Other plugin copies were not checked; Skill copies were not checked.`
    : options.selectedSkill
      ? `Marketplace Skill is current: ${options.selectedSkill}. Other Marketplace copies were not checked.`
    : "Marketplace distribution is current.");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  try {
    if (options.command === "help") {
      help();
      return;
    }
    await assertMarketplaceLayoutCurrent(options.root);
    if (options.command === "init") await runInit(options);
    else if (options.command === "add") await runAdd(options);
    else if (options.command === "sync") await runSync(options);
    else await runCheck(options);
  } catch (error) {
    error.marketplaceOptions ??= options;
    throw error;
  }
}

function reportFailure(error) {
  const prefix = error.expected ? "assemble-agent-marketplace" : "assemble-agent-marketplace unexpected error";
  const code = typeof error.code === "string" ? ` [${error.code}]` : "";
  console.error(`${prefix}${code}: ${error.message}`);
  for (const failure of error.secondaryFailures ?? []) {
    const secondaryCode = typeof failure.error?.code === "string" ? ` [${failure.error.code}]` : "";
    console.error(`Additional ${failure.action} failure${secondaryCode} at ${failure.target}: ${failure.error?.message ?? failure.error}`);
  }
  const guidance = filesystemGuidance(
    error,
    error.marketplaceOptions,
  ) ?? filesystemGuidance(error.secondaryFailures?.[0]?.error, error.marketplaceOptions);
  if (guidance) console.error(guidance);
  process.exitCode = 1;
}

async function isDirectInvocation(argumentPath) {
  if (!argumentPath) return false;
  let invokedPath = path.resolve(argumentPath);
  let scriptPath = path.resolve(SCRIPT_PATH);
  if (pathKey(invokedPath) === pathKey(scriptPath)) return true;
  try {
    [invokedPath, scriptPath] = await Promise.all([
      realpath(invokedPath),
      realpath(scriptPath),
    ]);
  } catch {
    // Preserve the normal comparison when either path disappears during startup.
  }
  return pathKey(invokedPath) === pathKey(scriptPath);
}

if (await isDirectInvocation(process.argv[1])) {
  main().catch(reportFailure);
}
