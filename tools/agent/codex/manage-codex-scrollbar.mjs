#!/usr/bin/env node
// @ai-dotfiles agent-dev-runtime managed
// Prefer native scrollbar styles without a debugging endpoint on normal launch.
// Explicit debug operations remain available for temporary pixel-width experiments.

import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const styleId = "codex-scrollbar-test";
const marker = "data-codex-scrollbar-test";
const sidebarSelector = ".sidebar-navigation";
const threadSelector = ".thread-scroll-container";
const supportedOptions = new Set(["action", "width", "port"]);
const actionOptions = new Map([
  ["launch", []], ["profile", []], ["debug-launch", ["width", "port"]],
  ["apply", ["width", "port"]], ["remove", ["port"]],
]);
const timeoutMs = 45_000;
const defaultWidth = 24;
const defaultPort = 9222;

export function parseOptions(args) {
  const isHelp = value => ["help", "--help", "-h"].includes(value);
  if (!args.length || (args.length === 1 && isHelp(args[0]))
    || (args.length === 2 && actionOptions.has(args[0]) && isHelp(args[1]))) {
    console.log(`Usage: agent codex app <launch|profile|debug-launch|apply|remove> [options]
Standalone: node tools/agent/codex/manage-codex-scrollbar.mjs <action> [options]

  launch                        Open Codex with wider scrollbars
  profile                       Inspect or confirm codexapp registration (PowerShell 7)
  debug-launch                  Launch with debugging and inject temporary CSS
  apply / remove                Change CSS in an already debug-enabled app

Debug operations only:
  --width 8..32                  debug-launch/apply; default: ${defaultWidth} CSS pixels
  --port 1024..65535              debug-launch/apply/remove; default: ${defaultPort}

--action ACTION is a legacy alternative to a positional action.

profile previews registration; interactive runs offer confirmation before writing.
Requires Windows and Node.js 24 or later. Bare invocation shows help.
Both launch actions require closed Codex and an external terminal.
launch uses standard scrollbar width and colors without a fixed pixel width.
This is not an official Codex setting and may stop working after an app update.
Normal launch does not enable debugging.
debug-launch opens a loopback endpoint: local processes can control the app until
it exits. remove only removes CSS. Debug output confirms insertion, not pixel width.
Reloads/additional windows may need apply again. No background watcher is installed.
Close Codex normally and reopen it from Start to revert either launch mode.
`);
    return null;
  }

  const options = new Map();
  if (args[0] && !args[0].startsWith("-")) {
    options.set("action", args[0]);
    args = args.slice(1);
  }
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    const key = name.startsWith("--") ? name.slice(2) : "";
    if (!supportedOptions.has(key)) {
      throw new Error("Unknown or unexpected argument. Run --help to see supported options.");
    }
    if (options.has(key)) throw new Error(`Option already provided: ${name}`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${name}.`);
    }
    options.set(key, value);
    index += 1;
  }
  const action = String(options.get("action") ?? "").toLowerCase();
  const allowed = actionOptions.get(action);
  if (!allowed) throw new Error("Choose launch, profile, debug-launch, apply, or remove. Run --help for usage.");
  for (const key of options.keys()) {
    if (key !== "action" && !allowed.includes(key)) {
      throw new Error(`${action} does not accept --${key}. Run --help for usage.`);
    }
  }
  const settings = { action };
  for (const [key, fallback, min, max] of [
    ["width", defaultWidth, 8, 32], ["port", defaultPort, 1024, 65535],
  ]) {
    if (!allowed.includes(key)) continue;
    const value = Number(options.get(key) ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`--${key} must be an integer from ${min} to ${max}.`);
    }
    settings[key] = value;
  }
  return settings;
}

function isPortAvailable(portNumber) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(portNumber, host, () => {
      server.close(() => resolve(true));
    });
  });
}

async function getTargets(port, waitMs = 2_000) {
  const response = await fetch(`http://${host}:${port}/json/list`, {
    signal: AbortSignal.timeout(waitMs),
    redirect: "error",
  });
  if (!response.ok) throw new Error("Debugging endpoint returned an error.");
  const targets = await response.json();
  if (!Array.isArray(targets)) throw new Error("Debugging endpoint returned an invalid target list.");
  return targets.filter((target) => {
    if (target?.type !== "page" || typeof target.webSocketDebuggerUrl !== "string") return false;
    try {
      const url = new URL(target.webSocketDebuggerUrl);
      return url.protocol === "ws:" && url.hostname === host && url.port === String(port);
    } catch {
      return false;
    }
  });
}

export async function waitForCodexRenderer(options, {
  get = getTargets, apply = applyToCodexTarget, now = Date.now, sleep = delay,
} = {}) {
  const deadline = now() + timeoutMs;
  let pauseMs = 150;
  while (now() < deadline) {
    let targets = [];
    try {
      targets = await get(options.port, Math.min(2_000, deadline - now()));
    } catch {
      // The endpoint may not be ready yet.
    }

    if (targets.length && await apply(targets, options, { deadline, now })) return;
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await sleep(Math.min(pauseMs, remaining));
    pauseMs = Math.min(pauseMs * 2, 1_000);
  }
  throw new Error(
    "Codex did not expose the expected scroll regions before the timeout.",
  );
}

export function evaluate(webSocketUrl, expression, waitMs = 10_000) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    let settled = false;
    const timer = setTimeout(() => fail(new Error("Renderer response timed out.")), waitMs);

    function finish(callback, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        try {
          socket.close();
        } catch {
          // The renderer may close the connection at the same time.
        }
      }
      callback(value);
    }

    function fail(error) {
      finish(reject, error);
    }

    socket.addEventListener("open", () => {
      if (settled) {
        socket.close();
        return;
      }
      try {
        socket.send(JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression, awaitPromise: true, returnByValue: true },
        }));
      } catch {
        fail(new Error("Renderer debugging connection failed."));
      }
    }, { once: true });

    socket.addEventListener("message", (event) => {
      let message;
      try {
        const data = typeof event.data === "string"
          ? event.data
          : Buffer.from(event.data).toString("utf8");
        message = JSON.parse(data);
      } catch {
        return;
      }
      if (message.id !== 1) return;
      if (message.error || message.result?.exceptionDetails) {
        fail(new Error("Renderer rejected the temporary style operation."));
        return;
      }
      finish(resolve, message.result?.result?.value);
    });

    socket.addEventListener("error", () => fail(new Error("Renderer debugging connection failed.")), { once: true });
    socket.addEventListener("close", () => {
      if (!settled) fail(new Error("Renderer closed the debugging connection."));
    }, { once: true });
  });
}

function makeExpression({ action, width }) {
  if (action === "remove") {
    return `(() => {
      const style = document.getElementById(${JSON.stringify(styleId)});
      const marked = document.querySelectorAll(${JSON.stringify(`[${marker}]`)});
      if (!style && marked.length === 0) return { success: false };
      style?.remove();
      marked.forEach((element) => element.removeAttribute(${JSON.stringify(marker)}));
      return { success: true };
    })()`;
  }

  return `(() => {
    const styleId = ${JSON.stringify(styleId)};
    const marker = ${JSON.stringify(marker)};
    const width = ${width};
    const sidebar = document.querySelector(${JSON.stringify(sidebarSelector)});
    const thread = document.querySelector(${JSON.stringify(threadSelector)});
    const roots = [sidebar, thread].filter(Boolean);
    if (!roots.length) return { success: false };

    document.querySelectorAll("[" + marker + "]")
      .forEach((element) => element.removeAttribute(marker));
    const marked = new Set();
    for (const root of roots) {
      for (let element = root; element; element = element.parentElement) {
        const style = getComputedStyle(element);
        const vertical = /^(auto|scroll|overlay)$/.test(style.overflowY)
          && element.scrollHeight > element.clientHeight + 1;
        const horizontal = /^(auto|scroll|overlay)$/.test(style.overflowX)
          && element.scrollWidth > element.clientWidth + 1;
        if (element === root || vertical || horizontal) marked.add(element);
      }
    }

    marked.forEach((element) => element.setAttribute(marker, ""));
    let sheet = document.getElementById(styleId);
    if (!sheet) {
      sheet = document.createElement("style");
      sheet.id = styleId;
      document.head.appendChild(sheet);
    }
    const cssTargets = [
      "[" + marker + "]",
      "[" + marker + "] *",
      ...[${JSON.stringify(sidebarSelector)}, ${JSON.stringify(threadSelector)}]
        .flatMap((selector) => [selector, selector + " *"]),
    ];
    sheet.textContent = cssTargets.join(", ") + " { scrollbar-width: auto !important; }\\n"
      + cssTargets.map((selector) => selector + "::-webkit-scrollbar").join(",\\n")
      + " {\\n  width: " + width + "px !important;\\n}";
    return { success: true, sidebar: Boolean(sidebar), thread: Boolean(thread), width };
  })()`;
}

export async function applyToCodexTarget(targets, options, {
  deadline = Infinity, now = Date.now, run = evaluate, log = console.log,
} = {}) {
  const expression = makeExpression(options);
  for (const target of targets) {
    const remaining = deadline - now();
    if (remaining <= 0) break;
    try {
      const result = await run(target.webSocketDebuggerUrl, expression, Math.min(10_000, remaining));
      if (!result?.success) continue;
      if (options.action === "remove") {
        log("Temporary style removed. Restart Codex normally to close the debugging endpoint.");
      } else {
        const session = result.thread ? "session=true" : "session=not mounted yet";
        log(`Temporary ${result.width}px scrollbar style applied (sidebar=${result.sidebar}, ${session}).`);
      }
      return true;
    } catch {
      // Other renderer targets may not be the Codex window.
    }
  }
  return false;
}

export function launchCodex({ debug = false, port = defaultPort, run = spawnSync } = {}) {
  const flags = debug ? [
    `--remote-debugging-address=${host}`, `--remote-debugging-port=${port}`,
  ] : [
    "--enable-blink-features=PreferDefaultScrollbarStyles",
    "--blink-settings=prefersDefaultScrollbarStyles=true",
  ];
  const result = run("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-File",
    join(dirname(fileURLToPath(import.meta.url)), "launch-codex-app.ps1"),
    "-LaunchArguments", flags.join(" "),
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true, timeout: 30_000 });
  if (result.status === 2) throw new Error("Close Codex normally, then repeat the requested launch action from a separate terminal.");
  if (result.status === 3) throw new Error("The registered Codex app package was not found.");
  if (result.status === 4) throw new Error("The Codex app manifest has no unique supported desktop entry point.");
  if (result.error || result.status !== 0 || !/^[1-9]\d*$/.test(result.stdout?.trim() ?? "")) {
    throw new Error("Could not activate the packaged Codex app. Try launching it from Start. No direct-executable or debugging fallback was attempted.");
  }
}

async function main() {
  const settings = parseOptions(process.argv.slice(2));
  if (!settings) return;

  const { action, port } = settings;
  if (process.platform !== "win32") throw new Error("Codex desktop app operations require Windows.");
  if (action === "profile") {
    const result = spawnSync("pwsh", ["-NoLogo", "-NoProfile", "-File",
      join(dirname(fileURLToPath(import.meta.url)), "register-codex-app-profile.ps1"),
    ], { stdio: "inherit", windowsHide: true });
    if (result.error) throw new Error("Could not run profile registration. PowerShell 7 (pwsh) is required.");
    process.exitCode = result.status ?? 1;
    return;
  }

  if (action === "launch") {
    launchCodex();
    console.log("Opening Codex with wider scrollbars.");
    console.log("To restore the original appearance, close Codex and reopen it from Start.");
    return;
  }
  if (action === "debug-launch") {
    if (!(await isPortAvailable(port))) {
      throw new Error(`Loopback port ${port} is already in use; no app was launched.`);
    }
    launchCodex({ debug: true, port });
    try {
      await waitForCodexRenderer(settings);
    } catch (error) {
      throw new Error(
        `The temporary style was not confirmed. Codex may still be open with the local debugging endpoint active; close it normally. ${error.message}`,
      );
    }
    console.log("For rollback and to close the endpoint, close Codex normally and reopen it from Start.");
    return;
  }

  let targets;
  try {
    targets = await getTargets(port);
  } catch {
    throw new Error(`No local debugging endpoint is available on port ${port}.`);
  }
  if (!targets.length) {
    throw new Error("No Codex renderer is available on the local debugging endpoint.");
  }
  if (!(await applyToCodexTarget(targets, settings))) {
    throw new Error("No Codex renderer with the expected scroll regions was found.");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  }
}
