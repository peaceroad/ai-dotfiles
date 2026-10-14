#!/usr/bin/env node

// @plugin-creator-agent-plugins managed-portable-validator v1

import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import { isIP } from "node:net";
import { validateHeaderName, validateHeaderValue } from "node:http";
import { fileURLToPath } from "node:url";
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
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function displayPath(pathValue) {
  const absolutePath = path.resolve(pathValue);
  const home = path.resolve(homedir());
  const relativeToHome = path.relative(home, absolutePath);
  if (relativeToHome === "") return "~";
  if (relativeToHome !== ".." && !relativeToHome.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeToHome)) {
    return `~/${relativeToHome.replaceAll(path.sep, "/")}`;
  }
  return `[external]/${path.basename(absolutePath)}`;
}

function sanitizeError(message, paths = []) {
  const home = path.resolve(homedir());
  let result = String(message);
  const replacements = [...new Set(paths.filter((value) => typeof value === "string" && path.isAbsolute(value)))];
  replacements.sort((a, b) => b.length - a.length);
  for (const target of replacements) {
    result = result.replaceAll(`\\\\?\\${target}`, displayPath(target))
      .replaceAll(target, displayPath(target))
      .replaceAll(target.replaceAll("\\", "/"), displayPath(target));
  }
  return result
    .replaceAll(`\\\\?\\${home}`, "~")
    .replaceAll(home, "~")
    .replaceAll(home.replaceAll("\\", "/"), "~");
}

async function resolvePackagePath(root, file) {
  const resolved = await realpath(file);
  if (!isWithin(root, resolved)) throw new Error(`Path resolves outside the package: ${path.relative(root, file)}`);
  return resolved;
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

async function readJson(root, file, errors) {
  // JSON.parse cannot return undefined; reserve it for read or parse failures.
  let text;
  try {
    const resolved = await resolvePackagePath(root, file);
    if (!(await stat(resolved)).isFile()) {
      errors.push(`${path.basename(file)} must be a regular file.`);
      return undefined;
    }
    text = await readFile(resolved, "utf8");
  } catch (error) {
    errors.push(`Cannot read ${path.basename(file)}: ${sanitizeError(error.message, [error.path, file])}`);
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`${path.basename(file)} is not valid JSON: ${error.message}`);
    return undefined;
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

function trimYamlWhitespace(value) {
  return value.replace(/^[ \t]+|[ \t]+$/gu, "");
}

function frontmatterValue(lines, key) {
  const pattern = new RegExp(`^${key}:(?:[ \t]+([^\r\n]*)|)$`, "u");
  const matches = lines.map((line, index) => ({ match: pattern.exec(line), index }))
    .filter(({ match }) => match);
  if (matches.length === 0) return null;
  if (matches.length > 1) throw new Error(`${key} must not be repeated.`);
  const { match, index } = matches[0];
  const continuation = lines.slice(index + 1).find((line) => trimYamlWhitespace(line) && !trimYamlWhitespace(line).startsWith("#"));
  if (continuation && /^[ \t]/u.test(continuation)) {
    throw new Error(`${key} uses unsupported multiline YAML; use a single-line string or a full YAML validator.`);
  }
  if (/[\u2028\u2029]/u.test(match[1] ?? "")) {
    throw new Error(`${key} uses unsupported Unicode line separators; use a single-line string.`);
  }
  const value = trimYamlWhitespace(match[1] ?? "");
  if (value.startsWith("'")) {
    const quoted = /^'((?:[^']|'')*)'(?:[ \t]+#.*)?$/u.exec(value);
    if (quoted) return quoted[1].replaceAll("''", "'");
  } else if (value.startsWith('"')) {
    const quoted = /^("(?:[^"\\]|\\.)*")(?:[ \t]+#.*)?$/u.exec(value);
    if (quoted) {
      try { return JSON.parse(quoted[1]); } catch { /* Unsupported YAML escape. */ }
    }
  } else {
    const plain = trimYamlWhitespace(value.replace(/(?:^|[ \t]+)#.*$/u, ""));
    if (!plain) return "";
    if (!/^[!&*|>{}\[\],%@`]|^[-?:](?:[ \t]|$)|:(?:[ \t]|$)/u.test(plain)
      && !/^(?:null|~|true|false|[-+]?(?:0x[0-9a-f]+|0o[0-7]+|(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:e[-+]?[0-9]+)?)|[-+]?\.(?:inf|nan))$/iu.test(plain)) return plain;
  }
  throw new Error(`${key} must use a supported single-line YAML string (plain, single-quoted, or JSON-style double-quoted).`);
}

export function validateSkillFrontmatter(text, directoryName, label = "SKILL.md") {
  const errors = [];
  if (directoryName.length > 64 || !SKILL_NAME.test(directoryName)) {
    errors.push(`Skill directory name does not satisfy the Agent Skills rules: ${directoryName}`);
  }
  const lines = text.split(/\r?\n/u);
  if (lines[0] !== "---") return { errors: [...errors, `${label} has no YAML frontmatter.`] };
  const end = lines.findIndex((line, index) => index > 0 && line === "---");
  if (end < 0) return { errors: [...errors, `The YAML frontmatter in ${label} is not closed.`] };
  let name;
  let description;
  try {
    const frontmatter = lines.slice(1, end);
    name = frontmatterValue(frontmatter, "name");
    description = frontmatterValue(frontmatter, "description");
  } catch (error) {
    return { errors: [...errors, `${label}: ${error.message}`] };
  }
  if (name !== directoryName) errors.push(`The name in ${label} does not match its parent directory.`);
  if (description === null || description.trim() === "") errors.push(`The description in ${label} is empty.`);
  else if ([...description].length > 1024) errors.push(`The description in ${label} exceeds 1024 characters.`);
  return { name, description, errors };
}

async function validateSkills(root, errors, warnings, summary) {
  const skillsDir = path.join(root, "skills");
  let entries;
  try {
    // A missing component is optional; a present but broken link is invalid.
    try { await lstat(skillsDir); }
    catch (error) { if (error.code === "ENOENT") return; throw error; }
    const resolved = await resolvePackagePath(root, skillsDir);
    entries = await readdir(resolved, { withFileTypes: true });
  } catch (error) {
    errors.push(`Cannot read skills/: ${sanitizeError(error.message, [error.path])}`);
    return;
  }

  for (const entry of entries) {
    const skillDirectory = path.join(skillsDir, entry.name);
    try {
      const resolved = await resolvePackagePath(root, skillDirectory);
      if (!(await stat(resolved)).isDirectory()) {
        warnings.push(`A non-directory item directly under skills/ is not discovered as a skill: ${entry.name}`);
        continue;
      }
    } catch (error) {
      errors.push(`Cannot inspect skills/${entry.name}/: ${sanitizeError(error.message, [error.path])}`);
      continue;
    }
    const skillFile = path.join(skillDirectory, "SKILL.md");
    let text;
    try {
      try { await lstat(skillFile); }
      catch (error) {
        if (error.code !== "ENOENT") throw error;
        warnings.push(`skills/${entry.name}/ has no SKILL.md and is not discovered as a skill.`);
        continue;
      }
      const resolved = await resolvePackagePath(root, skillFile);
      if (!(await stat(resolved)).isFile()) {
        warnings.push(`skills/${entry.name}/SKILL.md is not a regular file and is not discovered as a skill.`);
        continue;
      }
      text = await readFile(resolved, "utf8");
    } catch (error) {
      errors.push(`Cannot read skills/${entry.name}/SKILL.md: ${sanitizeError(error.message, [error.path])}`);
      continue;
    }
    summary.skills += 1;
    errors.push(...validateSkillFrontmatter(text, entry.name, `skills/${entry.name}/SKILL.md`).errors);
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
  const hostname = url.hostname.startsWith("[") && url.hostname.endsWith("]")
    ? url.hostname.slice(1, -1)
    : url.hostname;
  const addressFamily = isIP(hostname);
  const loopback = hostname === "localhost"
    || (addressFamily === 4 && hostname.startsWith("127."))
    || (addressFamily === 6 && hostname === "::1");
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
    if (isObject(server.headers)) {
      const names = new Set();
      for (const [header, value] of Object.entries(server.headers)) {
        const normalized = header.toLowerCase();
        if (names.has(normalized)) errors.push(`${label}.headers contains a case-insensitive duplicate name.`);
        names.add(normalized);
        try { validateHeaderName(header); validateHeaderValue(header, value); }
        catch { errors.push(`${label}.headers contains an invalid HTTP header field.`); }
      }
    }
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
  const mcp = await readJson(root, file, errors);
  if (mcp === undefined) return;
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
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) {
      errors.push(`Cannot read package directory ${path.relative(root, directory) || "."}: ${sanitizeError(error.message, [error.path])}`);
      return;
    }
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        try {
          const resolved = await realpath(target);
          if (!isWithin(resolvedRoot, resolved)) errors.push(`Link resolves outside the package: ${path.relative(root, target)}`);
        } catch (error) {
          errors.push(`Cannot resolve link: ${path.relative(root, target)} (${sanitizeError(error.message, [error.path])})`);
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
  const root = await realpath(path.resolve(options.root));
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
  const manifest = await readJson(root, path.join(root, "plugin.json"), errors);
  if (manifest !== undefined) validateManifest(manifest, errors, warnings);
  await validateSkills(root, errors, warnings, summary);
  await validateMcp(root, errors, warnings, summary);
  await validateLinks(root, errors);

  const result = {
    ok: errors.length === 0, ...summary,
    errors: errors.map((message) => sanitizeError(message, [root])),
    warnings: warnings.map((message) => sanitizeError(message, [root])),
  };
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`${result.ok ? "OK" : "FAILED"}: ${summary.root}`);
    console.log(`skills: ${summary.skills}, mcp.json: ${summary.hasMcp ? "present" : "absent"}`);
    for (const warning of result.warnings) console.log(`WARNING: ${warning}`);
    for (const error of result.errors) console.error(`ERROR: ${error}`);
  }
  if (!result.ok) process.exitCode = 1;
}

async function isDirectInvocation() {
  if (!process.argv[1]) return false;
  const invoked = await realpath(process.argv[1]).catch(() => path.resolve(process.argv[1]));
  const script = await realpath(fileURLToPath(import.meta.url));
  return process.platform === "win32" ? invoked.toLowerCase() === script.toLowerCase() : invoked === script;
}

if (await isDirectInvocation()) {
  main().catch((error) => {
    console.error(`validate-agent-plugin: ${sanitizeError(error.message, [error.path, error.dest])}`);
    process.exitCode = 1;
  });
}
