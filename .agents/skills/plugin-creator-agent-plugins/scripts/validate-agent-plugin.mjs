#!/usr/bin/env node

// @plugin-creator-agent-plugins managed-portable-validator v1

import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const SPEC_VERSION = "1.0.0";
const PLUGIN_SCHEMA = `https://agent-plugins.org/schemas/${SPEC_VERSION}/plugin.schema.json`;
const MCP_SCHEMA = `https://agent-plugins.org/schemas/${SPEC_VERSION}/mcp.schema.json`;
const PLUGIN_KEYS = new Set(["$schema", "name", "version", "description", "author", "homepage", "repository", "license", "keywords", "extensions"]);
const AUTHOR_KEYS = new Set(["name", "email", "url"]);
const PLUGIN_NAME = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const SKILL_NAME = /^(?!.*--)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const EXTENSION_NAME = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function displayPath(pathValue) {
  const absolutePath = path.resolve(pathValue);
  const home = path.resolve(homedir());
  const relativeToHome = path.relative(home, absolutePath);
  if (relativeToHome === "") return "~";
  if (!relativeToHome.startsWith("..") && !path.isAbsolute(relativeToHome)) {
    return `~/${relativeToHome.replaceAll(path.sep, "/")}`;
  }
  return `[external]/${path.basename(absolutePath)}`;
}

function sanitizeError(message) {
  const home = path.resolve(homedir());
  return String(message)
    .replaceAll(`\\\\?\\${home}`, "~")
    .replaceAll(home, "~")
    .replaceAll(home.replaceAll("\\", "/"), "~");
}

function parseArgs(argv) {
  const result = { json: false, root: null };
  for (const arg of argv) {
    if (arg === "--json") result.json = true;
    else if (arg === "-h" || arg === "--help") {
      console.log(`Validate an Agent Plugins ${SPEC_VERSION} package.

Usage:
  node scripts/validate-agent-plugin.mjs <plugin-root> [--json]

Options:
  --json       Emit one JSON result to stdout.
  -h, --help   Show this help.

Examples:
  node scripts/validate-agent-plugin.mjs ./plugins/example
  node scripts/validate-agent-plugin.mjs ./plugins/example --json`);
      process.exit(0);
    } else if (!result.root) result.root = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!result.root) throw new Error("Specify the plugin root.");
  return result;
}

async function readJson(file, errors) {
  let text;
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      errors.push(`${path.basename(file)} must be a regular file.`);
      return null;
    }
    text = await readFile(file, "utf8");
  } catch (error) {
    errors.push(`Cannot read ${path.basename(file)}: ${error.message}`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`${path.basename(file)} is not valid JSON: ${error.message}`);
    return null;
  }
}

function checkString(object, key, errors, prefix) {
  if (key in object && typeof object[key] !== "string") errors.push(`${prefix}.${key} must be a string.`);
}

function validateManifest(manifest, errors, warnings) {
  if (!isObject(manifest)) {
    errors.push("The root of plugin.json must be an object.");
    return;
  }
  for (const key of Object.keys(manifest)) {
    if (!PLUGIN_KEYS.has(key)) errors.push(`Unsupported top-level key in plugin.json: ${key}`);
  }
  if (manifest.$schema !== PLUGIN_SCHEMA) errors.push(`plugin.json.$schema must be ${PLUGIN_SCHEMA}.`);
  if (typeof manifest.name !== "string" || manifest.name.length < 1 || manifest.name.length > 64 || !PLUGIN_NAME.test(manifest.name)) {
    errors.push("plugin.json.name does not satisfy the Agent Plugins v1 naming rules.");
  }
  for (const key of ["version", "description", "homepage", "repository", "license"]) checkString(manifest, key, errors, "plugin.json");

  if ("author" in manifest) {
    if (!isObject(manifest.author)) errors.push("plugin.json.author must be an object.");
    else {
      for (const key of Object.keys(manifest.author)) if (!AUTHOR_KEYS.has(key)) errors.push(`Unsupported key in plugin.json.author: ${key}`);
      for (const key of AUTHOR_KEYS) checkString(manifest.author, key, errors, "plugin.json.author");
    }
  }
  if ("keywords" in manifest && (!Array.isArray(manifest.keywords) || manifest.keywords.some((item) => typeof item !== "string"))) {
    errors.push("plugin.json.keywords must be an array of strings.");
  }
  if ("extensions" in manifest) {
    if (!isObject(manifest.extensions)) errors.push("plugin.json.extensions must be an object.");
    else {
      for (const [namespace, value] of Object.entries(manifest.extensions)) {
        if (!isObject(value)) errors.push(`extensions.${namespace} must be an object.`);
        if (!EXTENSION_NAME.test(namespace)) errors.push(`Extension namespace must use reverse-domain notation: ${namespace}`);
      }
    }
  }
}

function frontmatterValue(frontmatter, key) {
  const pattern = new RegExp(`^${key}:\\s*(?:"([^"]*)"|'([^']*)'|([^\\n#]*))`, "m");
  const match = frontmatter.match(pattern);
  if (!match) return null;
  return (match[1] ?? match[2] ?? match[3] ?? "").trim();
}

async function validateSkills(root, errors, warnings, summary) {
  const skillsDir = path.join(root, "skills");
  let entries;
  try {
    entries = await readdir(skillsDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    errors.push(`Cannot read skills/: ${error.message}`);
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      warnings.push(`A non-directory item directly under skills/ is not discovered as a skill: ${entry.name}`);
      continue;
    }
    const skillFile = path.join(skillsDir, entry.name, "SKILL.md");
    let text;
    try {
      const stat = await lstat(skillFile);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("not a regular file");
      text = await readFile(skillFile, "utf8");
    } catch (error) {
      warnings.push(`skills/${entry.name}/ has no SKILL.md and is not discovered as a skill.`);
      continue;
    }
    summary.skills += 1;
    if (entry.name.length > 64 || !SKILL_NAME.test(entry.name)) errors.push(`Skill directory name does not satisfy the Agent Skills rules: ${entry.name}`);
    if (!text.startsWith("---")) {
      errors.push(`skills/${entry.name}/SKILL.md has no YAML frontmatter.`);
      continue;
    }
    const end = text.indexOf("\n---", 3);
    if (end < 0) {
      errors.push(`The YAML frontmatter in skills/${entry.name}/SKILL.md is not closed.`);
      continue;
    }
    const frontmatter = text.slice(3, end);
    const name = frontmatterValue(frontmatter, "name");
    const description = frontmatterValue(frontmatter, "description");
    if (name !== entry.name) errors.push(`The name in skills/${entry.name}/SKILL.md does not match its parent directory.`);
    if (description === null || description === "") errors.push(`The description in skills/${entry.name}/SKILL.md is empty.`);
    else if (description.length > 1024) errors.push(`The description in skills/${entry.name}/SKILL.md exceeds 1024 characters.`);
  }
}

function staysWithinPortableRoot(relativeText) {
  if (relativeText.includes("\\")) return false;
  const normalized = path.posix.normalize(relativeText || ".");
  return normalized !== ".." && !normalized.startsWith("../") && !path.posix.isAbsolute(normalized);
}

function validateCommand(command, label, errors) {
  if (typeof command !== "string" || command.length === 0) {
    errors.push(`${label}.command must be a non-empty string.`);
    return;
  }
  if (/[\r\n]|&&|\|\||[|;]/.test(command)) {
    errors.push(`Do not put a shell command line in ${label}.command.`);
    return;
  }
  if (command.startsWith("./")) {
    if (!staysWithinPortableRoot(command.slice(2))) errors.push(`${label}.command must remain inside the plugin root.`);
    return;
  }
  if (command.includes("/") || command.includes("\\") || path.posix.isAbsolute(command) || path.win32.isAbsolute(command)) {
    errors.push(`${label}.command must be a bare executable name or a plugin-relative path beginning with ./`);
  }
}

function validateCwd(cwd, label, errors) {
  if (typeof cwd !== "string") {
    errors.push(`${label}.cwd must be a string.`);
    return;
  }
  const forms = [
    { prefix: "./", suffix: cwd.startsWith("./") ? cwd.slice(2) : null },
    { prefix: "${PLUGIN_ROOT}", suffix: cwd === "${PLUGIN_ROOT}" ? "" : cwd.startsWith("${PLUGIN_ROOT}/") ? cwd.slice("${PLUGIN_ROOT}/".length) : null },
    { prefix: "${PLUGIN_DATA}", suffix: cwd === "${PLUGIN_DATA}" ? "" : cwd.startsWith("${PLUGIN_DATA}/") ? cwd.slice("${PLUGIN_DATA}/".length) : null },
  ];
  const form = forms.find((candidate) => candidate.suffix !== null);
  if (!form) {
    errors.push(`${label}.cwd must begin with ./, \${PLUGIN_ROOT}, or \${PLUGIN_DATA}.`);
    return;
  }
  if (!staysWithinPortableRoot(form.suffix)) errors.push(`${label}.cwd must remain inside the ${form.prefix} root.`);
}

function validateRemoteUrl(urlText, label, errors) {
  let url;
  try {
    url = new URL(urlText);
  } catch {
    errors.push(`${label}.url is not a valid URL.`);
    return;
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1" || url.hostname === "[::1]";
  if (url.protocol !== "http:" && url.protocol !== "https:") errors.push(`${label}.url must use HTTP or HTTPS.`);
  if (!loopback && url.protocol !== "https:") errors.push(`${label}.url must use HTTPS for a non-loopback connection.`);
  if (url.username || url.password) errors.push(`Do not embed credentials in ${label}.url.`);
  if (url.hash) errors.push(`${label}.url must not contain a fragment.`);
}

function validateMcpServer(name, server, errors, warnings) {
  const label = `mcp.json.mcpServers.${name}`;
  if (!isObject(server)) {
    errors.push(`${label} must be an object.`);
    return;
  }
  const allowedByType = {
    stdio: new Set(["type", "command", "args", "env", "cwd"]),
    "streamable-http": new Set(["type", "url", "headers"]),
    sse: new Set(["type", "url", "headers"]),
  };
  const allowed = allowedByType[server.type];
  if (!allowed) {
    errors.push(`${label}.type must be stdio, streamable-http, or sse.`);
    return;
  }
  for (const key of Object.keys(server)) if (!allowed.has(key)) errors.push(`Unsupported key in ${label}: ${key}`);
  if (server.type === "stdio") {
    validateCommand(server.command, label, errors);
    if ("args" in server && (!Array.isArray(server.args) || server.args.some((item) => typeof item !== "string"))) errors.push(`${label}.args must be an array of strings.`);
    if ("env" in server) {
      if (!isObject(server.env) || Object.values(server.env).some((item) => typeof item !== "string")) errors.push(`${label}.env must be an object with string values.`);
      if (isObject(server.env) && ("PLUGIN_ROOT" in server.env || "PLUGIN_DATA" in server.env)) errors.push(`${label}.env must not override PLUGIN_ROOT or PLUGIN_DATA.`);
    }
    if ("cwd" in server) validateCwd(server.cwd, label, errors);
  } else {
    if (typeof server.url !== "string" || server.url.length === 0) errors.push(`${label}.url must be a non-empty string.`);
    else validateRemoteUrl(server.url, label, errors);
    if ("headers" in server && (!isObject(server.headers) || Object.values(server.headers).some((item) => typeof item !== "string"))) errors.push(`${label}.headers must be an object with string values.`);
    if (server.type === "sse") warnings.push(`${label} uses legacy HTTP+SSE; client support is optional.`);
  }
}

async function validateMcp(root, errors, warnings, summary) {
  const file = path.join(root, "mcp.json");
  try {
    await lstat(file);
  } catch (error) {
    if (error.code === "ENOENT") return;
  }
  const mcp = await readJson(file, errors);
  if (!mcp) return;
  summary.hasMcp = true;
  if (!isObject(mcp)) {
    errors.push("The root of mcp.json must be an object.");
    return;
  }
  for (const key of Object.keys(mcp)) if (key !== "$schema" && key !== "mcpServers") errors.push(`Unsupported top-level key in mcp.json: ${key}`);
  if (mcp.$schema !== MCP_SCHEMA) errors.push(`mcp.json.$schema must be ${MCP_SCHEMA}.`);
  if (!isObject(mcp.mcpServers)) errors.push("mcp.json.mcpServers must be an object.");
  else for (const [name, server] of Object.entries(mcp.mcpServers)) validateMcpServer(name, server, errors, warnings);
}

async function validateLinks(root, errors) {
  const resolvedRoot = await realpath(root);
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        try {
          const resolved = await realpath(target);
          if (!isWithin(resolvedRoot, resolved)) errors.push(`Link resolves outside the package: ${path.relative(root, target)}`);
        } catch (error) {
          errors.push(`Cannot resolve link: ${path.relative(root, target)} (${error.message})`);
        }
      } else if (entry.isDirectory()) {
        await visit(target);
      }
    }
  }
  await visit(root);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = path.resolve(options.root);
  const errors = [];
  const warnings = [];
  const summary = {
    root: displayPath(root),
    specVersion: SPEC_VERSION,
    skills: 0,
    hasMcp: false,
  };

  const rootStat = await lstat(root);
  if (!rootStat.isDirectory()) throw new Error("The specified plugin root is not a directory.");
  const manifest = await readJson(path.join(root, "plugin.json"), errors);
  if (manifest) validateManifest(manifest, errors, warnings);
  await validateSkills(root, errors, warnings, summary);
  await validateMcp(root, errors, warnings, summary);
  await validateLinks(root, errors);

  const result = { ok: errors.length === 0, ...summary, errors, warnings };
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`${result.ok ? "OK" : "FAILED"}: ${summary.root}`);
    console.log(`skills: ${summary.skills}, mcp.json: ${summary.hasMcp ? "present" : "absent"}`);
    for (const warning of warnings) console.log(`WARNING: ${warning}`);
    for (const error of errors) console.error(`ERROR: ${error}`);
  }
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`validate-agent-plugin: ${sanitizeError(error.message)}`);
  process.exitCode = 1;
});
