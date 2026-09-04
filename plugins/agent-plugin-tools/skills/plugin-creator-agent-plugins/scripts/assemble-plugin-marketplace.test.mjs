#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { filesystemGuidance } from "./assemble-plugin-marketplace.mjs";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const assembler = path.join(scriptRoot, "assemble-plugin-marketplace.mjs");
const pluginSchema = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

function invoke(args, cwd) {
  return spawnSync(process.execPath, [assembler, ...args], {
    cwd,
    encoding: "utf8",
    shell: false,
  });
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createPlugin(root, name, description = name) {
  await mkdir(root, { recursive: true });
  await writeJson(path.join(root, "plugin.json"), {
    $schema: pluginSchema,
    name,
    version: "0.1.0",
    description,
  });
  await writeFile(path.join(root, "content.txt"), `${description}\n`, "utf8");
}

test("no arguments display read-only help", () => {
  const result = invoke([], scriptRoot);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /init <marketplace-root>/u);
  assert.match(result.stdout, /check <marketplace-root>/u);
  assert.equal(result.stderr, "");
});

test("a symbolic-link entry point still runs the CLI", async (context) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "plugin-marketplace-link-"));
  const linkedAssembler = path.join(tempRoot, "assemble-plugin-marketplace.mjs");
  try {
    try {
      await symlink(assembler, linkedAssembler, "file");
    } catch (error) {
      if (error.code === "EPERM" || error.code === "EACCES") {
        context.skip("Symbolic links are unavailable in this environment.");
        return;
      }
      throw error;
    }
    const result = spawnSync(process.execPath, [linkedAssembler, "--help"], {
      encoding: "utf8",
      shell: false,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Assemble a filesystem-backed/u);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("filesystem guidance distinguishes common local and network failures", () => {
  const root = path.join(os.tmpdir(), "marketplace-guidance");
  const options = { command: "sync", root };

  const destinationDenied = filesystemGuidance(
    { code: "EPERM", path: path.join(root, "plugins", "sample-plugin") },
    options,
  );
  assert.match(destinationDenied, /Marketplace destination is not writable/u);
  assert.match(destinationDenied, /authenticate outside this script/u);
  assert.match(destinationDenied, /same sync command/u);

  const sourceDenied = filesystemGuidance(
    { code: "EACCES", path: path.join(os.tmpdir(), "source", "sample-plugin") },
    options,
  );
  assert.match(sourceDenied, /source or destination is not accessible/u);

  assert.match(
    filesystemGuidance({ code: "ENOSPC", path: root }, options),
    /free space or has reached its storage quota/u,
  );
  assert.match(
    filesystemGuidance({ code: "EBUSY", path: root }, options),
    /no other init, add, or sync command/u,
  );
  assert.match(
    filesystemGuidance({ code: "ENOENT", path: root }, options),
    /share is connected/u,
  );
  assert.match(
    filesystemGuidance({ code: "ETIMEDOUT", path: root }, options),
    /network filesystem became unavailable/u,
  );
  assert.equal(filesystemGuidance({ code: "EINVAL", path: root }, options), undefined);
});

test("init, add, sync, and check assemble multiple plugins", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "plugin-marketplace-"));
  const marketplaceRoot = path.join(tempRoot, "distribution");
  const first = path.join(tempRoot, "sources", "first-plugin");
  const second = path.join(tempRoot, "sources", "second-plugin");
  try {
    await createPlugin(first, "first-plugin");
    await createPlugin(second, "second-plugin");

    const initialized = invoke([
      "init",
      marketplaceRoot,
      "--name",
      "test-marketplace",
      "--display-name",
      "Test Marketplace",
      "--plugin",
      first,
      "--category",
      "Productivity",
    ], tempRoot);
    assert.equal(initialized.status, 0, initialized.stderr);
    assert.match(initialized.stdout, /Configured plugins: 1/u);

    const added = invoke(["add", marketplaceRoot, second, "--category", "Developer tools"], tempRoot);
    assert.equal(added.status, 0, added.stderr);
    assert.match(added.stdout, /Added: second-plugin/u);

    const synced = invoke(["sync", marketplaceRoot], tempRoot);
    assert.equal(synced.status, 0, synced.stderr);
    assert.match(synced.stdout, /Synced: plugins\/first-plugin/u);
    assert.match(synced.stdout, /Marketplace sync complete/u);

    const catalog = JSON.parse(await readFile(
      path.join(marketplaceRoot, ".agents", "plugins", "marketplace.json"),
      "utf8",
    ));
    assert.equal(catalog.name, "test-marketplace");
    assert.deepEqual(catalog.plugins.map((plugin) => plugin.name), ["first-plugin", "second-plugin"]);
    assert.equal(catalog.plugins[1].category, "Developer tools");
    assert.equal(
      await readFile(path.join(marketplaceRoot, "plugins", "first-plugin", "content.txt"), "utf8"),
      "first-plugin\n",
    );

    const checked = invoke(["check", marketplaceRoot], tempRoot);
    assert.equal(checked.status, 0, checked.stderr);
    assert.match(checked.stdout, /Marketplace distribution is current/u);

    const repeated = invoke(["sync", marketplaceRoot], tempRoot);
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.match(repeated.stdout, /Plugin copies are current/u);
    assert.doesNotMatch(repeated.stdout, /Updated: \.agents\/plugin-marketplace-development\/state\.json/u);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("sync and check can use an external assembly definition", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "plugin-marketplace-external-"));
  const marketplaceRoot = path.join(tempRoot, "distribution");
  const source = path.join(tempRoot, "source", "sample-plugin");
  const configuration = path.join(tempRoot, "effective-config.json");
  try {
    await createPlugin(source, "sample-plugin");
    await writeJson(configuration, {
      schemaVersion: 1,
      name: "external-marketplace",
      displayName: "External Marketplace",
      plugins: [{ source, category: "Tools" }],
    });

    const synced = invoke(["sync", marketplaceRoot, "--config", configuration], tempRoot);
    assert.equal(synced.status, 0, synced.stderr);
    assert.match(synced.stdout, /Marketplace sync complete/u);
    await assert.rejects(
      readFile(path.join(marketplaceRoot, ".agents", "plugin-marketplace-development", "config.json"), "utf8"),
      { code: "ENOENT" },
    );

    const checked = invoke(["check", marketplaceRoot, "--config", configuration], tempRoot);
    assert.equal(checked.status, 0, checked.stderr);
    assert.match(checked.stdout, /Marketplace distribution is current/u);

    const defaultCheck = invoke(["check", marketplaceRoot], tempRoot);
    assert.equal(defaultCheck.status, 1);
    assert.match(defaultCheck.stderr, /configuration.*does not exist/iu);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("source changes are reported and safely synchronized", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "plugin-marketplace-update-"));
  const marketplaceRoot = path.join(tempRoot, "distribution");
  const source = path.join(tempRoot, "source", "sample-plugin");
  try {
    await createPlugin(source, "sample-plugin", "before");
    assert.equal(invoke([
      "init",
      marketplaceRoot,
      "--name",
      "sample-marketplace",
      "--display-name",
      "Sample Marketplace",
      "--plugin",
      source,
      "--category",
      "Productivity",
    ], tempRoot).status, 0);
    assert.equal(invoke(["sync", marketplaceRoot], tempRoot).status, 0);

    await writeFile(path.join(source, "content.txt"), "after\n", "utf8");
    const drift = invoke(["check", marketplaceRoot], tempRoot);
    assert.equal(drift.status, 1);
    assert.match(drift.stderr, /Changed: plugins\/sample-plugin/u);

    const updated = invoke(["sync", marketplaceRoot], tempRoot);
    assert.equal(updated.status, 0, updated.stderr);
    assert.equal(
      await readFile(path.join(marketplaceRoot, "plugins", "sample-plugin", "content.txt"), "utf8"),
      "after\n",
    );
    assert.equal(invoke(["check", marketplaceRoot], tempRoot).status, 0);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("scoped sync updates one plugin without certifying the others", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "plugin-marketplace-scoped-"));
  const marketplaceRoot = path.join(tempRoot, "distribution");
  const first = path.join(tempRoot, "sources", "first-plugin");
  const second = path.join(tempRoot, "sources", "second-plugin");
  const configPath = path.join(
    marketplaceRoot,
    ".agents",
    "plugin-marketplace-development",
    "config.json",
  );
  try {
    await createPlugin(first, "first-plugin", "first before");
    await createPlugin(second, "second-plugin", "second before");
    assert.equal(invoke([
      "init",
      marketplaceRoot,
      "--name",
      "sample-marketplace",
      "--display-name",
      "Sample Marketplace",
      "--plugin",
      first,
      "--plugin",
      second,
      "--category",
      "Tools",
    ], tempRoot).status, 0);
    assert.equal(invoke(["sync", marketplaceRoot], tempRoot).status, 0);

    await writeFile(path.join(first, "content.txt"), "first after\n", "utf8");
    await writeFile(path.join(second, "content.txt"), "second after\n", "utf8");
    const scoped = invoke(["sync", marketplaceRoot, "--plugin", "first-plugin"], tempRoot);
    assert.equal(scoped.status, 0, scoped.stderr);
    assert.match(scoped.stdout, /Other plugin copies were not checked/u);
    assert.equal(
      await readFile(path.join(marketplaceRoot, "plugins", "first-plugin", "content.txt"), "utf8"),
      "first after\n",
    );
    assert.equal(
      await readFile(path.join(marketplaceRoot, "plugins", "second-plugin", "content.txt"), "utf8"),
      "second before\n",
    );

    const scopedCheck = invoke(["check", marketplaceRoot, "--plugin", "first-plugin"], tempRoot);
    assert.equal(scopedCheck.status, 0, scopedCheck.stderr);
    assert.match(scopedCheck.stdout, /Other plugin copies were not checked/u);
    assert.equal(invoke(["check", marketplaceRoot], tempRoot).status, 1);

    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.plugins[0].category = "Changed category";
    await writeJson(configPath, config);
    const refused = invoke(["sync", marketplaceRoot, "--plugin", "first-plugin"], tempRoot);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /full sync before a scoped operation/u);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("sync refuses destination changes made outside the assembler", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "plugin-marketplace-safety-"));
  const marketplaceRoot = path.join(tempRoot, "distribution");
  const source = path.join(tempRoot, "source", "sample-plugin");
  try {
    await createPlugin(source, "sample-plugin");
    assert.equal(invoke([
      "init",
      marketplaceRoot,
      "--name",
      "sample-marketplace",
      "--display-name",
      "Sample Marketplace",
      "--plugin",
      source,
      "--category",
      "Productivity",
    ], tempRoot).status, 0);
    assert.equal(invoke(["sync", marketplaceRoot], tempRoot).status, 0);

    const catalogPath = path.join(marketplaceRoot, ".agents", "plugins", "marketplace.json");
    const catalog = await readFile(catalogPath, "utf8");
    await writeFile(catalogPath, `${catalog.trimEnd()}\n `, "utf8");
    const catalogRefused = invoke(["sync", marketplaceRoot], tempRoot);
    assert.equal(catalogRefused.status, 1);
    assert.match(catalogRefused.stderr, /catalog changed outside this assembler/u);
    await writeFile(catalogPath, catalog, "utf8");

    const destinationFile = path.join(marketplaceRoot, "plugins", "sample-plugin", "content.txt");
    await writeFile(destinationFile, "manual change\n", "utf8");
    const refused = invoke(["sync", marketplaceRoot], tempRoot);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /changed outside this assembler/u);
    assert.equal(await readFile(destinationFile, "utf8"), "manual change\n");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("removed entries stay on disk until explicitly deleted", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "plugin-marketplace-retain-"));
  const marketplaceRoot = path.join(tempRoot, "distribution");
  const source = path.join(tempRoot, "source", "sample-plugin");
  const configPath = path.join(
    marketplaceRoot,
    ".agents",
    "plugin-marketplace-development",
    "config.json",
  );
  try {
    await createPlugin(source, "sample-plugin");
    assert.equal(invoke([
      "init",
      marketplaceRoot,
      "--name",
      "sample-marketplace",
      "--display-name",
      "Sample Marketplace",
      "--plugin",
      source,
      "--category",
      "Productivity",
    ], tempRoot).status, 0);
    assert.equal(invoke(["sync", marketplaceRoot], tempRoot).status, 0);

    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.plugins = [];
    await writeJson(configPath, config);
    const synced = invoke(["sync", marketplaceRoot], tempRoot);
    assert.equal(synced.status, 0, synced.stderr);
    assert.match(synced.stdout, /Retained unreferenced generated plugin/u);
    const catalog = JSON.parse(await readFile(
      path.join(marketplaceRoot, ".agents", "plugins", "marketplace.json"),
      "utf8",
    ));
    assert.deepEqual(catalog.plugins, []);
    assert.equal(
      await readFile(path.join(marketplaceRoot, "plugins", "sample-plugin", "content.txt"), "utf8"),
      "sample-plugin\n",
    );

    await rm(path.join(marketplaceRoot, "plugins", "sample-plugin"), {
      recursive: true,
      force: true,
    });
    const cleaned = invoke(["sync", marketplaceRoot], tempRoot);
    assert.equal(cleaned.status, 0, cleaned.stderr);
    assert.doesNotMatch(cleaned.stdout, /Retained unreferenced generated plugin/u);
    const state = JSON.parse(await readFile(
      path.join(marketplaceRoot, ".agents", "plugin-marketplace-development", "state.json"),
      "utf8",
    ));
    assert.equal("sample-plugin" in state.plugins, false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("init is non-interactive and refuses invalid or existing configuration", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "plugin-marketplace-init-"));
  const marketplaceRoot = path.join(tempRoot, "distribution");
  const schemaPath = path.join(
    marketplaceRoot,
    ".agents",
    "plugin-marketplace-development",
    "schema.json",
  );
  try {
    const missing = invoke(["init", marketplaceRoot, "--name", "sample"], tempRoot);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /--display-name/u);

    const invalidName = invoke([
      "init",
      marketplaceRoot,
      "--name",
      "invalid--marketplace",
      "--display-name",
      "Invalid Marketplace",
    ], tempRoot);
    assert.equal(invalidName.status, 1);
    assert.match(invalidName.stderr, /Agent Plugin name form/u);

    await mkdir(path.dirname(schemaPath), { recursive: true });
    await writeFile(
      schemaPath,
      '{"$comment":"@plugin-creator-agent-plugins managed-marketplace-schema v1"}\n',
      "utf8",
    );

    const initialized = invoke([
      "init",
      marketplaceRoot,
      "--name",
      "sample-marketplace",
      "--display-name",
      "Sample Marketplace",
    ], tempRoot);
    assert.equal(initialized.status, 0, initialized.stderr);
    assert.match(initialized.stdout, /Updated: \.agents\/plugin-marketplace-development\/schema\.json/u);
    const repeated = invoke([
      "init",
      marketplaceRoot,
      "--name",
      "sample-marketplace",
      "--display-name",
      "Sample Marketplace",
    ], tempRoot);
    assert.equal(repeated.status, 1);
    assert.match(repeated.stderr, /config\.json already exists/u);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
