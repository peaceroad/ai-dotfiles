#!/usr/bin/env node

// @plugin-creator-agent-plugins managed-local-runner v1

import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const SCRIPT_NAME = basename(SCRIPT_PATH);
const VALIDATOR_PATH = join(SCRIPT_DIR, "validate-agent-plugin.mjs");
const COMMANDS = new Set(["status", "validate", "install"]);
const SCRIPT_EXTENSIONS = new Set([".cjs", ".js", ".mjs"]);
const VERSION_POLICIES = new Set(["bump", "keep"]);
const CONFIG_DIRECTORY = join(".agents", "plugin-development");
const CONFIG_SCHEMA_NAME = "schema.json";
const CONFIG_PATH_PATTERN = ".agents/plugin-development/<plugin-name>.json";
const CONFIG_FIELDS = new Set([
  "$schema",
  "schemaVersion",
  "pluginRoot",
  "marketplaceRoot",
  "versionPolicy",
  "minimumNodeMajor",
  "checks",
]);
const CHECK_FIELDS = new Set(["name", "command", "args", "cwd"]);
const HOME_PATH = resolve(homedir());
const DEFAULT_PERSONAL_MARKETPLACE = join(
  HOME_PATH,
  ".agents",
  "plugins",
  "marketplace.json",
);
const HOME_OUTPUT_VARIANTS = [
  `\\\\?\\${HOME_PATH}`,
  HOME_PATH.replaceAll("\\", "/"),
  HOME_PATH,
].sort((left, right) => right.length - left.length);

const HELP = `Manage a local Agent Plugins v1 package

Usage:
  node ${SCRIPT_NAME} status [<plugin-root> | --config <path>] [--marketplace-root <root>]
  node ${SCRIPT_NAME} validate [<plugin-root> | --config <path>]
  node ${SCRIPT_NAME} install [<plugin-root> | --config <path>] [--marketplace-root <root>] [--bump-version | --keep-version]

Commands:
  status    Show the source manifest, local marketplace, and Codex snapshot.
  validate  Validate the portable Agent Plugins v1 package without changing it.
  install   Validate, optionally update local-development version metadata,
            install from the matching local marketplace, and verify the snapshot.

Options:
  --config <path>            Use a ${CONFIG_PATH_PATTERN} file explicitly.
  --marketplace-root <root>  Use a specific root containing
                             .agents/plugins/marketplace.json.
  --bump-version             Replace existing build metadata with
                             +agent.<UTC timestamp> before installation.
  --keep-version             Install without changing plugin.json version.
  -h, --help                 Show this help.

Version policy:
  install automatically bumps a version that already ends in +agent.<timestamp>.
  A discovered repository configuration may choose "bump" or "keep".
  Otherwise choose --bump-version or --keep-version explicitly. A missing version
  is never invented; use --keep-version or add a repository-owned version first.

Repository configuration:
  If <plugin-root> and --config are omitted, configurations are discovered from
  the working directory or this script's repository. Exactly one is selected
  automatically; multiple configurations require --config. A configuration may
  define repository-specific validation checks.

This tool validates the portable package and Codex installation boundary. Without
repository configuration, run repository-specific tests separately. Configured
checks are repository-owned, read-only validation commands. Running without
arguments displays this help and does not change files, marketplaces, or installed
plugins.`;

function fail(message, exitCode = 1) {
  const error = new Error(message);
  error.exitCode = exitCode;
  throw error;
}

function parseArgs(argv) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === "help")) {
    return { help: true };
  }

  let command;
  let pluginRoot;
  let configPath;
  let marketplaceRoot;
  let bumpVersion = false;
  let keepVersion = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "-h" || arg === "--help") {
      help = true;
      continue;
    }
    if (arg === "--marketplace-root") {
      index += 1;
      if (index >= argv.length) {
        fail("--marketplace-root requires a path.", 2);
      }
      marketplaceRoot = argv[index];
      continue;
    }
    if (arg === "--config") {
      index += 1;
      if (index >= argv.length) {
        fail("--config requires a path.", 2);
      }
      configPath = argv[index];
      continue;
    }
    if (arg === "--bump-version") {
      bumpVersion = true;
      continue;
    }
    if (arg === "--keep-version") {
      keepVersion = true;
      continue;
    }
    if (arg.startsWith("-")) {
      fail(`Unknown option: ${arg}`, 2);
    }
    if (command === undefined) {
      command = arg;
      continue;
    }
    if (pluginRoot === undefined) {
      pluginRoot = arg;
      continue;
    }
    fail(`Unexpected argument: ${arg}`, 2);
  }

  if (help) {
    return { help: true };
  }
  if (!COMMANDS.has(command)) {
    fail(`Unknown command: ${command ?? "(missing)"}`, 2);
  }
  if (pluginRoot !== undefined && configPath !== undefined) {
    fail("Choose either <plugin-root> or --config, not both.", 2);
  }
  if (bumpVersion && keepVersion) {
    fail("Choose only one of --bump-version and --keep-version.", 2);
  }
  if (command !== "install" && (bumpVersion || keepVersion)) {
    fail("Version options apply only to install.", 2);
  }
  if (command === "validate" && marketplaceRoot !== undefined) {
    fail("validate does not use --marketplace-root.", 2);
  }

  return {
    command,
    pluginRoot: pluginRoot === undefined ? undefined : resolve(pluginRoot),
    configPath: configPath === undefined ? undefined : resolve(configPath),
    marketplaceRoot:
      marketplaceRoot === undefined ? undefined : resolve(marketplaceRoot),
    bumpVersion,
    keepVersion,
  };
}

function normalizedPath(pathValue) {
  const withoutDevicePrefix = pathValue.startsWith("\\\\?\\")
    ? pathValue.slice(4)
    : pathValue;
  let absolutePath = resolve(withoutDevicePrefix);
  if (existsSync(absolutePath)) {
    absolutePath = realpathSync(absolutePath);
  }
  return process.platform === "win32"
    ? absolutePath.toLowerCase()
    : absolutePath;
}

function samePath(left, right) {
  return normalizedPath(left) === normalizedPath(right);
}

function isWithin(parent, candidate) {
  const pathFromParent = relative(parent, candidate);
  return (
    pathFromParent === ""
    || (
      pathFromParent !== ".."
      && !pathFromParent.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
      && !isAbsolute(pathFromParent)
    )
  );
}

function displayPath(pathValue) {
  const absolutePath = resolve(pathValue);
  if (samePath(HOME_PATH, absolutePath)) {
    return "~";
  }
  const pathFromHome = relative(HOME_PATH, absolutePath);
  if (isWithin(HOME_PATH, absolutePath)) {
    return `~/${pathFromHome.replaceAll("\\", "/")}`;
  }
  return `[external]/${basename(absolutePath)}`;
}

function sanitizeOutput(value) {
  let sanitized = String(value);
  for (const variant of HOME_OUTPUT_VARIANTS) {
    sanitized = sanitized.replaceAll(variant, "~");
  }
  return sanitized;
}

function run(command, args, { capture = false, cwd = process.cwd() } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: false,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.error) {
    fail(`Could not start command: ${sanitizeOutput(result.error.message)}`);
  }
  if (result.status !== 0) {
    const details = capture
      ? sanitizeOutput([result.stdout, result.stderr].filter(Boolean).join("\n").trim())
      : "";
    fail(
      `Command failed with exit code ${result.status}: ${basename(command)}`
      + (details ? `\n${details}` : ""),
    );
  }
  return capture ? result.stdout.trim() : "";
}

function findWindowsCommands(name) {
  const result = spawnSync("where.exe", [name], {
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) {
    return [];
  }
  return result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getCodexCommand() {
  const override = process.env.AGENT_PLUGIN_CODEX_CLI;
  if (override) {
    const resolvedOverride = resolve(override);
    if (!existsSync(resolvedOverride)) {
      fail("AGENT_PLUGIN_CODEX_CLI points to a missing file.");
    }
    if (SCRIPT_EXTENSIONS.has(extname(resolvedOverride))) {
      return { command: process.execPath, prefixArgs: [resolvedOverride] };
    }
    return { command: resolvedOverride, prefixArgs: [] };
  }

  if (process.platform !== "win32") {
    return { command: "codex", prefixArgs: [] };
  }

  const npmBinDirectories = new Set(
    findWindowsCommands("codex.cmd").map((pathValue) => dirname(pathValue)),
  );
  if (process.env.APPDATA) {
    npmBinDirectories.add(join(process.env.APPDATA, "npm"));
  }
  for (const npmBinDirectory of npmBinDirectories) {
    const cliEntry = join(
      npmBinDirectory,
      "node_modules",
      "@openai",
      "codex",
      "bin",
      "codex.js",
    );
    if (existsSync(cliEntry)) {
      return { command: process.execPath, prefixArgs: [cliEntry] };
    }
  }

  for (const executable of findWindowsCommands("codex.exe")) {
    if (existsSync(executable)) {
      return { command: executable, prefixArgs: [] };
    }
  }
  fail("Could not locate the Codex CLI.");
}

function runCodex(codex, args, options = {}) {
  return run(codex.command, [...codex.prefixArgs, ...args], options);
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function listConfigFiles(repositoryRoot) {
  const configDirectory = join(repositoryRoot, CONFIG_DIRECTORY);
  if (!existsSync(configDirectory) || !statSync(configDirectory).isDirectory()) {
    return [];
  }
  return readdirSync(configDirectory, { withFileTypes: true })
    .filter((entry) => (
      entry.isFile()
      && entry.name.endsWith(".json")
      && entry.name !== CONFIG_SCHEMA_NAME
    ))
    .map((entry) => join(configDirectory, entry.name))
    .sort((left, right) => left.localeCompare(right, "en"));
}

function findConfigsFrom(startPath) {
  let current = resolve(startPath);
  while (true) {
    const candidates = listConfigFiles(current);
    if (candidates.length > 0) {
      return candidates;
    }
    const parent = dirname(current);
    if (parent === current) {
      return [];
    }
    current = parent;
  }
}

function discoverConfigPath() {
  const candidates = [
    ...findConfigsFrom(process.cwd()),
    ...findConfigsFrom(dirname(SCRIPT_DIR)),
  ];
  const unique = candidates.filter(
    (candidate, index) => candidates.findIndex((other) => samePath(candidate, other)) === index,
  );
  if (unique.length === 0) {
    fail(
      `No <plugin-root> was given and no ${CONFIG_PATH_PATTERN} file could be found.`,
      2,
    );
  }
  if (unique.length > 1) {
    fail(
      `Multiple repository configurations were found. Use --config explicitly:\n${unique.map(displayPath).join("\n")}`,
      2,
    );
  }
  return unique[0];
}

function assertKnownFields(object, allowedFields, label) {
  if (object === null || typeof object !== "object" || Array.isArray(object)) {
    fail(`${label} must be a JSON object.`);
  }
  const unknown = Object.keys(object).filter((field) => !allowedFields.has(field));
  if (unknown.length > 0) {
    fail(`${label} has unknown fields: ${unknown.join(", ")}.`);
  }
}

function resolveRepositoryPath(
  repositoryRoot,
  pathValue,
  label,
  { mustExist = true, requireDirectory = false } = {},
) {
  if (typeof pathValue !== "string" || pathValue.length === 0) {
    fail(`${label} must be a non-empty repository-relative path.`);
  }
  if (isAbsolute(pathValue)) {
    fail(`${label} must be repository-relative.`);
  }
  const resolvedPath = resolve(repositoryRoot, pathValue);
  if (!isWithin(repositoryRoot, resolvedPath)) {
    fail(`${label} escapes the repository root.`);
  }
  const pathExists = existsSync(resolvedPath);
  if (mustExist && !pathExists) {
    fail(`${label} does not exist: ${pathValue}`);
  }
  if (pathExists) {
    if (!isWithin(normalizedPath(repositoryRoot), normalizedPath(resolvedPath))) {
      fail(`${label} resolves outside the repository root.`);
    }
    if (requireDirectory && !statSync(resolvedPath).isDirectory()) {
      fail(`${label} must point to a directory.`);
    }
  }
  return resolvedPath;
}

function normalizeRepositoryCheck(check, index, repositoryRoot, configLabel) {
  const label = `${configLabel}.checks[${index}]`;
  assertKnownFields(check, CHECK_FIELDS, label);
  if (
    typeof check.name !== "string"
    || check.name.trim().length === 0
    || /[\r\n]/u.test(check.name)
  ) {
    fail(`${label}.name must be a non-empty single-line string.`);
  }
  if (typeof check.command !== "string" || check.command.length === 0) {
    fail(`${label}.command must be a non-empty string.`);
  }
  const args = check.args ?? [];
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
    fail(`${label}.args must be an array of strings.`);
  }
  const cwd = resolveRepositoryPath(
    repositoryRoot,
    check.cwd ?? ".",
    `${label}.cwd`,
    { requireDirectory: true },
  );
  let command = check.command;
  if (command === "${NODE}") {
    command = process.execPath;
  } else if (/[\\/]/u.test(command) || command.startsWith(".")) {
    command = resolveRepositoryPath(
      repositoryRoot,
      command,
      `${label}.command`,
      { requireDirectory: false },
    );
    if (statSync(command).isDirectory()) {
      fail(`${label}.command must not point to a directory.`);
    }
  }
  return { name: check.name.trim(), command, args, cwd };
}

function readRepositoryConfig(configPath) {
  const absoluteConfigPath = resolve(configPath);
  const configDirectory = dirname(absoluteConfigPath);
  const repositoryRoot = resolve(configDirectory, "..", "..");
  const expectedDirectory = join(repositoryRoot, CONFIG_DIRECTORY);
  const configName = basename(absoluteConfigPath);
  if (
    !samePath(configDirectory, expectedDirectory)
    || !configName.endsWith(".json")
    || configName === CONFIG_SCHEMA_NAME
  ) {
    fail(`Repository configuration must match ${CONFIG_PATH_PATTERN}.`);
  }
  const configLabel = configName;
  const config = parseJson(
    readFileSync(absoluteConfigPath, "utf8"),
    displayPath(absoluteConfigPath),
  );
  assertKnownFields(config, CONFIG_FIELDS, configLabel);
  if (config.schemaVersion !== 1) {
    fail(`${configLabel}.schemaVersion must be 1.`);
  }
  if ("$schema" in config && typeof config.$schema !== "string") {
    fail(`${configLabel}.$schema must be a string.`);
  }
  if (
    config.versionPolicy !== undefined
    && !VERSION_POLICIES.has(config.versionPolicy)
  ) {
    fail(`${configLabel}.versionPolicy must be "bump" or "keep".`);
  }
  if (
    config.minimumNodeMajor !== undefined
    && (!Number.isInteger(config.minimumNodeMajor) || config.minimumNodeMajor < 1)
  ) {
    fail(`${configLabel}.minimumNodeMajor must be a positive integer.`);
  }
  const checks = config.checks ?? [];
  if (!Array.isArray(checks)) {
    fail(`${configLabel}.checks must be an array.`);
  }
  return {
    configPath: absoluteConfigPath,
    repositoryRoot,
    pluginRoot: resolveRepositoryPath(
      repositoryRoot,
      config.pluginRoot,
      `${configLabel}.pluginRoot`,
      { requireDirectory: true },
    ),
    marketplaceRoot: resolveRepositoryPath(
      repositoryRoot,
      config.marketplaceRoot ?? ".",
      `${configLabel}.marketplaceRoot`,
      { requireDirectory: true },
    ),
    versionPolicy: config.versionPolicy,
    minimumNodeMajor: config.minimumNodeMajor,
    checks: checks.map((check, index) => (
      normalizeRepositoryCheck(check, index, repositoryRoot, configLabel)
    )),
  };
}

function resolveInvocation(options) {
  if (options.pluginRoot !== undefined) {
    return { ...options, checks: [] };
  }
  const config = readRepositoryConfig(
    options.configPath ?? discoverConfigPath(),
  );
  if (config.minimumNodeMajor !== undefined) {
    const currentMajor = Number.parseInt(process.versions.node.split(".", 1)[0], 10);
    if (currentMajor < config.minimumNodeMajor) {
      fail(
        `Node.js ${config.minimumNodeMajor} or later is required by ${displayPath(config.configPath)}. Current: ${process.versions.node}`,
      );
    }
  }
  return {
    ...options,
    pluginRoot: config.pluginRoot,
    marketplaceRoot: options.marketplaceRoot ?? config.marketplaceRoot,
    versionPolicy: config.versionPolicy,
    checks: config.checks,
    repositoryRoot: config.repositoryRoot,
    configPath: config.configPath,
  };
}

function runRepositoryChecks(options) {
  for (const check of options.checks) {
    console.log(`Repository check: ${check.name}`);
    try {
      run(check.command, check.args, { cwd: check.cwd });
    } catch (error) {
      fail(`Repository check failed: ${check.name}\n${error.message}`);
    }
  }
}

function readPluginContext(options) {
  const manifestInfo = readManifest(options.pluginRoot);
  validatePluginName(manifestInfo.manifest);
  if (options.configPath !== undefined) {
    const configuredName = basename(options.configPath, ".json");
    if (configuredName !== manifestInfo.manifest.name) {
      fail(
        `Configuration filename ${configuredName}.json must match plugin name ${manifestInfo.manifest.name}.`,
      );
    }
  }
  const marketplace = findMarketplace(
    options.pluginRoot,
    manifestInfo.manifest.name,
    options.marketplaceRoot,
  );
  return { manifestInfo, marketplace };
}

function readManifest(pluginRoot) {
  const manifestPath = join(pluginRoot, "plugin.json");
  let source;
  try {
    source = readFileSync(manifestPath, "utf8");
  } catch (error) {
    fail(`Could not read ${displayPath(manifestPath)}: ${error.code ?? error.message}`);
  }
  const manifest = parseJson(source, "plugin.json");
  return { manifestPath, source, manifest };
}

function runPortableValidation(pluginRoot) {
  if (!existsSync(VALIDATOR_PATH)) {
    fail("The bundled Agent Plugins validator is missing.");
  }
  run(process.execPath, [VALIDATOR_PATH, pluginRoot], { cwd: SCRIPT_DIR });
}

function readMarketplaceAtRoot(marketplaceRoot, pluginRoot, pluginName) {
  const marketplacePath = join(
    marketplaceRoot,
    ".agents",
    "plugins",
    "marketplace.json",
  );
  if (!existsSync(marketplacePath)) {
    return null;
  }
  const marketplace = parseJson(
    readFileSync(marketplacePath, "utf8"),
    displayPath(marketplacePath),
  );
  if (typeof marketplace.name !== "string" || marketplace.name.length === 0) {
    fail(`${displayPath(marketplacePath)} has no valid marketplace name.`);
  }
  if (!Array.isArray(marketplace.plugins)) {
    fail(`${displayPath(marketplacePath)} has no plugins array.`);
  }

  const matches = marketplace.plugins.filter((entry) => {
    if (
      entry?.name !== pluginName
      || entry?.source?.source !== "local"
      || typeof entry?.source?.path !== "string"
    ) {
      return false;
    }
    return samePath(resolve(marketplaceRoot, entry.source.path), pluginRoot);
  });
  if (matches.length > 1) {
    fail(`Marketplace ${marketplace.name} contains duplicate local entries for ${pluginName}.`);
  }
  if (matches.length === 0) {
    return null;
  }
  return {
    marketplaceRoot,
    marketplacePath,
    marketplaceName: marketplace.name,
  };
}

function findMarketplace(pluginRoot, pluginName, explicitRoot) {
  if (explicitRoot !== undefined) {
    const match = readMarketplaceAtRoot(explicitRoot, pluginRoot, pluginName);
    if (match === null) {
      fail(
        `${displayPath(explicitRoot)} does not contain a local marketplace entry for ${pluginName}.`,
      );
    }
    return match;
  }

  let current = pluginRoot;
  while (true) {
    const match = readMarketplaceAtRoot(current, pluginRoot, pluginName);
    if (match !== null) {
      return match;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  const personalMatch = readMarketplaceAtRoot(
    HOME_PATH,
    pluginRoot,
    pluginName,
  );
  if (personalMatch !== null) {
    return personalMatch;
  }
  fail(
    `Could not find a local marketplace entry that points to ${displayPath(pluginRoot)}.`,
  );
}

function readCodexJson(codex, args, label) {
  const output = runCodex(codex, args, { capture: true });
  return parseJson(output, label);
}

function getRegisteredMarketplaces(codex) {
  const payload = readCodexJson(
    codex,
    ["plugin", "marketplace", "list", "--json"],
    "Codex marketplace list",
  );
  return Array.isArray(payload.marketplaces) ? payload.marketplaces : [];
}

function registrationState(codex, marketplace) {
  const registrations = getRegisteredMarketplaces(codex);
  const sameName = registrations.filter(
    (entry) => entry?.name === marketplace.marketplaceName,
  );
  if (sameName.length > 1) {
    fail(
      `Marketplace name ${marketplace.marketplaceName} is registered more than once.`,
    );
  }
  if (sameName.length === 1) {
    const [registration] = sameName;
    if (
      typeof registration?.root === "string"
      && samePath(registration.root, marketplace.marketplaceRoot)
    ) {
      return { registered: true, implicit: false };
    }
    fail(
      `Marketplace name ${marketplace.marketplaceName} is registered to a different root.`,
    );
  }
  if (samePath(marketplace.marketplacePath, DEFAULT_PERSONAL_MARKETPLACE)) {
    return { registered: true, implicit: true };
  }
  return { registered: false, implicit: false };
}

function ensureMarketplaceRegistered(codex, marketplace) {
  const before = registrationState(codex, marketplace);
  if (before.registered) {
    return before;
  }
  runCodex(
    codex,
    ["plugin", "marketplace", "add", marketplace.marketplaceRoot],
    { capture: true },
  );
  const after = registrationState(codex, marketplace);
  if (!after.registered) {
    fail(`Codex did not register marketplace ${marketplace.marketplaceName}.`);
  }
  console.log(`Registered marketplace: ${marketplace.marketplaceName}`);
  return after;
}

function getPluginSnapshot(codex, pluginName, marketplaceName, pluginRoot) {
  const payload = readCodexJson(
    codex,
    ["plugin", "list", "--available", "--json"],
    "Codex plugin list",
  );
  const entries = [
    ...(Array.isArray(payload.installed) ? payload.installed : []),
    ...(Array.isArray(payload.available) ? payload.available : []),
  ].filter(
    (entry) => entry?.name === pluginName
      && entry?.marketplaceName === marketplaceName,
  );
  const matchingSource = entries.find(
    (entry) => typeof entry?.source?.path === "string"
      && samePath(entry.source.path, pluginRoot),
  );
  return matchingSource ?? entries[0] ?? null;
}

function formatVersion(version) {
  return typeof version === "string" && version.length > 0
    ? version
    : "(not set)";
}

function printStatus({ pluginRoot, manifest, marketplace, registration, snapshot }) {
  console.log(`Plugin:           ${manifest.name}`);
  console.log(`Source version:   ${formatVersion(manifest.version)}`);
  console.log(`Plugin root:      ${displayPath(pluginRoot)}`);
  console.log(`Marketplace:      ${marketplace.marketplaceName}`);
  console.log(`Marketplace root: ${displayPath(marketplace.marketplaceRoot)}`);
  console.log(
    `Registration:     ${registration.registered ? (registration.implicit ? "implicit" : "registered") : "not registered"}`,
  );
  if (snapshot === null) {
    console.log("Codex snapshot:   not found");
    return;
  }
  console.log(`Codex version:    ${formatVersion(snapshot.version)}`);
  console.log(`Installed:        ${snapshot.installed === true ? "yes" : "no"}`);
  console.log(`Enabled:          ${snapshot.enabled === true ? "yes" : "no"}`);
}

function utcTimestamp(now = new Date()) {
  return now.toISOString().replace(/\D/gu, "").slice(0, 17);
}

function hasManagedVersion(version) {
  return typeof version === "string" && /\+agent\.\d{14,17}$/u.test(version);
}

function chooseVersionPolicy(manifest, options) {
  if (options.bumpVersion) {
    return "bump";
  }
  if (options.keepVersion) {
    return "keep";
  }
  if (options.versionPolicy !== undefined) {
    return options.versionPolicy;
  }
  if (hasManagedVersion(manifest.version)) {
    return "bump";
  }
  fail(
    "Choose --bump-version or --keep-version for install. Existing +agent.<timestamp> versions are bumped automatically.",
    2,
  );
}

function updateManifestVersion(manifestInfo) {
  const currentVersion = manifestInfo.manifest.version;
  if (typeof currentVersion !== "string" || currentVersion.length === 0) {
    fail("plugin.json has no version to bump. Add a repository-owned version or use --keep-version.");
  }
  const baseVersion = currentVersion.split("+", 1)[0];
  const nextVersion = `${baseVersion}+agent.${utcTimestamp()}`;
  const updatedManifest = { ...manifestInfo.manifest, version: nextVersion };
  writeFileSync(
    manifestInfo.manifestPath,
    `${JSON.stringify(updatedManifest, null, 2)}\n`,
    "utf8",
  );
  return nextVersion;
}

function validatePluginName(manifest) {
  if (typeof manifest.name !== "string" || manifest.name.length === 0) {
    fail("plugin.json has no valid name.");
  }
}

function handleStatus(options) {
  const { manifestInfo, marketplace } = readPluginContext(options);
  const codex = getCodexCommand();
  const registration = registrationState(codex, marketplace);
  const snapshot = getPluginSnapshot(
    codex,
    manifestInfo.manifest.name,
    marketplace.marketplaceName,
    options.pluginRoot,
  );
  printStatus({
    pluginRoot: options.pluginRoot,
    manifest: manifestInfo.manifest,
    marketplace,
    registration,
    snapshot,
  });
}

function handleValidate(options) {
  runPortableValidation(options.pluginRoot);
  if (options.repositoryRoot !== undefined) {
    readPluginContext(options);
  }
  runRepositoryChecks(options);
}

function handleInstall(options) {
  runPortableValidation(options.pluginRoot);
  const { manifestInfo, marketplace } = readPluginContext(options);
  runRepositoryChecks(options);
  const versionPolicy = chooseVersionPolicy(manifestInfo.manifest, options);
  let sourceVersion = manifestInfo.manifest.version;

  if (versionPolicy === "bump") {
    sourceVersion = updateManifestVersion(manifestInfo);
    try {
      runPortableValidation(options.pluginRoot);
    } catch (error) {
      writeFileSync(manifestInfo.manifestPath, manifestInfo.source, "utf8");
      throw error;
    }
    console.log(`Updated source version: ${sourceVersion}`);
  }

  const codex = getCodexCommand();
  ensureMarketplaceRegistered(codex, marketplace);
  const installResult = readCodexJson(
    codex,
    [
      "plugin",
      "add",
      `${manifestInfo.manifest.name}@${marketplace.marketplaceName}`,
      "--json",
    ],
    "Codex plugin add",
  );
  if (
    typeof installResult.installedPath !== "string"
    || installResult.installedPath.trim().length === 0
  ) {
    fail("Codex plugin add did not report installedPath.");
  }
  const installedManifest = readManifest(installResult.installedPath).manifest;
  if (installedManifest.name !== manifestInfo.manifest.name) {
    fail("The installed manifest reports a different plugin name.");
  }
  if (
    typeof sourceVersion === "string"
    && sourceVersion.length > 0
    && installedManifest.version !== sourceVersion
  ) {
    fail(
      `Installed manifest version ${formatVersion(installedManifest.version)} does not match source version ${sourceVersion}.`,
    );
  }

  const snapshot = getPluginSnapshot(
    codex,
    manifestInfo.manifest.name,
    marketplace.marketplaceName,
    options.pluginRoot,
  );
  if (snapshot === null || snapshot.installed !== true) {
    fail("Codex did not report the plugin as installed.");
  }
  if (
    typeof sourceVersion === "string"
    && sourceVersion.length > 0
    && snapshot.version !== sourceVersion
  ) {
    fail(
      `Installed version ${formatVersion(snapshot.version)} does not match source version ${sourceVersion}.`,
    );
  }
  if (
    typeof snapshot?.source?.path === "string"
    && !samePath(snapshot.source.path, options.pluginRoot)
  ) {
    fail("Codex installed the plugin from a different source path.");
  }

  console.log(
    `Installed: ${manifestInfo.manifest.name}@${marketplace.marketplaceName}`
    + ` (${formatVersion(snapshot.version)})`,
  );
  console.log(`Verified installed root: ${displayPath(installResult.installedPath)}`);
  console.log("Start a new Codex task to load the updated plugin components.");
}

try {
  const parsedOptions = parseArgs(process.argv.slice(2));
  const options = parsedOptions.help ? parsedOptions : resolveInvocation(parsedOptions);
  if (options.help) {
    console.log(HELP);
  } else if (options.command === "status") {
    handleStatus(options);
  } else if (options.command === "validate") {
    handleValidate(options);
  } else {
    handleInstall(options);
  }
} catch (error) {
  console.error(`Error: ${sanitizeOutput(error.message)}`);
  if (error.exitCode === 2) {
    console.error("");
    console.error(HELP);
  }
  process.exitCode = error.exitCode ?? 1;
}
