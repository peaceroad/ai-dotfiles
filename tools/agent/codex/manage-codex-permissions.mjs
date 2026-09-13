#!/usr/bin/env node
// @ai-dotfiles agent-dev-runtime managed
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const help = `Inspect Codex permission and approval settings (read-only).

Usage: agent codex permission status [--thread UUID] [--turn UUID]
       [--project DIRECTORY] [--codex-home DIRECTORY] [--profile NAME] [--json]
Alias: agent codex permissions

In a terminal, status without options opens a picker for up to 12 recent sessions.
It shows project, title, and session-record update time (not last-viewed time).
Lists sessions/ records, excluding archived_sessions/. Choose m for manual entry.
Enter/q cancels. Explicit options and redirected input/output never open a picker.

Compares config.toml, Desktop saved choices, and one exact session's turn_context.
--thread defaults to CODEX_THREAD_ID. Without a thread, effective values are unavailable.
--turn selects an exact turn; otherwise the latest recorded turn is reported with its ID.
--project defaults to the current directory. --profile is an explicit inspection assumption,
not evidence of the running app's selected profile. CODEX_HOME overrides ~/.codex.
Paths under the user's home are displayed as ~. Conversation bodies are never printed.

Requires Node.js 24 and Python 3.11+ (python on PATH; standard-library TOML parser).
No app-server is started, no network is used, and no permissions are changed.
App feature flags, runtime management requirements, launch overrides, and model-facing
instructions are not collected. Differences do not prove corruption or their cause.
Repair is not implemented: a supported correction path must be verified first.

Exit codes: 0 = help; 1 = inspection/runtime failure; 2 = invalid arguments;
3 = diagnostic report (live evidence remains incomplete). JSON has schemaVersion 1.
`;
function runPython(args) {
  return spawnSync('python', ['-B', '-X', 'utf8', fileURLToPath(new URL('inspect-codex-permissions.py', import.meta.url)), ...args], {
    encoding: 'utf8', shell: false, timeout: 60000, maxBuffer: 4 * 1024 * 1024,
  });
}

function askTerminal(prompt) {
  return new Promise(resolveAnswer => {
    const input = createInterface({ input: process.stdin, output: process.stdout });
    input.once('close', () => resolveAnswer(null));
    input.once('SIGINT', () => input.close());
    input.question(prompt, answer => { resolveAnswer(answer); input.close(); });
  });
}

const safeText = value => String(value).replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, ' ').trim();
const isUuid = value => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const expandHome = value => value === '~' ? homedir() : value.startsWith('~/') ? join(homedir(), value.slice(2)) : value;

export async function pickSession({ ask, log, run }) {
  const result = run(['--recent']);
  let sessions = [];
  if (!result.error && result.status === 0 && !result.stderr) {
    try {
      const data = JSON.parse(result.stdout);
      sessions = data.sessions.filter(row => isUuid(row.id) && typeof row.project === 'string' && row.project).slice(0, 12);
      for (const note of data.notes ?? []) log(safeText(note));
    } catch { log('Recent-session metadata is unavailable; use manual entry.'); }
  } else log('Recent-session metadata is unavailable; use manual entry.');
  log('Recent sessions — session-record update time (sessions/ only):');
  sessions.forEach((row, index) => {
    const project = row.project.replaceAll('\\', '/').split('/').filter(Boolean).at(-1) ?? row.project;
    log(`  ${index + 1}. ${safeText(project)} / ${safeText(row.title).slice(0, 100)} [${row.id.slice(0, 8)}]`);
    log(`     ${safeText(row.updatedAt)} | ${safeText(row.project)}`);
  });
  if (!sessions.length) log('  No recent sessions available.');
  log('  m. Enter task ID and project manually\n  q. Cancel');
  for (;;) {
    const answer = (await ask('Selection (Enter cancels): '))?.trim().toLowerCase();
    if (!answer || answer === 'q') return null;
    if (answer === 'm') {
      const thread = (await ask('Task ID (Enter cancels): '))?.trim();
      if (!thread) return null;
      if (!isUuid(thread)) { log('Enter a valid task UUID.'); continue; }
      const project = await ask('Project path (Enter uses current directory): ');
      if (project === null) return null;
      return ['--thread', thread.toLowerCase(), '--project', resolve(expandHome(project.trim().replace(/^"(.*)"$/, '$1')) || process.cwd())];
    }
    if (/^[1-9]\d*$/.test(answer) && sessions[Number(answer) - 1]) {
      const row = sessions[Number(answer) - 1];
      return ['--thread', row.id, '--project', expandHome(row.project)];
    }
    log('Choose a listed number, m, or q.');
  }
}

export async function runPermission(args, {
  interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  ask = askTerminal, log = console.log, error = console.error,
  write = text => process.stdout.write(text), run = runPython,
} = {}) {
  if (!args.length || (args.length === 1 && ['help', '--help', '-h'].includes(args[0]))) {
    log(help);
    return 0;
  }
  if (args[0] !== 'status') {
    error('Expected status or help. This tool does not change settings.');
    return 2;
  }
  let forwarded = args.slice(1);
  if (interactive && !forwarded.length) {
    forwarded = await pickSession({ ask, log, run });
    if (forwarded === null) return 0;
  }
  const result = run(forwarded);
  if (result.error || result.status === null) {
    error('Could not complete the read-only inspection. Check Python 3.11+ availability and read access; no retry was attempted.');
    return 1;
  } else if (result.stderr) {
    // Do not expose interpreter tracebacks, file paths, or source content.
    error('Inspection failed. Check Python 3.11+, file formats, and read access.');
    return 1;
  }
  write(result.stdout);
  return result.status;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await runPermission(process.argv.slice(2)); }
  catch { console.error('Permission inspection failed; no automatic retry attempted.'); process.exitCode = 1; }
}
