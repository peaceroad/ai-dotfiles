import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const CLI = join(import.meta.dirname, "agent.mjs");

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

function run(cli, args, env) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
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
  writeJson(pluginConfig, { schemaVersion: 1, pluginRoot: "plugins/sample-plugin" });
  makeRunner(skillManager, "skill");
  makeRunner(marketplaceManager, "marketplace");
  makeRunner(pluginRunner, "plugin");
  writeJson(configPath, {
    schemaVersion: 1,
    plugins: {
      sample: {
        repository: repository.replaceAll("\\", "/"),
        config: ".agents/plugin-development/sample-plugin.json",
      },
    },
    marketplaces: {
      shared: { root: join(root, "shared") },
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
    assert.equal(run(CLI, ["dev", "marketplace", "check"], env).status, 0);
    assert.equal(run(CLI, ["dev", "marketplace", "sync"], env).status, 0);

    mkdirSync(join(home, ".agents", "skills", "sample-skill"), { recursive: true });
    const blocked = run(CLI, ["dev", "plugin", "sync"], env);
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /active user-scoped entries/u);

    rmSync(join(home, ".agents", "skills", "sample-skill"), { recursive: true });
    assert.equal(run(CLI, ["dev", "plugin", "sync"], env).status, 0);

    const calls = readFileSync(log, "utf8").trim().split("\n");
    assert.equal(calls.length, 5);
    assert.match(calls[0], /^skill:\["check"\]$/u);
    assert.match(calls[1], /^plugin:\["validate","--config",/u);
    assert.match(calls[2], /^marketplace:\["check",/u);
    assert.match(calls[3], /^marketplace:\["sync",/u);
    assert.match(calls[4], /^plugin:\["install","--config",/u);
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
