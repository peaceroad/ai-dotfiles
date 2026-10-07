// Synthetic development/agent records from openai/codex rust-v0.159.2.
// Paths and messages are archive data; the fixture never executes their actions.
import { pathToFileURL } from 'node:url';
import { compactedTurn } from './compacted-turn.mjs';

export function developmentTurn(id, cwd = 'C:/fixture') {
  const records = compactedTurn(id, cwd), owner = records[0].payload.id;
  const peer = '00000000-0000-4000-8000-000000000099';
  const timestamp = records[0].timestamp, turn_id = records[1].payload.turn_id;
  const items = [
    { type: 'HookPrompt', id: 'hook-1', fragments: [{ text: 'Synthetic hook context', hookRunId: 'hook-run-1' }] },
    { type: 'FileChange', id: 'patch-1', status: 'completed', auto_approved: false, stdout: 'Synthetic patch result', changes: {
      'new.js': { type: 'add', content: 'synthetic new file' },
      'old.js': { type: 'delete', content: 'synthetic old file' },
      'changed.js': { type: 'update', unified_diff: '@@ -1 +1 @@\n-old\n+new', move_path: 'renamed.js' },
    } },
    { type: 'EnteredReviewMode', id: 'review-start', target: { type: 'baseBranch', branch: 'fixture-base' }, user_facing_hint: 'Synthetic review' },
    { type: 'ExitedReviewMode', id: 'review-end', review_output: {
      findings: [{ title: 'Synthetic finding', body: 'Synthetic explanation', confidence_score: 0.5, priority: 2,
        code_location: { absolute_file_path: `${cwd}/fixture.js`, line_range: { start: 1, end: 2 } } }],
      overall_correctness: 'Synthetic result', overall_explanation: 'Synthetic assessment', overall_confidence_score: 0.5,
    } },
    { type: 'WebSearch', id: 'hosted-web', query: 'Synthetic query', action: { type: 'open_page', url: 'https://example.invalid/fixture' } },
    { type: 'ImageView', id: 'image-view', path: pathToFileURL(`${cwd}/nonexistent-fixture.png`).href },
    { type: 'ImageGeneration', id: 'hosted-image', status: 'failed', result: '', revised_prompt: 'Synthetic request' },
    { type: 'CollabAgentToolCall', id: 'collab-1', tool: 'wait', status: 'completed', sender_thread_id: owner,
      receiver_thread_ids: [peer], receiver_agents: [{ thread_id: peer, agent_nickname: 'Fixture', agent_role: 'fixture' }],
      agents_states: { [peer]: { completed: 'Synthetic worker result' } }, reasoning_effort: 'high' },
    { type: 'SubAgentActivity', id: 'activity-1', kind: 'completed', agent_thread_id: peer, agent_path: '/root/worker' },
  ];
  const additions = items.map(item => ({ timestamp, type: 'event_msg',
    payload: { type: 'item_completed', thread_id: owner, turn_id, item, completed_at_ms: 946684800003 } }));
  additions.push(
    { timestamp, type: 'inter_agent_communication', payload: { id: 'message-1', author: '/root', recipient: '/root/worker',
      other_recipients: [], content: 'Synthetic message', encrypted_content: 'opaque-fixture', trigger_turn: false } },
    { timestamp, type: 'inter_agent_communication_metadata', payload: { trigger_turn: false } },
    { timestamp, type: 'event_msg', payload: { type: 'sub_agent_activity', event_id: 'activity-event',
      agent_thread_id: peer, agent_path: '/root/worker', kind: 'completed', occurred_at_ms: 946684800003 } },
  );
  records.splice(records.findIndex(record => record.payload.item?.type === 'AgentMessage'), 0, ...additions);
  return records.map((record, ordinal) => ({ ...record, ordinal }));
}
