#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const SKILL_ROOT = resolve(SCRIPT_DIR, "..");
const ASSET_ROOT = join(SKILL_ROOT, "assets", "repository-management");
const COMMANDS = new Set(["import", "init", "prepare", "refresh"]);
const CONFIG_DIRECTORY = join(".agents", "plugin-development");
const CONFIG_SCHEMA_NAME = "schema.json";
const CONFIG_PATH_PATTERN = ".agents/plugin-development/<plugin-name>.json";
const MANAGED_FILES = [
  {
    source: join(ASSET_ROOT, "plugin-development.schema.json"),
    target: join(CONFIG_DIRECTORY, CONFIG_SCHEMA_NAME),
    marker: "urn:plugin-creator-agent-plugins:agent-plugin-development-schema:v1",
  },
  {
    source: join(SCRIPT_DIR, "manage-local-agent-plugin.mjs"),
    target: join("scripts", "local-plugin.mjs"),
    marker: "@plugin-creator-agent-plugins managed-local-runner v1",
  },
  {
    source: join(SCRIPT_DIR, "validate-agent-plugin.mjs"),
    target: join("scripts", "validate-agent-plugin.mjs"),
    marker: "@plugin-creator-agent-plugins managed-portable-validator v1",
  },
];

const HELP = `Scaffold repository-owned local Agent Plugin management

Usage:
  node scaffold-local-agent-plugin.mjs init <repository-root> <plugin-root> [--marketplace-root <root>] [--bump-version | --keep-version]
  node scaffold-local-agent-plugin.mjs prepare <repository-root> <plugin-root> <pending-output> [--marketplace-root <root>] [--bump-version | --keep-version]
  node scaffold-local-agent-plugin.mjs import <repository-root> <pending-config>
  node scaffold-local-agent-plugin.mjs refresh <repository-root> [--check]

Commands:
  init     Create a per-plugin repository configuration and any missing managed files.
  prepare  Write only a new pending configuration to an explicit path. Import it
           later from a terminal that can write the repository scaffold paths.
  import   Copy a prepared configuration into its per-plugin location, create any
           missing managed files, and validate it. The source file is retained.
  refresh  Update changed runner, validator, and shared schema files, then
           validate every configured plugin.

Options:
  --marketplace-root <root>  Repository-relative Marketplace root. Defaults to .
  --bump-version             Store versionPolicy "bump" in the repository config.
  --keep-version             Store versionPolicy "keep" in the repository config.
  --check                    With refresh, report template drift without writing.
  -h, --help                 Show this help.

init and import reuse byte-identical managed files but never overwrite
configurations or modified managed files. prepare never overwrites its output or
prepares a replacement for an existing Repository configuration.
import rolls back the copied configuration if validation fails and never deletes
its source. refresh never changes ${CONFIG_PATH_PATTERN}
files and refuses managed files without the generated marker.
refresh --check is read-only. Running without arguments displays this help without
changing the repository.`;

function fail(message, exitCode = 1) {
  const error = new Error(message);
  error.exitCode = exitCode;
  throw error;
}

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    return { help: true };
  }
  const command = argv[0];
  if (!COMMANDS.has(command)) {
    fail(`Unknown command: ${command}`, 2);
  }
  let repositoryRoot;
  let inputPath;
  let outputPath;
  let marketplaceRoot = ".";
  let bumpVersion = false;
  let keepVersion = false;
  let checkOnly = false;
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--marketplace-root") {
      index += 1;
      if (index >= argv.length) {
        fail("--marketplace-root requires a path.", 2);
      }
      marketplaceRoot = argv[index];
    } else if (arg === "--bump-version") {
      bumpVersion = true;
    } else if (arg === "--keep-version") {
      keepVersion = true;
    } else if (arg === "--check") {
      checkOnly = true;
    } else if (arg.startsWith("-")) {
      fail(`Unknown option: ${arg}`, 2);
    } else if (repositoryRoot === undefined) {
      repositoryRoot = arg;
    } else if (inputPath === undefined) {
      inputPath = arg;
    } else if (outputPath === undefined) {
      outputPath = arg;
    } else {
      fail(`Unexpected argument: ${arg}`, 2);
    }
  }
  if (repositoryRoot === undefined) {
    fail(`${command} requires <repository-root>.`, 2);
  }
  if (checkOnly && command !== "refresh") {
    fail("--check can be used only with refresh.", 2);
  }
  if (command === "refresh") {
    if (
      inputPath !== undefined
      || outputPath !== undefined
      || marketplaceRoot !== "."
      || bumpVersion
      || keepVersion
    ) {
      fail("refresh accepts only <repository-root> and optional --check.", 2);
    }
  } else if (command === "import") {
    if (inputPath === undefined) {
      fail("import requires <pending-config>.", 2);
    }
    if (outputPath !== undefined || marketplaceRoot !== "." || bumpVersion || keepVersion) {
      fail("import accepts only <repository-root> and <pending-config>.", 2);
    }
  } else {
    if (inputPath === undefined) {
      fail(`${command} requires <plugin-root>.`, 2);
    }
    if (command === "prepare" && outputPath === undefined) {
      fail("prepare requires <pending-output>.", 2);
    }
    if (command === "init" && outputPath !== undefined) {
      fail("init accepts only <repository-root> and <plugin-root>.", 2);
    }
    if (bumpVersion === keepVersion) {
      fail(`${command} requires exactly one of --bump-version and --keep-version.`, 2);
    }
  }
  return {
    command,
    repositoryRoot: resolve(repositoryRoot),
    pluginRoot: command === "init" || command === "prepare" ? inputPath : undefined,
    pendingConfig: command === "import" ? resolve(inputPath) : undefined,
    pendingOutput: command === "prepare" ? resolve(outputPath) : undefined,
    marketplaceRoot,
    versionPolicy: bumpVersion ? "bump" : "keep",
    checkOnly,
  };
}

function canonicalPath(pathValue) {
  const absolute = resolve(pathValue);
  const canonical = existsSync(absolute) ? realpathSync(absolute) : absolute;
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

function comparablePath(pathValue) {
  const absolute = resolve(pathValue);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

function isWithin(parent, candidate) {
  const fromParent = relative(parent, candidate);
  return fromParent === "" || (
    fromParent !== ".."
    && !fromParent.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    && !isAbsolute(fromParent)
  );
}

function resolveRepositoryRoot(repositoryRoot) {
  if (!existsSync(repositoryRoot) || !statSync(repositoryRoot).isDirectory()) {
    fail(`Repository root does not exist: ${repositoryRoot}`);
  }
  return realpathSync(repositoryRoot);
}

function repositoryRelativePath(repositoryRoot, pathValue, label) {
  const absolute = isAbsolute(pathValue)
    ? resolve(pathValue)
    : resolve(repositoryRoot, pathValue);
  if (!isWithin(canonicalPath(repositoryRoot), canonicalPath(absolute))) {
    fail(`${label} must stay within the repository root.`);
  }
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
    fail(`${label} must point to an existing directory.`);
  }
  const relativePath = relative(repositoryRoot, absolute).replaceAll("\\", "/");
  return relativePath || ".";
}

function validateInitInputs(options) {
  const pluginRoot = repositoryRelativePath(
    options.repositoryRoot,
    options.pluginRoot,
    "plugin-root",
  );
  const marketplaceRoot = repositoryRelativePath(
    options.repositoryRoot,
    options.marketplaceRoot,
    "marketplace-root",
  );
  const pluginPath = resolve(options.repositoryRoot, pluginRoot);
  const validation = spawnSync(
    process.execPath,
    [join(SCRIPT_DIR, "validate-agent-plugin.mjs"), pluginPath],
    {
      cwd: options.repositoryRoot,
      encoding: "utf8",
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (validation.error || validation.status !== 0) {
    const details = [validation.stdout, validation.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();
    fail(`Portable plugin validation failed.${details ? `\n${details}` : ""}`);
  }

  const manifest = JSON.parse(
    readFileSync(join(pluginPath, "plugin.json"), "utf8"),
  );
  if (
    typeof manifest.name !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(manifest.name)
    || manifest.name === "schema"
  ) {
    fail("plugin.json name cannot be used as a repository configuration filename.");
  }
  const marketplacePath = join(
    options.repositoryRoot,
    marketplaceRoot,
    ".agents",
    "plugins",
    "marketplace.json",
  );
  if (!existsSync(marketplacePath)) {
    fail(`Marketplace catalog does not exist: ${marketplacePath}`);
  }
  const marketplace = JSON.parse(readFileSync(marketplacePath, "utf8"));
  const namedEntries = Array.isArray(marketplace.plugins)
    ? marketplace.plugins.filter((entry) => entry?.name === manifest.name)
    : [];
  if (namedEntries.length > 1) {
    fail(`Marketplace contains duplicate entries for ${manifest.name}.`);
  }
  const [entry] = namedEntries;
  if (
    entry?.source?.source !== "local"
    || typeof entry.source.path !== "string"
    || canonicalPath(resolve(options.repositoryRoot, marketplaceRoot, entry.source.path))
      !== canonicalPath(pluginPath)
  ) {
    fail(`Marketplace must contain exactly one matching local entry for ${manifest.name}.`);
  }
  return { ...options, pluginName: manifest.name, pluginRoot, marketplaceRoot };
}

function inspectManagedFiles(repositoryRoot) {
  const states = [];
  for (const file of MANAGED_FILES) {
    if (!existsSync(file.source)) {
      fail(`Managed template source is missing: ${file.source}`);
    }
    const templateBytes = readFileSync(file.source);
    if (!templateBytes.includes(file.marker)) {
      fail(`Managed template marker is missing: ${file.source}`);
    }
    const target = join(repositoryRoot, file.target);
    if (!existsSync(target)) {
      states.push({ file, target, state: "missing" });
      continue;
    }
    const targetBytes = readFileSync(target);
    if (targetBytes.equals(templateBytes)) {
      states.push({ file, target, state: "current" });
    } else {
      states.push({
        file,
        target,
        state: targetBytes.includes(file.marker) ? "changed" : "unmanaged",
      });
    }
  }
  return states;
}

function copyManagedFiles(repositoryRoot, { refresh }) {
  const states = inspectManagedFiles(repositoryRoot);
  const conflicts = states
    .filter(({ state }) => state === "unmanaged" || (!refresh && state === "changed"))
    .map(({ file }) => file.target.replaceAll("\\", "/"));
  if (conflicts.length > 0) {
    fail(
      `${refresh ? "Unmanaged" : "Existing"} files would be overwritten:\n${conflicts.join("\n")}`,
    );
  }
  for (const { file, target, state } of states) {
    if (state === "current") {
      if (!refresh) {
        console.log(`Reused: ${file.target.replaceAll("\\", "/")}`);
      }
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(file.source, target);
    console.log(`${refresh ? "Refreshed" : "Created"}: ${file.target.replaceAll("\\", "/")}`);
  }
}

function checkManagedFiles(repositoryRoot) {
  const drift = inspectManagedFiles(repositoryRoot)
    .filter(({ state }) => state !== "current");
  if (drift.length === 0) {
    console.log("Managed files are current.");
    return;
  }
  const labels = {
    changed: "Changed",
    missing: "Missing",
    unmanaged: "Unmanaged",
  };
  fail(
    "Managed files differ from this skill's templates:\n"
    + drift
      .map(({ file, state }) => `${labels[state]}: ${file.target.replaceAll("\\", "/")}`)
      .join("\n")
    + "\nRun refresh without --check to update changed or missing files. Resolve unmanaged files before refreshing.",
  );
}

function configRelativePath(pluginName) {
  return join(CONFIG_DIRECTORY, `${pluginName}.json`);
}

function requireMissingRepositoryConfig(repositoryRoot, pluginName) {
  const relativeConfigPath = configRelativePath(pluginName);
  const configPath = join(repositoryRoot, relativeConfigPath);
  if (existsSync(configPath)) {
    fail(`${relativeConfigPath.replaceAll("\\", "/")} already exists.`);
  }
  return { configPath, relativeConfigPath };
}

function listRepositoryConfigs(repositoryRoot) {
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

function readPendingConfig(options) {
  if (
    !existsSync(options.pendingConfig)
    || !statSync(options.pendingConfig).isFile()
  ) {
    fail(`Pending configuration does not exist: ${options.pendingConfig}`);
  }
  const configDirectory = join(options.repositoryRoot, CONFIG_DIRECTORY);
  if (isWithin(canonicalPath(configDirectory), canonicalPath(options.pendingConfig))) {
    fail(`Pending configuration must be outside ${CONFIG_DIRECTORY.replaceAll("\\", "/")}.`);
  }
  let config;
  try {
    config = JSON.parse(readFileSync(options.pendingConfig, "utf8"));
  } catch (error) {
    fail(`Pending configuration is not valid JSON: ${error.message}`);
  }
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    fail("Pending configuration must be a JSON object.");
  }
  const resolved = validateInitInputs({
    ...options,
    pluginRoot: config.pluginRoot,
    marketplaceRoot: config.marketplaceRoot ?? ".",
  });
  const normalizedConfig = {
    ...config,
    $schema: "./schema.json",
    pluginRoot: resolved.pluginRoot,
  };
  if (resolved.marketplaceRoot === ".") {
    delete normalizedConfig.marketplaceRoot;
  } else {
    normalizedConfig.marketplaceRoot = resolved.marketplaceRoot;
  }
  return { ...resolved, config: normalizedConfig };
}

function buildRepositoryConfig(options) {
  const template = JSON.parse(
    readFileSync(join(ASSET_ROOT, "plugin-development.json"), "utf8"),
  );
  return {
    ...template,
    pluginRoot: options.pluginRoot,
    ...(options.marketplaceRoot === "."
      ? {}
      : { marketplaceRoot: options.marketplaceRoot }),
    versionPolicy: options.versionPolicy,
  };
}

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeNewRepositoryConfig(config, destination, action) {
  mkdirSync(dirname(destination.configPath), { recursive: true });
  writeFileSync(
    destination.configPath,
    formatJson(config),
    { encoding: "utf8", flag: "wx" },
  );
  console.log(`${action}: ${destination.relativeConfigPath.replaceAll("\\", "/")}`);
  return destination.configPath;
}

function writePendingConfig(options) {
  const outputDirectory = dirname(options.pendingOutput);
  if (!existsSync(outputDirectory) || !statSync(outputDirectory).isDirectory()) {
    fail(`Pending output directory does not exist: ${outputDirectory}`);
  }
  const pendingOutput = join(realpathSync(outputDirectory), basename(options.pendingOutput));
  const configDirectory = join(options.repositoryRoot, CONFIG_DIRECTORY);
  if (isWithin(canonicalPath(configDirectory), canonicalPath(pendingOutput))) {
    fail(`Pending output must be outside ${CONFIG_DIRECTORY.replaceAll("\\", "/")}.`);
  }
  if (existsSync(pendingOutput)) {
    fail(`Pending output already exists: ${pendingOutput}`);
  }
  writeFileSync(
    pendingOutput,
    formatJson(buildRepositoryConfig(options)),
    { encoding: "utf8", flag: "wx" },
  );
  console.log(`Prepared: ${pendingOutput}`);
  console.log("Review or extend the pending configuration, then run:");
  console.log(`  node ${quotePowerShell(SCRIPT_PATH)} import ${quotePowerShell(options.repositoryRoot)} ${quotePowerShell(pendingOutput)}`);
}

function quotePowerShell(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function validateScaffold(repositoryRoot, configPaths) {
  const runner = join(repositoryRoot, "scripts", "local-plugin.mjs");
  for (const configPath of configPaths) {
    const result = spawnSync(
      process.execPath,
      [runner, "validate", "--config", configPath],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    if (result.error || result.status !== 0) {
      const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
      fail(
        `Generated runner validation failed for ${relative(repositoryRoot, configPath).replaceAll("\\", "/")}.`
        + (details ? `\n${details}` : ""),
      );
    }
    console.log(result.stdout.trim());
  }
}

function runInit(options) {
  const repositoryRoot = resolveRepositoryRoot(options.repositoryRoot);
  const resolved = validateInitInputs({ ...options, repositoryRoot });
  const destination = requireMissingRepositoryConfig(repositoryRoot, resolved.pluginName);
  copyManagedFiles(repositoryRoot, { refresh: false });
  const configPath = writeNewRepositoryConfig(
    buildRepositoryConfig(resolved),
    destination,
    "Created",
  );
  validateScaffold(repositoryRoot, [configPath]);
}

function runImport(options) {
  const repositoryRoot = resolveRepositoryRoot(options.repositoryRoot);
  const resolved = readPendingConfig({ ...options, repositoryRoot });
  const destination = requireMissingRepositoryConfig(repositoryRoot, resolved.pluginName);
  copyManagedFiles(repositoryRoot, { refresh: false });
  const configPath = writeNewRepositoryConfig(resolved.config, destination, "Imported");
  try {
    validateScaffold(repositoryRoot, [configPath]);
  } catch (error) {
    try {
      unlinkSync(configPath);
    } catch (cleanupError) {
      fail(`${error.message}\nCould not remove failed import: ${cleanupError.message}`);
    }
    throw error;
  }
  console.log(`Pending source retained: ${options.pendingConfig}`);
}

function runPrepare(options) {
  const repositoryRoot = resolveRepositoryRoot(options.repositoryRoot);
  const resolved = validateInitInputs({ ...options, repositoryRoot });
  requireMissingRepositoryConfig(repositoryRoot, resolved.pluginName);
  writePendingConfig(resolved);
}

function runRefresh(options) {
  const repositoryRoot = resolveRepositoryRoot(options.repositoryRoot);
  const configPaths = listRepositoryConfigs(repositoryRoot);
  if (configPaths.length === 0) {
    fail(`No ${CONFIG_PATH_PATTERN} files exist.`);
  }
  if (options.checkOnly) {
    checkManagedFiles(repositoryRoot);
    return;
  }
  copyManagedFiles(repositoryRoot, { refresh: true });
  validateScaffold(repositoryRoot, configPaths);
}

export function permissionGuidance(error, options, scriptPath = SCRIPT_PATH) {
  if (!options || (error.code !== "EACCES" && error.code !== "EPERM")) {
    return undefined;
  }
  const reportedPath = typeof error.dest === "string" ? error.dest : error.path;
  const failedPath = typeof reportedPath === "string" ? resolve(reportedPath) : undefined;
  const configDirectory = join(options.repositoryRoot, CONFIG_DIRECTORY);
  if (failedPath && isWithin(comparablePath(configDirectory), comparablePath(failedPath))) {
    if (options.command === "init") {
      const versionFlag = options.versionPolicy === "bump" ? "--bump-version" : "--keep-version";
      const marketplaceArgs = options.marketplaceRoot === "."
        ? ""
        : ` --marketplace-root ${quotePowerShell(options.marketplaceRoot)}`;
      return "The repository development configuration directory is not writable.\n"
        + "Choose a writable <pending-output>, then run:\n"
        + `  node ${quotePowerShell(scriptPath)} prepare ${quotePowerShell(options.repositoryRoot)} ${quotePowerShell(options.pluginRoot)} 'C:\\path\\to\\pending-config.json'${marketplaceArgs} ${versionFlag}\n`
        + `  node ${quotePowerShell(scriptPath)} import ${quotePowerShell(options.repositoryRoot)} 'C:\\path\\to\\pending-config.json'`;
    }
    if (options.command === "import") {
      return "The repository development configuration directory is not writable.\n"
        + "Run the same import command from a terminal that can write that directory.";
    }
    return "The repository development configuration directory is not writable.\n"
      + "Run refresh from a terminal that can write that directory.";
  }
  if (options.command === "prepare") {
    return "The pending output path is not writable. Choose another explicit <pending-output>.";
  }
  return "A managed target is not writable. Run the same command from a terminal with access to the reported path.";
}

function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
    if (options.help) {
      console.log(HELP);
    } else if (options.command === "init") {
      runInit(options);
    } else if (options.command === "import") {
      runImport(options);
    } else if (options.command === "prepare") {
      runPrepare(options);
    } else {
      runRefresh(options);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    const guidance = permissionGuidance(error, options);
    if (guidance) {
      console.error(guidance);
    }
    if (error.exitCode === 2) {
      console.error("");
      console.error(HELP);
    }
    process.exitCode = error.exitCode ?? 1;
  }
}

if (process.argv[1] && comparablePath(process.argv[1]) === comparablePath(SCRIPT_PATH)) {
  main(process.argv.slice(2));
}
