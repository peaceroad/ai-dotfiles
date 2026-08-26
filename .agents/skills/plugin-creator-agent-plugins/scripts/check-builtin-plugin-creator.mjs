#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function parseArgs(argv) {
  const result = { json: false, skillPath: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      result.json = true;
    } else if (arg === "--skill-path") {
      index += 1;
      if (!argv[index]) throw new Error("--skill-path requires a path to SKILL.md.");
      result.skillPath = argv[index];
    } else if (arg === "-h" || arg === "--help") {
      console.log(`Inspect built-in plugin-creator instructions for Agent Plugins v1 language.

Usage:
  node scripts/check-builtin-plugin-creator.mjs [--json] [--skill-path <SKILL.md>]

Options:
  --json                    Emit one JSON result to stdout.
  --skill-path <SKILL.md>   Inspect a specific instruction file.
  -h, --help                Show this help.

This is a text heuristic and does not prove runtime support.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return result;
}

function defaultSkillPath() {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  return path.join(codexHome, "skills", ".system", "plugin-creator", "SKILL.md");
}

function inspect(content) {
  const evidence = {
    mentionsAgentPluginsV1: /Agent Plugins(?: specification)? v?1|agent-plugins\.org\/schemas\/1\.0\.0\/plugin\.schema\.json/i.test(content),
    mentionsRootManifest: /(?:root|plugin root)[^\n]{0,80}`?plugin\.json`?|root `plugin\.json`/i.test(content),
    requiresLegacyManifest: /(?:required|always creates?|must[^\n]{0,30}(?:keep|contain|include))[^\n]{0,100}\.codex-plugin\/plugin\.json|\.codex-plugin\/plugin\.json[^\n]{0,80}(?:required|always)/i.test(content),
    mentionsPortableMcp: /(?:^|[^.a-z0-9])(?:root )?`?mcp\.json`?/im.test(content),
    mentionsLegacyMcp: /`?\.mcp\.json`?/i.test(content),
  };

  let status = "unknown";
  if (evidence.mentionsAgentPluginsV1 && evidence.mentionsRootManifest) {
    status = evidence.requiresLegacyManifest ? "mixed-or-compatibility" : "agent-plugins-v1-described";
  } else if (evidence.requiresLegacyManifest) {
    status = "legacy-codex-described";
  }

  return { status, evidence };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const skillPath = path.resolve(options.skillPath || defaultSkillPath());
  const content = await readFile(skillPath, "utf8");
  const result = { skillPath, ...inspect(content) };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`plugin-creator: ${result.status}`);
  console.log(`path: ${result.skillPath}`);
  for (const [key, value] of Object.entries(result.evidence)) {
    console.log(`${key}: ${value}`);
  }
  console.log("This inspects the built-in skill instructions only; it does not prove runtime support.");
}

main().catch((error) => {
  console.error(`check-builtin-plugin-creator: ${error.message}`);
  process.exitCode = 1;
});
