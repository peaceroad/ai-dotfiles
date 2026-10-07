// Synthetic checkpoint and tool results based on openai/codex rust-v0.159.2.
// These strings are archived fixture data, never instructions or real provenance.
import { paginatedTurn } from './paginated-turn.mjs';

export function compactedTurn(id, cwd) {
  const records = paginatedTurn(id, cwd), owner = records[0].payload.id;
  const timestamp = records[0].timestamp, turn_id = records[1].payload.turn_id;
  const source = { id: { message_id: 'user-1', turn_id, role: 'user' }, revision: 'fixture-revision', complete: true };
  const sender = { receiver_turn_id: turn_id, receiver_message_id: 'user-1', text: 'Synthetic sender context' };
  const item = item => ({ timestamp, type: 'event_msg', payload: { type: 'item_completed', thread_id: owner, turn_id, item, completed_at_ms: 946684800002 } });
  const additions = [
    item({ type: 'McpToolCall', id: 'mcp-1', server: 'fixture', tool: 'read_fixture', arguments: {}, status: 'completed',
      connectorId: 'fixture-connector', mcpAppUi: { resourceUri: 'ui://fixture', preferredModelDisplayMode: 'inline' },
      readOnlyHint: true, result: { content: [{ type: 'text', text: 'Synthetic MCP result' }], structuredContent: { fixture: true }, isError: false },
      duration: { secs: 0, nanos: 1000000 } }),
    item({ type: 'Extension', kind: 'clock.sleep', id: 'sleep-1', durationMs: 1 }),
    item({ type: 'Extension', kind: 'web.search', id: 'web-1', query: 'synthetic fixture', action: { type: 'search', queries: ['synthetic fixture'] },
      results: [{ title: 'Synthetic result', url: 'https://example.invalid/fixture' }] }),
    item({ type: 'Extension', kind: 'image_gen.generation', id: 'image-1', status: 'failed', result: '',
      failure: { type: 'usageLimitExceeded', limitId: 'fixture', resetsAt: 946688400 } }),
    { timestamp, type: 'retained_context', payload: { type: 'verified_answer', turn_id, call_id: 'question-1',
      questions: [{ question: 'Synthetic question', answer: 'Synthetic answer' }], acceptance_order: 1 } },
    item({ type: 'ContextCompaction', id: 'compact-1' }),
    { timestamp, type: 'compacted', payload: {
      message: 'Synthetic compaction summary',
      replacement_history: [
        { type: 'compaction', id: 'compact-response', encrypted_content: 'opaque-fixture' },
        { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Synthetic retained question' }] },
      ],
      replacement_history_metadata: [{ compaction_model_hash: 'fixture', compaction_output: true }, { user_input_order: 1, retained_source: source }],
      guardian_history: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Synthetic guardian context' }],
        guardian_metadata: { guardian_sources: [source], sender_user_messages: sender, mcp_attribution: { status: 'complete',
          sources: [{ server_name: 'fixture', tool_name: 'read_fixture', first_turn_id: turn_id }] } } }],
      retained_context: {
        verified_answers: [{ order: 1, turn_id, call_id: 'question-1', questions: [{ question: 'Synthetic question', answer: 'Synthetic answer' }] }], incomplete: false,
        user_messages: [{ order: 2, revision: 'fixture-revision', turn_id, message_id: 'user-1', text: 'Synthetic retained question', complete: true, origin: 'user' }],
        user_messages_incomplete: false, assistant_messages: [], assistant_messages_incomplete: false,
        sender_deliveries: [{ order: 3, ...sender }], next_order: 4,
      },
      mcp_resource_origins: { origins: [{ call_id: 'mcp-1', turn_id, tool: 'read_fixture', connector_id: 'fixture-connector', uri: 'ui://fixture', ambiguous_account: false }],
        turns: [turn_id], current_turn_id: turn_id },
      window_number: 1, first_window_id: 'fixture-window-0', previous_window_id: 'fixture-window-0', window_id: 'fixture-window-1',
      compaction_response_id: 'fixture-compaction-response', latest_token_usage_record: records[11].payload,
      resume_metadata: { multi_agent_version: 'v2', last_started_turn_id: turn_id,
        previous_turn_settings: { model: 'fixture-model', cyber_access_program: 'standard', comp_hash: 'fixture', realtime_active: false } },
    } },
  ];
  records.splice(9, 0, ...additions);
  return records.map((record, ordinal) => ({ ...record, ordinal }));
}
