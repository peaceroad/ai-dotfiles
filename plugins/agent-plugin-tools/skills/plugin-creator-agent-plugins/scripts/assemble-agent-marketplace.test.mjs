#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { filesystemGuidance, treeDigest } from "./assemble-agent-marketplace.mjs";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const assembler = path.join(scriptRoot, "assemble-agent-marketplace.mjs");
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

async function createSkill(root, name, description = `${name} description`) {
  await mkdir(root, { recursive: true });
  await writeFile(
    path.join(root, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
    "utf8",
  );
  await writeFile(path.join(root, "content.txt"), `${description}\n`, "utf8");
}

test("syncs standalone Skills with optional source provenance", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "skill-marketplace-"));
  const marketplaceRoot = path.join(tempRoot, "distribution");
  const skillRoot = path.join(tempRoot, "sources", "sample-skill");
  const configPath = path.join(tempRoot, "config.json");
  try {
    await createSkill(skillRoot, "sample-skill");
    await writeJson(configPath, {
      schemaVersion: 2,
      name: "test-marketplace",
      displayName: "Test Marketplace",
      plugins: [],
      skills: [{ source: skillRoot, sourceUrl: "https://example.com/sample-skill" }],
    });

    const outsideFile = path.join(tempRoot, "outside.txt");
    const outsideLink = path.join(skillRoot, "outside-link.txt");
    await writeFile(outsideFile, "outside\n", "utf8");
    try {
      await symlink(outsideFile, outsideLink, "file");
      const unsafeLink = invoke(["sync", marketplaceRoot, "--config", configPath], tempRoot);
      assert.equal(unsafeLink.status, 1);
      assert.match(unsafeLink.stderr, /symbolic link outside its root/u);
      await rm(outsideLink);
    } catch (error) {
      if (!["EPERM", "EACCES"].includes(error.code)) throw error;
    }

    const synced = invoke(["sync", marketplaceRoot, "--config", configPath], tempRoot);
    assert.equal(synced.status, 0, synced.stderr);
    assert.match(synced.stdout, /Synced: skills\/sample-skill/u);
    const catalog = JSON.parse(await readFile(
      path.join(marketplaceRoot, ".agents", "skills", "catalog.json"),
      "utf8",
    ));
    assert.equal(catalog.skills[0].name, "sample-skill");
    assert.equal(catalog.skills[0].sourceUrl, "https://example.com/sample-skill");
    assert.match(catalog.skills[0].digest, /^sha256-tree-v2:[0-9a-f]{64}$/u);
    assert.equal(invoke(["check", marketplaceRoot, "--config", configPath], tempRoot).status, 0);

    await writeFile(path.join(skillRoot, "content.txt"), "updated\n", "utf8");
    const changed = invoke([
      "check", marketplaceRoot, "--config", configPath, "--skill", "sample-skill",
    ], tempRoot);
    assert.equal(changed.status, 1);
    assert.match(changed.stderr, /Changed: skills\/sample-skill/u);
    const scoped = invoke([
      "sync", marketplaceRoot, "--config", configPath, "--skill", "sample-skill",
    ], tempRoot);
    assert.equal(scoped.status, 0, scoped.stderr);
    assert.match(scoped.stdout, /Marketplace Skill sync complete/u);
    assert.equal(invoke(["check", marketplaceRoot, "--config", configPath], tempRoot).status, 0);

    await writeJson(configPath, {
      schemaVersion: 2,
      name: "test-marketplace",
      displayName: "Test Marketplace",
      plugins: [],
      skills: [{ source: skillRoot, sourceUrl: "https://example.com/sample-skill?token=secret" }],
    });
    const unsafeUrl = invoke(["check", marketplaceRoot, "--config", configPath], tempRoot);
    assert.equal(unsafeUrl.status, 1);
    assert.match(unsafeUrl.stderr, /without credentials, query parameters, or a fragment/u);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("standalone Skill frontmatter is checked before any distribution writes", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "skill-frontmatter-boundary-"));
  const marketplaceRoot = path.join(tempRoot, "distribution");
  const skillRoot = path.join(tempRoot, "sample-skill");
  const configPath = path.join(tempRoot, "config.json");
  try {
    await createSkill(skillRoot, "sample-skill");
    await writeJson(configPath, {
      schemaVersion: 2, name: "test-marketplace", displayName: "Test Marketplace",
      plugins: [], skills: [{ source: skillRoot }],
    });
    const initial = invoke(["sync", marketplaceRoot, "--config", configPath], tempRoot);
    assert.equal(initial.status, 0, initial.stderr);
    const before = await treeDigest(marketplaceRoot);
    for (const description of ["", "# comment-only", '""', "x".repeat(1025), "null", "|\n  unsupported block"]) {
      await createSkill(skillRoot, "sample-skill", description);
      for (const selected of [[], ["--skill", "sample-skill"]]) {
        for (const command of ["sync", "check"]) {
          const result = invoke([command, marketplaceRoot, "--config", configPath, ...selected], tempRoot);
          assert.equal(result.status, 1, result.stdout + result.stderr);
          assert.match(result.stderr, /description|unsupported multiline YAML/u);
          assert.equal(await treeDigest(marketplaceRoot), before);
        }
      }
    }
    for (const description of ["Use C# tools # comment", "'It''s a Skill' # comment", JSON.stringify('Use "quoted" text'), "x".repeat(1024)]) {
      await createSkill(skillRoot, "sample-skill", description);
      const result = invoke(["sync", marketplaceRoot, "--config", configPath], tempRoot);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(invoke(["check", marketplaceRoot, "--config", configPath], tempRoot).status, 0);
      assert.equal(await readFile(path.join(marketplaceRoot, "skills", "sample-skill", "SKILL.md"), "utf8"), await readFile(path.join(skillRoot, "SKILL.md"), "utf8"));
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("no arguments display read-only help", () => {
  const result = invoke([], scriptRoot);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /init <marketplace-root>/u);
  assert.match(result.stdout, /check <marketplace-root>/u);
  assert.equal(result.stderr, "");
});

test("commands reject the retired Marketplace management directory", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "plugin-marketplace-legacy-layout-"));
  const marketplaceRoot = path.join(tempRoot, "distribution");
  try {
    await mkdir(path.join(marketplaceRoot, ".agents", "plugin-marketplace-development"), {
      recursive: true,
    });
    const result = invoke([
      "init",
      marketplaceRoot,
      "--name",
      "sample-marketplace",
      "--display-name",
      "Sample Marketplace",
    ], tempRoot);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Rename that directory to \.agents\/marketplace-development/u);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("a symbolic-link entry point still runs the CLI", async (context) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "plugin-marketplace-link-"));
  const linkedAssembler = path.join(tempRoot, "assemble-agent-marketplace.mjs");
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
    assert.doesNotMatch(repeated.stdout, /Updated: \.agents\/marketplace-development\/state\.json/u);
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
      schemaVersion: 2,
      name: "external-marketplace",
      displayName: "External Marketplace",
      plugins: [{ source, category: "Tools" }],
      skills: [],
    });

    const synced = invoke(["sync", marketplaceRoot, "--config", configuration], tempRoot);
    assert.equal(synced.status, 0, synced.stderr);
    assert.match(synced.stdout, /Marketplace sync complete/u);
    await assert.rejects(
      readFile(path.join(marketplaceRoot, ".agents", "marketplace-development", "config.json"), "utf8"),
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

test("assembly rejects obsolete configuration schema versions", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "plugin-marketplace-schema-v1-"));
  const marketplaceRoot = path.join(tempRoot, "distribution");
  const configuration = path.join(tempRoot, "obsolete-config.json");
  try {
    await writeJson(configuration, {
      schemaVersion: 1,
      name: "obsolete-marketplace",
      displayName: "Obsolete Marketplace",
      plugins: [],
    });
    const result = invoke(["check", marketplaceRoot, "--config", configuration], tempRoot);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /config\.json\.schemaVersion must be 2/u);
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
    "marketplace-development",
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
    "marketplace-development",
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
      path.join(marketplaceRoot, ".agents", "marketplace-development", "state.json"),
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
    "marketplace-development",
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
    assert.match(initialized.stdout, /Updated: \.agents\/marketplace-development\/schema\.json/u);
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


test("portable tree digest has deterministic byte ordering and excludes host permissions", async () => {
  const { createHash } = await import("node:crypto");
  const { chmod } = await import("node:fs/promises");
  const root = await mkdtemp(path.join(os.tmpdir(), "portable-digest-"));
  try {
    await writeFile(path.join(root, "a.txt"), "a");
    await writeFile(path.join(root, "Z.txt"), "z");
    const fileHash = value => createHash("sha256").update(value).digest("hex");
    const expected = createHash("sha256").update(`f\0Z.txt\0${fileHash("z")}\0f\0a.txt\0${fileHash("a")}\0`).digest("hex");
    const before = await treeDigest(root);
    assert.equal(before, `sha256-tree-v2:${expected}`);
    if (process.platform !== "win32") {
      const legacyBefore = await treeDigest(root, true);
      await chmod(path.join(root, "a.txt"), 0o700);
      assert.equal(await treeDigest(root), before);
      assert.notEqual(await treeDigest(root, true), legacyBefore);
    }
    await writeFile(path.join(root, "a.txt"), "changed");
    assert.notEqual(await treeDigest(root), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("assembler accepts an explicitly selected root alias and rejects internal redirects", async (t) => {
  const { rename } = await import("node:fs/promises");
  for (const output of ["plugins", "skills", ".agents", ".agents/marketplace-development", ".agents/plugins", ".agents/skills", ".agents/marketplace-development/state.json"]) {
    await t.test(output, async (t) => {
      const root = await mkdtemp(path.join(os.tmpdir(), "assembler-boundary-"));
      try {
        const distribution = path.join(root, "distribution");
        const selected = path.join(root, "selected");
        const source = path.join(root, "sources", "sample-plugin");
        await createPlugin(source, "sample-plugin");
        await mkdir(distribution);
        try { await symlink(distribution, selected, "junction"); }
        catch (error) {
          if (["EPERM", "EACCES"].includes(error.code)) return t.skip("Symbolic links are unavailable");
          throw error;
        }
        const initialized = invoke(["init", selected, "--name", "sample", "--display-name", "Sample", "--plugin", source, "--category", "Tools"], root);
        assert.equal(initialized.status, 0, initialized.stderr);
        const synced = invoke(["sync", selected], root);
        assert.equal(synced.status, 0, synced.stderr);
        const redirected = path.join(distribution, output);
        const outside = path.join(root, "outside");
        if (output === "skills") await mkdir(redirected);
        await rename(redirected, outside);
        const file = output.endsWith(".json");
        await symlink(outside, redirected, file ? "file" : "junction");
        const before = file ? await readFile(outside) : await treeDigest(outside);
        for (const command of ["sync", "check", "add"]) {
          const result = invoke([command, selected, ...(command === "add" ? [source, "--category", "Tools"] : [])], root);
          assert.equal(result.status, 1, result.stderr);
          assert.match(result.stderr, /redirected/u);
        }
        assert.deepEqual(file ? await readFile(outside) : await treeDigest(outside), before);
      } finally { await rm(root, { recursive: true, force: true }); }
    });
  }
});

test("assembler preflights init output and rejects canonical source/output overlap", async (t) => {
  const { readdir } = await import("node:fs/promises");
  const root = await mkdtemp(path.join(os.tmpdir(), "assembler-source-boundary-"));
  try {
    const distribution = path.join(root, "distribution");
    const outside = path.join(root, "outside");
    await mkdir(distribution);
    await mkdir(outside);
    try { await symlink(outside, path.join(distribution, ".agents"), "junction"); }
    catch (error) {
      if (["EPERM", "EACCES"].includes(error.code)) return t.skip("Symbolic links are unavailable");
      throw error;
    }
    const rejected = invoke(["init", distribution, "--name", "sample", "--display-name", "Sample"], root);
    assert.equal(rejected.status, 1, rejected.stderr);
    assert.match(rejected.stderr, /redirected/u);
    assert.deepEqual(await readdir(outside), []);
    await rm(path.join(distribution, ".agents"));

    const generated = path.join(distribution, "plugins", "sample-plugin");
    await createPlugin(generated, "sample-plugin");
    const alias = path.join(root, "alias");
    await symlink(distribution, alias, "junction");
    const config = path.join(root, "config.json");
    await writeJson(config, { schemaVersion: 2, name: "sample", displayName: "Sample", skills: [],
      plugins: [{ source: path.join(alias, "plugins", "sample-plugin"), category: "Tools" }] });
    const before = await readFile(path.join(generated, "content.txt"));
    const result = invoke(["sync", distribution, "--config", config], root);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /source overlaps managed/u);
    assert.deepEqual(await readFile(path.join(generated, "content.txt")), before);
    assert.equal((await readdir(distribution)).includes(".agents"), false);

    // A source containing the destination would recursively consume its own output.
    await createPlugin(path.join(root, "source-plugin"), "parent-plugin");
    await writeJson(config, { schemaVersion: 2, name: "sample", displayName: "Sample", skills: [],
      plugins: [{ source: path.join(root, "source-plugin"), category: "Tools" }] });
    const nested = invoke(["sync", path.join(root, "source-plugin", "distribution"), "--config", config], root);
    assert.equal(nested.status, 1, nested.stderr);
    assert.match(nested.stderr, /source overlaps managed/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("streamed tree digests match buffered vectors for empty, binary, nested and linked entries", async (t) => {
  const { createHash } = await import("node:crypto");
  const { lstat, readdir, readlink } = await import("node:fs/promises");
  const root = await mkdtemp(path.join(os.tmpdir(), "assembler-digest-vector-"));
  try {
    await mkdir(path.join(root, "nested"));
    await writeFile(path.join(root, "empty"), Buffer.alloc(0));
    await writeFile(path.join(root, "Z.bin"), Buffer.from(Array.from({ length: 700003 }, (_, i) => i % 251)));
    await writeFile(path.join(root, "nested", "é.txt"), "text\u0000tail\n");
    try { await symlink("Z.bin", path.join(root, "link"), "file"); }
    catch (error) {
      if (!["EPERM", "EACCES"].includes(error.code)) throw error;
      t.diagnostic("Link vector unavailable; other digest vectors still checked");
    }
    for (const legacy of [false, true]) {
      const hash = createHash("sha256");
      async function buffered(directory, prefix = "") {
        const names = (await readdir(directory)).sort((a, b) => legacy ? a.localeCompare(b, "en") : Buffer.compare(Buffer.from(a), Buffer.from(b)));
        for (const name of names) {
          const file = path.join(directory, name);
          const rel = prefix ? `${prefix}/${name}` : name;
          const info = await lstat(file);
          if (info.isSymbolicLink()) hash.update(`l\0${rel}\0${await readlink(file)}\0`);
          else {
            hash.update(`${info.isDirectory() ? "d" : "f"}\0${rel}\0${legacy ? `${info.mode & 0o777}\0` : ""}`);
            if (info.isDirectory()) await buffered(file, rel);
            else {
              const bytes = await readFile(file);
              hash.update(legacy ? bytes : createHash("sha256").update(bytes).digest("hex"));
              hash.update("\0");
            }
          }
        }
      }
      await buffered(root);
      assert.equal(await treeDigest(root, legacy), `${legacy ? "sha256" : "sha256-tree-v2"}:${hash.digest("hex")}`);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("assembler resolves a new selected root beneath an aliased ancestor", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "assembler-new-root-"));
  try {
    const parent = path.join(root, "parent");
    const alias = path.join(root, "selected-parent");
    await mkdir(parent);
    try { await symlink(parent, alias, "junction"); }
    catch (error) {
      if (["EPERM", "EACCES"].includes(error.code)) return t.skip("Symbolic links are unavailable");
      throw error;
    }
    const selected = path.join(alias, "new-marketplace");
    const result = invoke(["init", selected, "--name", "sample", "--display-name", "Sample"], root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(invoke(["sync", selected], root).status, 0);
    assert.equal(invoke(["check", path.join(parent, "new-marketplace")], root).status, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("assembler errors and recovery paths hide a synthetic private home", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "assembler-diagnostics-"));
  try {
    const result = spawnSync(process.execPath, [assembler, "sync", path.join(home, "missing")], {
      encoding: "utf8", env: { ...process.env, HOME: home, USERPROFILE: home },
    });
    assert.equal(result.status, 1);
    assert.ok(!result.stderr.includes(home));
    assert.match(result.stderr, /~\/missing/u);
    const guidance = filesystemGuidance({ code: "EACCES", path: path.join(home, "marketplace") }, { root: home, command: "sync" });
    assert.ok(!guidance.includes(home));
    assert.match(guidance, /Reported path:/u);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("assembler preserves temporary, staging and backup collisions", async (t) => {
  const { pathToFileURL } = await import("node:url");
  for (const kind of ["temporary", "staging", "backup"]) await t.test(kind, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "assembler-collision-"));
    try {
      const distribution = path.join(root, "distribution");
      const source = path.join(root, "source");
      const config = path.join(root, "config.json");
      await createPlugin(source, "sample");
      await writeJson(config, { schemaVersion: 2, name: "sample", displayName: "Sample", skills: [],
        plugins: [{ source, category: "Tools" }] });
      if (kind === "backup") {
        const initialized = invoke(["init", distribution, "--name", "sample", "--display-name", "Sample"], root);
        assert.equal(initialized.status, 0, initialized.stderr);
      }
      const preload = path.join(root, "collision.mjs"), marker = path.join(root, "collision-path.txt");
      await writeFile(preload, `import fs from "node:fs"; import path from "node:path";
import crypto from "node:crypto"; import { syncBuiltinESMExports } from "node:module";
if (process.argv[1] === ${JSON.stringify(assembler)}) {
  crypto.randomUUID = () => "fixed"; syncBuiltinESMExports();
  const directory = path.join(${JSON.stringify(distribution)}, ".agents", "marketplace-development");
  const kind = ${JSON.stringify(kind)};
  const collision = path.join(directory, kind === "staging" ? ".staging-" + process.pid + "-fixed"
    : kind === "backup" ? "config.json.bak-" + process.pid + "-fixed" : "schema.json.tmp-" + process.pid + "-fixed");
  fs.mkdirSync(path.dirname(collision), { recursive: true });
  if (kind === "staging") fs.mkdirSync(collision);
  fs.writeFileSync(kind === "staging" ? path.join(collision, "sentinel") : collision, "another writer");
  fs.writeFileSync(${JSON.stringify(marker)}, collision);
}\n`);
      const args = kind === "temporary" ? ["init", distribution, "--name", "sample", "--display-name", "Sample"]
        : kind === "staging" ? ["sync", distribution, "--config", config] : ["add", distribution, source, "--category", "Tools"];
      const result = spawnSync(process.execPath, [assembler, ...args], {
        encoding: "utf8", env: { ...process.env, NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` },
      });
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, kind === "backup" ? /Backup path already exists/u : /EEXIST/u);
      const collision = await readFile(marker, "utf8");
      assert.equal(await readFile(kind === "staging" ? path.join(collision, "sentinel") : collision, "utf8"), "another writer");
      if (kind === "backup") assert.deepEqual(JSON.parse(await readFile(path.join(distribution, ".agents", "marketplace-development", "config.json"))).plugins, []);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

test("assembler redacts known source paths in captured validator failures", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "assembler-child-diagnostics-"));
  try {
    const source = path.join(root, "private-source");
    await createPlugin(source, "sample");
    try { await symlink(path.join(root, "missing"), path.join(source, "dangling"), "file"); }
    catch (error) {
      if (["EPERM", "EACCES"].includes(error.code)) return t.skip("Symbolic links are unavailable");
      throw error;
    }
    const result = spawnSync(process.execPath, [assembler, "init", path.join(root, "marketplace"), "--name", "sample", "--display-name", "Sample", "--plugin", source, "--category", "Tools"], {
      encoding: "utf8", env: { ...process.env, HOME: path.join(root, "home"), USERPROFILE: path.join(root, "home") },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Cannot resolve link/u);
    assert.ok(!result.stderr.includes(root));
  } finally { await rm(root, { recursive: true, force: true }); }
});
