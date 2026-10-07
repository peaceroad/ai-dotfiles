import { supportsZstdRuntime } from './session-rollout-io.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateHistoryPrefix, validateSavedLineage } from './session-lineage.mjs';
import { paginatedTurn, encodeTurn } from './fixtures/paginated-turn.mjs';
import { compactedTurn } from './fixtures/compacted-turn.mjs';
import { developmentTurn } from './fixtures/development-turn.mjs';
import { persistedTurn } from './fixtures/persisted-turn.mjs';
import { zstdCompressSync } from 'node:zlib';

const id = '00000000-0000-4000-8000-000000000001';
const ancestor = '00000000-0000-4000-8000-000000000002';
const stamp = '2000-01-01T00:00:00Z';
const meta = (base, owner = id) => ({ timestamp: stamp, ordinal: base?.end_ordinal_exclusive ?? 0, type: 'session_meta',
  payload: { id: owner, timestamp: stamp, cwd: 'fixture', originator: 'fixture', cli_version: '0.159.2', history_mode: 'paginated', ...(base ? { history_base: base } : {}) } });
const msg = ordinal => ({ timestamp: stamp, ordinal, type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '日本語🙂' }] } });
const lines = values => values.map(value => JSON.stringify(value) + '\n').join('');
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'agent-lineage-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, 'rollout.jsonl');
  return { root, path, check: async (raw, endOrdinal, endByte = Buffer.byteLength(raw)) => {
    writeFileSync(path, raw);
    return validateHistoryPrefix(path, { owner: id, endByte, ...(endOrdinal === undefined ? {} : { endOrdinal }) });
  } };
}

test('remaining persisted variants validate nested payloads in plain and zstd', async t => {
  const f = fixture(t), records = persistedTurn(), raw = encodeTurn(records);
  assert.equal((await f.check(raw, records.length)).status, 'verified');
  if (supportsZstdRuntime()) {
    const path = f.path + '.zst'; writeFileSync(path, zstdCompressSync(raw));
    assert.equal((await validateHistoryPrefix(path, { owner: id, endByte: Buffer.byteLength(raw), endOrdinal: records.length })).status, 'verified');
  }
  for (const [type, change] of [
    ['agent_message', p => p.content[0].type = 'future'],
    ['local_shell_call', p => p.action.env.FIXTURE = 1],
    ['local_shell_call', p => p.action.timeout_ms = -1],
    ['web_search_call', p => p.action.type = 'openPage'],
    ['image_generation_call', p => delete p.result],
    ['configuration_update', p => p.reasoning.effort = 'future'],
    ['thread_goal_updated', p => p.goal.status = 'usage_limited'],
    ['thread_goal_updated', p => p.goal.tokensUsed = 0.5],
    ['entered_review_mode', p => p.target.future = true],
    ['exited_review_mode', p => p.review_output = {}],
    ['patch_apply_end', p => p.changes['fixture.js'].content = null],
    ['mcp_tool_call_end', p => p.result.Ok.content = {}],
    ['mcp_tool_call_end', p => p.result.Err = 'conflicting result'],
    ['web_search_end', p => p.action.queries = [null]],
    ['image_generation_end', p => p.failure.resetsAt = 0.5],
    ['transcript_segment', p => p.role = 'tool'],
    ['bem_item_promoted', p => p.presentation = { type: 'inline_visualization', index: 2 ** 32 }],
    ['realtime_session_closed', p => p.outcome = 'future'],
  ]) {
    const invalid = persistedTurn(); change(invalid.find(r => r.payload.type === type).payload);
    assert.equal((await f.check(encodeTurn(invalid), invalid.length)).status, 'unverified', type);
  }
  for (const sampled_at of ['2000-02-30T00:00:00Z', '2000-01-01T24:00:00Z', '2000-01-01', '2000-01-01T00:00:00+24:00']) {
    const invalid = persistedTurn(); invalid.find(r => r.type === 'security_risk_score').payload.sampled_at = sampled_at;
    assert.equal((await f.check(encodeTurn(invalid), invalid.length)).status, 'unverified', sampled_at);
  }
});

test('plain prefixes bind exact bytes to metadata and contiguous ordinals', async t => {
  const f = fixture(t), raw = lines([meta(), msg(1), msg(2)]);
  const result = await f.check(raw, 3);
  assert.equal(result.status, 'verified');
  assert.equal(result.sha256, createHash('sha256').update(raw).digest('hex'));
  assert.equal(result.baseOrdinal, 0);
  for (const end of [2, 4]) await assert.rejects(f.check(raw, end), /disagree/);
  assert.equal((await f.check(lines([meta()]), 1)).status, 'verified');
  const base = { thread_id: ancestor, end_byte_offset: 100, end_ordinal_exclusive: 4 };
  assert.equal((await f.check(lines([meta(base), msg(5)]), 6)).status, 'verified');
  assert.equal((await f.check(lines([meta(base)]), 5)).status, 'verified');
  for (const end of [3, 4]) await assert.rejects(f.check(lines([meta(base)]), end), /ordinals/);
});

test('prefix validation handles CRLF and whitespace without counting characters or later records', async t => {
  const f = fixture(t), raw = lines([meta(), msg(1)]).replaceAll('\n', '\r\n') + ' \t\r\n';
  const result = await f.check(raw + 'invalid later data', 2, Buffer.byteLength(raw));
  assert.equal(result.status, 'verified');
  assert.equal(result.endByte, Buffer.byteLength(raw));
  for (const end of [0, raw.length, Buffer.byteLength(raw) + 100, Buffer.byteLength(lines([meta()])) - 1]) {
    await assert.rejects(f.check(raw, 2, end));
  }
  const utf8 = Buffer.from(lines([meta(), msg(1)]));
  const split = utf8.indexOf(Buffer.from('日本語')) + 1;
  await assert.rejects(f.check(utf8, 2, split), /incomplete/);
  await assert.rejects(f.check(Buffer.concat([Buffer.from(lines([meta()])), Buffer.from([0xc3, 0x28, 10])]), 2), /UTF-8/);
});

test('unknown schemas and noncontiguous ordinals remain unverified without inventing a count', async t => {
  const f = fixture(t);
  const unknown = { timestamp: stamp, ordinal: 1, type: 'future', payload: {} };
  for (const body of [[unknown, msg(1)], [unknown, msg(4)], [msg(1), msg(3)], [msg(1), msg(1)], [msg(2), msg(1)],
    [{ ...msg(1), ordinal: undefined }], [{ ...msg(1), payload: { type: 'message', role: 'user', content: [{ type: 'future' }] } }],
    [{ ...msg(1), metadata: { future: true } }]]) {
    assert.equal((await f.check(lines([meta(), ...body]), 100)).status, 'unverified');
  }
  assert.equal((await f.check(lines([{ ...meta(), ordinal: undefined }, msg(1)]), 2)).status, 'unverified');
  await assert.rejects(f.check(lines([meta(), unknown]) + 'bad JSON\n', 2), /JSON/);
});

test('numeric lexemes reject rounding, exponent notation, negatives, strings and overflow', async t => {
  const f = fixture(t);
  for (const token of ['1.00000000000000001', '1e0', '-0', '-1', '9007199254740992', '"1"']) {
    const raw = lines([meta(), msg(1)]).replace('"ordinal":1,', `"ordinal":${token},`);
    await assert.rejects(f.check(raw, 2), /integer/);
  }
  const base = { thread_id: ancestor, end_byte_offset: 100, end_ordinal_exclusive: 4 };
  for (const key of ['end_byte_offset', 'end_ordinal_exclusive']) {
    const raw = lines([meta(base)]).replace(new RegExp(`"${key}":\\d+`), `"${key}":4.0000000000000001`);
    await assert.rejects(f.check(raw, 5), /integer/);
  }
  await assert.rejects(f.check(lines([meta({ ...base, end_ordinal_exclusive: Number.MAX_SAFE_INTEGER })])), /ordinals/);
  await assert.rejects(f.check(lines([{ ...meta(), ordinal: 1 }])), /metadata ordinal/);
});

test('saved lineage applies the same checks to extra owned rollouts and missing or cyclic ancestors', async t => {
  const f = fixture(t), raw = lines([meta()]);
  writeFileSync(f.path, raw);
  mkdirSync(join(f.root, 'rollouts'));
  const extra = '00000000-0000-4000-8000-000000000003';
  const file = `rollouts/${extra}.jsonl`;
  const sources = [{ id, file: 'rollout.jsonl' }, { id: extra, file }];
  const base = { thread_id: id, end_byte_offset: Buffer.byteLength(raw), end_ordinal_exclusive: 1 };
  writeFileSync(join(f.root, file), lines([meta(base), msg(2)]));
  assert.equal((await validateSavedLineage(f.root, sources, id)).status, 'verified');
  writeFileSync(join(f.root, file), lines([meta({ ...base, end_ordinal_exclusive: 2 })]));
  await assert.rejects(validateSavedLineage(f.root, sources, id), /disagree/);
  writeFileSync(join(f.root, file), lines([meta({ ...base, thread_id: ancestor })]));
  assert.equal((await validateSavedLineage(f.root, sources, id)).status, 'unverified');
  writeFileSync(join(f.root, file), lines([meta({ ...base, thread_id: extra })]));
  await assert.rejects(validateSavedLineage(f.root, sources, id), /cyclic/);
  writeFileSync(join(f.root, file), lines([meta(undefined, ancestor)]));
  await assert.rejects(validateSavedLineage(f.root, sources, id), /owner/);
});

test('only legacy histories without a base are exempt from ordinal verification', async t => {
  const f = fixture(t), sources = [{ id, file: 'rollout.jsonl' }];
  writeFileSync(f.path, lines([{ type: 'session_meta', payload: { id, history_mode: 'legacy' } }, msg(undefined)]));
  assert.equal((await validateSavedLineage(f.root, sources, id)).status, 'verified');
  writeFileSync(f.path, lines([{ type: 'session_meta', payload: { id, history_mode: 'paginated' } }, msg(undefined)]));
  assert.equal((await validateSavedLineage(f.root, sources, id)).status, 'unverified');
  writeFileSync(f.path, lines([{ type: 'session_meta', payload: { id, history_mode: 'future' } }]));
  await assert.rejects(validateSavedLineage(f.root, sources, id), /mode/);
});

test('ordinary paginated turns validate metadata, events, context, tool results and exact ordinals', async t => {
  const f = fixture(t), records = paginatedTurn(), raw = encodeTurn(records);
  const result = await f.check(raw, records.length);
  assert.equal(result.status, 'verified', JSON.stringify(result));
  if (supportsZstdRuntime()) {
    const compressed = `${f.path}.zst`; writeFileSync(compressed, zstdCompressSync(raw));
    assert.deepEqual(await validateHistoryPrefix(compressed, { owner: id, endByte: Buffer.byteLength(raw), endOrdinal: records.length }), result);
  }
  const prefix = encodeTurn(records.slice(0, 10));
  assert.equal((await f.check(raw, 10, Buffer.byteLength(prefix))).status, 'verified');
  await assert.rejects(f.check(raw, 9, Buffer.byteLength(prefix)), /disagree/);
});

test('nested unknown variants, malformed payloads and integer lexemes cannot prove a boundary', async t => {
  const f = fixture(t);
  const changes = [
    r => r[0].payload.source = { subagent: { future: {} } },
    r => r[0].payload.base_instructions.provenance = { type: 'future' },
    r => r[0].payload.dynamic_tools[0].deferLoading = null,
    r => delete r[1].payload.turn_id,
    r => delete r[2].payload.model,
    r => r[2].payload.permission_profile.file_system.entries[0].access = 'future',
    r => r[2].payload.sandbox_policy = { type: 'read-only', network_access: 'yes' },
    r => r[2].payload.collaboration_mode.settings.reasoning_effort = 3,
    r => r[4].payload.item.content[0].text_elements = [{ byte_range: { start: 0, end: '3' } }],
    r => r[5].payload.summary[0].type = 'future',
    r => r[7].payload.output[0].type = 'future',
    r => r[8].payload.item.duration.nanos = 1000000000,
    r => delete r[8].payload.item.duration.secs,
    r => r[8].payload.item.cwd = 'C:/fixture',
    r => r[8].payload.item.cwd = 'file:///fixture?query',
    r => r[8].payload.item.cwd = 'file:///fixture#fragment',
    r => r[8].payload.item.cwd = 'file:///fixture/%00',
    r => r[9].payload.item.content[0].text = 42,
    r => r[10].payload.info.total_token_usage.input_tokens = null,
    r => r[12].payload.thread_settings.permission_profile = { type: 'future' },
    r => r[13].payload.future = true,
  ];
  for (const change of changes) {
    const records = paginatedTurn(); change(records);
    const result = await f.check(encodeTurn(records), records.length);
    assert.equal(result.status, 'unverified');
    assert.match(result.issues[0].reason, /unsupported-/);
  }
  for (const token of ['12.0000000000000001', '12e0', '9007199254740992']) {
    const raw = encodeTurn(paginatedTurn()).replaceAll('"input_tokens":12', `"input_tokens":${token}`);
    assert.equal((await f.check(raw)).status, 'unverified');
  }
});

test('unverified diagnostics are bounded, retain source lines, and cannot be cleared by later records', async t => {
  const f = fixture(t), records = paginatedTurn();
  records[5].payload.future = true;
  records[7].ordinal = undefined;
  const result = await f.check(encodeTurn(records), 100);
  assert.equal(result.status, 'unverified');
  assert.deepEqual(result.issues, [{ reason: 'unsupported-record-schema', line: 6 }, { reason: 'missing-ordinal', line: 8 }]);
});

test('reviewed nested variants share the closed schema and reject added fields', async t => {
  const f = fixture(t);
  const variants = [
    ['response_item', { type: 'custom_tool_call', call_id: 'call', name: 'tool', input: 'fixture' }],
    ['response_item', { type: 'custom_tool_call_output', call_id: 'call', output: 'fixture' }],
    ['response_item', { type: 'tool_search_call', execution: 'client', arguments: { query: 'fixture' } }],
    ['response_item', { type: 'tool_search_output', status: 'completed', execution: 'client', tools: [] }],
    ['response_item', { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'fixture' }], phase: 'partial_answer' }],
    ['response_item', { type: 'compaction', encrypted_content: 'fixture' }],
    ['response_item', { type: 'context_compaction' }],
    ['compacted', { message: 'fixture' }],
    ['retained_context', { type: 'delivered_assistant_message', turn_id: 'turn', acceptance_order: 1, text: 'fixture', complete: true }],
    ...[
      { type: 'Plan', id: 'plan', text: 'fixture' },
      { type: 'Reasoning', id: 'reasoning', summary_text: ['fixture'] },
      { type: 'FunctionCallOutput', id: 'call', name: 'tool', output: 'fixture' },
      { type: 'DynamicToolCall', id: 'call', tool: 'tool', arguments: {}, status: 'completed',
        content_items: [{ type: 'inputText', text: 'fixture' }], success: true, duration: { secs: 1, nanos: 0 } },
    ].map(item => ['event_msg', { type: 'item_completed', thread_id: id, turn_id: 'turn', item }]),
    ['event_msg', { type: 'turn_started', turn_id: 'turn' }],
    ['event_msg', { type: 'turn_complete', turn_id: 'turn' }],
    ['event_msg', { type: 'turn_aborted', reason: 'interrupted' }],
    ['event_msg', { type: 'thread_rolled_back', num_turns: 1 }],
    ['event_msg', { type: 'context_compacted' }],
  ];
  for (const [type, payload] of variants) {
    const record = { timestamp: stamp, ordinal: 1, type, payload };
    assert.equal((await f.check(lines([meta(), record]), 2)).status, 'verified', payload.type);
    const invalid = structuredClone(record);
    (invalid.payload.item ?? invalid.payload).future = true;
    assert.equal((await f.check(lines([meta(), invalid]), 2)).status, 'unverified', payload.type);
  }
  const metadata = [
    { source: { subagent: { thread_spawn: { parent_thread_id: ancestor, depth: 1, agent_path: '/root/worker', agent_role: 'fixture' } } }, multi_agent_version: 'v2' },
    { source: { internal: 'guardian' }, selected_capability_roots: [{ id: 'fixture', location: { type: 'environment', environmentId: 'local', path: 'file:///fixture' } }] },
    { dynamic_tools: [{ type: 'namespace', name: 'fixture', description: '', tools: [{ type: 'function', name: 'tool', description: '', inputSchema: {} }] }] },
    { dynamic_tools: [{ name: 'tool', description: '', inputSchema: {}, namespace: 'fixture', exposeToContext: false }] },
  ];
  for (const fields of metadata) {
    const first = meta(); Object.assign(first.payload, fields);
    assert.equal((await f.check(lines([first]), 1)).status, 'verified');
  }
  for (const change of [
    r => { r.payload.agent_type = 'fixture'; r.payload.agent_role = 'fixture'; },
    r => { r.payload.source = { subagent: { thread_spawn: { parent_thread_id: ancestor, depth: 1, agent_path: '/root/root' } } }; },
    r => { r.payload.source = { subagent: { thread_spawn: { parent_thread_id: ancestor, depth: 1, agent_role: 'fixture', agent_type: 'fixture' } } }; },
  ]) {
    const first = meta(); change(first);
    assert.equal((await f.check(lines([first]), 1)).status, 'unverified');
  }
});

test('compaction checkpoints, MCP and known extensions preserve plain/zstd ordinal boundaries', async t => {
  const f = fixture(t), records = compactedTurn(), raw = encodeTurn(records);
  const result = await f.check(raw, records.length);
  assert.equal(result.status, 'verified', JSON.stringify(result));
  const position = records.findIndex(record => record.type === 'compacted');
  for (const end of [position, position + 1]) {
    const prefix = encodeTurn(records.slice(0, end));
    assert.equal((await f.check(raw, end, Buffer.byteLength(prefix))).status, 'verified');
  }
  await assert.rejects(f.check(raw, records.length + 1), /disagree/);
  if (supportsZstdRuntime()) {
    const compressed = `${f.path}.zst`; writeFileSync(compressed, zstdCompressSync(raw));
    assert.deepEqual(await validateHistoryPrefix(compressed, { owner: id, endByte: Buffer.byteLength(raw), endOrdinal: records.length }), result);
  }
  const checkpoint = records.find(record => record.type === 'compacted').payload;
  checkpoint.window_id = 1; // Historical numeric form, decoded as a window number.
  checkpoint.replacement_history[0].type = 'compaction_summary';
  assert.equal((await f.check(encodeTurn(records))).status, 'verified');
  checkpoint.replacement_history_metadata = null;
  checkpoint.retained_context.assistant_messages = [{ turn_id: 'turn', text: 'Synthetic reply', complete: true }];
  checkpoint.retained_context.user_messages = [{ turn_id: 'turn', text: 'Synthetic question', complete: true }];
  assert.equal((await f.check(encodeTurn(records))).status, 'verified');
});

test('compaction consistency and nested MCP/extension schemas fail closed', async t => {
  const f = fixture(t);
  for (const change of [
    p => p.replacement_history_metadata.pop(),
    p => { p.replacement_history = null; },
    p => p.replacement_history[0].encrypted_content = 1,
    p => p.replacement_history_metadata[0].compaction_output = null,
    p => p.guardian_history[0].guardian_metadata.guardian_sources[0].id.role = 'future',
    p => p.retained_context.user_messages[0].order = -1,
    p => p.retained_context.user_messages[0].origin = 'future',
    p => p.retained_context.user_messages[0].origin = null,
    p => p.retained_context.assistant_messages = [{ turn_id: 'turn', text: 'fixture', complete: true, inherited: null }],
    p => delete p.retained_context.incomplete,
    p => p.mcp_resource_origins.origins[0].ambiguous_account = null,
    p => p.resume_metadata.previous_turn_settings.model = false,
    p => p.window_id = 1.5,
  ]) {
    const records = compactedTurn(); change(records.find(record => record.type === 'compacted').payload);
    assert.equal((await f.check(encodeTurn(records))).status, 'unverified');
  }
  for (const [type, change] of [
    ['McpToolCall', p => p.result.isError = 'false'],
    ['McpToolCall', p => p.result.content = {}],
    ['McpToolCall', p => p.mcpAppUi.preferredModelDisplayMode = 'future'],
    ['McpToolCall', p => p.duration.nanos = 1000000000],
    ['McpToolCall', p => p.status = 'in_progress'],
    ['Extension', p => p.kind = 'future.extension'],
    ['Extension', p => p.durationMs = -1],
    ['ContextCompaction', p => delete p.id],
  ]) {
    const records = compactedTurn(); change(records.find(record => record.payload.item?.type === type).payload.item);
    assert.equal((await f.check(encodeTurn(records))).status, 'unverified');
  }
  const records = compactedTurn();
  records.find(r => r.payload.item?.type === 'McpToolCall').payload.item.result.content.push({ type: 'future-mcp-content', nested: { fixture: true, '\ud83d\ude00': '\ud83d\ude00' } });
  assert.equal((await f.check(encodeTurn(records))).status, 'verified', 'MCP content is officially opaque JSON');
  for (const token of ['1e0', '1.00000000000000001', '9007199254740992']) {
    assert.equal((await f.check(encodeTurn(records).replace('"window_number":1', `"window_number":${token}`))).status, 'unverified');
  }
  for (const value of [{ text: '\ud800' }, { '\udfff': 'value' }]) {
    const invalid = compactedTurn();
    invalid.find(r => r.payload.item?.type === 'McpToolCall').payload.item.result.content.push(value);
    assert.equal((await f.check(encodeTurn(invalid))).status, 'unverified', 'Opaque JSON must still contain valid Unicode scalar strings');
  }
});

test('development and agent records bind plain/zstd boundaries without following paths or messages', async t => {
  const f = fixture(t), records = developmentTurn(), raw = encodeTurn(records);
  const result = await f.check(raw, records.length);
  assert.equal(result.status, 'verified', JSON.stringify(result));
  const messageIndex = records.findIndex(r => r.type === 'inter_agent_communication');
  assert.ok(messageIndex > 0);
  for (const end of [messageIndex, messageIndex + 1, messageIndex + 2]) {
    assert.equal((await f.check(raw, end, Buffer.byteLength(encodeTurn(records.slice(0, end))))).status, 'verified');
  }
  if (supportsZstdRuntime()) {
    const compressed = `${f.path}.zst`; writeFileSync(compressed, zstdCompressSync(raw));
    assert.deepEqual(await validateHistoryPrefix(compressed, { owner: id, endByte: Buffer.byteLength(raw), endOrdinal: records.length }), result);
  }
  for (const [type, change] of [
    ['HookPrompt', p => p.fragments[0].hookRunId = 1],
    ['FileChange', p => p.changes['changed.js'].move_path = 3],
    ['FileChange', p => p.changes['new.js'].type = 'future'],
    ['FileChange', p => p.changes = []],
    ['FileChange', p => p.status = 'future'],
    ['EnteredReviewMode', p => p.target = { type: 'commit' }],
    ['ExitedReviewMode', p => p.review_output.findings[0].code_location.line_range.end = -1],
    ['ExitedReviewMode', p => p.review_output.overall_confidence_score = 1e100],
    ['WebSearch', p => p.action.type = 'openPage'],
    ['ImageView', p => p.path = 'relative.png'],
    ['ImageGeneration', p => p.saved_path = 'relative.png'],
    ['CollabAgentToolCall', p => p.receiver_agents[0].agent_type = 'duplicate alias'],
    ['CollabAgentToolCall', p => p.agents_states = { invalid_uuid: 'running' }],
    ['CollabAgentToolCall', p => p.agents_states[Object.keys(p.agents_states)[0]] = { completed: 1 }],
    ['CollabAgentToolCall', p => p.receiver_thread_ids = null],
    ['SubAgentActivity', p => p.agent_path = '/root/root'],
    ['SubAgentActivity', p => p.kind = 'future'],
  ]) {
    const invalid = developmentTurn(); change(invalid.find(r => r.payload.item?.type === type).payload.item);
    assert.equal((await f.check(encodeTurn(invalid))).status, 'unverified', type);
  }
  for (const change of [p => p.recipient = '/root/root', p => p.other_recipients = null,
    p => delete p.trigger_turn, p => p.trigger_turn = 'false', p => p.future = true]) {
    const invalid = developmentTurn(); change(invalid.find(r => r.type === 'inter_agent_communication').payload);
    assert.equal((await f.check(encodeTurn(invalid))).status, 'unverified');
  }
  for (const token of ['2e0', '2.00000000000000001', '4294967296']) {
    assert.equal((await f.check(raw.replace('"end":2', `"end":${token}`))).status, 'unverified');
  }
});

test('development schema aliases, defaults and dictionary entries remain closed', async t => {
  const f = fixture(t), completed = item => ({ timestamp: stamp, ordinal: 1, type: 'event_msg',
    payload: { type: 'item_completed', thread_id: id, turn_id: 'turn', item } });
  const variants = [
    ...['pending_init', 'running', 'interrupted', 'shutdown', 'not_found', { completed: null }, { errored: 'fixture' }]
      .map(state => ({ type: 'CollabAgentToolCall', id: 'agent', tool: 'send_message', status: 'completed', sender_thread_id: id,
        receiver_agents: [{ thread_id: ancestor, agent_type: 'fixture' }], agents_states: { [ancestor]: state } })),
    { type: 'CollabAgentToolCall', id: 'agent', tool: 'list_agents', status: 'completed', sender_thread_id: id },
    ...[{ type: 'uncommittedChanges' }, { type: 'commit', sha: 'fixture' }, { type: 'custom', instructions: 'fixture' }]
      .map(target => ({ type: 'EnteredReviewMode', id: 'review', target, user_facing_hint: 'fixture' })),
    { type: 'ExitedReviewMode', id: 'review', review_output: null },
    { type: 'FileChange', id: 'patch', changes: Object.fromEntries(['__proto__', 'constructor'].map(key => [key, { type: 'update', unified_diff: 'fixture' }])) },
    { type: 'WebSearch', id: 'web', query: 'fixture', action: { type: 'find_in_page', pattern: 'fixture' } },
  ];
  for (const item of variants) {
    assert.equal((await f.check(lines([meta(), completed(item)]), 2)).status, 'verified', item.type);
    assert.equal((await f.check(lines([meta(), completed({ ...item, future: true })]), 2)).status, 'unverified', item.type);
  }
  for (const payload of [{}, { trigger_turn: null }, { trigger_turn: false, future: true }]) {
    assert.equal((await f.check(lines([meta(), { timestamp: stamp, ordinal: 1, type: 'inter_agent_communication_metadata', payload }]), 2)).status, 'unverified');
  }
});
