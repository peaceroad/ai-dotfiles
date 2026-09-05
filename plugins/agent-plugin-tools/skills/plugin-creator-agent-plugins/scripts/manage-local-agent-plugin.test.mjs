#!/usr/bin/env node

// @plugin-creator-agent-plugins managed-local-runner-tests v1

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const manager = path.join(scriptRoot, "manage-local-agent-plugin.mjs");
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "manage-agent-plugin-"));
const pluginSchema = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
let failed = false;

function check(name, condition, details = "") {
  if (condition) {
    console.log(`PASS ${name}`);
    return;
  }
  failed = true;
  console.error(`FAIL ${name}${details ? `: ${details}` : ""}`);
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runManager(args, fakeCodex, statePath, cwd = undefined) {
  return spawnSync(process.execPath, [manager, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      AGENT_PLUGIN_CODEX_CLI: fakeCodex,
      AGENT_PLUGIN_FAKE_STATE: statePath,
    },
  });
}

function repositoryConfigPath(repoRoot, pluginName) {
  return path.join(
    repoRoot,
    ".agents",
    "plugin-development",
    `${pluginName}.json`,
  );
}

async function createRepository(name, version = "0.1.0") {
  const repoRoot = path.join(tempRoot, name);
  const pluginRoot = path.join(repoRoot, "plugins", name);
  await mkdir(pluginRoot, { recursive: true });
  const manifest = { $schema: pluginSchema, name };
  if (version !== null) {
    manifest.version = version;
  }
  await writeJson(path.join(pluginRoot, "plugin.json"), manifest);
  await writeJson(path.join(repoRoot, ".agents", "plugins", "marketplace.json"), {
    name: `${name}-marketplace`,
    plugins: [
      {
        name,
        source: { source: "local", path: `./plugins/${name}` },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
        category: "Developer Tools",
      },
    ],
  });
  return { repoRoot, pluginRoot };
}

const fakeCodex = path.join(tempRoot, "fake-codex.mjs");
await writeFile(
  fakeCodex,
  `import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const statePath = process.env.AGENT_PLUGIN_FAKE_STATE;
const state = JSON.parse(readFileSync(statePath, "utf8"));
const args = process.argv.slice(2);
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + "\\n", "utf8");

if (args.join(" ") === "plugin marketplace list --json") {
  console.log(JSON.stringify({ marketplaces: state.marketplaces }));
} else if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "add") {
  const root = resolve(args[3]);
  const marketplace = JSON.parse(readFileSync(join(root, ".agents", "plugins", "marketplace.json"), "utf8"));
  state.marketplaces.push({ name: marketplace.name, root });
  save();
  console.log(JSON.stringify({ name: marketplace.name }));
} else if (args.join(" ") === "plugin list --available --json") {
  console.log(JSON.stringify({ installed: state.installed, available: [] }));
} else if (args[0] === "plugin" && args[1] === "add") {
  const [pluginName, marketplaceName] = args[2].split("@");
  const registration = state.marketplaces.find((entry) => entry.name === marketplaceName);
  if (!registration) process.exit(4);
  const marketplace = JSON.parse(readFileSync(join(registration.root, ".agents", "plugins", "marketplace.json"), "utf8"));
  const entry = marketplace.plugins.find((candidate) => candidate.name === pluginName);
  const pluginRoot = resolve(registration.root, entry.source.path);
  const manifest = JSON.parse(readFileSync(join(pluginRoot, "plugin.json"), "utf8"));
  const installedPath = join(dirname(statePath), "cache", pluginName, manifest.version ?? "no-version");
  mkdirSync(installedPath, { recursive: true });
  copyFileSync(join(pluginRoot, "plugin.json"), join(installedPath, "plugin.json"));
  state.installed = [{
    pluginId: pluginName + "@" + marketplaceName,
    name: pluginName,
    marketplaceName,
    version: manifest.version,
    installed: true,
    enabled: true,
    installedPath,
    source: { source: "local", path: pluginRoot },
  }];
  save();
  console.log(JSON.stringify(state.installed[0]));
} else {
  console.error("unsupported fake Codex command: " + args.join(" "));
  process.exit(3);
}
`,
  "utf8",
);

try {
  const noArguments = runManager([], fakeCodex, path.join(tempRoot, "unused.json"));
  check(
    "no arguments display help without invoking Codex",
    noArguments.status === 0
      && noArguments.stdout.includes("Agent Plugins v1")
      && noArguments.stdout.includes("Running without")
      && noArguments.stderr === "",
    [noArguments.stdout, noArguments.stderr].join("\n"),
  );

  const help = runManager(["--help"], fakeCodex, path.join(tempRoot, "unused.json"));
  check("help is read-only and succeeds", help.status === 0 && help.stdout.includes("Agent Plugins v1"));

  const helpCommand = runManager(["help"], fakeCodex, path.join(tempRoot, "unused.json"));
  check("help command is read-only and succeeds", helpCommand.status === 0 && helpCommand.stdout.includes("Usage:"));

  const repository = await createRepository("sample-plugin");
  const statePath = path.join(tempRoot, "state.json");
  await writeJson(statePath, { marketplaces: [], installed: [] });

  const validate = runManager(["validate", repository.pluginRoot], fakeCodex, statePath);
  check("validate accepts a portable package", validate.status === 0, validate.stderr);

  const distributed = await createRepository("distributed-plugin");
  await writeJson(
    path.join(
      distributed.repoRoot,
      ".agents",
      "marketplace-development",
      "config.json",
    ),
    {
      schemaVersion: 1,
      name: "distributed-marketplace",
      displayName: "Distributed Marketplace",
      plugins: [],
    },
  );
  const distributedInstall = runManager(
    ["install", distributed.pluginRoot, "--keep-version"],
    fakeCodex,
    statePath,
  );
  check(
    "install refuses a generated shared Marketplace copy",
    distributedInstall.status === 1
      && distributedInstall.stderr.includes("Use the Codex CLI"),
    distributedInstall.stderr,
  );

  const missingPolicy = runManager(["install", repository.pluginRoot], fakeCodex, statePath);
  const unchanged = JSON.parse(await readFile(path.join(repository.pluginRoot, "plugin.json"), "utf8"));
  check(
    "install requires an explicit new-repository version policy",
    missingPolicy.status === 2
      && missingPolicy.stderr.includes("--bump-version or --keep-version")
      && unchanged.version === "0.1.0",
    missingPolicy.stderr,
  );

  const install = runManager(
    ["install", repository.pluginRoot, "--bump-version"],
    fakeCodex,
    statePath,
  );
  const updated = JSON.parse(await readFile(path.join(repository.pluginRoot, "plugin.json"), "utf8"));
  const installedState = JSON.parse(await readFile(statePath, "utf8"));
  check(
    "install registers, bumps, installs, and verifies",
    install.status === 0
      && /^0\.1\.0\+agent\.\d{17}$/u.test(updated.version)
      && installedState.marketplaces.length === 1
      && installedState.installed[0]?.version === updated.version
      && install.stdout.includes("Verified installed root")
      && install.stdout.includes("Start a new Codex task"),
    [install.stdout, install.stderr].join("\n"),
  );

  const status = runManager(["status", repository.pluginRoot], fakeCodex, statePath);
  check(
    "status reports the matching source and snapshot",
    status.status === 0
      && status.stdout.includes("Registration:     registered")
      && status.stdout.includes("Installed:        yes")
      && status.stdout.includes(updated.version),
    status.stderr,
  );

  const repositoryCheck = path.join(repository.repoRoot, "scripts", "repository-check.mjs");
  await mkdir(path.dirname(repositoryCheck), { recursive: true });
  await writeFile(repositoryCheck, 'console.log("repository-specific check ran");\n', "utf8");
  await writeJson(
    repositoryConfigPath(repository.repoRoot, "sample-plugin"),
    {
      schemaVersion: 1,
      pluginRoot: "plugins/sample-plugin",
      versionPolicy: "bump",
      minimumNodeMajor: Number.parseInt(process.versions.node.split(".", 1)[0], 10),
      checks: [
        {
          name: "sample repository check",
          command: "${NODE}",
          args: ["scripts/repository-check.mjs"],
        },
      ],
    },
  );
  const configuredValidation = runManager(
    [
      "validate",
      "--config",
      repositoryConfigPath(repository.repoRoot, "sample-plugin"),
    ],
    fakeCodex,
    statePath,
    repository.repoRoot,
  );
  check(
    "repository configuration discovers the plugin and runs structured checks",
    configuredValidation.status === 0
      && configuredValidation.stdout.includes("Repository check: sample repository check")
      && configuredValidation.stdout.includes("repository-specific check ran"),
    [configuredValidation.stdout, configuredValidation.stderr].join("\n"),
  );

  await writeJson(
    repositoryConfigPath(repository.repoRoot, "another-plugin"),
    {
      schemaVersion: 1,
      pluginRoot: "plugins/sample-plugin",
      versionPolicy: "keep",
    },
  );
  const ambiguousConfiguration = runManager(
    ["validate"],
    fakeCodex,
    statePath,
    repository.repoRoot,
  );
  check(
    "multiple repository configurations require an explicit selection",
    ambiguousConfiguration.status === 2
      && ambiguousConfiguration.stderr.includes("Multiple repository configurations")
      && ambiguousConfiguration.stderr.includes("Use --config explicitly"),
    ambiguousConfiguration.stderr,
  );

  const invalidMarketplaceRepository = await createRepository(
    "invalid-marketplace-plugin",
  );
  const checkMarker = path.join(
    invalidMarketplaceRepository.repoRoot,
    "repository-check-ran.txt",
  );
  const markerCheck = path.join(
    invalidMarketplaceRepository.repoRoot,
    "scripts",
    "marker-check.mjs",
  );
  await mkdir(path.dirname(markerCheck), { recursive: true });
  await writeFile(
    markerCheck,
    'import { writeFileSync } from "node:fs";\nwriteFileSync("repository-check-ran.txt", "ran\\n", "utf8");\n',
    "utf8",
  );
  await writeJson(
    path.join(
      invalidMarketplaceRepository.repoRoot,
      ".agents",
      "plugins",
      "marketplace.json",
    ),
    { name: "invalid-marketplace", plugins: [] },
  );
  await writeJson(
    path.join(
      invalidMarketplaceRepository.repoRoot,
      ".agents",
      "plugin-development",
      "invalid-marketplace-plugin.json",
    ),
    {
      schemaVersion: 1,
      pluginRoot: "plugins/invalid-marketplace-plugin",
      versionPolicy: "keep",
      checks: [
        {
          name: "must not run",
          command: "${NODE}",
          args: ["scripts/marker-check.mjs"],
        },
      ],
    },
  );
  const invalidMarketplace = runManager(
    [
      "validate",
      "--config",
      path.join(
        invalidMarketplaceRepository.repoRoot,
        ".agents",
        "plugin-development",
        "invalid-marketplace-plugin.json",
      ),
    ],
    fakeCodex,
    statePath,
    invalidMarketplaceRepository.repoRoot,
  );
  check(
    "Marketplace binding is validated before repository checks",
    invalidMarketplace.status === 1
      && invalidMarketplace.stderr.includes("does not contain a local marketplace entry")
      && !existsSync(checkMarker),
    [invalidMarketplace.stdout, invalidMarketplace.stderr].join("\n"),
  );

  const failingRepository = await createRepository("failing-check-plugin");
  const failingCheck = path.join(
    failingRepository.repoRoot,
    "scripts",
    "failing-check.mjs",
  );
  await mkdir(path.dirname(failingCheck), { recursive: true });
  await writeFile(failingCheck, "process.exit(7);\n", "utf8");
  await writeJson(
    repositoryConfigPath(failingRepository.repoRoot, "failing-check-plugin"),
    {
      schemaVersion: 1,
      pluginRoot: "plugins/failing-check-plugin",
      marketplaceRoot: ".",
      versionPolicy: "bump",
      checks: [
        {
          name: "intentional failure",
          command: "${NODE}",
          args: ["scripts/failing-check.mjs"],
        },
      ],
    },
  );
  const failingState = path.join(tempRoot, "failing-check-state.json");
  await writeJson(failingState, { marketplaces: [], installed: [] });
  const rejectedInstall = runManager(
    [
      "install",
      "--config",
      repositoryConfigPath(failingRepository.repoRoot, "failing-check-plugin"),
    ],
    fakeCodex,
    failingState,
    failingRepository.repoRoot,
  );
  const rejectedManifest = JSON.parse(
    await readFile(path.join(failingRepository.pluginRoot, "plugin.json"), "utf8"),
  );
  const rejectedState = JSON.parse(await readFile(failingState, "utf8"));
  check(
    "a failing repository check stops install before any mutation",
    rejectedInstall.status === 1
      && rejectedInstall.stderr.includes("intentional failure")
      && rejectedManifest.version === "0.1.0"
      && rejectedState.marketplaces.length === 0
      && rejectedState.installed.length === 0,
    [rejectedInstall.stdout, rejectedInstall.stderr].join("\n"),
  );

  const ambiguousState = path.join(tempRoot, "ambiguous-state.json");
  await writeJson(ambiguousState, {
    marketplaces: [
      {
        name: "sample-plugin-marketplace",
        root: repository.repoRoot,
      },
      {
        name: "sample-plugin-marketplace",
        root: path.join(tempRoot, "different-root"),
      },
    ],
    installed: [],
  });
  const ambiguousStatus = runManager(
    ["status", repository.pluginRoot],
    fakeCodex,
    ambiguousState,
  );
  check(
    "duplicate marketplace registrations fail instead of choosing one",
    ambiguousStatus.status === 1
      && ambiguousStatus.stderr.includes("registered more than once"),
    ambiguousStatus.stderr,
  );

  const secondInstall = runManager(
    [
      "install",
      "--config",
      repositoryConfigPath(repository.repoRoot, "sample-plugin"),
    ],
    fakeCodex,
    statePath,
    repository.repoRoot,
  );
  const secondVersion = JSON.parse(
    await readFile(path.join(repository.pluginRoot, "plugin.json"), "utf8"),
  ).version;
  check(
    "configured version policy bumps later installs",
    secondInstall.status === 0
      && /^0\.1\.0\+agent\.\d{17}$/u.test(secondVersion)
      && secondInstall.stdout.includes("repository-specific check ran"),
    secondInstall.stderr,
  );

  const escapingRepository = await createRepository("escaping-plugin");
  await writeJson(
    repositoryConfigPath(escapingRepository.repoRoot, "escaping-plugin"),
    {
      schemaVersion: 1,
      pluginRoot: "../outside",
      versionPolicy: "keep",
    },
  );
  const escapingConfig = runManager(
    [
      "validate",
      "--config",
      repositoryConfigPath(escapingRepository.repoRoot, "escaping-plugin"),
    ],
    fakeCodex,
    statePath,
    escapingRepository.repoRoot,
  );
  check(
    "repository configuration cannot escape its repository root",
    escapingConfig.status === 1
      && escapingConfig.stderr.includes("escapes the repository root"),
    escapingConfig.stderr,
  );

  const noVersionRepository = await createRepository("no-version-plugin", null);
  const noVersionState = path.join(tempRoot, "no-version-state.json");
  await writeJson(noVersionState, { marketplaces: [], installed: [] });
  const keepVersion = runManager(
    ["install", noVersionRepository.pluginRoot, "--keep-version"],
    fakeCodex,
    noVersionState,
  );
  check("install can preserve an absent optional version", keepVersion.status === 0, keepVersion.stderr);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

if (failed) {
  process.exitCode = 1;
}
