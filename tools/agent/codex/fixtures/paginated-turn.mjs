// Synthetic protocol fixture; never copied from a user's history.
// Field shapes: openai/codex rust-v0.159.2 protocol/{protocol,models,items}.rs.
import { pathToFileURL } from 'node:url';
export function paginatedTurn(id = '00000000-0000-4000-8000-000000000001', cwd = 'C:/fixture') {
  const timestamp = '2000-01-01T00:00:00Z', turn_id = 'synthetic-turn';
  const usage = { input_tokens: 12, cached_input_tokens: 2, output_tokens: 8, reasoning_output_tokens: 3, total_tokens: 20 };
  const collaboration_mode = { mode: 'default', settings: { model: 'fixture-model', reasoning_effort: 'high', developer_instructions: null } };
  const permission_profile = { type: 'managed', network: 'restricted', file_system: { type: 'restricted',
    entries: [{ path: { type: 'path', path: cwd }, access: 'read' }, { path: { type: 'special', value: { kind: 'tmpdir' } }, access: 'write' }] } };
  const payloads = [
    ['session_meta', { id, session_id: id, timestamp, cwd, originator: 'fixture', cli_version: '0.159.2',
      source: { custom: 'fixture-app' }, model_provider: 'fixture', history_mode: 'paginated',
      base_instructions: { text: 'Synthetic instructions', provenance: { type: 'model', model: 'fixture-model' } },
      dynamic_tools: [{ type: 'function', name: 'fixture_tool', description: 'Synthetic tool', inputSchema: { type: 'object' }, deferLoading: false }],
      git: { branch: 'fixture-branch' }, runtime_workspace_roots: [cwd], context_window: { window_id: 'fixture-window' } }],
    ['event_msg', { type: 'task_started', turn_id, started_at: 946684800, collaboration_mode_kind: 'default', model_context_window: 32768 }],
    ['turn_context', { turn_id, cwd, approval_policy: 'never', sandbox_policy: { type: 'read-only' }, permission_profile,
      active_permission_profile: { id: ':read-only' }, model: 'fixture-model', summary: 'auto', effort: 'high',
      collaboration_mode, workspace_roots: [cwd], current_date: '2000-01-01', timezone: 'UTC' }],
    ['world_state', { full: true, state: { fixture: { active: true } } }],
    ['event_msg', { type: 'item_completed', thread_id: id, turn_id, item: { type: 'UserMessage', id: 'user-1',
      content: [{ type: 'text', text: 'Synthetic question 日本語', text_elements: [] }] }, completed_at_ms: 946684800000 }],
    ['response_item', { type: 'reasoning', summary: [{ type: 'summary_text', text: 'Synthetic summary' }], content: null, encrypted_content: 'fixture' }],
    ['response_item', { type: 'function_call', name: 'fixture_tool', namespace: 'fixture', call_id: 'call-1', arguments: '{}' }],
    ['response_item', { type: 'function_call_output', call_id: 'call-1', output: [{ type: 'input_text', text: 'Synthetic output' }] }],
    ['event_msg', { type: 'item_completed', thread_id: id, turn_id, item: { type: 'CommandExecution', id: 'command-1',
      command: ['fixture-command'], cwd: pathToFileURL(cwd).href, parsed_cmd: [{ type: 'unknown', cmd: 'fixture-command' }], source: 'agent', status: 'completed',
      exit_code: 0, duration: { secs: 0, nanos: 1000000 }, aggregated_output: 'Synthetic output' }, completed_at_ms: 946684800001 }],
    ['event_msg', { type: 'item_completed', thread_id: id, turn_id, item: { type: 'AgentMessage', id: 'assistant-1',
      content: [{ type: 'Text', text: 'Synthetic answer 日本語' }], phase: 'final_answer' }, completed_at_ms: 946684800002 }],
    ['event_msg', { type: 'token_count', info: { total_token_usage: usage, last_token_usage: usage, model_context_window: 32768 },
      rate_limits: { primary: { used_percent: 0.5, window_minutes: 60, resets_at: 946688400 }, plan_type: 'pro' } }],
    ['token_usage_record', { thread_id: id, session_id: id, turn_id, root_turn_id: turn_id, response_id: 'response-1',
      usage, turn_token_usage: usage, thread_token_usage: usage }],
    ['event_msg', { type: 'thread_settings_applied', thread_id: id, thread_settings: { model: 'fixture-model', model_provider_id: 'fixture',
      approval_policy: 'never', approvals_reviewer: 'user', permission_profile, cwd, collaboration_mode, disabled_plugin_ids: [] } }],
    ['event_msg', { type: 'task_complete', turn_id, last_agent_message: 'Synthetic answer 日本語', started_at: 946684800,
      completed_at: 946684801, duration_ms: 1000 }],
  ];
  return payloads.map(([type, payload], ordinal) => ({ timestamp, ordinal, type, payload }));
}
export const encodeTurn = records => records.map(record => JSON.stringify(record) + '\n').join('');
