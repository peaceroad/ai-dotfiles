import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';

export const capabilities = Object.freeze({
  adapter: 'codex-exec-text-v1', explicitTextBundle: true,
  naturalSkillDiscovery: false, toolTasks: false, midTurnSteering: false,
  turnResume: false, protectedHoldout: false, executableCandidates: false,
  observedModelVersion: false, strictTokenCap: false,
  usage: 'reported-at-turn-end', stop: 'process-group-or-taskkill; failure-is-unconfirmed',
});

export function findCodex(explicit) {
  if (explicit) {
    if (!isAbsolute(explicit) || !existsSync(explicit) || /\.(cmd|bat|ps1|js|mjs)$/i.test(explicit)) throw new Error('binary must name an existing native Codex executable.');
    return explicit;
  }
  const native = process.platform === 'win32' ? 'codex.exe' : 'codex';
  for (const dir of (process.env.PATH || '').split(delimiter).filter(Boolean)) {
    const file = join(dir, native);
    if (existsSync(file)) return file;
  }
  // npm Windows shims require a shell. Resolve their installed native dependency
  // instead so prompts never pass through shell interpolation or another launcher.
  if (process.platform === 'win32') {
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const triple = arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
    for (const dir of (process.env.PATH || '').split(delimiter).filter(Boolean)) {
      const packageFile = join(dir, 'node_modules', '@openai', 'codex', 'package.json');
      if (!existsSync(packageFile)) continue;
      const require = createRequire(resolve(packageFile));
      try {
        const platformPackage = require.resolve(`@openai/codex-win32-${arch}/package.json`);
        const file = join(dirname(platformPackage), 'vendor', triple, 'bin', native);
        if (existsSync(file)) return file;
      } catch { /* This installation may use the older in-package vendor layout. */ }
      const file = join(dirname(packageFile), 'vendor', triple, 'bin', native);
      if (existsSync(file)) return file;
    }
  }
  throw new Error('Native Codex executable not found; set runtime.binary to the installed executable.');
}

export function codexArguments(runtime, cwd, schemaFile) {
  if (!runtime.model || typeof runtime.model !== 'string') throw new Error('Specify runtime.model for comparable trials.');
  const args = ['exec', '--json', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '-c', 'approval_policy="never"', '-m', runtime.model, '-C', cwd];
  if (runtime.reasoningEffort) {
    if (!['low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(runtime.reasoningEffort)) throw new Error('Unsupported reasoningEffort.');
    args.push('-c', `model_reasoning_effort=${JSON.stringify(runtime.reasoningEffort)}`);
  }
  if (runtime.ignoreUserConfig === true) args.push('--ignore-user-config');
  for (const name of ['shell_tool', 'unified_exec', 'apps', 'plugins', 'hooks', 'multi_agent', 'browser_use', 'computer_use', 'image_generation', 'daemon_auto_start']) args.push('--disable', name);
  if (schemaFile) args.push('--output-schema', schemaFile);
  args.push('-');
  return args;
}

export function createEventReader() {
  let pending = '', invalid = 0, failed = false;
  const result = { output: '', usage: null, threadId: null, completed: false, errors: [], eventTypes: [], toolActivity: false, observedModel: null };
  const types = new Set();
  function line(text) {
    if (!text.trim()) return;
    let e;
    try { e = JSON.parse(text); } catch { invalid++; return; }
    if (!e || typeof e !== 'object' || Array.isArray(e) || typeof e.type !== 'string' || !e.type.trim()) { invalid++; return; }
    types.add(e.type);
    if (e.type === 'thread.started') result.threadId = e.thread_id ?? null;
    if (e.type === 'turn.completed') { result.completed = true; result.usage = e.usage ?? null; }
    if (e.type === 'turn.failed') { failed = true; result.errors.push(e.error?.message || 'Turn failed.'); }
    if (e.type === 'error') result.errors.push(e.message || 'Runtime error.');
    if (e.type === 'item.completed' && e.item?.type === 'agent_message') {
      if (typeof e.item.text !== 'string') invalid++;
      else result.output = e.item.text;
    }
    if (e.item && ['command_execution', 'file_change', 'mcp_tool_call', 'web_search'].includes(e.item.type)) result.toolActivity = true;
    // Reasoning items and full tool transcripts are deliberately not retained.
  }
  return {
    push(chunk) { pending += chunk; const lines = pending.split('\n'); pending = lines.pop(); for (const item of lines) line(item); },
    finish() { line(pending); pending = ''; result.eventTypes = [...types]; return { ...result, completed: result.completed && !failed, invalidLines: invalid }; },
  };
}

function stopTree(child) {
  if (!child.pid) return false;
  if (process.platform === 'win32') {
    const stopped = spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000, encoding: 'utf8' });
    if (stopped.status === 0) return true;
    try { child.kill('SIGKILL'); } catch { /* Keep the unconfirmed outcome. */ }
    return false;
  }
  try { process.kill(-child.pid, 'SIGKILL'); return true; }
  catch { return false; }
}

export function codexInvoker(runtime, workRoot) {
  const binary = findCodex(runtime.binary);
  const versionResult = spawnSync(binary, ['--version'], { windowsHide: true, encoding: 'utf8', timeout: 10000 });
  if (versionResult.status !== 0) throw new Error('Cannot identify the installed Codex executable.');
  const version = versionResult.stdout.trim();
  return {
    identity: { capabilities, version, runtime, inheritedInstructions: 'Host/global instructions may remain; not audited by this adapter.', isolation: 'Fresh cwd and read-only sandbox; no protected holdout guarantee.' },
    invoke(request) {
      return new Promise(resolveResult => {
        const cwd = join(workRoot, randomUUID());
        mkdirSync(cwd, { recursive: true });
        const schemaFile = request.outputSchema ? join(cwd, 'response-schema.json') : null;
        if (schemaFile) writeFileSync(schemaFile, `${JSON.stringify(request.outputSchema)}\n`);
        const args = codexArguments(runtime, cwd, schemaFile);
        const reader = createEventReader();
        const decoder = new StringDecoder('utf8');
        const child = spawn(binary, args, { cwd, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
        let stderr = '', bytes = 0, termination = null, finished = false, emergency;
        const settle = (code, signal, error) => {
          if (finished) return;
          finished = true; clearTimeout(timer); clearTimeout(emergency);
          process.removeListener('SIGINT', onInterrupt); process.removeListener('SIGTERM', onTerminate);
          reader.push(decoder.end());
          const result = reader.finish();
          let status = 'completed';
          if (termination) status = termination.confirmed ? (termination.interrupted ? 'interrupted' : 'timeout') : 'cleanup_unconfirmed';
          else if (error || code !== 0 || !result.completed || result.invalidLines) status = 'runtime_error';
          else if (result.toolActivity) status = 'unsupported';
          const reason = error || (termination ? termination.reason : result.toolActivity ? 'Tool activity is outside the text adapter contract.' : status === 'runtime_error' ? result.errors.at(-1) || stderr.slice(-1600) || 'Missing successful turn completion.' : null);
          child.stdout?.destroy(); child.stderr?.destroy(); child.stdin?.destroy(); child.unref();
          resolveResult({ status, reason, output: result.output, usage: result.usage, threadId: result.threadId, eventTypes: result.eventTypes, observedModel: result.observedModel, exitCode: code, signal, workspace: cwd });
        };
        const stop = (reason, interrupted = false) => {
          if (termination || finished) return;
          termination = { reason, interrupted, confirmed: stopTree(child) };
          emergency = setTimeout(() => settle(null, null, 'Termination did not complete.'), 2000);
        };
        const onInterrupt = () => stop('Interrupted by SIGINT.', true);
        const onTerminate = () => stop('Interrupted by SIGTERM.', true);
        process.once('SIGINT', onInterrupt); process.once('SIGTERM', onTerminate);
        const timer = setTimeout(() => stop('Execution time limit reached.'), request.timeoutMs);
        child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > 4 * 1024 * 1024) stop('Runtime output limit reached.'); else reader.push(decoder.write(chunk)); });
        child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8192); });
        child.stdin.on('error', () => {});
        child.once('error', e => settle(null, null, e.message));
        child.once('close', (code, signal) => settle(code, signal));
        child.stdin.end(request.prompt);
      });
    },
  };
}
