#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  appendFile,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { permissionGuidance } from "./scaffold-local-agent-plugin.mjs";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const scaffold = path.join(scriptRoot, "scaffold-local-agent-plugin.mjs");
const schema = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

function invoke(args, cwd) {
  return spawnSync(process.execPath, [scaffold, ...args], {
    cwd,
    encoding: "utf8",
    shell: false,
  });
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("no arguments display read-only help", () => {
  const result = invoke([], scriptRoot);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage:\n/u);
  assert.match(result.stdout, /prepare <repository-root>/u);
  assert.match(result.stdout, /refresh <repository-root> \[--check\]/u);
  assert.equal(result.stderr, "");
});

test("permission guidance is command- and destination-specific", () => {
  const repositoryRoot = path.join(os.tmpdir(), "permission-guidance-repository");
  const configDirectory = path.join(repositoryRoot, ".agents", "plugin-development");
  const common = {
    repositoryRoot,
    marketplaceRoot: ".",
    pluginRoot: "plugins/sample-plugin",
    versionPolicy: "bump",
  };

  const initGuidance = permissionGuidance(
    { code: "EPERM", path: configDirectory },
    { ...common, command: "init" },
    scaffold,
  );
  assert.match(initGuidance, / prepare /u);
  assert.match(initGuidance, / import /u);

  const refreshGuidance = permissionGuidance(
    {
      code: "EPERM",
      path: path.join(scriptRoot, "assets", "source.json"),
      dest: path.join(configDirectory, "schema.json"),
    },
    { ...common, command: "refresh" },
    scaffold,
  );
  assert.match(refreshGuidance, /Run refresh from a terminal/u);

  const importGuidance = permissionGuidance(
    { code: "EACCES", path: path.join(configDirectory, "sample-plugin.json") },
    { ...common, command: "import" },
    scaffold,
  );
  assert.match(importGuidance, /same import command/u);

  const prepareGuidance = permissionGuidance(
    { code: "EACCES", path: path.join(repositoryRoot, "pending.json") },
    { ...common, command: "prepare" },
    scaffold,
  );
  assert.match(prepareGuidance, /Choose another explicit/u);

  const genericGuidance = permissionGuidance(
    { code: "EPERM", dest: path.join(repositoryRoot, "scripts", "local-plugin.mjs") },
    { ...common, command: "refresh" },
    scaffold,
  );
  assert.match(genericGuidance, /managed target is not writable/u);
  assert.equal(
    permissionGuidance(
      { code: "ENOENT", path: configDirectory },
      { ...common, command: "init" },
      scaffold,
    ),
    undefined,
  );
});

test("init supports multiple plugin configs while sharing managed files", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agent-plugin-scaffold-"));
  const repositoryRoot = path.join(tempRoot, "repository");
  const pluginRoot = path.join(repositoryRoot, "plugins", "sample-plugin");
  const configPath = path.join(
    repositoryRoot,
    ".agents",
    "plugin-development",
    "sample-plugin.json",
  );
  const secondConfigPath = path.join(
    repositoryRoot,
    ".agents",
    "plugin-development",
    "second-plugin.json",
  );
  const runner = path.join(repositoryRoot, "scripts", "local-plugin.mjs");
  try {
    await mkdir(pluginRoot, { recursive: true });
    await writeJson(path.join(pluginRoot, "plugin.json"), {
      $schema: schema,
      name: "sample-plugin",
      version: "0.1.0",
    });
    await writeJson(
      path.join(repositoryRoot, ".agents", "plugins", "marketplace.json"),
      {
        name: "sample-marketplace",
        plugins: [
          {
            name: "sample-plugin",
            source: { source: "local", path: "./plugins/sample-plugin" },
          },
        ],
      },
    );

    const initialized = invoke(
      ["init", repositoryRoot, "plugins/sample-plugin", "--bump-version"],
      tempRoot,
    );
    assert.equal(initialized.status, 0, initialized.stderr);
    assert.match(initialized.stdout, /Created: scripts\/local-plugin\.mjs/u);
    assert.match(initialized.stdout, /skills: 0/u);

    const configBefore = await readFile(configPath, "utf8");
    const config = JSON.parse(configBefore);
    assert.equal(config.pluginRoot, "plugins/sample-plugin");
    assert.equal(config.$schema, "./schema.json");
    assert.equal("marketplaceRoot" in config, false);
    assert.equal(config.versionPolicy, "bump");
    assert.equal(
      existsSync(path.join(repositoryRoot, "scripts", "local-plugin.test.mjs")),
      false,
    );
    assert.equal(
      existsSync(path.join(repositoryRoot, ".agents", "plugin-development", "schema.json")),
      true,
    );

    const noArguments = spawnSync(process.execPath, [runner], {
      cwd: repositoryRoot,
      encoding: "utf8",
      shell: false,
    });
    assert.equal(noArguments.status, 0, noArguments.stderr);
    assert.match(noArguments.stdout, /node local-plugin\.mjs validate/u);

    const currentCheck = invoke(["refresh", repositoryRoot, "--check"], tempRoot);
    assert.equal(currentCheck.status, 0, currentCheck.stderr);
    assert.match(currentCheck.stdout, /Managed files are current\./u);
    assert.doesNotMatch(currentCheck.stdout, /skills: 0/u);

    await appendFile(runner, "\n// local modification that refresh owns\n", "utf8");
    const driftCheck = invoke(["refresh", repositoryRoot, "--check"], tempRoot);
    assert.equal(driftCheck.status, 1);
    assert.match(driftCheck.stderr, /Changed: scripts\/local-plugin\.mjs/u);
    assert.match(await readFile(runner, "utf8"), /local modification/u);

    const refreshed = invoke(["refresh", repositoryRoot], tempRoot);
    assert.equal(refreshed.status, 0, refreshed.stderr);
    assert.match(refreshed.stdout, /Refreshed: scripts\/local-plugin\.mjs/u);
    assert.doesNotMatch(refreshed.stdout, /Refreshed: \.agents\/plugin-development\/schema\.json/u);
    assert.equal(await readFile(configPath, "utf8"), configBefore);
    assert.doesNotMatch(await readFile(runner, "utf8"), /local modification/u);

    const secondPluginRoot = path.join(repositoryRoot, "plugins", "second-plugin");
    await mkdir(secondPluginRoot, { recursive: true });
    await writeJson(path.join(secondPluginRoot, "plugin.json"), {
      $schema: schema,
      name: "second-plugin",
      version: "0.1.0",
    });
    const marketplacePath = path.join(
      repositoryRoot,
      ".agents",
      "plugins",
      "marketplace.json",
    );
    const marketplace = JSON.parse(await readFile(marketplacePath, "utf8"));
    marketplace.plugins.push({
      name: "second-plugin",
      source: { source: "local", path: "./plugins/second-plugin" },
    });
    await writeJson(marketplacePath, marketplace);

    const secondInit = invoke(
      ["init", repositoryRoot, "plugins/second-plugin", "--keep-version"],
      tempRoot,
    );
    assert.equal(secondInit.status, 0, secondInit.stderr);
    assert.match(secondInit.stdout, /Reused: scripts\/local-plugin\.mjs/u);
    assert.equal(JSON.parse(await readFile(secondConfigPath, "utf8")).pluginRoot, "plugins/second-plugin");

    const ambiguousValidation = spawnSync(process.execPath, [runner, "validate"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      shell: false,
    });
    assert.equal(ambiguousValidation.status, 2);
    assert.match(ambiguousValidation.stderr, /Use --config explicitly/u);

    const multiRefreshed = invoke(["refresh", repositoryRoot], tempRoot);
    assert.equal(multiRefreshed.status, 0, multiRefreshed.stderr);
    assert.match(multiRefreshed.stdout, /sample-plugin/u);
    assert.match(multiRefreshed.stdout, /second-plugin/u);

    const repeatedInit = invoke(
      ["init", repositoryRoot, "plugins/sample-plugin", "--bump-version"],
      tempRoot,
    );
    assert.equal(repeatedInit.status, 1);
    assert.match(repeatedInit.stderr, /sample-plugin\.json already exists/u);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("prepare writes only an explicit pending file that import can consume", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agent-plugin-prepare-"));
  const repositoryRoot = path.join(tempRoot, "repository");
  const pluginRoot = path.join(repositoryRoot, "plugins", "sample-plugin");
  const pendingOutput = path.join(tempRoot, "sample-plugin.pending.json");
  try {
    await mkdir(pluginRoot, { recursive: true });
    await writeJson(path.join(pluginRoot, "plugin.json"), {
      $schema: schema,
      name: "sample-plugin",
      version: "0.1.0",
    });
    await writeJson(
      path.join(repositoryRoot, ".agents", "plugins", "marketplace.json"),
      {
        name: "sample-marketplace",
        plugins: [
          {
            name: "sample-plugin",
            source: { source: "local", path: "./plugins/sample-plugin" },
          },
        ],
      },
    );

    const prepared = invoke(
      ["prepare", repositoryRoot, "plugins/sample-plugin", pendingOutput, "--keep-version"],
      tempRoot,
    );
    assert.equal(prepared.status, 0, prepared.stderr);
    assert.match(prepared.stdout, /Prepared:/u);
    assert.match(prepared.stdout, /Review or extend the pending configuration/u);
    assert.match(prepared.stdout, /node .* import /u);
    assert.equal(
      existsSync(path.join(repositoryRoot, ".agents", "plugin-development")),
      false,
    );
    assert.equal(existsSync(path.join(repositoryRoot, "scripts")), false);
    const pending = JSON.parse(await readFile(pendingOutput, "utf8"));
    assert.equal(pending.pluginRoot, "plugins/sample-plugin");
    assert.equal(pending.versionPolicy, "keep");

    const repeatedPrepare = invoke(
      ["prepare", repositoryRoot, "plugins/sample-plugin", pendingOutput, "--keep-version"],
      tempRoot,
    );
    assert.equal(repeatedPrepare.status, 1);
    assert.match(repeatedPrepare.stderr, /Pending output already exists/u);

    const imported = invoke(["import", repositoryRoot, pendingOutput], tempRoot);
    assert.equal(imported.status, 0, imported.stderr);
    assert.equal(existsSync(pendingOutput), true);
    assert.equal(existsSync(path.join(
      repositoryRoot,
      ".agents",
      "plugin-development",
      "sample-plugin.json",
    )), true);

    const blockedOutput = path.join(tempRoot, "blocked.pending.json");
    const blockedPrepare = invoke(
      ["prepare", repositoryRoot, "plugins/sample-plugin", blockedOutput, "--keep-version"],
      tempRoot,
    );
    assert.equal(blockedPrepare.status, 1);
    assert.match(blockedPrepare.stderr, /sample-plugin\.json already exists/u);
    assert.equal(existsSync(blockedOutput), false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("init validates the Marketplace contract before writing files", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agent-plugin-scaffold-invalid-"));
  const repositoryRoot = path.join(tempRoot, "repository");
  const pluginRoot = path.join(repositoryRoot, "plugins", "sample-plugin");
  try {
    await mkdir(pluginRoot, { recursive: true });
    await writeJson(path.join(pluginRoot, "plugin.json"), {
      $schema: schema,
      name: "sample-plugin",
      version: "0.1.0",
    });
    const result = invoke(
      ["init", repositoryRoot, "plugins/sample-plugin", "--keep-version"],
      tempRoot,
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Marketplace catalog does not exist/u);
    assert.equal(
      existsSync(path.join(
        repositoryRoot,
        ".agents",
        "plugin-development",
        "sample-plugin.json",
      )),
      false,
    );
    assert.equal(
      existsSync(path.join(repositoryRoot, "scripts", "local-plugin.mjs")),
      false,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("import places a pending config without deleting its source and rolls back failures", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agent-plugin-import-"));
  const repositoryRoot = path.join(tempRoot, "repository");
  const marketplacePath = path.join(
    repositoryRoot,
    ".agents",
    "plugins",
    "marketplace.json",
  );
  const pendingDirectory = path.join(repositoryRoot, ".pending-plugin-development");
  try {
    for (const pluginName of ["sample-plugin", "invalid-plugin"]) {
      await writeJson(
        path.join(repositoryRoot, "plugins", pluginName, "plugin.json"),
        {
          $schema: schema,
          name: pluginName,
          version: "0.1.0",
        },
      );
    }
    await writeJson(marketplacePath, {
      name: "sample-marketplace",
      plugins: ["sample-plugin", "invalid-plugin"].map((name) => ({
        name,
        source: { source: "local", path: `./plugins/${name}` },
      })),
    });

    const pendingConfig = path.join(pendingDirectory, "sample.json");
    await writeJson(pendingConfig, {
      $schema: "./stale-schema.json",
      schemaVersion: 1,
      pluginRoot: "plugins/sample-plugin",
      versionPolicy: "keep",
      checks: [],
    });
    const imported = invoke(
      ["import", repositoryRoot, pendingConfig],
      tempRoot,
    );
    assert.equal(imported.status, 0, imported.stderr);
    assert.match(imported.stdout, /Imported: \.agents\/plugin-development\/sample-plugin\.json/u);
    assert.match(imported.stdout, /Pending source retained:/u);
    assert.equal(existsSync(pendingConfig), true);
    const importedConfig = JSON.parse(await readFile(path.join(
      repositoryRoot,
      ".agents",
      "plugin-development",
      "sample-plugin.json",
    ), "utf8"));
    assert.equal(importedConfig.$schema, "./schema.json");

    const invalidPendingConfig = path.join(pendingDirectory, "invalid.json");
    await writeJson(invalidPendingConfig, {
      schemaVersion: 1,
      pluginRoot: "plugins/invalid-plugin",
      versionPolicy: "keep",
      unknownField: true,
    });
    const rejected = invoke(
      ["import", repositoryRoot, invalidPendingConfig],
      tempRoot,
    );
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /unknown fields/u);
    assert.equal(existsSync(invalidPendingConfig), true);
    assert.equal(existsSync(path.join(
      repositoryRoot,
      ".agents",
      "plugin-development",
      "invalid-plugin.json",
    )), false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
