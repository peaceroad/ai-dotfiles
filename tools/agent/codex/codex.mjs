#!/usr/bin/env node
// @ai-dotfiles agent-dev-runtime managed

import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// One registry drives help, menu choices, dispatch, and installed payloads.
export const CODEX_TOOLS = [
  {
    name: "git-acl", key: "g", title: "Git write permissions",
    description: "Inspect or repair known Codex-related deny ACLs on a repository.",
    requirements: "Windows, PowerShell 7, Git, and a local NTFS repository. Experimental repair; no automatic rollback.",
    file: "manage-git-write-acl.ps1", windowsOnly: true, repository: true,
    actions: [["status", "s", "Show status (read-only)"], ["repair", "r", "Repair known deny ACLs"]],
  },
  {
    name: "disk-pressure", key: "d", title: "Disk-pressure recovery",
    description: "Inspect storage and recover a specific corrupted sandbox state file. Does not clean up disk space.",
    requirements: "Windows. Repair requires at least 5 GiB free; corrupt state is backed up, not deleted.",
    file: "manage-codex-disk-pressure.mjs", windowsOnly: true,
    actions: [["status", "s", "Show status (read-only)"], ["repair", "r", "Back up corrupted ACL state"]],
  },
  {
    name: "skill-validator-utf8", key: "u", title: "Skill validator UTF-8 patch",
    description: "Inspect, apply, or restore the UTF-8 patch for reviewed Codex validator versions.",
    requirements: "Usually unnecessary when Python already reads UTF-8 by default. Apply requires Python with PyYAML. Unknown versions are never modified.",
    file: "manage-skill-validator-utf8-patch.mjs", windowsMenuOnly: true,
    actions: [["status", "s", "Show status (read-only)"], ["apply", "a", "Apply the reviewed patch"], ["restore", "r", "Restore the reviewed original"]],
  },
  {
    name: "log-policy", key: "l", title: "Diagnostic log policy",
    description: "Inspect or change which future SQLite diagnostic log levels are retained. Existing rows are preserved. Not yet validated on macOS/Linux.",
    requirements: "Node.js with node:sqlite. Unsupported workaround; schema and trigger checks must pass.",
    file: "manage-sqlite-trace-log-suppression.mjs",
    actions: [["status", "s", "Show status (read-only)"], ["suppress", "p", "Choose a log retention level"], ["restore", "r", "Restore all future log levels"]],
  },
  {
    name: "session", key: "e", title: "Session management",
    description: "Inspect, archive, delete, or export sessions selected by UUID, date, or weeks of age.",
    requirements: "Node.js 24. Archive/delete require Windows, PowerShell 7, and Codex CLI 0.153.4. Export is not an importable backup. macOS/Linux are not yet validated.",
    file: "manage-codex-sessions.mjs",
    actions: [["list", "l", "List sessions (read-only)"], ["plan", "p", "Preview a deletion plan (read-only)"], ["archive", "a", "Confirm archive"], ["delete", "d", "Confirm permanent deletion"], ["export", "e", "Export private session history"]],
  },
];

const directory = dirname(fileURLToPath(import.meta.url));
const isHelp = value => ["help", "--help", "-h"].includes(value);
const isAvailable = (tool, platform) => !tool.windowsOnly || platform === "win32";
// Default discovery is narrower than explicit access for environment-dependent fixes.
const isVisible = (tool, platform) => isAvailable(tool, platform) && (!tool.windowsMenuOnly || platform === "win32");
const banner = "Codex diagnostics and workarounds\nProvided by ai-dotfiles; not an official Codex command.";

function printHelp(log, platform, tool) {
  log(banner);
  log("Usage: agent codex [<tool> [<action> [arguments...]]]");
  log("Standalone: node <runtime>/codex/codex.mjs [<tool> [<action> [arguments...]]]");
  for (const entry of tool ? [tool] : CODEX_TOOLS.filter(entry => isVisible(entry, platform))) {
    log(`\n${entry.name}: ${entry.description}\n  ${entry.requirements}`);
    for (const [action, , description] of entry.actions) {
      const argumentsHint = entry.repository ? " <repository> [-CodexHome <directory>]"
        : entry.name === "session" ? (action === "list" ? " [--before DATE|Nw] [--limit N]" : " [UUID | --before DATE|Nw]")
        : action === "suppress" ? " [trace|debug|info|warn|error|none]" : "";
      log(`  agent codex ${entry.name} ${action}${argumentsHint} - ${description}`);
    }
    log(`  agent codex ${entry.name} help - Full script help${isAvailable(entry, platform) ? "" : " on Windows"}`);
  }
  log("\nWith no action, an interactive terminal opens a menu; redirected input/output shows help only.");
  log("Fully close Codex/ChatGPT before changes. Each script retains its own safety checks and confirmation.");
  log("No development.json is required. Individual .mjs and .ps1 scripts remain directly executable.");
}

// Close readline before handing stdin to a child. Never pre-read its confirmation.
function askTerminal(prompt) {
  return new Promise(resolveAnswer => {
    const input = createInterface({ input: process.stdin, output: process.stdout });
    input.once("close", () => resolveAnswer(null));
    input.once("SIGINT", () => input.close());
    input.question(prompt, answer => {
      resolveAnswer(answer);
      input.close();
    });
  });
}

export function runTool(tool, args, { platform = process.platform, spawn = spawnSync, log = console.log } = {}) {
  if (!isAvailable(tool, platform)) {
    if (args.length === 1 && isHelp(args[0])) {
      printHelp(log, platform, tool);
      log("This tool is available through agent codex only on Windows. No child process was started.");
      return 0;
    }
    log(`Unavailable: ${tool.name} is a Windows tool. No operation was started. Run agent codex ${tool.name} help for details.`);
    return 1;
  }
  const powershell = tool.file.endsWith(".ps1");
  const command = powershell ? "pwsh" : process.execPath;
  const prefix = powershell ? ["-NoLogo", "-NoProfile", "-File"] : [];
  const result = spawn(command, [...prefix, join(directory, tool.file), ...args], {
    stdio: "inherit", shell: false,
  });
  if (result.error) {
    log(`Could not run ${tool.name} (${result.error.code ?? "spawn failure"}). Check ${powershell ? "PowerShell 7 (pwsh) on PATH" : "the installed Node.js runtime and script"}.`);
    return 1;
  }
  if (result.signal) {
    log(`${tool.name} interrupted (${result.signal}).`);
    return result.signal === "SIGINT" ? 130 : 1;
  }
  return result.status ?? 1;
}

function select(items, answer, keyOf, nameOf) {
  return items.find((item, index) => [String(index + 1), keyOf(item), nameOf(item)].includes(answer));
}

async function menu(initialTool, { ask, run, log, platform }) {
  const visibleTools = CODEX_TOOLS.filter(entry => isVisible(entry, platform));
  let tool = initialTool;
  let lastFailure = 0;
  while (true) {
    if (!tool) {
      log(`\n${banner}\n\nChoose a tool:`);
      visibleTools.forEach((entry, index) => log(
        `  ${index + 1}/${entry.key}. ${entry.title}\n       ${entry.description}`,
      ));
      log("  q. Quit");
      const choice = (await ask("Selection: "))?.trim().toLowerCase();
      if (choice == null || choice === "q") return lastFailure;
      tool = select(visibleTools, choice, item => item.key, item => item.name);
      if (!tool) log("Choose a listed tool.");
      continue;
    }
    log(`\n${tool.title}\n${tool.description}\n${tool.requirements}`);
    log("Changes require Codex/ChatGPT to be closed and confirmation in the individual script.");
    tool.actions.forEach(([action, key, label], index) => log(`  ${index + 1}/${key}. ${label} (${action})`));
    log("  h. Show full script help\n  b. Back\n  q. Quit");
    const choice = (await ask("Selection: "))?.trim().toLowerCase();
    if (choice == null || choice === "q") return lastFailure;
    if (choice === "b") { tool = null; continue; }
    const action = ["h", "help"].includes(choice) ? "help"
      : select(tool.actions, choice, item => item[1], item => item[0])?.[0];
    if (!action) { log("Choose a listed action."); continue; }
    const args = [action];
    if (tool.repository && action !== "help") {
      const repository = await ask("Repository path (Enter cancels): ");
      if (repository === null) return lastFailure;
      if (!repository.trim()) continue;
      // A prompt accepts a literal path, not a shell command.
      args.push(resolve(repository.trim()));
    }
    log(`\nRunning: agent codex ${tool.name} ${action}`);
    const status = await run(tool, args);
    log(`Operation finished with exit code ${status}.`);
    if (status) lastFailure = status;
    if (status === 130) return status;
  }
}

export async function runCodex(args, {
  interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  ask = askTerminal, log = console.log, platform = process.platform,
  run = (tool, forwarded) => runTool(tool, forwarded, { platform, log }),
} = {}) {
  if (isHelp(args[0]) && args.length === 1) { printHelp(log, platform); return 0; }
  const tool = CODEX_TOOLS.find(entry => entry.name === args[0]);
  if (args.length && !tool) { log("Unknown Codex tool. Run agent codex --help."); return 2; }
  const forwarded = args.slice(1);
  if (isHelp(forwarded[0])) {
    if (forwarded.length !== 1) { log("Help does not accept extra arguments."); return 2; }
    forwarded[0] = "help";
  } else if (forwarded.length && !tool.actions.some(([action]) => action === forwarded[0])) {
    log(`Unknown action for ${tool.name}. Run agent codex ${tool.name} help.`);
    return 2;
  }
  // Enforce the same policy for a tool menu and an explicit action, before prompting.
  if (tool && !isAvailable(tool, platform)) return runTool(tool, forwarded, { platform, log });
  if (!forwarded.length) {
    if (!interactive) { printHelp(log, platform, tool); return 0; }
    return menu(tool, { ask, run, log, platform });
  }
  return run(tool, forwarded);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await runCodex(process.argv.slice(2)); }
  catch { console.error("Codex tool dispatch failed; no automatic retry was attempted."); process.exitCode = 1; }
}
