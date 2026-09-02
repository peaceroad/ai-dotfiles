#!/usr/bin/env node

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "validate-agent-plugin.mjs");
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "validate-agent-plugin-"));
const pluginSchema = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const mcpSchema = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";
let failed = false;

function run(name, pluginRoot, expected) {
  const result = spawnSync(process.execPath, [script, pluginRoot, "--json"], { encoding: "utf8" });
  let output;
  try {
    output = JSON.parse(result.stdout);
  } catch {
    output = { stdout: result.stdout, stderr: result.stderr };
  }
  const actualStatus = result.status ?? 1;
  const errorText = Array.isArray(output.errors) ? output.errors.join("\n") : "";
  const warningText = Array.isArray(output.warnings) ? output.warnings.join("\n") : "";
  const problems = [];
  if (actualStatus !== expected.status) problems.push(`expected status ${expected.status}, got ${actualStatus}`);
  if (expected.errorIncludes && !errorText.includes(expected.errorIncludes)) problems.push(`missing error: ${expected.errorIncludes}`);
  if (expected.warningIncludes && !warningText.includes(expected.warningIncludes)) problems.push(`missing warning: ${expected.warningIncludes}`);
  if (expected.specVersion && output.specVersion !== expected.specVersion) problems.push(`expected specVersion ${expected.specVersion}, got ${output.specVersion}`);
  if (problems.length > 0) {
    failed = true;
    console.error(`FAIL ${name}: ${problems.join("; ")}`);
    console.error(JSON.stringify(output, null, 2));
  } else {
    console.log(`PASS ${name}`);
  }
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createPlugin(name, options = {}) {
  const root = path.join(tempRoot, name);
  await mkdir(root, { recursive: true });
  await writeJson(path.join(root, "plugin.json"), options.manifest ?? { $schema: pluginSchema, name });
  if (options.mcp) await writeJson(path.join(root, "mcp.json"), { $schema: mcpSchema, mcpServers: options.mcp });
  return root;
}

try {
  const valid = await createPlugin("valid.plugin", {
    manifest: { $schema: pluginSchema, name: "valid.plugin", extensions: { "com.example.client": {} } },
    mcp: {
      local: { type: "stdio", command: "node", args: ["${PLUGIN_ROOT}/server/index.js"], cwd: "${PLUGIN_ROOT}/server" },
      remote: { type: "streamable-http", url: "https://example.com/mcp" },
    },
  });
  await mkdir(path.join(valid, "skills", "greet", "support", "nested"), { recursive: true });
  await writeFile(path.join(valid, "skills", "greet", "SKILL.md"), "---\nname: greet\ndescription: Greet users when they request a greeting.\n---\n\nGreet the user.\n", "utf8");
  await writeFile(path.join(valid, "skills", "greet", "support", "nested", "SKILL.md"), "---\nname: ignored\ndescription: This nested file is not a discovered plugin skill.\n---\n", "utf8");
  run("valid skills and MCP package", valid, { status: 0, specVersion: "1.0.0" });

  const unknownKey = await createPlugin("unknown-key", { manifest: { $schema: pluginSchema, name: "unknown-key", skills: "./skills" } });
  run("unknown manifest key", unknownKey, { status: 1, errorIncludes: "Unsupported top-level key" });

  const legacyOnly = path.join(tempRoot, "legacy-only");
  await mkdir(path.join(legacyOnly, ".codex-plugin"), { recursive: true });
  await writeJson(path.join(legacyOnly, ".codex-plugin", "plugin.json"), { name: "legacy-only" });
  run("missing root manifest", legacyOnly, { status: 1, errorIncludes: "Cannot read plugin.json" });

  const insecureMcp = await createPlugin("insecure-mcp", { mcp: { remote: { type: "streamable-http", url: "http://example.com/mcp" } } });
  run("non-loopback HTTP MCP", insecureMcp, { status: 1, errorIncludes: "must use HTTPS" });

  const badNamespace = await createPlugin("bad-namespace", { manifest: { $schema: pluginSchema, name: "bad-namespace", extensions: { codex: {} } } });
  run("invalid extension namespace", badNamespace, { status: 1, errorIncludes: "reverse-domain notation" });

  const absoluteCommand = await createPlugin("absolute-command", { mcp: { local: { type: "stdio", command: "C:\\tools\\server.exe" } } });
  run("absolute stdio command", absoluteCommand, { status: 1, errorIncludes: "bare executable name" });

  const escapingCommand = await createPlugin("escaping-command", { mcp: { local: { type: "stdio", command: "./../server" } } });
  run("escaping plugin-relative command", escapingCommand, { status: 1, errorIncludes: "inside the plugin root" });

  const escapingCwd = await createPlugin("escaping-cwd", { mcp: { local: { type: "stdio", command: "node", cwd: "${PLUGIN_DATA}/../outside" } } });
  run("escaping MCP cwd", escapingCwd, { status: 1, errorIncludes: "inside the ${PLUGIN_DATA} root" });

  const invalidScheme = await createPlugin("invalid-scheme", { mcp: { remote: { type: "streamable-http", url: "ftp://localhost/mcp" } } });
  run("non-HTTP MCP URL", invalidScheme, { status: 1, errorIncludes: "HTTP or HTTPS" });

  const fragmentUrl = await createPlugin("fragment-url", { mcp: { remote: { type: "streamable-http", url: "https://example.com/mcp#tools" } } });
  run("MCP URL fragment", fragmentUrl, { status: 1, errorIncludes: "must not contain a fragment" });

  const legacySse = await createPlugin("legacy-sse", { mcp: { events: { type: "sse", url: "https://example.com/sse" } } });
  run("legacy SSE warning", legacySse, { status: 0, warningIncludes: "legacy HTTP+SSE" });

  const badSkill = await createPlugin("bad-skill");
  await mkdir(path.join(badSkill, "skills", "actual-name"), { recursive: true });
  await writeFile(path.join(badSkill, "skills", "actual-name", "SKILL.md"), "---\nname: different-name\ndescription: Test mismatch handling.\n---\n", "utf8");
  run("skill name mismatch", badSkill, { status: 1, errorIncludes: "does not match its parent directory" });

  const futureSchema = await createPlugin("future-schema", { manifest: { $schema: "https://agent-plugins.org/schemas/2.0.0/plugin.schema.json", name: "future-schema" } });
  run("unsupported specification version", futureSchema, { status: 1, errorIncludes: pluginSchema });
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

if (failed) process.exitCode = 1;
