#!/usr/bin/env node
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readJson, readRecord, saveJson, openStore, applyBundle, usageTotals, reservedCalls } from './records.mjs';
import { codexInvoker, capabilities } from './codex-adapter.mjs';
import { hostInvoker, hostCapabilities, attachHostExecution, receiveHostResponse, cancelHostRequest, readHostInput, hostInputSlice } from './host-adapter.mjs';
import { loadExperiment, callPlan, controllerHash, improve } from './experiment.mjs';

const help = `Agent Eval — bounded skill comparisons (experimental)

node agent-eval.mjs capabilities
node agent-eval.mjs validate <experiment.json>
node agent-eval.mjs run <experiment.json> --out <private-directory> [--response <response.json>]
node agent-eval.mjs status <private-directory>
node agent-eval.mjs input <private-input.json> --hash <reserved-input-hash> [--offset <characters> --limit <characters>]
node agent-eval.mjs attach <private-directory> --request <request-id> --execution <subagent-id>
node agent-eval.mjs receive <private-directory> --response <response.json>
node agent-eval.mjs cancel-request <private-directory> --request <never-dispatched-request-id>
node agent-eval.mjs apply <private-directory> --root <target-source>
node agent-eval.mjs rollback <private-directory> --root <target-source>
node agent-eval.mjs note <private-directory> --text <observation-and-evidence-reference>

Use runtime.adapter host for existing subagent tools, or codex-cli for manual CLI runs.
Only the codex-cli adapter requires an authenticated Codex CLI.
Records must be outside Git worktrees. run never edits source or installs a skill.
Text candidates are supported; generated code and interactive tool tasks are not.
See references/runtime.md for the contract, examples, and limitations.
`;

const publicMessage = value => String(value).replaceAll(homedir(), '~').replaceAll(homedir().replaceAll('\\', '/'), '~');

export function report(state) {
  const final = state.decisions.findLast(d => d.prefix === 'main' && d.final);
  const counts = {};
  for (const trial of state.trials) counts[trial.status] = (counts[trial.status] || 0) + 1;
  const pending = state.trials.find(t => t.status === 'awaiting_response');
  return { id: state.id, contractHash: state.contractHash, outcome: final?.status || (pending ? 'needs-host-response' : 'incomplete'), selectedHash: final?.selectedHash || null,
    reservedCalls: reservedCalls(state.trials), pending: pending ? { ...pending.pending, executionId: pending.executionId ?? null } : null,
    attempted: state.trials.filter(t => t.attempted).length, outcomes: counts, usage: usageTotals(state.trials.filter(t => t.attempted)),
    ...(final?.comparison ? { comparison: final.comparison, qualityGain: final.qualityGain } : {}),
    ...(final?.stopReason ? { stopReason: final.stopReason } : {}),
    scope: state.contract.experiment.evidenceScope, application: state.application };
}

export async function run(configFile, output, invokerFactory, response) {
  const config = readJson(configFile);
  const spec = loadExperiment(config, dirname(resolve(configFile)));
  const factory = invokerFactory ?? (spec.runtime.adapter === 'host' ? hostInvoker : codexInvoker);
  const adapter = factory(spec.runtime, join(resolve(output), 'work'));
  const contract = { controller: controllerHash(), experiment: spec, execution: adapter.identity };
  const store = openStore(resolve(output), contract);
  try {
    if (response !== undefined) {
      if (spec.runtime.adapter !== 'host') throw new Error('Bound responses require the host adapter.');
      receiveHostResponse(store, response);
    }
    const existing = store.state.decisions.findLast(d => d.prefix === 'main' && d.final);
    if (!existing) {
      try { await improve(store, 'main', spec, adapter.invoke); }
      catch (error) { if (error.code !== 'HOST_RESPONSE_PENDING') throw error; }
    }
    const result = report(store.state);
    saveJson(join(output, 'report.json'), result);
    return result;
  } finally { store.close(); }
}

export function hostOperation(output, operation, value) {
  const before = readRecord(output);
  if (before.contract.experiment.runtime.adapter !== 'host') throw new Error('This record is not a host experiment.');
  const store = openStore(resolve(output), before.contract);
  try {
    if (operation === 'attach') return attachHostExecution(store, value.requestId, value.executionId);
    if (operation === 'receive') return receiveHostResponse(store, value);
    if (operation === 'cancel') return cancelHostRequest(store, value.requestId);
    throw new Error('Unknown host operation.');
  } finally { store.close(); }
}

export function applyRecord(output, root, rollback = false) {
  const before = readRecord(output);
  const store = openStore(output, before.contract);
  try {
    const state = store.state;
    const final = state.decisions.findLast(d => d.prefix === 'main' && d.final);
    if (!final || final.status !== 'accept') throw new Error('No accepted candidate is available.');
    const start = state.contract.experiment.target;
    if (rollback) {
      if (state.application?.status !== 'source-applied' || state.application.root !== resolve(root)) throw new Error('No matching source application to restore.');
      const files = applyBundle(root, final.bundle, start);
      state.application = { ...state.application, status: 'source-restored', files, activeVersion: 'unverified' };
    } else {
      if (state.application) throw new Error('Application already recorded; inspect its state before another operation.');
      // Save a recovery intent before touching source. A write failure is visible.
      state.application = { status: 'applying', root: resolve(root), from: start.hash, to: final.bundle.hash, activeVersion: 'unverified' };
      store.save();
      const files = applyBundle(root, start, final.bundle);
      state.application = { ...state.application, status: 'source-applied', files };
    }
    store.save();
    return { status: state.application.status, files: state.application.files, activeVersion: 'unverified' };
  } catch (e) {
    if (store.state.application?.status === 'applying') {
      store.state.application.status = 'application-needs-inspection';
      store.state.application.reason = e.message; store.save();
    }
    throw e;
  } finally { store.close(); }
}

async function main(args) {
  const command = args.shift();
  if (!command || ['--help', '-h', 'help'].includes(command)) { console.log(help); return; }
  if (command === 'capabilities') { console.log(JSON.stringify({ host: hostCapabilities, 'codex-cli': capabilities }, null, 2)); return; }
  const path = args.shift();
  if (!path) throw new Error('Missing configuration or record path.');
  const options = {};
  while (args.length) {
    const name = args.shift(), value = args.shift();
    if (!['--out', '--root', '--text', '--request', '--execution', '--response', '--hash', '--offset', '--limit'].includes(name) || value === undefined || Object.hasOwn(options, name)) throw new Error('Unknown, duplicate, or incomplete option.');
    options[name] = value;
  }
  let result;
  if (command === 'input') {
    // Preserve exact task text: display redaction would change the delivered prompt.
    const input = readHostInput(path, options['--hash']);
    const output = options['--offset'] !== undefined || options['--limit'] !== undefined
      ? hostInputSlice(input, Number(options['--offset'] ?? 0), Number(options['--limit'])) : input;
    console.log(JSON.stringify(output,null,2)); return;
  } else if (command === 'validate') {
    const spec = loadExperiment(readJson(path), dirname(resolve(path)));
    result = { valid: true, executed: false, callPlan: callPlan(spec) };
  } else if (command === 'run') {
    if (!options['--out']) throw new Error('Specify --out outside the repository.');
    result = await run(path, options['--out'], undefined, options['--response'] ? readJson(options['--response']) : undefined);
  } else if (command === 'status') result = report(readRecord(path));
  else if (command === 'attach') result = hostOperation(path, 'attach', { requestId: options['--request'], executionId: options['--execution'] });
  else if (command === 'cancel-request') result = hostOperation(path, 'cancel', { requestId: options['--request'] });
  else if (command === 'receive') {
    if (!options['--response']) throw new Error('Specify --response with the bound subagent result.');
    result = hostOperation(path, 'receive', readJson(options['--response']));
  }
  else if (command === 'apply' || command === 'rollback') {
    if (!options['--root']) throw new Error('Specify the authorized target source with --root.');
    result = applyRecord(resolve(path), resolve(options['--root']), command === 'rollback');
  } else if (command === 'note') {
    if (!options['--text']) throw new Error('Specify a meaningful observation and evidence reference with --text.');
    const before = readRecord(path);
    const store = openStore(resolve(path), before.contract);
    try { store.state.observations.push({ text: options['--text'], contractHash: before.contractHash }); store.save(); result = { recorded: true, changedInstructions: false }; }
    finally { store.close(); }
  } else throw new Error('Unknown command. Use --help.');
  console.log(publicMessage(JSON.stringify(result, null, 2)));
  if (['incomplete', 'inconclusive', 'evaluation-invalid', 'unsupported'].includes(result.outcome)) process.exitCode = 2;
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch(error => { console.error(publicMessage(error.message)); process.exitCode = 1; });
}
