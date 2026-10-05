import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync, lstatSync, realpathSync, openSync, closeSync, unlinkSync, chmodSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
export function readRecord(root) {
  const state = readJson(join(root, 'record.json'));
  if (state.schema !== 1 || !state.contract || state.contractHash !== digest(state.contract)) {
    throw new Error('Recorded contract is missing or its hash changed; inspect the evidence before continuing.');
  }
  return state;
}
export function saveJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    renameSync(temp, file);
  } finally { if (existsSync(temp)) unlinkSync(temp); }
}

export function portablePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes(':') || value.startsWith('/') || value.split('/').some(p => !p || p === '.' || p === '..') || /[\x00-\x1f]/.test(value)) {
    throw new Error('Expected a portable, non-traversing relative file path.');
  }
  return value;
}

export function inside(root, path) {
  const rel = relative(root, path);
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
}

export function safeFile(root, name, { existing = true } = {}) {
  portablePath(name);
  const base = realpathSync(root);
  const parts = name.split('/');
  let path = base;
  for (let i = 0; i < parts.length; i++) {
    path = join(path, parts[i]);
    if (existsSync(path)) {
      if (lstatSync(path).isSymbolicLink() || !inside(base, realpathSync(path))) throw new Error('Symlink or path escape in bundle.');
      if (i < parts.length - 1 && !lstatSync(path).isDirectory()) throw new Error('Bundle parent is not a directory.');
    } else if (existing) throw new Error(`Missing bundle file: ${name}`);
  }
  return path;
}

export function snapshot(spec, base = process.cwd()) {
  if (!spec || typeof spec.root !== 'string' || !Array.isArray(spec.files) || !spec.files.length) throw new Error('A bundle needs root and a nonempty files array.');
  const root = resolve(base, spec.root);
  const files = Object.create(null);
  for (const name of [...spec.files].sort()) {
    if (Object.hasOwn(files, name)) throw new Error('Duplicate bundle file.');
    const path = safeFile(root, name);
    if (!lstatSync(path).isFile()) throw new Error('Bundle entries must be files.');
    const bytes = readFileSync(path);
    if (bytes.length > 512 * 1024 || bytes.includes(0)) throw new Error('Only bounded text files are supported.');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    files[name] = text;
  }
  return { hash: digest(files), files };
}

export function editBundle(parent, edits, editable) {
  if (!Array.isArray(edits) || !edits.length) throw new Error('A candidate needs at least one edit.');
  const files = { ...parent.files }, touched = new Set();
  for (const edit of edits) {
    const path = portablePath(edit.path);
    if (!editable.includes(path) || !Object.hasOwn(files, path) || touched.has(path)) throw new Error('Edit outside declared files or duplicate edit.');
    if (!/\.(md|txt|json)$/.test(path)) throw new Error('This runner supports text/data candidates only, not executable helper changes.');
    if (typeof edit.content !== 'string' || edit.content.includes('\0') || Buffer.byteLength(edit.content) > 512 * 1024) throw new Error('Invalid replacement text.');
    files[path] = edit.content.replace(/\r\n?/g, '\n');
    touched.add(path);
  }
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  return { hash: digest(sorted), files: sorted };
}

export function outsideRepositories(path) {
  let ancestor = resolve(path);
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  ancestor = realpathSync(ancestor);
  while (true) {
    const marker = join(ancestor, '.git');
    const metadata = lstatSync(marker, { throwIfNoEntry: false });
    // An empty directory alone is not a Git worktree. Still reject gitfiles,
    // symlinks, nonempty/incomplete metadata and unreadable markers; keep
    // checking ancestors so an empty nested placeholder cannot hide a repo.
    if (metadata && (!metadata.isDirectory() || readdirSync(marker).length > 0)) {
      throw new Error('Experiment records must be outside a Git working tree, including ignored directories.');
    }
    if (dirname(ancestor) === ancestor) break;
    ancestor = dirname(ancestor);
  }
}

export function openStore(root, contract, { now = Date.now } = {}) {
  outsideRepositories(root);
  mkdirSync(root, { recursive: true });
  const lock = join(root, 'run.lock');
  let fd;
  try { fd = openSync(lock, 'wx'); } catch { throw new Error('Experiment is locked. Verify the prior runner has stopped before removing run.lock.'); }
  const file = join(root, 'record.json');
  const contractHash = digest(contract);
  let state;
  try {
    writeFileSync(fd, `${JSON.stringify({ pid: process.pid })}\n`);
    state = existsSync(file) ? readRecord(root) : {
      schema: 1, id: randomUUID(), contractHash, contract, started: now(),
      trials: [], candidates: [], decisions: [], observations: [], application: null,
    };
    if (state.schema !== 1 || state.contractHash !== contractHash) throw new Error('Contract, source, model, or controller version changed. Start a new experiment.');
    if (state.trials.some(t => t.status === 'running')) {
      for (const t of state.trials) if (t.status === 'running') { t.status = 'interrupted'; t.reason = 'Runner stopped without a terminal record; inspect before any retry.'; }
    }
    saveJson(file, state);
  } catch (e) { closeSync(fd); unlinkSync(lock); throw e; }
  return {
    root, state, now, save: () => saveJson(file, state),
    close: () => { closeSync(fd); unlinkSync(lock); },
  };
}

export function usageTotals(trials) {
  let input = 0, output = 0, unknown = 0;
  for (const t of trials) {
    if (Number.isSafeInteger(t.usage?.input_tokens) && t.usage.input_tokens >= 0 && Number.isSafeInteger(t.usage?.output_tokens) && t.usage.output_tokens >= 0) {
      input += t.usage.input_tokens; output += t.usage.output_tokens;
    } else unknown++;
  }
  return { input_tokens: input, output_tokens: output, unknown_trials: unknown };
}

export const reservedCalls = trials => trials.filter(t => t.reserved || t.attempted).length;

// Pending reservations count against the shared budget, including nested calls.
export async function measuredCall(store, key, role, request, invoke, budget) {
  const old = store.state.trials.find(t => t.key === key);
  if (old) {
    if (old.requestHash !== digest(request)) throw new Error('Trial key reused with a different request.');
    if (old.status !== 'awaiting_response') return old;
  }
  const elapsed = store.now() - store.state.started;
  const used = usageTotals(store.state.trials.filter(t => t.attempted));
  let stop = null;
  if (store.state.trials.some(t => ['cleanup_unconfirmed', 'interrupted', 'not_dispatched'].includes(t.status))) stop = 'Prior execution needs reconciliation or was cancelled.';
  else if (reservedCalls(store.state.trials) >= budget.maxCalls) stop = 'Call budget reached.';
  else if (elapsed >= budget.maxMs) stop = 'Elapsed-time budget reached.';
  else if (budget.maxTokens && (used.input_tokens + used.output_tokens >= budget.maxTokens || used.unknown_trials > 0)) stop = 'Token accounting cannot allow another call.';
  const trial = old ?? { key, role, requestHash: digest(request), started: store.now(), status: stop ? 'budget_stopped' : 'running',
    attempted: !stop && !invoke.deferred, reserved: !stop, timeoutMs: Math.min(budget.callTimeoutMs, budget.maxMs - elapsed), request };
  if (!old) {
    if (stop) trial.reason = stop;
    store.state.trials.push(trial);
    store.save(); // Never start paid work before its reservation is durable.
    if (stop) return trial;
  }
  try {
    const result = await invoke({ ...request, trialKey: key, timeoutMs: trial.timeoutMs, deadline: trial.started + trial.timeoutMs });
    Object.assign(trial, result);
    trial.attempted = true; delete trial.pending;
    if (!['completed', 'runtime_error', 'timeout', 'interrupted', 'unsupported', 'cleanup_unconfirmed'].includes(trial.status)) {
      trial.status = 'runtime_error'; trial.reason = 'Invalid adapter terminal status.';
    }
    if (trial.status === 'completed' && typeof trial.output !== 'string') {
      trial.status = 'runtime_error'; trial.reason = 'Adapter completed without a text result.';
    }
  } catch (e) {
    if (e.code === 'HOST_RESPONSE_PENDING') {
      trial.status = 'awaiting_response'; trial.pending = e.pending; store.save(); throw e;
    }
    trial.status = 'runtime_error'; trial.reason = e.message;
  }
  trial.ended = store.now();
  trial.elapsedMs = trial.ended - trial.started;
  store.save();
  return trial;
}

export function applyBundle(root, baseline, candidate) {
  // Check the entire relevant bundle before writing any file; never reset a tree.
  for (const [name, content] of Object.entries(baseline.files)) {
    if (readFileSync(safeFile(root, name), 'utf8') !== content) throw new Error(`Intervening edit in ${name}; application refused.`);
  }
  const changed = Object.keys(candidate.files).filter(n => candidate.files[n] !== baseline.files[n]);
  for (const name of changed) {
    if (!Object.hasOwn(baseline.files, name)) throw new Error('Adding or removing source files is not supported by this applicator.');
    safeFile(root, name);
  }
  const written = [];
  const replace = (file, content) => {
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, content, { flag: 'wx' });
      chmodSync(temp, lstatSync(file).mode);
      renameSync(temp, file);
    } finally { if (existsSync(temp)) unlinkSync(temp); }
  };
  try {
    for (const name of changed) {
      const file = safeFile(root, name);
      // Catch common concurrent edits again immediately before each replacement.
      if (readFileSync(file, 'utf8') !== baseline.files[name]) throw new Error(`Concurrent edit in ${name}.`);
      replace(file, candidate.files[name]); written.push(name);
    }
  } catch (e) {
    for (const name of written.reverse()) {
      const file = safeFile(root, name);
      if (readFileSync(file, 'utf8') === candidate.files[name]) replace(file, baseline.files[name]);
    }
    throw e;
  }
  return changed;
}
