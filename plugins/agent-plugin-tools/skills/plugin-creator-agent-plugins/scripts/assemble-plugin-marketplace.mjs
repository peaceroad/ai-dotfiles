#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  readFile,
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
const DEVELOPMENT_DIRECTORY = path.join(".agents", "plugin-marketplace-development");
const CONFIG_RELATIVE_PATH = path.join(DEVELOPMENT_DIRECTORY, "config.json");
const SCHEMA_RELATIVE_PATH = path.join(DEVELOPMENT_DIRECTORY, "schema.json");
const STATE_RELATIVE_PATH = path.join(DEVELOPMENT_DIRECTORY, "state.json");
const CATALOG_RELATIVE_PATH = path.join(".agents", "plugins", "marketplace.json");
const PLUGINS_RELATIVE_PATH = "plugins";
const STATE_MARKER = "@plugin-creator-agent-plugins managed-marketplace-state v1";
const SCHEMA_MARKER = "@plugin-creator-agent-plugins managed-marketplace-schema v1";
const NAME_PATTERN = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u;
const COMMANDS = new Set(["init", "add", "sync", "check"]);
const CONFIG_KEYS = new Set(["$schema", "schemaVersion", "name", "displayName", "plugins"]);
const PLUGIN_CONFIG_KEYS = new Set(["source", "category"]);

function help() {
  console.log(`Assemble a filesystem-backed Codex plugin marketplace

Usage:
  node assemble-plugin-marketplace.mjs init <marketplace-root> --name <name> --display-name <label> [--plugin <plugin-root> ... --category <category>]
  node assemble-plugin-marketplace.mjs add <marketplace-root> <plugin-root> --category <category>
  node assemble-plugin-marketplace.mjs sync <marketplace-root>
  node assemble-plugin-marketplace.mjs check <marketplace-root>

Commands:
  init   Create the human-owned configuration and managed schema. With
         --plugin, validate and add one or more initial plugin sources.
  add    Validate one plugin source and add it to the configuration.
  sync   Validate sources, safely copy configured plugins, and generate the
         Codex Marketplace catalog. Git and publication are not modified.
  check  Validate sources and report distribution drift without writing.

Options:
  --name <name>             Stable Marketplace identifier for init.
  --display-name <label>    Marketplace label shown by Codex for init.
  --plugin <plugin-root>    Initial plugin source; repeatable with init.
  --category <category>     Category for add or all initial plugins.
  -h, --help                Show this help.

The Marketplace root may be a local directory, a checked-out Git repository,
or an accessible network filesystem path. Relative plugin sources are resolved
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
    plugins: [],
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
    const value = rest[index + 1];
    if (!value) fail(`Missing value for ${option}.`);
    if (option === "--name") options.name = value;
    else if (option === "--display-name") options.displayName = value;
    else if (option === "--category") options.category = value;
    else if (option === "--plugin" && command === "init") options.plugins.push(value);
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
    fail(`${command} accepts only the Marketplace root.`);
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
  for (const key of Object.keys(config)) if (!CONFIG_KEYS.has(key)) fail(`Unsupported configuration key: ${key}`);
  if (config.schemaVersion !== 1) fail("config.json.schemaVersion must be 1.");
  config.name = validateName(config.name, "config.json.name");
  config.displayName = normalizeText(config.displayName, "config.json.displayName");
  if (!Array.isArray(config.plugins)) fail("config.json.plugins must be an array.");
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

async function inspectPlugin(root, entry, { validate = true, includeDigest = true } = {}) {
  const source = resolveConfigSource(root, entry.source);
  if (isWithin(path.join(root, PLUGINS_RELATIVE_PATH), source)) {
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

async function treeDigest(root) {
  const hash = createHash("sha256");
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
        hash.update(`l\0${relative}\0${await readlink(target)}\0`);
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

async function loadConfiguration(root) {
  return validateConfig(
    await readJson(path.join(root, CONFIG_RELATIVE_PATH), "Marketplace development configuration"),
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
  if (current !== templateText && !current.includes(SCHEMA_MARKER)) {
    fail(`Refusing to overwrite an unmanaged schema: ${file}`);
  }
  return current;
}

async function assertDestinationsSafe(root, plugins, catalogText, state) {
  const destinationDigests = new Map();
  const catalogPath = path.join(root, CATALOG_RELATIVE_PATH);
  const catalogType = await pathType(catalogPath);
  if (catalogType !== null && catalogType !== "file") fail(`Marketplace catalog path is not a file: ${catalogPath}`);
  if (catalogType === "file") {
    const current = await readFile(catalogPath);
    const currentDigest = byteDigest(current);
    if (current.toString("utf8") !== catalogText && state?.marketplaceDigest !== currentDigest) {
      fail(`Refusing to overwrite a Marketplace catalog changed outside this assembler: ${catalogPath}`);
    }
  }

  for (const plugin of plugins) {
    const destination = path.join(root, PLUGINS_RELATIVE_PATH, plugin.name);
    const type = await pathType(destination);
    if (type === null) {
      destinationDigests.set(plugin.name, null);
      continue;
    }
    if (type !== "directory") fail(`Plugin destination is not a directory: ${destination}`);
    const currentDigest = await treeDigest(destination);
    if (currentDigest !== plugin.digest && state?.plugins?.[plugin.name]?.digest !== currentDigest) {
      fail(`Refusing to overwrite a plugin changed outside this assembler: ${destination}`);
    }
    destinationDigests.set(plugin.name, currentDigest);
  }
  return destinationDigests;
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
    schemaVersion: 1,
    name: options.name,
    displayName: options.displayName,
    plugins: entries,
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

async function evaluate(root) {
  const config = await loadConfiguration(root);
  const plugins = await inspectPlugins(config, root);
  const catalogText = jsonText(marketplaceDocument(config, plugins));
  const catalogDigest = byteDigest(catalogText);
  const schemaText = await readFile(SCHEMA_TEMPLATE, "utf8");
  const state = await loadState(root);
  return { plugins, catalogText, catalogDigest, schemaText, state };
}

async function runSync(options) {
  const { plugins, catalogText, catalogDigest, schemaText, state } = await evaluate(options.root);
  const schemaCurrent = await assertSchemaManaged(options.root, schemaText);
  const destinationDigests = await assertDestinationsSafe(
    options.root,
    plugins,
    catalogText,
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
      if (destinationDigests.get(plugin.name) === plugin.digest) continue;
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

    for (const item of changed) {
      await replaceDirectory(item.staged, item.destination);
      console.log(`Synced: plugins/${item.plugin.name}`);
    }

    const schemaPath = path.join(options.root, SCHEMA_RELATIVE_PATH);
    if (schemaCurrent !== schemaText) {
      await writeAtomic(schemaPath, schemaText);
      console.log(`Updated: ${SCHEMA_RELATIVE_PATH.replaceAll(path.sep, "/")}`);
    }

    const catalogPath = path.join(options.root, CATALOG_RELATIVE_PATH);
    if ((await pathType(catalogPath)) !== "file" || await readFile(catalogPath, "utf8") !== catalogText) {
      await writeAtomic(catalogPath, catalogText);
      console.log(`Updated: ${CATALOG_RELATIVE_PATH.replaceAll(path.sep, "/")}`);
    }

    const statePlugins = { ...(state?.plugins ?? {}) };
    for (const plugin of plugins) statePlugins[plugin.name] = { digest: plugin.digest };
    const configuredNames = new Set(plugins.map((plugin) => plugin.name));
    const retainedNames = [];
    for (const name of Object.keys(statePlugins).sort()) {
      if (configuredNames.has(name)) continue;
      if ((await pathType(path.join(options.root, PLUGINS_RELATIVE_PATH, name))) === null) {
        delete statePlugins[name];
      } else {
        retainedNames.push(name);
      }
    }
    const stateDocument = {
      $comment: STATE_MARKER,
      schemaVersion: 1,
      marketplaceDigest: catalogDigest,
      plugins: statePlugins,
    };
    const statePath = path.join(options.root, STATE_RELATIVE_PATH);
    const stateText = jsonText(stateDocument);
    if ((await pathType(statePath)) !== "file" || await readFile(statePath, "utf8") !== stateText) {
      await writeAtomic(statePath, stateText);
      console.log(`Updated: ${STATE_RELATIVE_PATH.replaceAll(path.sep, "/")}`);
    }
    for (const name of retainedNames) console.log(`WARNING: Retained unreferenced generated plugin: plugins/${name}`);
    if (changed.length === 0) console.log("Plugin copies are current.");
    console.log("Marketplace sync complete.");
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await removeAfterOperation(stagingRoot, { recursive: true, force: true }, primaryError);
  }
}

async function runCheck(options) {
  const { plugins, catalogText, catalogDigest, schemaText, state } = await evaluate(options.root);
  const drift = [];
  const schemaPath = path.join(options.root, SCHEMA_RELATIVE_PATH);
  if ((await pathType(schemaPath)) !== "file" || await readFile(schemaPath, "utf8") !== schemaText) {
    drift.push(`Changed: ${SCHEMA_RELATIVE_PATH.replaceAll(path.sep, "/")}`);
  }
  const catalogPath = path.join(options.root, CATALOG_RELATIVE_PATH);
  if ((await pathType(catalogPath)) !== "file" || await readFile(catalogPath, "utf8") !== catalogText) {
    drift.push(`Changed: ${CATALOG_RELATIVE_PATH.replaceAll(path.sep, "/")}`);
  }
  for (const plugin of plugins) {
    const destination = path.join(options.root, PLUGINS_RELATIVE_PATH, plugin.name);
    if ((await pathType(destination)) !== "directory" || await treeDigest(destination) !== plugin.digest) {
      drift.push(`Changed: plugins/${plugin.name}`);
    }
  }
  if (!state) drift.push(`Missing: ${STATE_RELATIVE_PATH.replaceAll(path.sep, "/")}`);
  else {
    if (state.marketplaceDigest !== catalogDigest) {
      drift.push(`Changed: ${STATE_RELATIVE_PATH.replaceAll(path.sep, "/")} Marketplace digest`);
    }
    for (const plugin of plugins) {
      if (state.plugins?.[plugin.name]?.digest !== plugin.digest) {
        drift.push(`Changed: ${STATE_RELATIVE_PATH.replaceAll(path.sep, "/")} ${plugin.name} digest`);
      }
    }
  }
  if (drift.length > 0) {
    for (const message of drift) console.error(message);
    process.exitCode = 1;
    return;
  }
  console.log("Marketplace distribution is current.");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  try {
    if (options.command === "help") {
      help();
      return;
    }
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
  const prefix = error.expected ? "assemble-plugin-marketplace" : "assemble-plugin-marketplace unexpected error";
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

if (process.argv[1] && pathKey(process.argv[1]) === pathKey(SCRIPT_PATH)) {
  main().catch(reportFailure);
}
