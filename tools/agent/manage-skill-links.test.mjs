import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const MANAGER = resolve(import.meta.dirname, "..", "..", "home", ".agents", "scripts", "manage-skill-links.mjs");

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function run(args, env) {
  return spawnSync(process.execPath, [MANAGER, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("validates, checks, and safely synchronizes declared skill links", () => {
  const root = join(tmpdir(), `skill-links-${process.pid}-${Date.now()}`);
  const home = join(root, "home");
  const target = join(home, "repos", "sample-skill");
  const manifest = join(home, ".agents", "skill-links.json");
  const link = join(home, ".agents", "skills", "sample-skill");
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "SKILL.md"), "---\nname: sample-skill\n---\n", "utf8");
  writeJson(manifest, {
    schemaVersion: 1,
    linkRoot: "~/.agents/skills",
    skills: { "sample-skill": "~/repos/sample-skill" },
  });
  const env = { AGENT_DEV_HOME: home, AGENT_DEV_SKILL_LINKS: manifest };

  try {
    assert.equal(run(["validate"], env).status, 0);
    const status = run(["status"], env);
    assert.equal(status.status, 0);
    assert.match(status.stdout, /^missing\s+sample-skill/mu);
    assert.equal(run(["check"], env).status, 1);

    const synchronized = run(["sync"], env);
    assert.equal(synchronized.status, 0, synchronized.stderr);
    assert.equal(lstatSync(link).isSymbolicLink(), true);
    assert.equal(resolve(dirname(link), readlinkSync(link)), resolve(target));
    assert.equal(run(["check"], env).status, 0);

    rmSync(link);
    mkdirSync(link);
    const refused = run(["sync"], env);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /sync never replaces an existing path/u);
    assert.equal(lstatSync(link).isDirectory(), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
