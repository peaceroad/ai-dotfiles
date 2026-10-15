// Synthetic rust-v0.162.1 fixture, based only on published typed definitions.
// protocol/{account,protocol,turn_input}.rs; history/{lib,guardian_history,
// compaction_resume_metadata}.rs. No user history or environmental values.
import { developmentTurn } from './development-turn.mjs';

export function compatibilityTurn(id, cwd) {
  const records = developmentTurn(id, cwd);
  records[0].payload.cli_version = '0.162.1';
  delete records.find(r => r.type === 'turn_context').payload.summary;
  for (const record of records) {
    const activity = record.payload.item?.type === 'SubAgentActivity' ? record.payload.item
      : record.payload.type === 'sub_agent_activity' ? record.payload : null;
    if (activity) Object.assign(activity, { model: 'synthetic-model', reasoning_effort: 'high' });
  }
  const started = records.find(r => r.payload.type === 'task_started');
  const turn_id = started.payload.turn_id;
  const attribution = { turn_id, root_turn_id: turn_id, parent_turn_id: null,
    turn_trigger: 'synthetic-input', initiating_agent_path: '/root' };
  started.payload.turn_attribution = attribution;
  started.payload.root_turn_id = turn_id;
  const metadata = { guardian_review_ids: ['synthetic-review'],
    guardian_retained_omissions: { user_instructions: true, assistant_context: false } };
  records.find(r => r.type === 'response_item').metadata = metadata;
  const compacted = records.find(r => r.type === 'compacted').payload;
  compacted.resume_metadata.turn_attribution = attribution;
  Object.assign(compacted.replacement_history_metadata[1], metadata);
  Object.assign(compacted.guardian_history[0].guardian_metadata, metadata);
  const counter = records.find(r => r.payload.type === 'token_count');
  const additions = ['go', 'prolite', 'promax', 'self_serve_business_prolite', 'self_serve_business_usage_based',
    'ent26', 'enterprise_cbp_automation', 'enterprise_cbp_usage_based', 'edu_plus', 'edu_pro', 'unknown'].map(plan_type => ({
    ...structuredClone(counter), payload: { ...structuredClone(counter.payload), rate_limits: { plan_type } },
  }));
  const error = { message: 'Synthetic error', codex_error_info: { response_stream_disconnected: { http_status_code: 503 } } };
  additions.push({ timestamp: started.timestamp, type: 'event_msg', payload: { type: 'turn_aborted',
    turn_id, root_turn_id: turn_id, reason: 'interrupted', error } });
  records.splice(-1, 0, ...additions);
  Object.assign(records.at(-1).payload, { root_turn_id: turn_id, error });
  return records.map((record, ordinal) => ({ ...record, ordinal }));
}
