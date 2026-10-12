#!/usr/bin/env node

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-builtin-plugin-creator.mjs");
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "check-plugin-creator-"));
let failed = false;

async function run(name, content, expectedStatus) {
  const skillPath = path.join(tempRoot, `${name}.md`);
  await writeFile(skillPath, content, "utf8");
  const result = spawnSync(process.execPath, [script, "--skill-path", skillPath, "--json"], { encoding: "utf8" });
  let output;
  try {
    output = JSON.parse(result.stdout);
  } catch {
    output = { stdout: result.stdout, stderr: result.stderr };
  }
  if (result.status !== 0 || output.status !== expectedStatus) {
    failed = true;
    console.error(`FAIL ${name}: expected ${expectedStatus}, got ${output.status ?? result.status}`);
    console.error(JSON.stringify(output, null, 2));
  } else {
    console.log(`PASS ${name}`);
  }
}

try {
  await run("agent-v1", "Agent Plugins v1 uses root plugin.json and root mcp.json.\n", "agent-plugins-v1-described");
  await run("mixed", "Agent Plugins v1 uses root plugin.json, but every package must include .codex-plugin/plugin.json for compatibility.\n", "mixed-or-compatibility");
  await run("legacy", "Every plugin must include .codex-plugin/plugin.json and .mcp.json.\n", "legacy-codex-described");
  await run("unknown", "Create a reusable extension package.\n", "unknown");
  const env = { ...process.env, HOME: tempRoot, USERPROFILE: tempRoot };
  for (const args of [["--skill-path", path.join(tempRoot, "agent-v1.md")],
    ["--skill-path", path.join(tempRoot, "agent-v1.md"), "--json"],
    ["--skill-path", path.join(tempRoot, "missing.md")]]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env });
    const output = result.stdout + result.stderr;
    if (output.includes(tempRoot) || !output.includes("~/")) {
      failed = true;
      console.error("FAIL diagnostic paths must be public-safe");
    }
  }
  console.log(failed ? "Diagnostic checks failed" : "PASS public-safe diagnostic paths");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

if (failed) process.exitCode = 1;
