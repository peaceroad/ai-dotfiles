#!/usr/bin/env node

// @ai-dotfiles agent-dev-runtime managed

import { homedir } from "node:os";
import path from "node:path";
import { lstat, mkdir, readFile, readlink, stat, symlink, open, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const HOME = path.resolve(process.env.AGENT_DEV_HOME || homedir());
const DEFAULT_MANIFEST = path.resolve(
  process.env.AGENT_DEV_SKILL_LINKS || path.join(HOME, ".agents", "ai-dotfiles", "skill-links.json"),
);
const ACTIONS = [
  ["status", "s", "Show status"],
  ["add", "a", "Add a source declaration"],
  ["update", "u", "Update a source and its matching link"],
  ["remove", "r", "Remove a declaration and its matching link"],
  ["check", "c", "Check links"],
  ["sync", "y", "Sync missing links"],
  ["validate", "v", "Validate settings"],
];
const COMMANDS = new Set(ACTIONS.map(([command]) => command));
const MUTATIONS = new Set(["add", "update", "remove"]);
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const EXPECTED_LINK_ROOT = "~/.agents/skills";

function usage() {
  return `Usage:
  agent dev skill link
  agent dev skill link <status|check|sync|validate>
  agent dev skill link add <name> <source-directory> [--yes]
  agent dev skill link update <name> <source-directory> [--yes]
  agent dev skill link remove <name> [--yes]
  node ~/.agents/ai-dotfiles/runtime/manage-skill-links.mjs [<command> [arguments...]]

Alias: agent dev skill links accepts the same actions as link.

Manifest:
  ~/.agents/ai-dotfiles/skill-links.json (override with AGENT_DEV_SKILL_LINKS)

Commands:
  validate  Validate the manifest without inspecting local links
  status  Show every declared link without failing on drift
  check   Show every declared link and fail when any link is not ready
  sync    Create missing links; never replace an existing path
  add     Register a source; create the manifest if absent, but do not create a link
  update  Change a source and retarget only an existing link matching the old declaration
  remove  Remove a declaration and its matching link; never delete the source

With no command, a terminal opens a menu; redirected input/output shows help.
Sources must be local directories under your home and contain SKILL.md.
Mutations ask for confirmation; --yes explicitly confirms a scripted request.
Close other link editors during changes. A stale .lock after interruption needs review.`;
}

function parseArguments(argv) {
  if (argv.length === 0) return {};
  if (["help", "--help", "-h"].includes(argv[0]) && argv.length === 1) return { help: true };
  const [command, ...rest] = argv;
  if (!COMMANDS.has(command)) throw new Error(`Unknown command: ${command}`);
  const yes = rest.at(-1) === "--yes";
  if (yes) rest.pop();
  const count = command === "remove" ? 1 : MUTATIONS.has(command) ? 2 : 0;
  if (rest.length !== count || (yes && !MUTATIONS.has(command)) || rest.some(value => value.startsWith("--"))) {
    throw new Error("Invalid arguments. Run agent dev skill link help.");
  }
  return { command, name: rest[0], source: rest[1], yes };
}

function expandHome(value, fieldName) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  if (value === "~") return HOME;
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(HOME, value.slice(2));
  }
  return path.resolve(value);
}

function normalizePath(value) {
  const resolved = path.resolve(value).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function displayError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (process.platform !== "win32") return message.split(HOME).join("~");

  let result = message;
  let index = result.toLowerCase().indexOf(HOME.toLowerCase());
  while (index !== -1) {
    result = `${result.slice(0, index)}~${result.slice(index + HOME.length)}`;
    index = result.toLowerCase().indexOf(HOME.toLowerCase(), index + 1);
  }
  return result;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isInside(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function validatePortablePath(value, fieldName) {
  if (typeof value !== "string" || !value.startsWith("~/")) {
    throw new Error(`${fieldName} must use a ~/ path`);
  }
  if (value.split("/").includes("..")) {
    throw new Error(`${fieldName} must not contain .. segments`);
  }
}

async function pathKind(targetPath) {
  try {
    const metadata = await stat(targetPath);
    if (metadata.isDirectory()) return "directory";
    if (metadata.isFile()) return "file";
    return "other";
  } catch (error) {
    if (error?.code === "ENOENT") return "missing";
    throw error;
  }
}

function validateManifest(manifest) {
  if (!isPlainObject(manifest)) throw new Error("manifest must be an object");
  const allowedFields = new Set(["schemaVersion", "linkRoot", "skills"]);
  const unknownFields = Object.keys(manifest).filter((field) => !allowedFields.has(field));
  if (unknownFields.length > 0) {
    throw new Error(`Unknown manifest field: ${unknownFields.join(", ")}`);
  }
  if (manifest?.schemaVersion !== 1) throw new Error("schemaVersion must be 1");
  if (manifest.linkRoot !== EXPECTED_LINK_ROOT) {
    throw new Error(`linkRoot must be ${EXPECTED_LINK_ROOT}`);
  }
  if (!isPlainObject(manifest.skills)) throw new Error("skills must be an object");

  const linkRoot = expandHome(manifest.linkRoot, "linkRoot");
  const seenTargets = new Set();
  const skills = Object.entries(manifest.skills)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, target]) => {
      if (!SKILL_NAME_PATTERN.test(name)) throw new Error(`Invalid skill name: ${name}`);
      validatePortablePath(target, `skills.${name}`);
      const targetPath = expandHome(target, `skills.${name}`);
      if (path.basename(targetPath) !== name) {
        throw new Error(`skills.${name} must target a directory named ${name}`);
      }
      if (normalizePath(targetPath) === normalizePath(linkRoot) || isInside(linkRoot, targetPath)) {
        throw new Error(`skills.${name} must not target linkRoot or one of its descendants`);
      }
      const normalizedTarget = normalizePath(targetPath);
      if (seenTargets.has(normalizedTarget)) {
        throw new Error(`skills.${name} duplicates another target`);
      }
      seenTargets.add(normalizedTarget);
      return {
        name,
        displayLink: `~/.agents/skills/${name}`,
        displayTarget: target,
        linkPath: path.join(linkRoot, name),
        targetPath,
      };
    });

  return { linkRoot, skills };
}

async function readManifestBytes() {
  const info = await metadata(DEFAULT_MANIFEST);
  if (info && (!info.isFile() || info.isSymbolicLink())) throw new Error("Manifest must be a regular file, not a link.");
  return info ? readFile(DEFAULT_MANIFEST, "utf8") : null;
}

async function readSnapshot() {
  const bytes = await readManifestBytes();
  const manifest = bytes === null ? { schemaVersion: 1, linkRoot: EXPECTED_LINK_ROOT, skills: {} } : JSON.parse(bytes);
  return { bytes, manifest, ...validateManifest(manifest) };
}

async function metadata(location) {
  try { return await lstat(location); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

// Mutation paths must not redirect writes through directory symlinks or junctions.
async function assertDirectories(directory) {
  for (let current = directory; ; current = path.dirname(current)) {
    const info = await metadata(current);
    if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error("Mutation directory must be a real directory, not a link.");
    if (current === HOME || path.dirname(current) === current) break;
  }
}

async function withLock(operation) {
  const directory = path.dirname(DEFAULT_MANIFEST);
  await assertDirectories(directory);
  await mkdir(directory, { recursive: true });
  const lockPath = `${DEFAULT_MANIFEST}.lock`;
  let lock;
  try { lock = await open(lockPath, "wx", 0o600); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error("Skill link settings are locked. Stop other operations; review a stale lock before removing it.");
    throw error;
  }
  try { return await operation(); }
  finally { await lock.close(); await unlink(lockPath); }
}

async function assertUnchanged(snapshot) {
  if (await readManifestBytes() !== snapshot.bytes) throw new Error("Manifest changed; no further changes were made. Retry after review.");
}

async function saveManifest(snapshot, manifest) {
  const temporary = `${DEFAULT_MANIFEST}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  let committed = false;
  try {
    try { await file.writeFile(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"); }
    finally { await file.close(); }
    await assertUnchanged(snapshot);
    await rename(temporary, DEFAULT_MANIFEST);
    committed = true;
  } finally {
    // After commit, cleanup must not turn success into a link-only rollback.
    if (!committed) await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
}

async function matchingLink(skill) {
  const info = await metadata(skill.linkPath);
  if (!info) return null;
  if (!info.isSymbolicLink()) throw new Error("Refusing to change an existing non-link path.");
  const raw = await readlink(skill.linkPath);
  if (normalizePath(path.resolve(path.dirname(skill.linkPath), raw)) !== normalizePath(skill.targetPath)) {
    throw new Error("Refusing to change a link that does not match its declaration.");
  }
  return { raw, ino: info.ino, dev: info.dev };
}

async function mutate({ command, name, source, yes }, ask) {
  if (!SKILL_NAME_PATTERN.test(name)) throw new Error("Invalid skill name.");
  const snapshot = await readSnapshot();
  const old = snapshot.skills.find(skill => skill.name === name);
  if (command === "add" ? old : !old) throw new Error(command === "add" ? "Skill is already registered; use update." : "Skill is not registered.");
  const manifest = structuredClone(snapshot.manifest);
  if (command === "remove") delete manifest.skills[name];
  else {
    const target = expandHome(source, "source");
    if (!isInside(HOME, target)) throw new Error("Source must be under your home directory.");
    manifest.skills[name] = `~/${path.relative(HOME, target).split(path.sep).join("/")}`;
  }
  const validated = validateManifest(manifest);
  const next = validated.skills.find(skill => skill.name === name);
  if (next && (await pathKind(next.targetPath) !== "directory" || await pathKind(path.join(next.targetPath, "SKILL.md")) !== "file")) {
    throw new Error("Source must be a directory containing SKILL.md.");
  }
  await assertDirectories(snapshot.linkRoot);
  const existing = old ? await matchingLink(old) : null;
  if (!old && await metadata(next.linkPath)) throw new Error("Link path is already occupied; add never adopts an existing path.");
  if (command === "update" && normalizePath(old.targetPath) === normalizePath(next.targetPath)) {
    console.log("No change: source is already registered."); return;
  }
  console.log(`${command}: ${name}${old ? `\n  Old source: ${old.displayTarget}` : ""}${next ? `\n  New source: ${next.displayTarget}` : ""}`);
  console.log(existing ? "The matching link will be changed; source files will not be modified."
    : command === "remove" ? "Only the declaration will be removed; no link exists."
    : "Only the declaration will change. Run sync to create missing links.");
  if (!yes) {
    if (!ask) throw new Error("Confirmation requires a terminal. Use --yes only after reviewing the requested change.");
    if ((await ask("Continue? [y/N]: "))?.trim().toLowerCase() !== "y") { console.log("Cancelled; no changes made."); return; }
  }
  await withLock(async () => {
    await assertUnchanged(snapshot);
    await assertDirectories(snapshot.linkRoot);
    const current = old ? await matchingLink(old) : null;
    if (JSON.stringify(current) !== JSON.stringify(existing) || (!old && await metadata(next.linkPath))) {
      throw new Error("Link changed after review; refusing to continue.");
    }
    let removed = false;
    let replacement = false;
    try {
      if (existing) {
        await unlink(old.linkPath); removed = true;
        if (next) { await symlink(next.targetPath, next.linkPath, "dir"); replacement = true; }
      }
      await saveManifest(snapshot, manifest);
    } catch (error) {
      if (removed) {
        try {
          if (replacement) { await matchingLink(next); await unlink(next.linkPath); }
          if (await metadata(old.linkPath)) throw new Error("Link path is occupied.");
          await symlink(existing.raw, old.linkPath, "dir");
        } catch { throw new Error("Change failed and link rollback could not complete. Inspect the manifest and link before retrying; source files were not changed."); }
      }
      throw error;
    }
  });
  console.log(`${command === "remove" ? "Removed" : "Saved"}: ${name}. Source files were not modified.`);
}

async function inspectSkill(skill) {
  const [targetKind, skillFileKind, linkMetadata] = await Promise.all([
    pathKind(skill.targetPath),
    pathKind(path.join(skill.targetPath, "SKILL.md")),
    metadata(skill.linkPath),
  ]);

  if (!linkMetadata) return { state: "missing", targetKind, skillFileKind };
  if (!linkMetadata.isSymbolicLink()) return { state: "not-link", targetKind, skillFileKind };

  const rawTarget = await readlink(skill.linkPath);
  const actualTarget = path.resolve(path.dirname(skill.linkPath), rawTarget);
  if (normalizePath(actualTarget) !== normalizePath(skill.targetPath)) {
    return { state: "wrong-target", targetKind, skillFileKind };
  }
  if (targetKind !== "directory") return { state: "target-missing", targetKind, skillFileKind };
  if (skillFileKind !== "file") return { state: "missing-skill", targetKind, skillFileKind };
  return { state: "ok", targetKind, skillFileKind };
}

function printResult(skill, result) {
  console.log(`${result.state.padEnd(14)} ${skill.name} -> ${skill.displayTarget}`);
}

async function inspectAll(skills) {
  return Promise.all(skills.map(async (skill) => ({
    skill,
    result: await inspectSkill(skill),
  })));
}

async function synchronize(linkRoot, skills) {
  await assertDirectories(linkRoot);
  await mkdir(linkRoot, { recursive: true });
  const initial = await inspectAll(skills);

  for (const { skill, result } of initial) {
    if (result.state === "ok") {
      printResult(skill, result);
      continue;
    }
    if (result.state !== "missing") {
      printResult(skill, result);
      console.error(`refused        ${skill.displayLink}: sync never replaces an existing path`);
      continue;
    }
    if (result.targetKind !== "directory" || result.skillFileKind !== "file") {
      printResult(skill, {
        state: result.targetKind !== "directory" ? "target-missing" : "missing-skill",
      });
      continue;
    }
    await symlink(skill.targetPath, skill.linkPath, "dir");
    console.log(`created        ${skill.name} -> ${skill.displayTarget}`);
  }

  return inspectAll(skills);
}

async function inspect(command) {
  const snapshot = await readSnapshot();
  const { linkRoot, skills } = snapshot;
  if (snapshot.bytes === null) {
    console.log("No skill link settings yet. Run agent dev skill link add <name> <source-directory>.");
    return command === "status" ? 0 : 1;
  }
  if (command === "validate") {
    console.log(`valid          ${skills.length} skill link declaration(s)`);
    return 0;
  }
  if (!skills.length) {
    console.log("No skill links registered. Use add to register a local source.");
    return 0;
  }
  const results = command === "sync"
    ? await withLock(async () => { await assertUnchanged(snapshot); return synchronize(linkRoot, skills); })
    : await inspectAll(skills);

  if (command !== "sync") {
    for (const { skill, result } of results) printResult(skill, result);
  }

  return command !== "status" && results.some(({ result }) => result.state !== "ok") ? 1 : 0;
}

export async function runLinks(argv, { interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY), ask } = {}) {
  const request = parseArguments(argv);
  if (request.help || (!request.command && !interactive)) { console.log(usage()); return 0; }
  let input;
  if (interactive && !ask) {
    input = createInterface({ input: process.stdin, output: process.stdout });
    ask = prompt => input.question(prompt).catch(() => null);
  }
  try {
    if (request.command) {
      if (MUTATIONS.has(request.command)) { await mutate(request, ask); return 0; }
      return inspect(request.command);
    }
    while (true) {
      console.log("\nLocal development skill links (not Marketplace installations)");
      ACTIONS.forEach(([, key, label], index) => console.log(`  ${index + 1}/${key}. ${label}`));
      console.log("  h. Help\n  q. Quit");
      const choice = (await ask("Selection: "))?.trim().toLowerCase();
      if (choice == null || ["q", "b"].includes(choice)) return 0;
      if (["h", "help"].includes(choice)) { console.log(usage()); continue; }
      const command = ACTIONS.find(([name, key], index) => [name, String(index + 1), key].includes(choice))?.[0];
      if (!command) { console.log("Choose a listed action."); continue; }
      try {
        if (MUTATIONS.has(command)) {
          if (command !== "add") await inspect("status");
          const name = (await ask("Skill name (Enter cancels): "))?.trim();
          if (!name) continue;
          const source = command === "remove" ? undefined : (await ask("Source directory (Enter cancels): "))?.trim();
          if (command !== "remove" && !source) continue;
          await mutate({ command, name, source }, ask);
        } else console.log(`Operation finished with exit code ${await inspect(command)}.`);
      } catch (error) { console.error(`error: ${displayError(error)}`); }
    }
  } finally { input?.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await runLinks(process.argv.slice(2)); }
  catch (error) { console.error(`error: ${displayError(error)}`); process.exitCode = 1; }
}
