import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { digest, readJson, saveJson } from './records.mjs';

export const hostCapabilities = Object.freeze({
  adapter: 'host-subagent-text-v1', explicitTextBundle: true,
  naturalSkillDiscovery: false, toolTasks: false, protectedHoldout: false,
  executableCandidates: false, observedModelVersion: false, strictTokenCap: false,
  usage: 'host-reported-or-unknown', stop: 'host-interruption; no-script-enforced-deadline',
  inputTransport: 'verified-private-file-or-inline',
});

export function readHostInput(file, expectedHash) {
  if (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error('Provide the reserved input hash.');
  const bytes = readFileSync(file);
  if (bytes.length > 4 * 1024 * 1024) throw new Error('Host input exceeds the text delivery limit.');
  const text = new TextDecoder('utf-8', {fatal:true}).decode(bytes);
  if (digest(text) !== expectedHash) throw new Error('Host input differs from the reserved payload.');
  const input = JSON.parse(text);
  if (typeof input.prompt !== 'string' || !Object.hasOwn(input,'outputSchema') || Object.keys(input).some(k=>!['prompt','outputSchema'].includes(k))) throw new Error('Invalid host input envelope.');
  return input;
}

export function hostInputSlice(input, offset, limit) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > input.prompt.length || !Number.isSafeInteger(limit) || limit <= 0) throw new Error('Input slice requires valid nonnegative offset and positive limit.');
  const end = Math.min(input.prompt.length, offset + limit);
  return { offset, end, totalChars: input.prompt.length, promptChunk: input.prompt.slice(offset,end), outputSchema: input.outputSchema };
}

export function hostInvoker(runtime, workRoot) {
  const invoke = async request => {
    const id = digest({ key: request.trialKey, prompt: request.prompt, schema: request.outputSchema });
    const root = join(workRoot, 'requests', id);
    const requestFile = join(root, 'request.json');
    const responseFile = join(root, 'response.json');
    const inputFile = join(root, 'input.json');
    const input = { prompt: request.prompt, outputSchema: request.outputSchema ?? null };
    const inputHash = digest(`${JSON.stringify(input,null,2)}\n`);
    if (!existsSync(requestFile)) saveJson(inputFile,input);
    readHostInput(inputFile,inputHash);
    if (!existsSync(requestFile)) saveJson(requestFile, {
      schema: 1, requestId: id, trialKey: request.trialKey, prompt: request.prompt,
      outputSchema: request.outputSchema ?? null, expiresAt: request.deadline,
      inputFile, inputHash,
      delivery: 'Fresh subagent context, no conversation fork. Read only the verified input packet for transport; then follow its prompt and schema without task tools or other file lookup.',
    });
    const job = readJson(requestFile);
    if (job.requestId !== id || job.trialKey !== request.trialKey || job.prompt !== request.prompt || digest(job.outputSchema) !== digest(request.outputSchema ?? null) || job.expiresAt !== request.deadline) throw new Error('Reserved host request was changed; start a new experiment.');
    const pending = { requestId: id, requestFile, inputFile, inputHash, inputChars: request.prompt.length, expiresAt: job.expiresAt };
    if (!existsSync(responseFile)) {
      const error = new Error('The host must execute or reconcile this reserved subagent request.');
      error.code = 'HOST_RESPONSE_PENDING'; error.pending = pending; throw error;
    }
    const receipt = readJson(responseFile);
    if (receipt.requestId !== id || !receipt.executionId || !Number.isFinite(receipt.receivedAt)) throw new Error('Invalid host response binding.');
    const late = receipt.status === 'completed' && receipt.receivedAt > job.expiresAt;
    return { status: late ? 'timeout' : receipt.status, output: receipt.output,
      reason: late ? 'Host response arrived after the reserved deadline.' : receipt.reason ?? null,
      usage: receipt.usage ?? null, executionId: receipt.executionId, observedModel: null,
      provenance: 'host-reported subagent result; backend model and token usage are not independently verified',
    };
  };
  invoke.deferred = true;
  return { identity: { capabilities: hostCapabilities, runtime,
    model: 'Inherited host model; backend version unobserved.',
    isolation: 'Fresh context requested; host instructions and shared filesystem remain accessible.',
  }, invoke };
}

function pendingTrial(store, id) {
  const trial = store.state.trials.find(t => t.status === 'awaiting_response' && t.pending?.requestId === id);
  if (!trial) throw new Error('No matching pending host request.');
  return trial;
}

export function attachHostExecution(store, id, executionId) {
  if (typeof executionId !== 'string' || !executionId.trim()) throw new Error('Record the actual subagent execution ID.');
  const trial = pendingTrial(store, id);
  if (trial.executionId && trial.executionId !== executionId) throw new Error('Request already attached to another execution; do not dispatch twice.');
  if (store.state.trials.some(t => t !== trial && t.executionId === executionId)) throw new Error('Execution ID already belongs to another request; use a fresh subagent.');
  trial.executionId = executionId; trial.attempted = true;
  store.save();
  return { attached: true, requestId: id, executionId };
}

export function cancelHostRequest(store, id) {
  const trial = pendingTrial(store, id);
  if (trial.executionId || trial.attempted) throw new Error('An attached execution must be reconciled through a terminal response.');
  trial.status = 'not_dispatched'; trial.reason = 'Host confirmed that no execution was dispatched.';
  trial.ended = store.now(); trial.elapsedMs = trial.ended - trial.started;
  delete trial.pending; store.save();
  return { requestId: id, status: trial.status, attempted: false };
}

export function receiveHostResponse(store, response) {
  const trial = pendingTrial(store, response.requestId);
  if (!trial.executionId || response.executionId !== trial.executionId) throw new Error('Response must identify the attached subagent execution.');
  if (!['completed', 'runtime_error', 'timeout', 'interrupted', 'unsupported', 'cleanup_unconfirmed'].includes(response.status)) throw new Error('Invalid host terminal status.');
  if (response.status === 'completed' && typeof response.output !== 'string') throw new Error('A completed response needs the unedited final output.');
  if (response.reason !== undefined && typeof response.reason !== 'string') throw new Error('Response reason must be text.');
  if (response.usage != null && (!Number.isSafeInteger(response.usage.input_tokens) || response.usage.input_tokens < 0 || !Number.isSafeInteger(response.usage.output_tokens) || response.usage.output_tokens < 0)) throw new Error('Supply measured usage or omit it; do not estimate.');
  const responseFile = join(dirname(trial.pending.requestFile), 'response.json');
  if (existsSync(responseFile)) throw new Error('Host response already received; resume without replacing it.');
  saveJson(responseFile, { requestId: response.requestId, executionId: response.executionId,
    status: response.status, output: response.output, reason: response.reason,
    usage: response.usage ?? null, receivedAt: Date.now() });
  return { received: true, requestId: response.requestId };
}
