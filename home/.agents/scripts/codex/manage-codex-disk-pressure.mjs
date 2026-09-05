import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  statfsSync,
} from "node:fs";
import {
  readFile,
  readdir,
  rename,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { spawnSync } from "node:child_process";

const homePath = homedir();
const codexHomePath = join(homePath, ".codex");
const codexHomeDisplayPath = "~/.codex";
const sandboxPath = join(codexHomePath, ".sandbox");
const statePath = join(sandboxPath, "deny_read_acl_state.json");
const stateDisplayPath = "~/.codex/.sandbox/deny_read_acl_state.json";
const setupErrorPath = join(sandboxPath, "setup_error.json");
const setupErrorDisplayPath = "~/.codex/.sandbox/setup_error.json";
const validCommands = new Set(["status", "repair"]);
const warningFreeBytes = 10 * 1024 ** 3;
const minimumRepairFreeBytes = 5 * 1024 ** 3;
const backupPrefix = "deny_read_acl_state.json.corrupt-";
const knownStorageFilePattern =
  /^(?:goals|logs|state)_\d+\.sqlite(?:-(?:shm|wal))?$/;

function printHelp() {
  console.log(`Inspect and recover from full-disk corruption of Codex's deny_read_acl_state.json on Windows.

Usage:
  node "$HOME/.agents/scripts/codex/manage-codex-disk-pressure.mjs" <command>

Commands:
  status
    Inspect free space, known Codex database files, setup_error.json metadata,
    and deny_read_acl_state.json validity without changing anything.

  repair
    Move an empty or invalid deny_read_acl_state.json to a timestamped backup
    so Codex can recreate it. A valid state file is never changed.

  help, --help, -h
    Show this help.

Targets:
  Codex home:       ${codexHomeDisplayPath}
  ACL state:        ${stateDisplayPath}
  Setup error:      ${setupErrorDisplayPath}

Safety:
  - "status" is read-only and can run while Codex is open.
  - "repair" requires at least ${formatBytes(minimumRepairFreeBytes)} free.
  - Fully exit ChatGPT/Codex before running "repair".
  - "repair" verifies that ChatGPT.exe and Codex.exe are not running.
  - "repair" requires an interactive "y" confirmation.
  - A corrupt state file is renamed, never deleted or overwritten.
  - Missing or valid state files are left unchanged.
  - setup_error.json, setup_marker.json, databases, sessions, and sandbox
    accounts are never modified.

Disk-full failure handled:
  If Windows reports error 112 while Codex writes deny_read_acl_state.json,
  the file can remain empty. Later sandbox starts then fail with:
    helper_unknown_error: apply deny-read ACLs
    EOF while parsing a value at line 1 column 0

Related command:
  node "$HOME/.agents/scripts/codex/manage-sqlite-trace-log-suppression.mjs" status

Requirements:
  Windows and Node.js 18.15 or newer.

Exit codes:
  0  Help displayed or command completed successfully.
  1  State inspection, process detection, or filesystem operation failed.
  2  Unknown command or invalid arguments.`);
}

function failUsage(message) {
  console.error(`Error: ${message}\n`);
  printHelp();
  process.exitCode = 2;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function maskHomePath(value) {
  let masked = String(value);
  const homeVariants = new Set([
    homePath,
    homePath.replaceAll("\\", "/"),
  ]);

  for (const variant of homeVariants) {
    const flags = process.platform === "win32" ? "gi" : "g";
    masked = masked.replace(new RegExp(escapeRegExp(variant), flags), "~");
  }

  return masked;
}

function sanitizeSingleLine(value) {
  return String(value).replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").trim();
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "(unavailable)";
  }

  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const digits = unitIndex === 0 ? 0 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]} (${bytes} bytes)`;
}

function getDiskSpace() {
  const stats = statfsSync(codexHomePath, { bigint: true });
  const freeBytesBigInt = stats.bsize * stats.bavail;
  const totalBytesBigInt = stats.bsize * stats.blocks;
  const maximumSafeInteger = BigInt(Number.MAX_SAFE_INTEGER);

  if (
    freeBytesBigInt > maximumSafeInteger
    || totalBytesBigInt > maximumSafeInteger
  ) {
    throw new Error("Disk size exceeds the safe numeric reporting range.");
  }

  return {
    freeBytes: Number(freeBytesBigInt),
    totalBytes: Number(totalBytesBigInt),
  };
}

function assertRegularFile(path, displayPath) {
  const stats = lstatSync(path);

  if (stats.isSymbolicLink()) {
    throw new Error(`Path is a symbolic link; refusing it: ${displayPath}`);
  }

  if (!stats.isFile()) {
    throw new Error(`Path is not a regular file: ${displayPath}`);
  }

  return stats;
}

async function inspectAclState() {
  if (!existsSync(statePath)) {
    return {
      description: "missing; Codex may create it on the next sandbox start",
      kind: "missing",
      size: null,
    };
  }

  const stats = assertRegularFile(statePath, stateDisplayPath);

  if (stats.size === 0) {
    return {
      description: "INVALID: empty file",
      fingerprint: sha256(Buffer.alloc(0)),
      kind: "invalid",
      mtimeMs: stats.mtimeMs,
      size: 0,
    };
  }

  const buffer = await readFile(statePath);
  const contents = buffer.toString("utf8");
  const snapshot = {
    fingerprint: sha256(buffer),
    mtimeMs: stats.mtimeMs,
    size: stats.size,
  };

  try {
    const parsed = JSON.parse(contents);

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        description: "INVALID: JSON root is not an object",
        kind: "invalid",
        ...snapshot,
      };
    }

    return {
      description: "valid JSON object",
      kind: "valid",
      ...snapshot,
    };
  } catch (error) {
    return {
      description: `INVALID JSON: ${error.message}`,
      kind: "invalid",
      ...snapshot,
    };
  }
}

async function inspectSetupError() {
  if (!existsSync(setupErrorPath)) {
    return {
      description: "not present",
      kind: "missing",
    };
  }

  const stats = assertRegularFile(setupErrorPath, setupErrorDisplayPath);
  const contents = await readFile(setupErrorPath, "utf8");

  try {
    const parsed = JSON.parse(contents);
    const code = typeof parsed?.code === "string"
      ? sanitizeSingleLine(parsed.code)
      : "(missing code)";
    const message = typeof parsed?.message === "string"
      ? sanitizeSingleLine(parsed.message)
      : "(missing message)";

    return {
      description:
        `${code}: ${message}; ${stats.size} bytes; modified ${stats.mtime.toISOString()}`,
      kind: "valid",
    };
  } catch (error) {
    return {
      description:
        `invalid JSON: ${error.message}; ${stats.size} bytes; modified ${stats.mtime.toISOString()}`,
      kind: "invalid",
    };
  }
}

async function listCorruptBackups() {
  if (!existsSync(sandboxPath)) {
    return [];
  }

  const entries = await readdir(sandboxPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(backupPrefix))
    .map((entry) => entry.name)
    .sort();
}

async function printKnownStorageFiles() {
  console.log("Known Codex storage files:");
  const entries = await readdir(codexHomePath, { withFileTypes: true });
  const names = entries
    .map((entry) => entry.name)
    .filter((name) => knownStorageFilePattern.test(name))
    .sort();

  if (names.length === 0) {
    console.log("  (none found)");
    return;
  }

  for (const name of names) {
    const path = join(codexHomePath, name);
    const stats = assertRegularFile(path, `${codexHomeDisplayPath}/${name}`);
    console.log(`  ${name.padEnd(22)} ${formatBytes(stats.size)}`);
  }
}

async function printStatus() {
  if (!existsSync(codexHomePath)) {
    throw new Error(`Codex home does not exist: ${codexHomeDisplayPath}`);
  }

  const disk = getDiskSpace();
  const state = await inspectAclState();
  const setupError = await inspectSetupError();
  const backups = await listCorruptBackups();
  const freeStatus = disk.freeBytes < minimumRepairFreeBytes
    ? "CRITICAL"
    : disk.freeBytes < warningFreeBytes
      ? "WARNING"
      : "OK";

  console.log(`Codex home: ${codexHomeDisplayPath}`);
  console.log(
    `Disk free:  ${formatBytes(disk.freeBytes)} of ${formatBytes(disk.totalBytes)} [${freeStatus}]`,
  );
  console.log(
    `ACL state:  ${state.description}${state.size === null ? "" : `; ${formatBytes(state.size)}`}`,
  );
  console.log(`Setup error: ${maskHomePath(setupError.description)}`);
  console.log(`Corrupt-state backups: ${backups.length}`);

  for (const name of backups) {
    console.log(`  ~/.codex/.sandbox/${name}`);
  }

  await printKnownStorageFiles();

  if (disk.freeBytes < warningFreeBytes) {
    console.log(
      `Action: increase free space above ${formatBytes(warningFreeBytes)} before disk-intensive Codex work.`,
    );
  }

  if (state.kind === "invalid") {
    console.log(
      `Action: after freeing at least ${formatBytes(minimumRepairFreeBytes)} and fully exiting ChatGPT/Codex, run repair.`,
    );
  } else if (state.kind === "valid" && setupError.kind === "missing") {
    console.log("Action: none; the known deny-read ACL state failure is absent.");
  }
}

function getRunningCodexProcesses() {
  if (process.platform !== "win32") {
    throw new Error("Process verification is implemented only for Windows.");
  }

  const windowsRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!windowsRoot) {
    throw new Error(
      "Cannot locate %SystemRoot%\\System32\\tasklist.exe because SystemRoot is unavailable.",
    );
  }

  const tasklistPath = join(windowsRoot, "System32", "tasklist.exe");
  const tasklistDisplayPath = "%SystemRoot%\\System32\\tasklist.exe";

  if (!existsSync(tasklistPath)) {
    throw new Error(`${tasklistDisplayPath} was not found.`);
  }

  assertRegularFile(tasklistPath, tasklistDisplayPath);

  const result = spawnSync(
    tasklistPath,
    ["/FO", "CSV", "/NH"],
    {
      encoding: "utf8",
      windowsHide: true,
    },
  );

  if (result.error) {
    throw new Error(`Could not start tasklist.exe: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(
      `tasklist.exe failed with exit code ${result.status}; refusing repair.`,
    );
  }

  const targetNames = new Set(["chatgpt.exe", "codex.exe"]);
  const runningNames = new Set();

  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^"([^"]+)"/);
    const name = match?.[1]?.toLowerCase();

    if (name && targetNames.has(name)) {
      runningNames.add(name);
    }
  }

  return [...runningNames].sort();
}

async function confirmRepair(state, freeBytes) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      '"repair" requires an interactive terminal so confirmation cannot be bypassed.',
    );
  }

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let answer;

  try {
    answer = await readline.question(
      `ACL state: ${state.description}\nDisk free: ${formatBytes(freeBytes)}\nMove the corrupt state to a timestamped backup? [y/N]: `,
    );
  } finally {
    readline.close();
  }

  if (answer.trim().toLowerCase() !== "y") {
    console.log("Cancelled; no files were changed.");
    return false;
  }

  return true;
}

function createBackupPath() {
  const timestamp = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(":", "")
    .replaceAll("-", "");
  return join(sandboxPath, `${backupPrefix}${timestamp}`);
}

function fileSnapshotsMatch(left, right) {
  return (
    left.fingerprint === right.fingerprint
    && left.mtimeMs === right.mtimeMs
    && left.size === right.size
  );
}

async function repairAclState() {
  if (!existsSync(codexHomePath)) {
    throw new Error(`Codex home does not exist: ${codexHomeDisplayPath}`);
  }

  const disk = getDiskSpace();

  if (disk.freeBytes < minimumRepairFreeBytes) {
    throw new Error(
      `Only ${formatBytes(disk.freeBytes)} is free; at least ${formatBytes(minimumRepairFreeBytes)} is required before repair.`,
    );
  }

  const state = await inspectAclState();

  if (state.kind === "missing") {
    console.log(
      `${stateDisplayPath} is already absent; no repair is needed.`,
    );
    return;
  }

  if (state.kind === "valid") {
    console.log(
      `${stateDisplayPath} is valid JSON; refusing to move it.`,
    );
    return;
  }

  const runningProcesses = getRunningCodexProcesses();

  if (runningProcesses.length > 0) {
    throw new Error(
      `ChatGPT/Codex is still running (${runningProcesses.join(", ")}). Fully exit it before repair.`,
    );
  }

  if (!(await confirmRepair(state, disk.freeBytes))) {
    return;
  }

  const recheckedRunningProcesses = getRunningCodexProcesses();

  if (recheckedRunningProcesses.length > 0) {
    throw new Error(
      `ChatGPT/Codex started after confirmation (${recheckedRunningProcesses.join(", ")}). Close it and retry.`,
    );
  }

  const recheckedDisk = getDiskSpace();

  if (recheckedDisk.freeBytes < minimumRepairFreeBytes) {
    throw new Error(
      "Free space fell below the repair threshold after confirmation; no file was changed.",
    );
  }

  const recheckedState = await inspectAclState();

  if (
    recheckedState.kind !== "invalid"
    || !fileSnapshotsMatch(state, recheckedState)
  ) {
    throw new Error(
      "ACL state changed after confirmation; refusing to move it.",
    );
  }

  const backupPath = createBackupPath();

  if (existsSync(backupPath)) {
    throw new Error(
      `Backup path already exists: ${maskHomePath(backupPath)}`,
    );
  }

  await rename(statePath, backupPath);

  try {
    if (existsSync(statePath) || !existsSync(backupPath)) {
      throw new Error("source or backup existence verification failed");
    }

    const backupStats = assertRegularFile(
      backupPath,
      maskHomePath(backupPath),
    );
    const backupBuffer = await readFile(backupPath);
    const backupMatches = (
      backupStats.size === recheckedState.size
      && sha256(backupBuffer) === recheckedState.fingerprint
    );

    if (!backupMatches) {
      throw new Error("backup content verification failed");
    }
  } catch (error) {
    if (!existsSync(statePath) && existsSync(backupPath)) {
      let rollbackError = null;

      try {
        await rename(backupPath, statePath);
      } catch (caughtError) {
        rollbackError = caughtError;
      }

      if (rollbackError) {
        throw new Error(
          `Post-move verification failed (${error.message}) and rollback failed (${rollbackError.message}). Inspect ${stateDisplayPath} manually.`,
        );
      }

      throw new Error(
        `Post-move verification failed (${error.message}). The original path was restored.`,
      );
    }

    throw new Error(
      `Post-move verification failed (${error.message}). Inspect ${stateDisplayPath} manually.`,
    );
  }

  console.log("Repair completed.");
  console.log(`Corrupt state moved to: ${maskHomePath(backupPath)}`);
  console.log("Start ChatGPT/Codex and run a harmless command.");
  console.log(
    `Then run "status" and confirm ${stateDisplayPath} is valid and ${setupErrorDisplayPath} is absent.`,
  );
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printHelp();
    return;
  }

  if (
    args.length === 1
    && ["help", "--help", "-h"].includes(args[0])
  ) {
    printHelp();
    return;
  }

  if (args.length !== 1) {
    failUsage("Exactly one command is required.");
    return;
  }

  const [command] = args;

  if (!validCommands.has(command)) {
    failUsage(`Unknown command: ${command}`);
    return;
  }

  if (command === "status") {
    await printStatus();
  } else {
    await repairAclState();
  }
}

try {
  await main();
} catch (error) {
  console.error(`Error: ${maskHomePath(error.message)}`);
  process.exitCode = 1;
}
