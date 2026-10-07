// Remaining persisted variants in openai/codex rust-v0.159.2 rollout/src/policy.rs.
// Synthetic archive data only; no fixture action is executed.
import { developmentTurn } from './development-turn.mjs';

export function persistedTurn(id, cwd) {
  const records = developmentTurn(id, cwd), owner = records[0].payload.id;
  const timestamp = records[0].timestamp, turn_id = records[1].payload.turn_id;
  const additions = [];
  const add = (type, payload) => additions.push({ timestamp, type, payload });
  for (const payload of [
    { type: 'agent_message', author: 'assistant', recipient: 'all', content: [
      { type: 'input_text', text: 'Synthetic routed message' }] },
    { type: 'local_shell_call', call_id: 'legacy-shell', status: 'completed', action: {
      type: 'exec', command: ['fixture'], timeout_ms: 1000, env: { FIXTURE: 'true' }, working_directory: cwd ?? 'C:/fixture', user: 'fixture' } },
    { type: 'web_search_call', id: 'legacy-web', status: 'completed', action: { type: 'search', queries: ['Synthetic query'] } },
    { type: 'image_generation_call', id: 'legacy-image', status: 'failed', result: '', revised_prompt: 'Synthetic request' },
    { type: 'configuration_update', reasoning: { effort: 'high' } },
  ]) add('response_item', payload);
  for (const payload of [
    { type: 'thread_goal_updated', threadId: owner, turnId: turn_id, goal: { threadId: owner, objective: 'Synthetic goal',
      status: 'complete', tokensUsed: 12, timeUsedSeconds: 1, createdAt: 946684800, updatedAt: 946684801, tokenBudget: 100 } },
    { type: 'entered_review_mode', target: { type: 'uncommittedChanges' }, user_facing_hint: 'Synthetic legacy review' },
    { type: 'exited_review_mode', turn_id, item_id: 'legacy-review', review_output: null },
    { type: 'patch_apply_end', call_id: 'legacy-patch', turn_id, stdout: '', stderr: '', success: true,
      status: 'completed', changes: { 'fixture.js': { type: 'add', content: 'synthetic file' } } },
    { type: 'mcp_tool_call_end', call_id: 'legacy-mcp', turn_id, invocation: { server: 'fixture', tool: 'fixture', arguments: {} },
      duration: { secs: 0, nanos: 1 }, result: { Ok: { content: [{ type: 'text', text: 'Synthetic result' }] } } },
    { type: 'web_search_end', call_id: 'legacy-web', query: 'Synthetic query', action: { type: 'search', query: 'Synthetic query' } },
    { type: 'image_generation_end', call_id: 'legacy-image', status: 'failed', result: '', transparent_background: false,
      failure: { type: 'usageLimitExceeded', limitId: 'fixture', resetsAt: 946684801 } },
  ]) add('event_msg', payload);
  add('security_risk_score', { scores: { fixture: 0.5 }, call_id: 'legacy-shell', action: {}, sampled_at: timestamp });
  const realtime = [
    { type: 'realtime_session_started' },
    { type: 'transcript_segment', role: 'user', text: 'Synthetic spoken question' },
    { type: 'transcript_segment', role: 'assistant', text: 'Synthetic spoken answer' },
    ...['whole_item', 'inline_markdown', 'inline_visualization'].map(type => ({ type: 'bem_item_promoted', turn_id,
      item_id: 'fixture-answer', presentation: { type, ...(type === 'inline_visualization' ? { index: 0 } : {}) } })),
    { type: 'realtime_session_closed', outcome: 'ended' },
  ];
  realtime.forEach((payload, index) => add('realtime_item', { id: `realtime-${index}`, realtime_session_id: 'realtime-fixture', ...payload }));
  records.splice(records.findIndex(record => record.payload.item?.type === 'AgentMessage'), 0, ...additions);
  return records.map((record, ordinal) => ({ ...record, ordinal }));
}
