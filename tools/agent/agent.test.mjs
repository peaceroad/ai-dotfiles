import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const CLI = join(import.meta.dirname, "agent.mjs");
const MARKETPLACE_MANAGER = join(
  import.meta.dirname,
  "..",
  "..",
  "plugins",
  "agent-plugin-tools",
  "skills",
  "plugin-creator-agent-plugins",
  "scripts",
  "assemble-plugin-marketplace.mjs",
);

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeRunner(path, role) {
  writeFileSync(
    path,
    `import { appendFileSync } from "node:fs";\nappendFileSync(process.env.AGENT_DEV_LOG, ${JSON.stringify(role)} + ":" + JSON.stringify(process.argv.slice(2)) + "\\n");\n`,
    "utf8",
  );
}

function run(cli, args, env, input) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    input,
  });
}

test("dispatches each development boundary and blocks duplicate skill discovery", () => {
  const root = join(tmpdir(), `agent-dev-${process.pid}-${Date.now()}`);
  const home = join(root, "home");
  const repository = join(home, "repos", "sample");
  const pluginRoot = join(repository, "plugins", "sample-plugin");
  const configDirectory = join(repository, ".agents", "plugin-development");
  const runnerDirectory = join(repository, "scripts");
  const toolsDirectory = join(root, "tools");
  const log = join(root, "calls.log");
  const configPath = join(home, ".agents", "development.json");
  const pluginConfig = join(configDirectory, "sample-plugin.json");
  const skillManager = join(toolsDirectory, "skill.mjs");
  const marketplaceManager = join(toolsDirectory, "marketplace.mjs");
  const pluginRunner = join(runnerDirectory, "local-plugin.mjs");

  mkdirSync(join(pluginRoot, "skills", "sample-skill"), { recursive: true });
  mkdirSync(configDirectory, { recursive: true });
  mkdirSync(runnerDirectory, { recursive: true });
  mkdirSync(toolsDirectory, { recursive: true });
  mkdirSync(join(home, ".agents"), { recursive: true });
  writeFileSync(join(pluginRoot, "skills", "sample-skill", "SKILL.md"), "---\nname: sample-skill\n---\n", "utf8");
  writeJson(join(pluginRoot, "plugin.json"), { name: "sample-plugin", version: "1.0.0" });
  writeJson(pluginConfig, { schemaVersion: 1, pluginRoot: "plugins/sample-plugin" });
  makeRunner(skillManager, "skill");
  makeRunner(marketplaceManager, "marketplace");
  makeRunner(pluginRunner, "plugin");
  writeJson(configPath, {
    schemaVersion: 2,
    plugins: {
      sample: {
        repository: repository.replaceAll("\\", "/"),
        developmentConfig: ".agents/plugin-development/sample-plugin.json",
      },
    },
    marketplaces: {
      shared: {
        root: join(root, "shared"),
        name: "shared",
        displayName: "Shared",
        mode: "authoritative",
        plugins: [{ target: "sample", category: "Tools" }],
      },
    },
  });

  const env = {
    AGENT_DEV_HOME: home,
    AGENT_DEV_CONFIG: configPath,
    AGENT_DEV_SKILL_MANAGER: skillManager,
    AGENT_DEV_MARKETPLACE_MANAGER: marketplaceManager,
    AGENT_DEV_LOG: log,
  };

  try {
    assert.equal(run(CLI, ["dev", "skill", "check"], env).status, 0);
    assert.equal(run(CLI, ["dev", "plugin", "check"], env).status, 0);
    assert.equal(run(CLI, ["dev", "marketplace", "sync"], env).status, 0);
    assert.equal(run(CLI, ["dev", "marketplace", "check"], env).status, 0);
    assert.equal(run(CLI, ["dev", "marketplace", "check", "--plugin", "sample"], env).status, 0);

    mkdirSync(join(home, ".agents", "skills", "sample-skill"), { recursive: true });
    const blocked = run(CLI, ["dev", "plugin", "sync"], env);
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /active user-scoped entries/u);

    rmSync(join(home, ".agents", "skills", "sample-skill"), { recursive: true });
    assert.equal(run(CLI, ["dev", "plugin", "sync"], env).status, 0);

    const calls = readFileSync(log, "utf8").trim().split("\n");
    assert.equal(calls.length, 6);
    assert.match(calls[0], /^skill:\["check"\]$/u);
    assert.match(calls[1], /^plugin:\["validate","--config",/u);
    assert.match(calls[2], /^marketplace:\["sync",.*,"--config",/u);
    assert.match(calls[3], /^marketplace:\["check",.*,"--config",/u);
    assert.match(calls[4], /^marketplace:\["check",.*,"--config",.*,"--plugin","sample-plugin","--merge"\]$/u);
    assert.match(calls[5], /^plugin:\["install","--config",/u);

    const mirror = readFileSync(join(root, "shared", ".agents", "plugin-marketplace-development", "config.json"), "utf8");
    assert.doesNotMatch(mirror, /repos/u);
    assert.deepEqual(JSON.parse(mirror).plugins, [{ name: "sample-plugin", category: "Tools" }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("direct plugin targets validate through the common manager and require explicit install policy", () => {
  const root = join(tmpdir(), `agent-dev-direct-plugin-${process.pid}-${Date.now()}`);
  const home = join(root, "home");
  const repository = join(root, "repository");
  const pluginRoot = join(repository, "plugins", "direct-plugin");
  const configPath = join(home, ".agents", "development.json");
  const manager = join(root, "manage-local-agent-plugin.mjs");
  const log = join(root, "calls.log");
  mkdirSync(join(pluginRoot, "skills", "direct-skill"), { recursive: true });
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(join(pluginRoot, "skills", "direct-skill", "SKILL.md"), "---\nname: direct-skill\n---\n", "utf8");
  writeJson(join(pluginRoot, "plugin.json"), { name: "direct-plugin", version: "1.0.0" });
  makeRunner(manager, "direct-plugin");
  const config = {
    schemaVersion: 2,
    plugins: { direct: { repository, pluginRoot: "plugins/direct-plugin" } },
    marketplaces: {},
  };
  writeJson(configPath, config);
  const env = {
    AGENT_DEV_HOME: home,
    AGENT_DEV_CONFIG: configPath,
    AGENT_DEV_LOCAL_PLUGIN_MANAGER: manager,
    AGENT_DEV_LOG: log,
  };

  try {
    const checked = run(CLI, ["dev", "plugin", "check"], env);
    assert.equal(checked.status, 0, checked.stderr);
    assert.match(checked.stdout, /portable package only; no repository-specific checks/u);
    const disabled = run(CLI, ["dev", "plugin", "sync"], env);
    assert.equal(disabled.status, 2);
    assert.match(disabled.stderr, /requires versionPolicy "bump" or "keep"/u);

    config.plugins.direct.versionPolicy = "keep";
    writeJson(configPath, config);
    assert.equal(run(CLI, ["dev", "plugin", "sync"], env).status, 0);
    const calls = readFileSync(log, "utf8").trim().split("\n");
    assert.match(calls[0], /^direct-plugin:\["validate",/u);
    assert.match(calls[1], /^direct-plugin:\["install",.*,"--keep-version"\]$/u);

    mkdirSync(join(home, ".agents", "skills", "direct-skill"), { recursive: true });
    const conflict = run(CLI, ["dev", "plugin", "sync"], env);
    assert.equal(conflict.status, 1);
    assert.match(conflict.stderr, /active user-scoped entries for: direct-skill/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("configures a new Marketplace and plugin assignment without syncing", () => {
  const root = join(tmpdir(), `agent-dev-configure-${process.pid}-${Date.now()}`);
  const home = join(root, "home");
  const repository = join(home, "repos", "sample");
  const marketplaceRoot = join(root, "marketplace");
  const configPath = join(home, ".agents", "development.json");
  mkdirSync(join(home, ".agents"), { recursive: true });
  mkdirSync(repository, { recursive: true });

  const input = [
    "1",
    "shared",
    marketplaceRoot,
    "",
    "Shared Marketplace",
    "c",
    "broken",
    join(root, "missing-marketplace"),
    "p",
    "n",
    "sample",
    repository,
    "1",
    ".agents/plugin-development/sample-plugin.json",
    "",
    "Tools",
    "p",
    "n",
    "portable",
    repository,
    "2",
    "plugins/portable",
    "1",
    "Productivity",
    "t",
    "b",
    "e",
    `${marketplaceRoot}-discarded`,
    ":back",
    "s",
    "",
  ].join("\n");

  try {
    const result = run(CLI, ["dev", "marketplace", "configure"], {
      AGENT_DEV_HOME: home,
      AGENT_DEV_CONFIG: configPath,
    }, input);
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(config.schemaVersion, 2);
    assert.equal(config.plugins.sample.developmentConfig, ".agents/plugin-development/sample-plugin.json");
    assert.equal(config.plugins.portable.pluginRoot, "plugins/portable");
    assert.equal(config.plugins.portable.versionPolicy, "keep");
    assert.deepEqual(config.marketplaces.shared.plugins, [
      { target: "sample", category: "Tools" },
      { target: "portable", category: "Productivity" },
    ]);
    assert.equal(config.marketplaces.shared.root, marketplaceRoot);
    assert.match(result.stdout, /Created: ~\/\.agents\/development\.json/u);
    assert.match(result.stdout, /Run agent dev marketplace check or sync explicitly/u);
    assert.doesNotMatch(result.stdout, /Choose Marketplace target:/u);
    assert.match(result.stdout, /Choose plugin target:/u);
    assert.match(result.stdout, /Cancelled editing a Marketplace; no changes from this operation were kept/u);
    assert.match(result.stdout, /Could not complete connecting a Marketplace; no changes from this operation were kept/u);
    assert.match(result.stdout, /1\/r\. Use repository settings/u);
    assert.match(result.stdout, /2\/d\. Use the plugin directory directly/u);
    assert.match(result.stdout, /1\/k\. Keep the current version/u);

    const cancelled = run(CLI, ["dev", "marketplace", "setup", "shared"], {
      AGENT_DEV_HOME: home,
      AGENT_DEV_CONFIG: configPath,
    }, "q\n");
    assert.equal(cancelled.status, 0, cancelled.stderr);
    assert.match(cancelled.stdout, /Configuration was not changed/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("requires an explicit target when multiple Marketplaces are configured", () => {
  const root = join(tmpdir(), `agent-dev-multiple-${process.pid}-${Date.now()}`);
  const home = join(root, "home");
  const configPath = join(home, ".agents", "development.json");
  mkdirSync(join(home, ".agents"), { recursive: true });
  writeJson(configPath, {
    schemaVersion: 2,
    plugins: {},
    marketplaces: {
      first: { root: join(root, "first"), name: "first", displayName: "First", mode: "authoritative", plugins: [] },
      second: { root: join(root, "second"), name: "second", displayName: "Second", mode: "authoritative", plugins: [] },
    },
  });
  try {
    const result = run(CLI, ["dev", "marketplace", "check"], {
      AGENT_DEV_HOME: home,
      AGENT_DEV_CONFIG: configPath,
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Choose a marketplace: first, second/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("configure selects one Marketplace for the session and can switch it", () => {
  const root = join(tmpdir(), `agent-dev-configure-multiple-${process.pid}-${Date.now()}`);
  const home = join(root, "home");
  const configPath = join(home, ".agents", "development.json");
  mkdirSync(dirname(configPath), { recursive: true });
  writeJson(configPath, {
    schemaVersion: 2,
    plugins: {},
    marketplaces: {
      first: { root: join(root, "first"), name: "first", displayName: "First", mode: "authoritative", plugins: [] },
      second: { root: join(root, "second"), name: "second", displayName: "Second", mode: "authoritative", plugins: [] },
    },
  });

  try {
    const result = run(CLI, ["dev", "marketplace", "configure"], {
      AGENT_DEV_HOME: home,
      AGENT_DEV_CONFIG: configPath,
    }, [
      "2",
      "e", "", "", "Second updated",
      "m", "1",
      "e", "", "", "First updated",
      "s",
      "",
    ].join("\n"));
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(config.marketplaces.first.displayName, "First updated");
    assert.equal(config.marketplaces.second.displayName, "Second updated");
    assert.match(result.stdout, /Configure local development \(Marketplace: second\)/u);
    assert.match(result.stdout, /Configure local development \(Marketplace: first\)/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects obsolete development configuration instead of migrating it", () => {
  const root = join(tmpdir(), `agent-dev-obsolete-${process.pid}-${Date.now()}`);
  const home = join(root, "home");
  const configPath = join(home, ".agents", "development.json");
  mkdirSync(dirname(configPath), { recursive: true });
  writeJson(configPath, { schemaVersion: 1, plugins: {}, marketplaces: {} });

  try {
    const result = run(CLI, ["dev", "marketplace", "configure"], {
      AGENT_DEV_HOME: home,
      AGENT_DEV_CONFIG: configPath,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /schemaVersion must be 2/u);
    assert.equal(JSON.parse(readFileSync(configPath, "utf8")).schemaVersion, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("imports a standalone Marketplace from the configure menu", () => {
  const root = join(tmpdir(), `agent-dev-import-${process.pid}-${Date.now()}`);
  const home = join(root, "home");
  const repository = join(home, "repos", "sample");
  const pluginRoot = join(repository, "plugins", "sample-plugin");
  const marketplaceRoot = join(root, "marketplace");
  const configPath = join(home, ".agents", "development.json");
  mkdirSync(join(repository, ".git"), { recursive: true });
  mkdirSync(pluginRoot, { recursive: true });
  mkdirSync(join(marketplaceRoot, ".agents", "plugin-marketplace-development"), { recursive: true });
  mkdirSync(join(home, ".agents"), { recursive: true });
  writeJson(join(pluginRoot, "plugin.json"), { name: "sample-plugin" });
  writeJson(join(marketplaceRoot, ".agents", "plugin-marketplace-development", "config.json"), {
    schemaVersion: 1,
    name: "sample-marketplace",
    displayName: "Sample Marketplace",
    plugins: [{ source: pluginRoot, category: "Tools" }],
  });
  writeJson(configPath, { schemaVersion: 2, plugins: {}, marketplaces: {} });

  try {
    const result = run(CLI, ["dev", "marketplace", "configure"], {
      AGENT_DEV_HOME: home,
      AGENT_DEV_CONFIG: configPath,
    }, ["2", "sample", marketplaceRoot, "s", ""].join("\n"));
    assert.equal(result.status, 0, result.stderr);
    const configured = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(configured.plugins["sample-plugin"].pluginRoot, "plugins/sample-plugin");
    assert.equal(configured.marketplaces.sample.mode, "authoritative");
    assert.deepEqual(configured.marketplaces.sample.plugins, [{ target: "sample-plugin", category: "Tools" }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("materializes private target references without publishing repository paths", () => {
  const root = join(tmpdir(), `agent-dev-materialize-${process.pid}-${Date.now()}`);
  const home = join(root, "home");
  const repository = join(home, "repos", "sample");
  const pluginRoot = join(repository, "plugins", "sample-plugin");
  const marketplaceRoot = join(root, "marketplace");
  const configPath = join(home, ".agents", "development.json");
  mkdirSync(pluginRoot, { recursive: true });
  mkdirSync(join(home, ".agents"), { recursive: true });
  writeJson(join(pluginRoot, "plugin.json"), {
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    name: "sample-plugin",
    version: "0.1.0",
    description: "Sample plugin.",
  });
  const development = {
    schemaVersion: 2,
    plugins: {
      sample: {
        repository,
        pluginRoot: "plugins/sample-plugin",
      },
    },
    marketplaces: {
      shared: {
        root: marketplaceRoot,
        name: "shared-marketplace",
        displayName: "Shared Marketplace",
        mode: "authoritative",
        plugins: [{ target: "sample", category: "Tools" }],
      },
    },
  };
  writeJson(configPath, development);
  mkdirSync(join(marketplaceRoot, ".agents", "plugin-marketplace-development"), { recursive: true });
  writeJson(join(marketplaceRoot, ".agents", "plugin-marketplace-development", "config.json"), {
    $schema: "./schema.json",
    schemaVersion: 1,
    name: "shared-marketplace",
    displayName: "Shared Marketplace",
    plugins: [{ source: pluginRoot, category: "Tools" }],
  });
  const env = {
    AGENT_DEV_HOME: home,
    AGENT_DEV_CONFIG: configPath,
    AGENT_DEV_MARKETPLACE_MANAGER: MARKETPLACE_MANAGER,
  };

  try {
    const synced = run(CLI, ["dev", "marketplace", "sync"], env);
    assert.equal(synced.status, 0, synced.stderr);
    assert.match(synced.stdout, /Updated: \.agents\/plugin-marketplace-development\/config\.json/u);
    const mirrorPath = join(marketplaceRoot, ".agents", "plugin-marketplace-development", "config.json");
    const mirrorText = readFileSync(mirrorPath, "utf8");
    assert.doesNotMatch(mirrorText, /repos/u);
    assert.deepEqual(JSON.parse(mirrorText).plugins, [{ name: "sample-plugin", category: "Tools" }]);
    assert.equal(run(CLI, ["dev", "marketplace", "check"], env).status, 0);

    development.marketplaces.shared.plugins[0].category = "Editorial";
    writeJson(configPath, development);
    const failingManager = join(root, "failing-marketplace-manager.mjs");
    writeFileSync(failingManager, "process.stderr.write('Expected manager failure.\\n'); process.exitCode = 1;\n", "utf8");
    const failed = run(CLI, ["dev", "marketplace", "sync"], {
      ...env,
      AGENT_DEV_MARKETPLACE_MANAGER: failingManager,
    });
    assert.equal(failed.status, 1);
    assert.equal(JSON.parse(readFileSync(mirrorPath, "utf8")).plugins[0].category, "Tools");

    assert.equal(run(CLI, ["dev", "marketplace", "sync"], env).status, 0);
    const updatedMirror = JSON.parse(readFileSync(mirrorPath, "utf8"));
    assert.equal(updatedMirror.plugins[0].category, "Editorial");

    updatedMirror.plugins[0].category = "Manual edit";
    writeJson(mirrorPath, updatedMirror);
    const refused = run(CLI, ["dev", "marketplace", "sync"], env);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /changed outside agent dev/u);

    const lockPath = join(marketplaceRoot, ".agents", "plugin-marketplace-development", "agent-dev-sync.lock");
    mkdirSync(lockPath);
    const locked = run(CLI, ["dev", "marketplace", "check"], env);
    assert.equal(locked.status, 1);
    assert.match(locked.stderr, /being synchronized/u);
    rmSync(lockPath, { recursive: true, force: true });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scoped Marketplace sync merges one contributor plugin into existing output", () => {
  const root = join(tmpdir(), `agent-dev-contributor-${process.pid}-${Date.now()}`);
  const home = join(root, "home");
  const firstRepository = join(home, "repos", "first");
  const secondRepository = join(home, "repos", "second");
  const firstPlugin = join(firstRepository, "plugins", "first-plugin");
  const secondPlugin = join(secondRepository, "plugins", "second-plugin");
  const marketplaceRoot = join(root, "marketplace");
  const configPath = join(home, ".agents", "development.json");
  mkdirSync(firstPlugin, { recursive: true });
  mkdirSync(secondPlugin, { recursive: true });
  mkdirSync(dirname(configPath), { recursive: true });
  for (const [pluginRoot, name] of [[firstPlugin, "first-plugin"], [secondPlugin, "second-plugin"]]) {
    writeJson(join(pluginRoot, "plugin.json"), {
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name,
      version: "0.1.0",
      description: `${name} description`,
    });
  }
  const marketplace = {
    root: marketplaceRoot,
    name: "shared-marketplace",
    displayName: "Shared Marketplace",
    mode: "authoritative",
  };
  const env = {
    AGENT_DEV_HOME: home,
    AGENT_DEV_CONFIG: configPath,
    AGENT_DEV_MARKETPLACE_MANAGER: MARKETPLACE_MANAGER,
  };

  try {
    writeJson(configPath, {
      schemaVersion: 2,
      plugins: { first: { repository: firstRepository, pluginRoot: "plugins/first-plugin" } },
      marketplaces: { shared: { ...marketplace, plugins: [{ target: "first", category: "Tools" }] } },
    });
    const initial = run(CLI, ["dev", "marketplace", "sync"], env);
    assert.equal(initial.status, 0, initial.stderr);

    writeJson(configPath, { schemaVersion: 2, plugins: {}, marketplaces: {} });
    const connected = run(CLI, ["dev", "marketplace", "setup"], env, [
      "2",
      "shared",
      marketplaceRoot,
      "s",
      "",
    ].join("\n"));
    assert.equal(connected.status, 0, connected.stderr);
    const connectedConfig = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(connectedConfig.marketplaces.shared.name, "shared-marketplace");
    assert.equal(connectedConfig.marketplaces.shared.mode, "contributor");
    assert.deepEqual(connectedConfig.marketplaces.shared.plugins, []);

    writeJson(configPath, {
      schemaVersion: 2,
      plugins: { second: { repository: secondRepository, pluginRoot: "plugins/second-plugin" } },
      marketplaces: {
        shared: {
          ...marketplace,
          mode: "contributor",
          plugins: [{ target: "second", category: "Editorial" }],
        },
      },
    });
    const unsafeFull = run(CLI, ["dev", "marketplace", "sync"], env);
    assert.equal(unsafeFull.status, 2);
    assert.match(unsafeFull.stderr, /contributor-managed.*--plugin/u);
    const contributed = run(CLI, ["dev", "marketplace", "sync", "--plugin", "second"], env);
    assert.equal(contributed.status, 0, contributed.stderr);
    assert.match(contributed.stdout, /Other plugin copies were not checked/u);

    const catalog = JSON.parse(readFileSync(
      join(marketplaceRoot, ".agents", "plugins", "marketplace.json"),
      "utf8",
    ));
    assert.deepEqual(catalog.plugins.map((plugin) => plugin.name), ["first-plugin", "second-plugin"]);
    const mirror = JSON.parse(readFileSync(
      join(marketplaceRoot, ".agents", "plugin-marketplace-development", "config.json"),
      "utf8",
    ));
    assert.deepEqual(mirror.plugins, [
      { name: "first-plugin", category: "Tools" },
      { name: "second-plugin", category: "Editorial" },
    ]);
    assert.doesNotMatch(JSON.stringify(mirror), /repos/u);

    const incompletePromotion = run(CLI, ["dev", "marketplace", "configure"], env, [
      "o",
      "authoritative",
      "q",
      "",
    ].join("\n"));
    assert.equal(incompletePromotion.status, 0, incompletePromotion.stderr);
    assert.match(incompletePromotion.stdout, /local sources are missing: first-plugin/u);
    assert.equal(JSON.parse(readFileSync(configPath, "utf8")).marketplaces.shared.mode, "contributor");

    writeJson(configPath, {
      schemaVersion: 2,
      plugins: {
        first: { repository: firstRepository, pluginRoot: "plugins/first-plugin" },
        second: { repository: secondRepository, pluginRoot: "plugins/second-plugin" },
      },
      marketplaces: {
        shared: {
          ...marketplace,
          mode: "contributor",
          plugins: [
            { target: "first", category: "Tools" },
            { target: "second", category: "Editorial" },
          ],
        },
      },
    });
    const promoted = run(CLI, ["dev", "marketplace", "configure"], env, [
      "o",
      "authoritative",
      "y",
      "s",
      "",
    ].join("\n"));
    assert.equal(promoted.status, 0, promoted.stderr);
    assert.equal(JSON.parse(readFileSync(configPath, "utf8")).marketplaces.shared.mode, "authoritative");

    writeFileSync(join(firstPlugin, "README.md"), "Unsynchronized source change.\n", "utf8");
    const incompleteHandoff = run(CLI, ["dev", "marketplace", "configure"], env, [
      "o",
      "contributor",
      "q",
      "",
    ].join("\n"));
    assert.equal(incompleteHandoff.status, 0, incompleteHandoff.stderr);
    assert.match(incompleteHandoff.stdout, /complete Marketplace is not synchronized/u);
    assert.equal(JSON.parse(readFileSync(configPath, "utf8")).marketplaces.shared.mode, "authoritative");

    assert.equal(run(CLI, ["dev", "marketplace", "sync"], env).status, 0);
    const handedOff = run(CLI, ["dev", "marketplace", "configure"], env, [
      "o",
      "contributor",
      "y",
      "s",
      "",
    ].join("\n"));
    assert.equal(handedOff.status, 0, handedOff.stderr);
    assert.equal(JSON.parse(readFileSync(configPath, "utf8")).marketplaces.shared.mode, "contributor");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("help does not require local configuration", () => {
  const result = run(CLI, ["--help"], {
    AGENT_DEV_CONFIG: join(tmpdir(), "missing-agent-development.json"),
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /agent dev plugin sync/u);
});

test("skill commands do not require plugin and Marketplace configuration", () => {
  const root = join(tmpdir(), `agent-dev-skill-${process.pid}-${Date.now()}`);
  const runner = join(root, "skill.mjs");
  const log = join(root, "calls.log");
  mkdirSync(root, { recursive: true });
  makeRunner(runner, "skill");
  try {
    const result = run(CLI, ["dev", "skill", "check"], {
      AGENT_DEV_CONFIG: join(root, "missing.json"),
      AGENT_DEV_SKILL_MANAGER: runner,
      AGENT_DEV_LOG: log,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(log, "utf8").trim(), 'skill:["check"]');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
