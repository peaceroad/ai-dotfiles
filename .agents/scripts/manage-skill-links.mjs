#!/usr/bin/env node

// @ai-dotfiles agent-dev-runtime managed

import { homedir } from "node:os";
import path from "node:path";
import { lstat, mkdir, readFile, readlink, stat, symlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const HOME = path.resolve(process.env.AGENT_DEV_HOME || homedir());
const DEFAULT_MANIFEST = path.resolve(
  process.env.AGENT_DEV_SKILL_LINKS || fileURLToPath(new URL("../skill-links.json", import.meta.url)),
);
const COMMANDS = new Set(["validate", "status", "check", "sync"]);
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const EXPECTED_LINK_ROOT = "~/.agents/skills";

function usage() {
  return `Usage:
  node ~/.agents/scripts/manage-skill-links.mjs validate
  node ~/.agents/scripts/manage-skill-links.mjs status
  node ~/.agents/scripts/manage-skill-links.mjs check
  node ~/.agents/scripts/manage-skill-links.mjs sync

Commands:
  validate  Validate the manifest without inspecting local links
  status  Show every declared link without failing on drift
  check   Show every declared link and fail when any link is not ready
  sync    Create missing links; never replace an existing path`;
}

function parseArguments(argv) {
  let command;

  for (const argument of argv) {
    if (!command && COMMANDS.has(argument)) {
      command = argument;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return command;
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

async function loadManifest(manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
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

  if (skills.length === 0) throw new Error("skills must declare at least one link");
  return { linkRoot, skills };
}

async function inspectSkill(skill) {
  const targetKind = await pathKind(skill.targetPath);
  const skillFileKind = await pathKind(path.join(skill.targetPath, "SKILL.md"));

  let linkMetadata;
  try {
    linkMetadata = await lstat(skill.linkPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

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

async function main() {
  const command = parseArguments(process.argv.slice(2));
  if (!command) {
    console.log(usage());
    return;
  }

  const { linkRoot, skills } = await loadManifest(DEFAULT_MANIFEST);
  if (command === "validate") {
    console.log(`valid          ${skills.length} skill link declaration(s)`);
    return;
  }
  const results = command === "sync"
    ? await synchronize(linkRoot, skills)
    : await inspectAll(skills);

  if (command !== "sync") {
    for (const { skill, result } of results) printResult(skill, result);
  }

  if (command !== "status" && results.some(({ result }) => result.state !== "ok")) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`error: ${displayError(error)}`);
  process.exitCode = 1;
});
