#!/usr/bin/env node

// @ai-dotfiles agent-command v1

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const HOME_PATH = resolve(process.env.AGENT_DEV_HOME || homedir());
const CONFIG_PATH = resolve(process.env.AGENT_DEV_CONFIG || join(HOME_PATH, ".agents", "development.json"));
const SKILL_MANAGER = resolve(process.env.AGENT_DEV_SKILL_MANAGER || join(SCRIPT_DIR, "manage-skill-links.mjs"));
const MARKETPLACE_MANAGER = resolve(
  process.env.AGENT_DEV_MARKETPLACE_MANAGER
    || join(HOME_PATH, ".agents", "skills", "plugin-creator-agent-plugins", "scripts", "assemble-plugin-marketplace.mjs"),
);
const TOP_LEVEL_KEYS = new Set(["$schema", "schemaVersion", "plugins", "marketplaces"]);
const PLUGIN_KEYS = new Set(["repository", "config", "runner"]);
const MARKETPLACE_KEYS = new Set(["root"]);

const HELP = `Manage local Agent Skill, Agent Plugin, and Marketplace development

Usage:
  agent dev
  agent dev skill check
  agent dev skill sync
  agent dev plugin check [<name>]
  agent dev plugin sync [<name>]
  agent dev marketplace check [<name>]
  agent dev marketplace sync [<name>]

Behavior:
  check  Validate or detect drift without changing managed state.
  sync   Reconcile the selected derived state from its source of truth.

Plugin sync installs from a repository-owned local Marketplace. Marketplace sync
assembles a separate shared distribution. Neither command makes an installed or
distributed copy the editable source. Plugin sync refuses to run while a
same-named user-scoped skill entry is active.

Configuration:
  ~/.agents/development.json

Running without a mutating subcommand displays help or configured target names
and does not change links, plugin installations, or Marketplace distributions.`;

function fail(message, exitCode = 1) {
  const error = new Error(message);
  error.exitCode = exitCode;
  throw error;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertKnownKeys(value, keys, label) {
  if (!isObject(value)) fail(`${label} must be a JSON object.`);
  const unknown = Object.keys(value).filter((key) => !keys.has(key));
  if (unknown.length > 0) fail(`${label} has unknown fields: ${unknown.join(", ")}.`);
}

function assertTargetName(name, label) {
  if (name.trim() === "" || /[\r\n]/u.test(name)) fail(`${label} names must be non-empty and single-line.`);
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

function readConfiguration() {
  const config = readJson(CONFIG_PATH, displayPath(CONFIG_PATH));
  assertKnownKeys(config, TOP_LEVEL_KEYS, "development.json");
  if (config.schemaVersion !== 1) fail("development.json.schemaVersion must be 1.");
  const plugins = config.plugins ?? {};
  const marketplaces = config.marketplaces ?? {};
  if (!isObject(plugins)) fail("development.json.plugins must be an object.");
  if (!isObject(marketplaces)) fail("development.json.marketplaces must be an object.");
  for (const [name, entry] of Object.entries(plugins)) {
    assertTargetName(name, "Plugin target");
    assertKnownKeys(entry, PLUGIN_KEYS, `plugins.${name}`);
    if (!entry.repository || !entry.config) fail(`plugins.${name} requires repository and config.`);
  }
  for (const [name, entry] of Object.entries(marketplaces)) {
    assertTargetName(name, "Marketplace target");
    assertKnownKeys(entry, MARKETPLACE_KEYS, `marketplaces.${name}`);
    if (!entry.root) fail(`marketplaces.${name} requires root.`);
  }
  return { plugins, marketplaces };
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

function pluginContext(name, entry, includePluginRoot) {
  const repository = expandPath(entry.repository, `plugins.${name}.repository`);
  if (!existsSync(repository) || !statSync(repository).isDirectory()) fail(`Plugin repository does not exist: ${name}.`);
  const realRepository = realpathSync(repository);
  const config = resolveRepositoryPath(realRepository, entry.config, `plugins.${name}.config`);
  const runner = resolveRepositoryPath(realRepository, entry.runner ?? "scripts/local-plugin.mjs", `plugins.${name}.runner`);
  if (!includePluginRoot) return { repository: realRepository, config, runner };
  const repositoryConfig = readJson(config, `plugins.${name}.config`);
  const pluginRoot = resolveRepositoryPath(
    realRepository,
    repositoryConfig.pluginRoot,
    `plugins.${name}.config pluginRoot`,
    "directory",
  );
  return { repository: realRepository, config, runner, pluginRoot };
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
  const context = pluginContext(name, entry, action === "sync");
  if (action === "sync") {
    const conflicts = activeUserSkillEntries(context.pluginRoot);
    if (conflicts.length > 0) {
      fail(
        `Plugin ${name} has active user-scoped entries for: ${conflicts.join(", ")}. `
        + "Disable those entries or use an isolated user environment before plugin sync.",
      );
    }
  }
  return runNode(
    context.runner,
    [action === "check" ? "validate" : "install", "--config", context.config],
    [[context.repository, `<plugin:${name}>`], [HOME_PATH, "~"]],
  );
}

function handleMarketplace(action, requestedName, config) {
  const [name, entry] = selectTarget(config.marketplaces, requestedName, "marketplace");
  const root = expandPath(entry.root, `marketplaces.${name}.root`);
  return runNode(
    MARKETPLACE_MANAGER,
    [action, root],
    [[root, `<marketplace:${name}>`], [HOME_PATH, "~"]],
  );
}

function printTargets(config) {
  console.log(`Plugins:      ${Object.keys(config.plugins).sort().join(", ") || "(none)"}`);
  console.log(`Marketplaces: ${Object.keys(config.marketplaces).sort().join(", ") || "(none)"}`);
  console.log("");
  console.log(HELP);
}

function parseInvocation(argv) {
  if (argv.length === 0 || ["-h", "--help", "help"].includes(argv[0])) return { help: true };
  if (argv[0] !== "dev") fail(`Unknown command: ${argv[0]}. Only "dev" is currently supported.`, 2);
  if (argv.length === 1) return { summary: true };
  const domain = argv[1];
  const action = argv[2];
  const target = argv[3];
  if (!["skill", "plugin", "marketplace"].includes(domain)) fail(`Unknown development target: ${domain ?? "(missing)"}.`, 2);
  if (!["check", "sync"].includes(action)) fail(`Choose check or sync for ${domain}.`, 2);
  if (domain === "skill" && target !== undefined) fail("skill does not accept a target name.", 2);
  if (argv.length > 4) fail(`Unexpected argument: ${argv[4]}.`, 2);
  return { domain, action, target };
}

try {
  const invocation = parseInvocation(process.argv.slice(2));
  if (invocation.help) console.log(HELP);
  else {
    if (invocation.domain === "skill") process.exitCode = handleSkill(invocation.action);
    else {
      const config = readConfiguration();
      if (invocation.summary) printTargets(config);
      else if (invocation.domain === "plugin") process.exitCode = handlePlugin(invocation.action, invocation.target, config);
      else process.exitCode = handleMarketplace(invocation.action, invocation.target, config);
    }
  }
} catch (error) {
  console.error(`agent: ${sanitizeOutput(error.message, [[HOME_PATH, "~"]])}`);
  if (error.exitCode === 2) console.error("\nRun agent --help for usage.");
  process.exitCode = error.exitCode ?? 1;
}
