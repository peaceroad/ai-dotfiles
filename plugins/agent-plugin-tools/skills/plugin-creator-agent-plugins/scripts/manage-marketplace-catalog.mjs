#!/usr/bin/env node

// @plugin-creator-agent-plugins managed-marketplace-catalog v1
// Offline, reference-only editing. This module never invokes Git or a network client.
import * as fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { createInterface } from "node:readline/promises";

const FILES = { codex: ".agents/plugins/marketplace.json", claude: ".claude-plugin/marketplace.json" };
const ACTIONS = ["init", "list", "check", "add", "update", "remove"];
const own = (object, key) => Object.hasOwn(object, key);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
export class CatalogError extends Error {
  constructor(message, committed = false) { super(message); this.name = "CatalogError"; this.committed = committed; this.commitStatus = committed === null ? "unknown" : committed ? "written" : "not-written"; this.exitCode = 1; }
}
function fail(message) { throw new CatalogError(message); }
function textValue(value, label) {
  if (typeof value !== "string" || !value.trim() || /\p{Cc}/u.test(value)) fail(`Invalid ${label}.`);
  return value;
}
function catalogName(value, format) {
  const valid = typeof value === "string" && (format === "claude"
    ? /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && !value.includes("..")
    : /^[A-Za-z0-9_-]+$/.test(value));
  if (!valid) fail(format === "claude"
    ? "Invalid Claude catalog name; start with an ASCII letter or digit, use letters, digits, dots, underscores or hyphens, and avoid consecutive dots."
    : "Invalid Codex catalog name; use ASCII letters, digits, underscores or hyphens (no dots).");
  return value;
}
function pluginName(value, format) {
  const valid = typeof value === "string" && (format === "claude"
    ? /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
    : /^[A-Za-z0-9._-]+$/.test(value) && !value.startsWith(".") && !value.endsWith(".") && !value.includes(".."));
  if (!valid) fail(format === "claude"
    ? "Invalid Claude plugin name; start with an ASCII letter or digit and use letters, digits, dots, underscores or hyphens."
    : "Invalid Codex plugin name; use ASCII letters, digits, dots, underscores or hyphens, without edge or consecutive dots.");
  return value;
}
const CLAUDE_RESERVED_CATALOG_NAMES = new Set([
  "claude-code-marketplace", "claude-code-plugins", "claude-plugins-official", "anthropic-marketplace", "anthropic-plugins",
  "agent-skills", "anthropic-agent-skills", "life-sciences", "knowledge-work-plugins", "claude-for-legal",
  "claude-for-financial-services", "financial-services-plugins", "first-party-plugins", "claude-tag-plugins",
  "claude-community", "claude-plugins-community", "healthcare", "anthropic-plugin-directory", "claude-plugin-directory",
  "inline", "builtin", "skills-dir", "synced", "claude-plugin-test", "constructor", "hasOwnProperty", "isPrototypeOf",
  "propertyIsEnumerable", "toLocaleString", "toString", "valueOf",
]);
const CODEX_RESERVED_CATALOG_NAMES = new Set([
  "openai-curated", "openai-api-curated", "openai-bundled", "openai-bundled-alpha", "openai-primary-runtime",
  "openai-curated-remote", "created-by-me-remote", "workspace-directory", "workspace-shared-with-me",
  "workspace-shared-with-me-private", "workspace-shared-with-me-unlisted",
]);
function reservedCatalogName(value, format) {
  // Host exceptions depend on source provenance. This offline helper neither
  // proves those exceptions nor duplicates contextual impersonation checks.
  return format === "claude"
    ? CLAUDE_RESERVED_CATALOG_NAMES.has(value) || /^(?:npm|pip|uv|cargo|github|gh)$/i.test(value) || value.startsWith("claudeai-")
    : CODEX_RESERVED_CATALOG_NAMES.has(value);
}
function catalogWarnings(document, entries, format) {
  return [
    ...(reservedCatalogName(document.name, format) ? ["Catalog name is reserved by the native host; source-dependent exception not verified."] : []),
    ...entries.filter((entry) => entry.status !== "supported").map((entry) => `${entry.name}: ${entry.status}; reference not fully checked.`),
  ];
}
function decimal(token) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
  let digits = (match[2] + (match[3] || "")).replace(/^0+/, "");
  if (!digits) return "0";
  let exponent = BigInt(match[4] || 0) - BigInt((match[3] || "").length);
  let end = digits.length;
  while (digits[end - 1] === "0") end--;
  exponent += BigInt(digits.length - end);
  digits = digits.slice(0, end);
  return `${match[1]}${digits}e${exponent}`;
}
// A narrow token walk after JSON.parse: detect duplicate decoded keys and
// numeric values that JSON.stringify would round. Never echo untrusted JSON.
export function parseCatalogJson(input) {
  let source;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(input); } catch { fail("Catalog is not valid UTF-8."); }
  let parsed;
  try { parsed = JSON.parse(source); } catch { fail("Catalog is not valid JSON."); }
  let at = 0;
  const whitespace = () => { while (/\s/.test(source[at] || "") && at < source.length) at++; };
  function string(decode = true) {
    const start = at++;
    while (source[at] !== '"') { if (source[at] === "\\") at++; at++; }
    at++;
    return decode ? JSON.parse(source.slice(start, at)) : undefined;
  }
  function value(depth = 0) {
    if (depth > 128) fail("Catalog nesting is too deep.");
    whitespace();
    // The initial parse already decoded values; only keys need decoding again.
    if (source[at] === '"') { string(false); return; }
    if (source[at] === "{") {
      at++; whitespace(); const keys = new Set();
      while (source[at] !== "}") {
        const key = string();
        if (keys.has(key)) fail("Catalog contains duplicate JSON keys.");
        keys.add(key); whitespace(); at++; value(depth + 1); whitespace();
        if (source[at] !== ",") break;
        at++; whitespace();
      }
      at++; return;
    }
    if (source[at] === "[") {
      at++; whitespace();
      while (source[at] !== "]") { value(depth + 1); whitespace(); if (source[at] !== ",") break; at++; }
      at++; return;
    }
    const token = /^[^,}\]\s]+/.exec(source.slice(at))[0]; at += token.length;
    if (/^-?\d/.test(token)) {
      const number = Number(token);
      if (!Number.isFinite(number) || Object.is(number, -0) || decimal(token) !== decimal(JSON.stringify(number))) fail("Catalog contains a number that cannot be preserved safely.");
    }
  }
  value();
  return parsed;
}

export function repositoryUrl(value) {
  if (typeof value !== "string") fail("Specify --repo owner/repo or a GitHub HTTPS repository URL.");
  const raw = value.startsWith("https://github.com/") ? value.slice(19) : value;
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9_.-]+$/.test(raw)) fail("Invalid GitHub repository; credentials, query, fragment and page URLs are not accepted.");
  const [owner, repo] = raw.split("/");
  const base = repo.endsWith(".git") ? repo.slice(0, -4) : repo;
  if (!base || /^\.+$/.test(base)) fail("Invalid GitHub repository.");
  return `https://github.com/${owner}/${base}.git`;
}
function subdirectory(value, format) {
  textValue(value, "subdirectory");
  if (value === ".") return null;
  const normalized = value.startsWith("./") ? value.slice(2) : value;
  if (/[\\:%]/.test(normalized)
      || normalized.split("/").some((part) => !part || part === "." || part === "..")) fail("Invalid relative subdirectory; use literal POSIX segments, not absolute, drive, encoded or parent paths.");
  return format === "codex" ? `./${normalized}` : normalized;
}
function reference(value) {
  textValue(value, "ref");
  if (/^[0-9a-fA-F]{40}$/.test(value) || value.startsWith("-") || /[\s~^:?*\[\\]/.test(value)
      || value.includes("..") || value.includes("@{") || value === "@" || value.endsWith(".")
      || value.split("/").some((part) => !part || part.startsWith(".") || part.endsWith(".lock"))) fail("Invalid branch or tag ref; use --sha for a full commit SHA.");
  return value;
}
function shaValue(value) { if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value)) fail("SHA must be exactly 40 lowercase hexadecimal characters."); return value; }
function sourceStatus(source, format) {
  if (!object(source) || !["url", "git-subdir"].includes(source.source)) return "unsupported";
  try {
    repositoryUrl(source.url);
    if (!source.url.startsWith("https://github.com/")) return "invalid";
    if (source.source === "git-subdir" && subdirectory(source.path, format) === null) return "invalid";
    if (source.source === "url" && own(source, "path")) return "unsupported";
    if (own(source, "ref")) reference(source.ref);
    if (own(source, "sha")) shaValue(source.sha);
    if (own(source, "ref") && own(source, "sha")) return "ambiguous";
    if (!own(source, "ref") && !own(source, "sha")) return "default-branch";
    return "supported";
  } catch { return "invalid"; }
}
function validateDocument(document, format) {
  if (!object(document) || !Array.isArray(document.plugins)) fail("Catalog must be an object with a plugins array.");
  catalogName(document.name, format);
  if (format === "claude") {
    if (!object(document.owner)) fail("Claude catalog requires owner.name.");
    textValue(document.owner.name, "owner name");
  } else if (own(document, "interface")) {
    if (!object(document.interface)) fail("Invalid catalog interface.");
    if (own(document.interface, "displayName")) textValue(document.interface.displayName, "display name");
  }
  const names = new Set();
  return document.plugins.map((entry) => {
    if (!object(entry) || !own(entry, "source")) fail("Each catalog entry requires name and source.");
    pluginName(entry.name, format);
    if (names.has(entry.name)) fail("Catalog contains duplicate plugin names.");
    names.add(entry.name);
    const status = sourceStatus(entry.source, format);
    return { name: entry.name, status, type: object(entry.source) && ["url", "git-subdir"].includes(entry.source.source) ? entry.source.source : "unsupported",
      ...(["supported", "ambiguous", "default-branch"].includes(status) ? { reference: Object.fromEntries(["url", "path", "ref", "sha"].filter((key) => own(entry.source, key)).map((key) => [key, entry.source[key]])) } : {}),
      tracking: status === "supported" ? (own(entry.source, "sha") ? "pinned SHA" : "branch/tag ref") : status };
  });
}
function changedSource(previous, options) {
  const result = previous ? { ...previous } : { source: "url", url: repositoryUrl(options.repo) };
  if (own(options, "repo")) result.url = repositoryUrl(options.repo);
  if (own(options, "subdir")) {
    const nextPath = subdirectory(options.subdir, options.format);
    const nextType = nextPath === null ? "url" : "git-subdir";
    if (previous && nextType !== previous.source && Object.keys(previous).some((key) => !["source", "url", "path", "ref", "sha"].includes(key))) fail("Source type conversion has unknown fields; resolve them manually before conversion.");
    result.source = nextType;
    if (nextPath === null) delete result.path; else result.path = nextPath;
  }
  if (own(options, "ref")) { result.ref = reference(options.ref); delete result.sha; }
  if (own(options, "sha")) { result.sha = shaValue(options.sha); delete result.ref; }
  return result;
}
function validateOptions(options) {
  if (!object(options) || !ACTIONS.includes(options.action)) fail("Expected init, list, check, add, update or remove.");
  if (typeof options.format !== "string" || !own(FILES, options.format)) fail("Specify --format codex or --format claude.");
  for (const flag of ["yes", "dryRun"]) {
    if (own(options, flag) && typeof options[flag] !== "boolean") fail(`Option ${flag} must be a boolean.`);
  }
  textValue(options.root, "repository root");
  const allowed = new Set(["action", "root", "format", "yes", "dryRun"]);
  const fields = { init: ["name", "owner", "displayName"], list: [], check: [], add: ["name", "repo", "subdir", "ref", "sha", "description", "category"], update: ["name", "repo", "subdir", "ref", "sha", "description", "category"], remove: ["name"] };
  for (const field of fields[options.action]) allowed.add(field);
  if (Object.keys(options).some((key) => !allowed.has(key))) fail("Option is not supported for this action.");
  if (own(options, "ref") && own(options, "sha")) fail("Choose exactly one of --ref and --sha.");
  if (options.action === "init") {
    catalogName(options.name, options.format);
    if (reservedCatalogName(options.name, options.format)) fail("Catalog name is reserved by the selected native host; choose a custom marketplace name.");
  }
  if (["add", "update", "remove"].includes(options.action)) pluginName(options.name, options.format);
  if (options.action === "add" && (!own(options, "repo") || (!own(options, "ref") && !own(options, "sha")))) fail("Add requires --repo and either --ref or --sha.");
  if (options.action === "update" && !["repo", "subdir", "ref", "sha", "description", "category"].some((field) => own(options, field))) fail("Update requires at least one changed field.");
  for (const field of ["description", "owner", "displayName", "category"]) if (own(options, field)) textValue(options[field], field);
  if (own(options, "category") && options.format !== "codex") fail("--category is supported for Codex catalogs only.");
  if (own(options, "repo")) repositoryUrl(options.repo);
  if (own(options, "subdir")) subdirectory(options.subdir, options.format);
  if (own(options, "ref")) reference(options.ref);
  if (own(options, "sha")) shaValue(options.sha);
  if (options.action === "init" && options.format === "claude" && !own(options, "owner")) fail("Claude init requires --owner (the catalog owner's display name).");
  if (options.action === "init" && ((options.format === "codex" && own(options, "owner")) || (options.format === "claude" && own(options, "displayName")))) fail("Init option does not apply to the selected format.");
}
async function statMaybe(io, target) {
  try { return await io.lstat(target); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
async function safePath(io, target) {
  const absolute = path.resolve(target); const parsed = path.parse(absolute); let current = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part); const stat = await statMaybe(io, current);
    if (!stat) break;
    if (stat.isSymbolicLink()) fail("Symlink or redirected path is not supported.");
    if (current !== absolute && !stat.isDirectory()) fail("Catalog parent is not a directory.");
  }
}
async function boundaries(io, root, file, writing) {
  await safePath(io, root); await safePath(io, file);
  const rootStat = await io.lstat(root);
  if (!rootStat.isDirectory()) fail("Repository root must be an existing directory.");
  if (writing) for (const marker of [".agents/marketplace-development", ".agents/plugin-marketplace-development"]) {
    const target = path.join(root, marker); await safePath(io, target);
    if (await statMaybe(io, target)) fail("Copy-distribution managed root: catalog writes are refused. Use its existing manager or a separate catalog root.");
  }
}
async function snapshot(io, file) {
  const stat = await statMaybe(io, file);
  if (!stat) return null;
  if (!stat.isFile() || stat.isSymbolicLink()) fail("Catalog must be a regular file.");
  const bytes = await io.readFile(file); const after = await io.lstat(file);
  if (stat.ino !== after.ino || stat.dev !== after.dev || stat.mtimeMs !== after.mtimeMs || stat.size !== after.size || stat.mode !== after.mode) fail("Catalog changed while being read; inspect and retry.");
  return { bytes, stat: after };
}
function sameSnapshot(a, b) {
  return a === null || b === null ? a === b : a.stat.ino === b.stat.ino && a.stat.dev === b.stat.dev && a.stat.mtimeMs === b.stat.mtimeMs && a.stat.mode === b.stat.mode && a.bytes.equals(b.bytes);
}

export async function runCatalog(options, { confirm, io = fs } = {}) {
  let committed = false;
  try {
    if (!object(options)) fail("Catalog options must be an object.");
    // Only validated own scalar fields cross asynchronous confirmation boundaries.
    options = { ...options };
    validateOptions(options);
    const root = path.resolve(options.root), relative = FILES[options.format], file = path.join(root, relative);
    const writing = !["list", "check"].includes(options.action);
    await boundaries(io, root, file, writing);
    const baseline = await snapshot(io, file);
    if (options.action === "init" && baseline) fail("Catalog already exists; init never overwrites it.");
    if (options.action !== "init" && !baseline) fail("Catalog does not exist; use init first.");
    const document = baseline ? parseCatalogJson(baseline.bytes) : { name: options.name,
      ...(options.format === "claude" ? { owner: { name: options.owner } } : { interface: { displayName: options.displayName || options.name } }), plugins: [] };
    const entries = validateDocument(document, options.format);
    const warnings = catalogWarnings(document, entries, options.format);
    const result = { status: "read", action: options.action, format: options.format, path: relative, entries, warnings,
      summary: "Offline structure/reference checks only; no repository access, installation or safety verification." };
    if (!writing) return { ...result, valid: warnings.length === 0 };
    const next = structuredClone(document);
    const index = next.plugins.findIndex((entry) => entry.name === options.name);
    if (options.action === "add") {
      const entry = { name: options.name, source: changedSource(null, options),
        ...(options.format === "codex" ? { policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }, category: options.category ?? "Productivity" } : {}),
        ...(own(options, "description") ? { description: options.description } : {}) };
      if (index >= 0) {
        if (isDeepStrictEqual(next.plugins[index], entry)) return { ...result, status: "unchanged", summary: "Identical entry; no changes." };
        fail("Plugin name already exists with different content; use update for explicit changes.");
      }
      next.plugins.push(entry);
    }
    if (["update", "remove"].includes(options.action)) {
      if (index < 0) fail("Plugin name is not listed.");
      const status = entries[index].status;
      if (options.action === "update" && ["unsupported", "invalid"].includes(status)) fail("Selected source is unsupported or invalid; no edit was made.");
      if (options.action === "remove") next.plugins.splice(index, 1);
      else {
        const sourceChange = ["repo", "subdir", "ref", "sha"].some((key) => own(options, key));
        if (status === "ambiguous" && sourceChange && !own(options, "ref") && !own(options, "sha")) fail("Existing ref and sha are ambiguous; explicitly select --ref or --sha.");
        if (sourceChange) next.plugins[index].source = changedSource(next.plugins[index].source, options);
        if (own(options, "description")) next.plugins[index].description = options.description;
        if (own(options, "category")) next.plugins[index].category = options.category;
      }
    }
    const nextEntries = validateDocument(next, options.format);
    if (baseline && isDeepStrictEqual(document, next)) return { ...result, status: "unchanged", summary: "No changes; original bytes and modification time retained." };
    const bytes = Buffer.from(`${JSON.stringify(next, null, 2)}\n`);
    parseCatalogJson(bytes);
    const preview = { ...result, entries: nextEntries,
      warnings: catalogWarnings(next, nextEntries, options.format),
      status: "preview", summary: `${options.action}: ${options.name}; only ${relative} will change.`,
      changes: { name: options.name, fields: Object.keys(options).filter((key) => ["repo", "subdir", "ref", "sha", "description", "category", "owner", "displayName"].includes(key)) } };
    // Project only known validated fields, never arbitrary source payloads or metadata.
    const previewEntry = (entry) => {
      if (!entry) return null;
      const status = sourceStatus(entry.source, options.format);
      if (["unsupported", "invalid"].includes(status)) return { name: entry.name, status, source: "[not displayed]" };
      return { name: entry.name, source: Object.fromEntries(
        ["source", "url", "path", "ref", "sha"].filter((key) => own(entry.source, key)).map((key) => [key, entry.source[key]])),
        ...(typeof entry.description === "string" && !/\p{Cc}/u.test(entry.description) ? { description: entry.description } : {}),
        ...(typeof entry.category === "string" && !/\p{Cc}/u.test(entry.category) ? { category: entry.category } : {}) };
    };
    preview.changes.before = index >= 0 ? previewEntry(document.plugins[index]) : null;
    preview.changes.after = previewEntry(next.plugins.find((entry) => entry.name === options.name));
    if (options.action === "add" && options.format === "codex") preview.changes.after.policy = next.plugins.at(-1).policy;
    if (options.action === "init") preview.changes.catalog = options.format === "claude" ? { name: next.name, owner: next.owner } : { name: next.name, interface: next.interface };
    if (options.dryRun) return preview;
    if (!options.yes) {
      if (typeof confirm !== "function") fail("Confirmation required; use --yes for noninteractive application or --dry-run to preview.");
      if (await confirm(preview) !== true) return { ...preview, status: "cancelled" };
    }
    // Confirmation happens before any directory creation or lock acquisition.
    await boundaries(io, root, file, true);
    const lockPath = path.join(root, `.marketplace-catalog-${options.format}.lock`);
    let lock, lockStat, temporary, temporaryStat, temporaryCreated = false, failure;
    try {
      try { lock = await io.open(lockPath, "wx", 0o600); lockStat = await lock.stat(); }
      catch (error) { if (error.code === "EEXIST") fail("Catalog lock exists; do not remove it based on age. Inspect the owning operation first."); throw error; }
      if (!sameSnapshot(baseline, await snapshot(io, file))) fail("Catalog changed during confirmation; inspect and retry.");
      await io.mkdir(path.dirname(file), { recursive: true });
      await boundaries(io, root, file, true);
      temporary = path.join(path.dirname(file), `.marketplace-catalog-${randomUUID()}.tmp`);
      const handle = await io.open(temporary, "wx", baseline ? baseline.stat.mode & 0o777 : 0o600);
      temporaryCreated = true;
      try {
        temporaryStat = await handle.stat();
        // open(mode) is filtered by umask. Preserve the inspected ordinary mode
        // on the operation-owned file handle, not via a pathname-based chmod.
        if (baseline) await handle.chmod(baseline.stat.mode & 0o777);
        await handle.writeFile(bytes); await handle.sync();
      } finally { await handle.close(); }
      const staged = await io.readFile(temporary);
      const stagedStat = await io.lstat(temporary);
      if (stagedStat.isSymbolicLink() || stagedStat.ino !== temporaryStat.ino || stagedStat.dev !== temporaryStat.dev || !staged.equals(bytes)) fail("Staged catalog changed; replacement was refused.");
      // Exact byte equality preserves the already validated serialized document.
      await boundaries(io, root, file, true);
      if (!sameSnapshot(baseline, await snapshot(io, file))) fail("Catalog changed before replacement; inspect and retry.");
      const currentLock = await io.lstat(lockPath);
      if (currentLock.ino !== lockStat.ino || currentLock.dev !== lockStat.dev || currentLock.isSymbolicLink()) fail("Catalog lock ownership changed; inspect before retrying.");
      // A failed rename response does not prove the replacement had no effect.
      committed = null;
      await io.rename(temporary, file); committed = true; temporary = null;
      if (!(await io.readFile(file)).equals(bytes)) throw new CatalogError("Catalog was replaced but read-back differs; inspect before retrying.", true);
    } catch (error) { failure = error; }
    finally {
      for (const [target, expected, created] of [[temporary, temporaryStat, temporaryCreated], [lockPath, lockStat, Boolean(lock)]]) {
        if (!target || !created) continue;
        try {
          // Without the created handle's identity, deleting this pathname
          // could delete someone else's replacement. Preserve it for inspection.
          if (!expected) throw new Error("created file identity unavailable");
          const current = await statMaybe(io, target);
          if (!current || current.ino !== expected.ino || current.dev !== expected.dev || current.isSymbolicLink()) throw new Error("ownership changed");
          if (target === lockPath) { await lock.close(); lock = null; }
          await io.unlink(target);
        } catch { failure = new CatalogError(committed === null
          ? "Catalog replacement outcome is unknown; cleanup could not be verified. Inspect the catalog, temporary file and lock before retrying."
          : committed ? "Catalog saved, but cleanup failed; inspect catalog and owned lock before retrying."
          : "Catalog not saved; cleanup failed or could not be verified. Inspect the operation's temporary file and lock before retrying.", committed); }
      }
      if (lock) { try { await lock.close(); } catch { /* already reported above */ } }
    }
    if (failure) throw failure;
    return { ...preview, status: "written", committed: true, commitStatus: "written" };
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    throw new CatalogError(committed === null ? "Catalog replacement outcome is unknown. Inspect the catalog, temporary file and lock before retrying."
      : committed ? "Catalog was replaced; verification failed. Inspect the catalog before retrying."
      : "Catalog operation failed; no replacement was completed. Check filesystem access and inspect before retrying.", committed);
  }
}

export const CATALOG_HELP = `Offline reference-only marketplace catalog
Usage: catalog <action> <root> [<plugin-name>] --format codex|claude [options]
  init    --name <catalog-name> [--display-name <text>] (codex)
          --name <catalog-name> --owner <text>           (claude)
  list    Show source type and branch/tag or SHA tracking.
  check   Check local JSON and supported reference syntax, not remote existence.
  add     <plugin-name> --repo <owner/repo> (--ref <branch-or-tag> | --sha <40-hex>)
  update  <plugin-name> [--repo ...] [--ref ... | --sha ...] [--subdir ...]
  remove  <plugin-name> Remove only the listing, not plugin files or installations.
Options: --subdir <relative-path> ('.' explicitly selects repository root)
         --description <text> (add/update); --dry-run (no writes); --yes (apply)
         --category <text> (Codex add/update; new-entry default: Productivity)
Use an existing root directory. Select exactly one format; no dual writes.
HTTPS github.com repository URLs are also accepted by --repo.
New Codex entries use AVAILABLE/ON_INSTALL. Existing policy is never rewritten.
Marketplace category can override the upstream category; choose it explicitly if needed.
Use --option=value for values starting with '--', and -- before dash-leading names.
Unknown metadata is preserved; changed JSON may be reformatted.
Writes use cooperating filesystem locks and one replacement, not a NAS guarantee.
No Git, network, authentication, execution, installation, commit, push or PR actions.
Examples:
  catalog init ./catalog --format codex --name example-catalog --dry-run
  catalog init ./catalog --format claude --name example-catalog --owner "Example Team" --dry-run
  catalog add ./catalog example-tool --format codex --repo example-org/example-tool --ref main --yes
  catalog update ./catalog example-tool --format codex --subdir plugins/example-tool --dry-run
  catalog update ./catalog example-tool --format codex --sha 0123456789abcdef0123456789abcdef01234567 --dry-run
  catalog remove ./catalog example-tool --format codex --dry-run
`;

export async function runCatalogCli(argv, { command = "catalog" } = {}) {
  const showHelp = () => {
    console.log(CATALOG_HELP.replaceAll("catalog <action>", `${command} <action>`).replaceAll("  catalog ", `  ${command} `));
    return { status: "help" };
  };
  if (!argv.length || (argv.length === 1 && ["help", "--help", "-h"].includes(argv[0])) || (argv.length === 2 && ACTIONS.includes(argv[0]) && ["help", "--help", "-h"].includes(argv[1]))) {
    return showHelp();
  }
  const options = { action: argv[0] }, positional = [];
  const values = { "--format": "format", "--name": "name", "--owner": "owner", "--display-name": "displayName", "--repo": "repo", "--subdir": "subdir", "--ref": "ref", "--sha": "sha", "--description": "description", "--category": "category" };
  for (let i = 1; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--") { positional.push(...argv.slice(i + 1)); break; }
    if (["--help", "-h"].includes(token)) return showHelp();
    if (token.startsWith("-")) {
      const equals = token.indexOf("=");
      const option = equals < 0 ? token : token.slice(0, equals);
      const key = values[option] || ({ "--yes": "yes", "--dry-run": "dryRun" })[option];
      if (!key) fail(`Unknown catalog option; run ${command} --help.`);
      if (own(options, key)) fail("Duplicate catalog option.");
      if (["yes", "dryRun"].includes(key)) {
        if (equals >= 0) fail("Boolean flags do not accept a value; omit the flag to leave it false.");
        options[key] = true;
      }
      else if (equals >= 0) options[key] = token.slice(equals + 1);
      else { if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) fail("Catalog option requires a value."); options[key] = argv[++i]; }
    } else positional.push(token);
  }
  const named = ["add", "update", "remove"].includes(options.action);
  if (positional.length !== (named ? 2 : 1) || (named && own(options, "name"))) fail(`Expected explicit repository root and, for add/update/remove, one plugin name; run ${command} --help.`);
  options.root = positional[0]; if (named) options.name = positional[1];
  const result = await runCatalog(options, { confirm: process.stdin.isTTY && process.stdout.isTTY ? async (preview) => {
    console.log(preview.summary);
    console.log(JSON.stringify(preview.changes, null, 2));
    const reader = createInterface({ input: process.stdin, output: process.stdout });
    try { return /^(?:y|yes)$/i.test((await reader.question("Apply this catalog-only change? [y/N] ")).trim()); } finally { reader.close(); }
  } : undefined });
  console.log(`${result.status}: ${result.summary}`);
  if (result.status === "preview") console.log(JSON.stringify(result.changes, null, 2));
  if (result.status === "read") for (const entry of result.entries) console.log(`  ${entry.name}: ${entry.type}; ${entry.tracking}${entry.reference ? `; ${JSON.stringify(entry.reference)}` : ""}`);
  for (const warning of result.warnings || []) console.log(`Warning: ${warning}`);
  return result;
}
export const main = runCatalogCli;
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCatalogCli(process.argv.slice(2)).then((result) => { if (result.action === "check" && !result.valid) process.exitCode = 1; }).catch((error) => {
    console.error(error instanceof CatalogError ? error.message : "Catalog operation failed."); process.exitCode = 1;
  });
}
