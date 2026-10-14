#!/usr/bin/env node

import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateSkillFrontmatter } from "./validate-agent-plugin.mjs";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "validate-agent-plugin.mjs");
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "validate-agent-plugin-"));
const pluginSchema = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const mcpSchema = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";
let failed = false;

function run(name, pluginRoot, expected, env = process.env) {
  const result = spawnSync(process.execPath, [script, pluginRoot, "--json"], { encoding: "utf8", env });
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
  if (output.ok !== (expected.status === 0)) problems.push(`expected ok ${expected.status === 0}, got ${output.ok}`);
  if (expected.errorIncludes && !errorText.includes(expected.errorIncludes)) problems.push(`missing error: ${expected.errorIncludes}`);
  if (expected.errorCount !== undefined && output.errors?.length !== expected.errorCount) problems.push(`expected ${expected.errorCount} errors, got ${output.errors?.length}`);
  if (expected.skills !== undefined && output.skills !== expected.skills) problems.push(`expected ${expected.skills} skills, got ${output.skills}`);
  if (expected.forbiddenText && `${result.stdout}${result.stderr}`.includes(expected.forbiddenText)) problems.push("output contains a private diagnostic path");
  if (expected.hasMcp !== undefined && output.hasMcp !== expected.hasMcp) problems.push(`expected hasMcp ${expected.hasMcp}, got ${output.hasMcp}`);
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
  for (const file of ["plugin.json", "mcp.json"]) {
    const root = await createPlugin(`private-json-${file}`);
    await writeFile(path.join(root, file), 'synthetic-private-token: invalid JSON');
    run(`${file} parse errors do not quote input`, root, { status: 1, errorIncludes: "is not valid JSON", forbiddenText: "synthetic-private-token" });
    const result = spawnSync(process.execPath, [script, root], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-private-token/);
  }
  const invalidRoots = [
    ["null", null],
    ["false", false],
    ["true", true],
    ["zero", 0],
    ["positive-number", 1],
    ["negative-number", -1],
    ["fraction", 1.5],
    ["empty-string", ""],
    ["string", "example"],
    ["empty-array", []],
    ["array", [{}]],
  ];
  for (const file of ["plugin.json", "mcp.json"]) {
    const hasMcp = file === "mcp.json";
    for (const [name, value] of invalidRoots) {
      const root = await createPlugin(`${file}-${name}`);
      await writeJson(path.join(root, file), value);
      run(`${file} rejects ${name} root`, root, {
        status: 1,
        errorIncludes: `The root of ${file} must be an object.`,
        errorCount: 1,
        hasMcp,
      });
    }

    const emptyObject = await createPlugin(`${file}-empty-object`);
    await writeJson(path.join(emptyObject, file), {});
    run(`${file} validates required object properties`, emptyObject, {
      status: 1,
      errorIncludes: `${file}.$schema must be`,
      errorCount: 2,
      hasMcp,
    });

    const malformed = await createPlugin(`${file}-malformed`);
    await writeFile(path.join(malformed, file), "{", "utf8");
    run(`${file} reports only its parse error`, malformed, {
      status: 1,
      errorIncludes: `${file} is not valid JSON:`,
      errorCount: 1,
      hasMcp: false,
    });

    const nonRegular = await createPlugin(`${file}-non-regular`);
    await rm(path.join(nonRegular, file), { force: true });
    await mkdir(path.join(nonRegular, file));
    run(`${file} rejects a non-regular file without a root-type error`, nonRegular, {
      status: 1,
      errorIncludes: `${file} must be a regular file.`,
      errorCount: 1,
      hasMcp: false,
    });

    const missing = await createPlugin(`${file}-missing`);
    await rm(path.join(missing, file), { force: true });
    run(`${file} ${hasMcp ? "is optional" : "is required"}`, missing, {
      status: hasMcp ? 0 : 1,
      errorIncludes: hasMcp ? undefined : "Cannot read plugin.json:",
      errorCount: hasMcp ? 0 : 1,
      hasMcp: false,
    });
  }

  const emptyMcp = await createPlugin("empty-mcp", { mcp: {} });
  run("valid empty MCP server object", emptyMcp, { status: 0, errorCount: 0, hasMcp: true });

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

  const ipv4LoopbackMcp = await createPlugin("ipv4-loopback-mcp", { mcp: { remote: { type: "streamable-http", url: "http://127.0.0.2/mcp" } } });
  run("IPv4 loopback range HTTP MCP", ipv4LoopbackMcp, { status: 0 });

  const ipv6LoopbackMcp = await createPlugin("ipv6-loopback-mcp", { mcp: { remote: { type: "streamable-http", url: "http://[::1]/mcp" } } });
  run("IPv6 loopback HTTP MCP", ipv6LoopbackMcp, { status: 0 });

  const nonLoopbackMcp = await createPlugin("non-loopback-mcp", { mcp: { remote: { type: "streamable-http", url: "http://128.0.0.1/mcp" } } });
  run("non-loopback IPv4 HTTP MCP", nonLoopbackMcp, { status: 1, errorIncludes: "must use HTTPS" });

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


  for (const [name, headers, status, errorIncludes] of [
    ["duplicate-headers", { "X-Test": "one", "x-test": "two" }, 1, "case-insensitive duplicate"],
    ["invalid-header-name", { "X Bad": "one" }, 1, "invalid HTTP header"],
    ["invalid-header-value", { "X-Test": "one\ntwo" }, 1, "invalid HTTP header"],
    ["valid-headers", { "X-Test": "one", "X-Count": "2" }, 0, undefined],
  ]) {
    const root = await createPlugin(name, { mcp: { remote: { type: "streamable-http", url: "https://example.com/mcp", headers } } });
    run(name, root, { status, errorIncludes });
  }

  const scalars = [
    ["plain", "A description", "A description"],
    ["number-prefix", "1024chars", "1024chars"],
    ["hash", "Use C# tools # comment", "Use C# tools"],
    ["single-quoted", "'It''s # a description' # comment", "It's # a description"],
    ["double-quoted", JSON.stringify('Use "quoted" text') + " # comment", 'Use "quoted" text'],
    ["unicode", JSON.stringify("😀".repeat(1024)), "😀".repeat(1024)],
    ["maximum", "a".repeat(1024), "a".repeat(1024)],
    ["empty", "", null],
    ["comment-only", "# no value", null],
    ["quoted-empty", "''", null],
    ["quoted-spaces", "'   '", null],
    ["overlong", "a".repeat(1025), null],
    ["quoted-overlong", JSON.stringify("a".repeat(1025)), null],
    ["null", "null", null],
    ["boolean", "true", null],
    ["number", "123", null],
    ["sequence", "[one, two]", null],
    ["mapping", "field:", null],
    ["directive-marker", "%foo", null],
    ["line-separator", "hello\u2028" + "x".repeat(1025), null],
    ["paragraph-separator", "hello\u2029" + "x".repeat(1025), null],
    ["trailing-line-separator", "x".repeat(1024) + "\u2028", null],
    ["trailing-nbsp", "x".repeat(1024) + "\u00a0", null],
    ["preserved-nbsp", "description\u00a0", "description\u00a0"],
    ["block", "|\n  description", null],
    ["continuation", "first\n  second", null],
    ["unclosed-quote", "'description", null],
    ["alias", "*description", null],
    ["duplicate", "first\ndescription: second", null],
  ];
  for (const [name, value, expected] of scalars) {
    const text = `---\nname: demo\ndescription: ${value}\n---\n`;
    const result = validateSkillFrontmatter(text, "demo");
    assert.equal(result.errors.length === 0, expected !== null, `${name}: ${result.errors.join("; ")}`);
    if (expected !== null) assert.equal(result.description, expected, name);
    const root = await createPlugin(`scalar-${name}`);
    await mkdir(path.join(root, "skills", "demo"), { recursive: true });
    await writeFile(path.join(root, "skills", "demo", "SKILL.md"), text);
    run(`contained Skill ${name}`, root, { status: expected === null ? 1 : 0, skills: 1 });
  }

  for (const key of ["name", "description"]) {
    const text = "---\nname: demo\ndescription: hello\n---\n".replace(`${key}: `, `${key}:`);
    assert.notEqual(validateSkillFrontmatter(text, "demo").errors.length, 0);
    const root = await createPlugin(`unseparated-${key}`);
    await mkdir(path.join(root, "skills", "demo"), { recursive: true });
    await writeFile(path.join(root, "skills", "demo", "SKILL.md"), text);
    run(`contained Skill requires ${key} separator whitespace`, root, { status: 1, skills: 1 });
  }

  let linksAvailable = true;
  const linkProbe = path.join(tempRoot, "link-probe");
  try { await symlink("missing", linkProbe, "file"); await rm(linkProbe); }
  catch (error) {
    if (!["EPERM", "EACCES"].includes(error.code)) throw error;
    linksAvailable = false;
    console.log("SKIP symbolic-link cases: symbolic links are unavailable");
  }
  if (linksAvailable) {
    const root = await createPlugin("internal-component-links");
    await mkdir(path.join(root, "..data", "skills"), { recursive: true });
    await mkdir(path.join(root, "..data", "demo"));
    await writeJson(path.join(root, "..data", "manifest.json"), { $schema: pluginSchema, name: "internal-component-links" });
    await writeJson(path.join(root, "..data", "mcp.json"), { $schema: mcpSchema, mcpServers: {} });
    await rm(path.join(root, "plugin.json"));
    await symlink("..data/manifest.json", path.join(root, "plugin.json"), "file");
    await symlink("..data/mcp.json", path.join(root, "mcp.json"), "file");
    await symlink("..data/skills", path.join(root, "skills"), "dir");
    await symlink("../demo", path.join(root, "..data", "skills", "demo"), "dir");
    await symlink("metadata.md", path.join(root, "..data", "demo", "SKILL.md"), "file");
    const metadata = path.join(root, "..data", "demo", "metadata.md");
    await writeFile(metadata, "---\nname: demo\ndescription: Internal links are discoverable.\n---\n");
    run("internal manifest, MCP, skills and Skill links", root, { status: 0, hasMcp: true, skills: 1 });
    await writeFile(metadata, "---\nname: wrong\ndescription: Invalid linked content is checked.\n---\n");
    run("linked Skill content is validated", root, { status: 1, errorIncludes: "does not match its parent directory", skills: 1 });
    const rootAlias = path.join(tempRoot, "root-alias");
    await symlink(root, rootAlias, "junction");
    run("package root alias preserves linked validation", rootAlias, { status: 1, errorIncludes: "does not match its parent directory", skills: 1 });

    const scriptAlias = path.join(tempRoot, "linked-validator.mjs");
    await symlink(script, scriptAlias, "file");
    const help = spawnSync(process.execPath, [scriptAlias, "--help"], { encoding: "utf8" });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Validate an Agent Plugins/u);
    const linkedRun = spawnSync(process.execPath, [scriptAlias, root, "--json"], { encoding: "utf8" });
    assert.equal(linkedRun.status, 1, linkedRun.stderr);
    assert.equal(JSON.parse(linkedRun.stdout).skills, 1);
    console.log("PASS linked validator entrypoint runs help and validation");

    for (const target of ["plugin.json", "mcp.json", "skills", "skills/demo", "skills/demo/SKILL.md"]) {
      for (const kind of ["external", "broken", "cyclic"]) {
        const root = await createPlugin(`unsafe-${target.replaceAll("/", "-").replaceAll(".", "-").toLowerCase()}-${kind}`);
        const file = path.join(root, target);
        await mkdir(path.dirname(file), { recursive: true });
        await rm(file, { recursive: true, force: true });
        let linkTarget = kind === "cyclic" ? path.basename(file) : "missing";
        const directory = target === "skills" || target === "skills/demo";
        if (kind === "external") {
          const outside = path.join(tempRoot, directory ? "outside-directory" : "outside-file");
          if (directory) await mkdir(outside, { recursive: true });
          else await writeFile(outside, "synthetic untrusted content");
          linkTarget = path.relative(path.dirname(file), outside);
        }
        await symlink(linkTarget, file, directory ? "dir" : "file");
        run(`${target} rejects ${kind} links`, root, { status: 1, errorIncludes: kind === "external" ? "outside the package" : "Cannot" });
      }
    }
  }

  const privateHome = path.join(tempRoot, "synthetic-home");
  const empty = path.join(privateHome, "empty-plugin");
  await mkdir(empty, { recursive: true });
  const env = { ...process.env, HOME: privateHome, USERPROFILE: privateHome };
  run("JSON read errors mask the synthetic home", empty, { status: 1, errorIncludes: "Cannot read plugin.json", forbiddenText: privateHome }, env);
  for (const args of [[empty], [path.join(privateHome, "missing-root")]]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env });
    assert.equal(result.status, 1);
    assert.equal(`${result.stdout}${result.stderr}`.includes(privateHome), false);
  }
  console.log("PASS text read errors mask the synthetic home");
  const unreadable = path.join(empty, "plugin.json");
  await writeJson(unreadable, { $schema: pluginSchema, name: "empty-plugin" });
  await chmod(unreadable, 0);
  try {
    let restricted = false;
    try { await readFile(unreadable); }
    catch (error) { if (["EACCES", "EPERM"].includes(error.code)) restricted = true; else throw error; }
    if (restricted) {
      run("JSON permission errors mask the synthetic home", empty, { status: 1, errorIncludes: "Cannot read plugin.json", forbiddenText: privateHome }, env);
      const result = spawnSync(process.execPath, [script, empty], { encoding: "utf8", env });
      assert.equal(result.status, 1);
      assert.equal(`${result.stdout}${result.stderr}`.includes(privateHome), false);
      console.log("PASS text permission errors mask the synthetic home");
    } else console.log("SKIP permission denial cases: this process can read mode-000 files");
  } finally { await chmod(unreadable, 0o600); }
  if (linksAvailable) {
    await symlink("missing", path.join(empty, "broken-link"), "file");
    run("JSON broken-link errors mask the synthetic home", empty, { status: 1, errorIncludes: "Cannot resolve link", forbiddenText: privateHome }, env);
    const result = spawnSync(process.execPath, [script, empty], { encoding: "utf8", env });
    assert.equal(result.status, 1);
    assert.equal(`${result.stdout}${result.stderr}`.includes(privateHome), false);
    console.log("PASS text broken-link errors mask the synthetic home");
  }
  const futureSchema = await createPlugin("future-schema", { manifest: { $schema: "https://agent-plugins.org/schemas/2.0.0/plugin.schema.json", name: "future-schema" } });
  run("unsupported specification version", futureSchema, { status: 1, errorIncludes: pluginSchema });
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

if (failed) process.exitCode = 1;
