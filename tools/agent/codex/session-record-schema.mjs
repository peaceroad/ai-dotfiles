// @ai-dotfiles agent-dev-runtime managed
// Reviewed subset of openai/codex rust-v0.159.2: protocol/src/{protocol,models,
// items,permissions,config_types,user_input,dynamic_tools,mcp}.rs, history/src/
// {lib,rollout_payload,retained_context,guardian_history}.rs and ext/items/src/.
// Closed objects deliberately reject new fields/variants instead of guessing how
// the official typed rollout decoder counts them. No archived settings are applied.
import { UUID } from './session-export-storage.mjs';

const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string';
const bool = v => typeof v === 'boolean';
const json = v => v !== undefined; // Explicit JSON values or documented decoder-ignored fields.
const number = v => typeof v === 'number' && Number.isFinite(v);
const float32 = v => number(v) && Number.isFinite(Math.fround(v));
const uuid = v => text(v) && UUID.test(v);
const choice = (...values) => { const set = new Set(values); return v => set.has(v); };
const maybe = check => (v, tokens, parent, key) => v == null || check(v, tokens, parent, key);
const array = check => (v, tokens) => Array.isArray(v) && v.every((item, i) => check(item, tokens, v, String(i)));
const either = (...checks) => (v, tokens, parent, key) => checks.some(check => check(v, tokens, parent, key));
const dictionary = (keyCheck, valueCheck) => (v, tokens) => object(v)
  && Object.keys(v).every(key => keyCheck(key) && valueCheck(v[key], tokens, v, key));
const noRoleAliasConflict = v => !object(v) || !(Object.hasOwn(v, 'agent_role') && Object.hasOwn(v, 'agent_type'));
// Decimal lexemes avoid accepting rounded/fractional JSON numbers as Rust integers.
const integer = (min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) => {
  const lexeme = min >= 0 ? /^(0|[1-9]\d*)$/ : /^-?(0|[1-9]\d*)$/;
  return (v, tokens, parent, key) => Number.isSafeInteger(v) && v >= min && v <= max && lexeme.test(tokens?.get(parent)?.[key] ?? '');
};
const int = integer(), uint = integer(0), positive = integer(1), int32 = integer(-(2 ** 31), 2 ** 31 - 1), uint32 = integer(0, 2 ** 32 - 1);
function shape(required = {}, optional = {}, defaults = {}) {
  const fields = new Map([...Object.entries(required), ...Object.entries(optional).map(([k, v]) => [k, maybe(v)]),
    ...Object.entries(defaults)]);
  const requiredKeys = Object.keys(required);
  // Parsed JSON has own data properties. Missing optional/default fields need no
  // validator call, while present nulls and unknown keys must still be checked.
  return (v, tokens) => object(v) && requiredKeys.every(key => Object.hasOwn(v, key))
    && Object.keys(v).every(key => fields.get(key)?.(v[key], tokens, v, key) ?? false);
}
function tagged(variants, tag = 'type') {
  const checks = new Map(Object.entries(variants).map(([name, rule]) => {
    if (typeof rule === 'function') return [name, rule];
    const [required, optional, defaults] = rule;
    return [name, shape({ [tag]: choice(name), ...required }, optional, defaults)];
  }));
  return (v, tokens) => object(v) && (checks.get(v[tag])?.(v, tokens) ?? false);
}
const external = variants => {
  const checks = new Map(Object.entries(variants));
  return (v, tokens) => {
    if (!object(v)) return false;
    const keys = Object.keys(v);
    return keys.length === 1 && (checks.get(keys[0])?.(v[keys[0]], tokens, v, keys[0]) ?? false);
  };
};
const strings = array(text), phase = choice('commentary', 'partial_answer', 'final_answer');
const detail = choice('auto', 'low', 'high', 'original');
// Native absolute paths only; URI-backed environments remain outside this subset.
const absolute = v => text(v) && !v.includes('\0') && (/^\//.test(v) || /^[a-z]:[\\/]/i.test(v) || /^\\\\[^\\]+\\[^\\]+/.test(v));
const fileUri = v => {
  if (!text(v) || !v.startsWith('file:') || /[?#\u0000-\u0020]/.test(v) || /%00/i.test(v)) return false;
  try { const url = new URL(v); return url.protocol === 'file:' && !url.username && !url.password && !url.port; }
  catch { return false; }
};
const agentPath = v => text(v) && (v === '/morpheus' || /^\/root(?:\/(?!root(?:\/|$))[a-z0-9_]+)*$/.test(v));
const network = choice('restricted', 'enabled');
const mode = choice('plan', 'default', 'code', 'pair_programming', 'execute', 'custom');
const effort = choice('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'persistent');
const multiAgent = choice('disabled', 'v1', 'v2');
const cyberProgram = choice('standard', 'daybreak_blue', 'daybreak_red');
const summary = choice('auto', 'concise', 'detailed', 'none');
const personality = choice('none', 'friendly', 'pragmatic');
const reviewer = choice('user', 'auto_review', 'guardian_subagent');
const collaboration = shape({ mode, settings: shape({ model: text }, { reasoning_effort: effort, developer_instructions: text }) });
const approval = either(choice('untrusted', 'on-request', 'on-failure', 'never'), external({ granular:
  shape({ sandbox_approval: bool, rules: bool, mcp_elicitations: bool }, {}, { skill_approval: bool, request_permissions: bool }) }));
const sandbox = tagged({
  'danger-full-access': [{}], 'read-only': [{}, {}, { network_access: bool }],
  'external-sandbox': [{}, {}, { network_access: network }],
  'workspace-write': [{}, {}, { writable_roots: array(absolute), network_access: bool, exclude_tmpdir_env_var: bool, exclude_slash_tmp: bool }],
});
const special = tagged({ root: [{}], minimal: [{}], tmpdir: [{}], slash_tmp: [{}],
  project_roots: [{}, { subpath: text }], current_working_directory: [{}, { subpath: text }] }, 'kind');
const fsPath = tagged({ path: [{ path: either(absolute, fileUri) }], special: [{ value: special }] });
const fsEntries = array(shape({ path: fsPath, access: choice('read', 'write', 'deny', 'none') }, { missing_path_behavior: choice('skip') }));
const managedFs = tagged({ restricted: [{ entries: fsEntries }, { glob_scan_max_depth: positive }], unrestricted: [{}] });
const permissions = tagged({ managed: [{ file_system: managedFs, network }], disabled: [{}], external: [{ network }] });
const activeProfile = shape({ id: text }, { extends: text });
const rawFs = shape({ kind: choice('restricted', 'unrestricted', 'external-sandbox') }, { glob_scan_max_depth: uint }, { entries: fsEntries });
const turnContext = shape({ cwd: absolute, approval_policy: approval, sandbox_policy: sandbox, model: text, summary }, {
  turn_id: text, root_turn_id: text, disabled_plugin_ids: strings, workspace_roots: array(absolute), current_date: text, timezone: text,
  approvals_reviewer: reviewer, permission_profile: permissions, active_permission_profile: activeProfile,
  network: shape({ allowed_domains: strings, denied_domains: strings }), file_system_sandbox_policy: rawFs,
  comp_hash: text, personality, collaboration_mode: collaboration, multi_agent_version: multiAgent,
  multi_agent_mode: choice('explicit_request_only', 'proactive'), realtime_active: bool, cyber_access_program: cyberProgram, effort,
});
const threadSettings = shape({ model: text, model_provider_id: text, approval_policy: approval, approvals_reviewer: reviewer,
  permission_profile: permissions, cwd: absolute, collaboration_mode: collaboration }, {
  service_tier: text, active_permission_profile: activeProfile, runtime_workspace_roots: array(absolute), reasoning_effort: effort,
  reasoning_summary: summary, personality,
}, { disabled_plugin_ids: strings });

const imageFields = { image_url: text, file_id: text, detail };
const content = tagged({ input_text: [{ text }], output_text: [{ text }], input_image: [{}, imageFields], input_audio: [{ audio_url: text }] });
const checkedContent = (v, tokens) => content(v, tokens) && (v.type !== 'input_image' || text(v.image_url) || text(v.file_id));
const outputPart = tagged({ input_text: [{ text }], input_image: [{}, imageFields], input_audio: [{ audio_url: text }], encrypted_content: [{ encrypted_content: text }] });
const output = either(text, array((v, tokens) => outputPart(v, tokens) && (v.type !== 'input_image' || text(v.image_url) || text(v.file_id))));
const passthrough = shape({}, { turn_id: text, create_time: number, cell_id: text, tool_calls_complete: bool,
  // Officially default-on-error or skip_deserializing; these cannot establish tool authority.
  content_item_kinds: json, executed_tool_calls: json,
});
const responseCommon = { id: text, internal_chat_message_metadata_passthrough: passthrough };
const responseVariants = {
  message: [{ role: text, content: array(checkedContent) }, { ...responseCommon, phase, end_turn: bool }],
  reasoning: [{ summary: array(tagged({ summary_text: [{ text }] })) }, { ...responseCommon,
    content: array(tagged({ reasoning_text: [{ text }], text: [{ text }] })), encrypted_content: text }],
  function_call: [{ call_id: text, name: text, arguments: text }, { ...responseCommon, namespace: text, encrypted_function_args: strings }],
  function_call_output: [{ output }, { ...responseCommon, call_id: text, name: text, namespace: text }],
  custom_tool_call: [{ call_id: text, name: text, input: text }, { ...responseCommon, status: text, namespace: text }],
  custom_tool_call_output: [{ call_id: text, output }, { ...responseCommon, name: text }],
  tool_search_call: [{ execution: text, arguments: json }, { ...responseCommon, call_id: text, status: text }],
  tool_search_output: [{ status: text, execution: text, tools: array(json) }, { ...responseCommon, call_id: text }],
  compaction: [{ encrypted_content: text }, responseCommon],
  compaction_summary: [{ encrypted_content: text }, responseCommon],
  context_compaction: [{}, { ...responseCommon, encrypted_content: text }],
};
const response = tagged(responseVariants);
const retainedSource = shape({ id: shape({ message_id: text, turn_id: text, role: choice('user', 'assistant') }), revision: text, complete: bool });
const senderFields = { receiver_turn_id: text, receiver_message_id: text, text };
const harness = shape({}, { fallback_token_limit_override: uint, delivered_assistant_message: text, compaction_model_hash: text,
  user_input_order: uint, retained_source: retainedSource, sender_user_messages: shape(senderFields),
  // The official checkpoint decoder maps invalid JSON values to an error checkpoint.
  // Retain those bytes without interpreting them as provenance or authorization.
  mcp_attribution: json }, { client_authored: bool, guardian_source_order_guidance: bool, guardian_sources: array(retainedSource),
  harness_authored_configuration: bool, compaction_output: bool, inherited_user_message: bool });
const guardianEntry = tagged(Object.fromEntries(Object.entries(responseVariants).map(([name, [required, optional, defaults]]) =>
  [name, [required, { ...optional, guardian_metadata: harness }, defaults]])));

const textElements = array(shape({ byte_range: shape({ start: uint, end: uint }) }, { placeholder: text }));
const userInput = tagged({ text: [{ text }, {}, { text_elements: textElements }], image: [{}, imageFields],
  local_image: [{ path: text }, { detail }], audio: [{ audio_url: text }], local_audio: [{ path: text }],
  skill: [{ name: text, path: text }], mention: [{ name: text, path: text }] });
const memoryCitation = shape({ entries: array(shape({ path: text, line_start: uint32, line_end: uint32, note: text })), rollout_ids: strings });
const agentOptional = { phase, memory_citation: memoryCitation, delivery: choice('async'), questions: array(shape({ title: text }, { options: strings })) };
const duration = shape({ secs: uint, nanos: integer(0, 999999999) });
// Codex's CallToolResult deliberately uses opaque JSON content, including future
// MCP content kinds. Only its typed envelope is constrained; nothing is executed.
const mcpResult = shape({ content: array(json) }, { structuredContent: json, isError: bool, _meta: json });
// Hosted web-search uses snake_case action tags; the extension uses camelCase.
const webAction = (openPage, findInPage) => tagged({ search: [{}, { query: text, queries: strings }],
  [openPage]: [{}, { url: text }], [findInPage]: [{}, { url: text, pattern: text }], other: [{}] });
const extensionType = choice('Extension');
const extension = tagged({
  'clock.sleep': [{ type: extensionType, id: text, durationMs: uint }],
  'web.search': [{ type: extensionType, id: text, query: text }, { results: array(json), action: webAction('openPage', 'findInPage') }],
  'image_gen.generation': [{ type: extensionType, id: text, status: text, result: text }, { revisedPrompt: text, transparentBackground: bool,
    savedPath: absolute, failure: tagged({ usageLimitExceeded: [{ limitId: text }, { resetsAt: int }] }) }],
}, 'kind');
const parsedCommand = tagged({ read: [{ cmd: text, name: text, path: text }], list_files: [{ cmd: text }, { path: text }],
  search: [{ cmd: text }, { query: text, path: text }], unknown: [{ cmd: text }] });
const agentRef = shape({ thread_id: uuid }, { agent_nickname: text, agent_role: text, agent_type: text });
const checkedAgentRef = (v, tokens) => agentRef(v, tokens) && noRoleAliasConflict(v);
const agentStatus = either(choice('pending_init', 'running', 'interrupted', 'shutdown', 'not_found'),
  external({ completed: maybe(text), errored: text }));
const activity = choice('started', 'interacted', 'interrupted', 'completed');
const fileChanges = dictionary(text, tagged({ add: [{ content: text }], delete: [{ content: text }],
  update: [{ unified_diff: text }, { move_path: text }] }));
const reviewTarget = tagged({ uncommittedChanges: [{}], baseBranch: [{ branch: text }], commit: [{ sha: text }, { title: text }],
  custom: [{ instructions: text }] });
const reviewOutput = shape({ findings: array(shape({ title: text, body: text, confidence_score: float32, priority: int32,
  code_location: shape({ absolute_file_path: text, line_range: shape({ start: uint32, end: uint32 }) }) })),
  overall_correctness: text, overall_explanation: text, overall_confidence_score: float32 });
const turnItem = tagged({
  UserMessage: [{ id: text, content: array((v, tokens) => userInput(v, tokens) && (v.type !== 'image' || text(v.image_url) || text(v.file_id))) }, { client_id: text }],
  HookPrompt: [{ id: text, fragments: array(shape({ text, hookRunId: text })) }],
  AgentMessage: [{ id: text, content: array(tagged({ Text: [{ text }] })) }, agentOptional],
  FunctionCallOutput: [{ id: text, name: text, output }, { namespace: text }],
  Plan: [{ id: text, text }], Reasoning: [{ id: text, summary_text: strings }, {}, { raw_content: strings }],
  CommandExecution: [{ id: text, command: strings, cwd: fileUri, parsed_cmd: array(parsedCommand),
    source: choice('agent', 'user_shell', 'unified_exec_startup', 'unified_exec_interaction'), status: choice('in_progress', 'completed', 'failed', 'declined') },
  { plugin_id: text, script_path: text, process_id: text, interaction_input: text, stdout: text, stderr: text,
    aggregated_output: text, exit_code: int32, duration, formatted_output: text }],
  DynamicToolCall: [{ id: text, tool: text, arguments: json, status: choice('in_progress', 'completed', 'failed') },
  { namespace: text, content_items: array(tagged({ inputText: [{ text }], inputImage: [{ imageUrl: text }], inputAudio: [{ audioUrl: text }] })),
    success: bool, error: text, duration }],
  CollabAgentToolCall: [{ id: text, tool: choice('spawn_agent', 'send_input', 'resume_agent', 'wait', 'close_agent', 'send_message', 'followup_task', 'interrupt_agent', 'list_agents'),
    status: choice('in_progress', 'completed', 'failed', 'interrupted'), sender_thread_id: uuid },
    { prompt: text, model: text, reasoning_effort: effort }, { receiver_thread_ids: array(uuid), receiver_agents: array(checkedAgentRef), agents_states: dictionary(uuid, agentStatus) }],
  SubAgentActivity: [{ id: text, kind: activity, agent_thread_id: uuid, agent_path: agentPath }],
  WebSearch: [{ id: text, query: text, action: webAction('open_page', 'find_in_page') }, { results: array(json) }],
  ImageView: [{ id: text, path: fileUri }],
  ImageGeneration: [{ id: text, status: text, result: text }, { revised_prompt: text, saved_path: absolute }],
  EnteredReviewMode: [{ id: text, target: reviewTarget, user_facing_hint: text }],
  ExitedReviewMode: [{ id: text }, { review_output: reviewOutput }],
  FileChange: [{ id: text, changes: fileChanges }, { status: choice('completed', 'failed', 'declined'), auto_approved: bool, stdout: text, stderr: text }],
  McpToolCall: [{ id: text, server: text, tool: text, arguments: json, status: choice('inProgress', 'completed', 'failed') }, {
    connectorId: text, mcpAppResourceUri: text, mcpAppUi: shape({ resourceUri: text, preferredModelDisplayMode: choice('inline', 'fullscreen') }),
    linkId: text, appName: text, actionName: text, pluginId: text, readOnlyHint: bool, result: mcpResult, error: shape({ message: text }), duration,
  }],
  ContextCompaction: [{ id: text }],
  Extension: extension,
});
const usage = shape({ input_tokens: int, cached_input_tokens: int, output_tokens: int, reasoning_output_tokens: int, total_tokens: int },
  { codex_rollout_budget_units: number }, { cache_write_input_tokens: int });
const usageRecord = shape({ thread_id: uuid, turn_id: text, session_id: uuid, root_turn_id: text, response_id: text,
  usage, turn_token_usage: usage, thread_token_usage: usage });
const answerFields = { turn_id: text, call_id: text, questions: array(shape({ question: text, answer: text })) };
const retainedMessageFields = { turn_id: text, text, complete: bool };
const retainedMessageOptions = { message_id: text, phase };
const retainedMessageDefaults = { origin: choice('user', 'heartbeat') };
const ordered = (required, optional = {}, defaults = {}) => shape(required, { ...optional, revision: text }, { ...defaults, inherited: bool, order: uint });
const retainedMessages = array(ordered(retainedMessageFields, retainedMessageOptions, retainedMessageDefaults));
const retainedContext = shape({ verified_answers: array(ordered(answerFields)), incomplete: bool }, {}, {
  user_messages: retainedMessages, user_messages_incomplete: bool,
  assistant_messages: retainedMessages, assistant_messages_incomplete: bool,
  sender_deliveries: array(ordered(senderFields)), next_order: uint,
});
const retainedEvent = tagged({
  verified_answer: [answerFields, { acceptance_order: uint }],
  delivered_assistant_message: [{ ...retainedMessageFields, acceptance_order: uint }, retainedMessageOptions, retainedMessageDefaults],
});
const compacted = shape({ message: text }, {
  replacement_history: array(response), replacement_history_metadata: array(harness), guardian_history: array(guardianEntry), retained_context: retainedContext,
  mcp_resource_origins: shape({ origins: array(shape({ call_id: text, tool: text, connector_id: text, uri: text },
    { turn_id: text, link_id: text }, { ambiguous_account: bool })), turns: strings }, { current_turn_id: text }),
  window_number: uint, first_window_id: text, previous_window_id: text, window_id: either(text, uint), compaction_response_id: text,
  latest_token_usage_record: usageRecord, resume_metadata: shape({}, { multi_agent_version: multiAgent, last_started_turn_id: text,
    previous_turn_settings: shape({ model: text }, { cyber_access_program: cyberProgram, comp_hash: text, realtime_active: bool }) }),
});
const checkedCompacted = (v, tokens) => compacted(v, tokens) && (v.replacement_history_metadata == null
  || (Array.isArray(v.replacement_history) && v.replacement_history.length === v.replacement_history_metadata.length));
const window = shape({ used_percent: number }, { window_minutes: int, resets_at: int });
const rateLimits = shape({}, { limit_id: text, limit_name: text, normal_model_slug: text, primary: window, secondary: window,
  credits: shape({ has_credits: bool, unlimited: bool }, { balance: text }),
  individual_limit: shape({ limit: text, used: text, remaining_percent: int32, resets_at: int }), spend_control_reached: bool,
  // Account plan enums evolve independently. Unsupported values remain unverified.
  plan_type: choice('free', 'plus', 'pro', 'team', 'business', 'enterprise', 'edu'),
  rate_limit_reached_type: choice('rate_limit_reached', 'workspace_owner_credits_depleted', 'workspace_member_credits_depleted', 'workspace_owner_usage_limit_reached', 'workspace_member_usage_limit_reached'),
});
const terminal = { last_agent_message: text, started_at: int, completed_at: int, duration_ms: int, time_to_first_token_ms: int };
const started = [{ turn_id: text }, { root_turn_id: text, trace_id: text, started_at: int, model_context_window: int }, { collaboration_mode_kind: mode }];
const events = tagged({
  task_started: started, turn_started: started, task_complete: [{ turn_id: text }, terminal], turn_complete: [{ turn_id: text }, terminal],
  token_count: [{}, { info: shape({ total_token_usage: usage, last_token_usage: usage }, { model_context_window: int }), rate_limits: rateLimits }],
  item_completed: [{ thread_id: uuid, turn_id: text, item: turnItem }, { started_at_ms: int }, { completed_at_ms: int }],
  thread_settings_applied: [{ thread_settings: threadSettings }, { thread_id: uuid }],
  thread_rolled_back: [{ num_turns: uint32 }], turn_aborted: [{ reason: choice('interrupted', 'replaced', 'review_ended', 'budget_limited') },
    { turn_id: text, started_at: int, completed_at: int, duration_ms: int }],
  agent_message: [{ message: text }, agentOptional], agent_reasoning: [{ text }], agent_reasoning_raw_content: [{ text }],
  user_message: [{ message: text }, { client_id: text, images: strings, file_ids: strings, audio: strings },
    { local_images: strings, local_audio: strings, text_elements: textElements, image_details: array(maybe(detail)),
      file_id_details: array(maybe(detail)), local_image_details: array(maybe(detail)), image_order: array(choice('inline', 'file')) }],
  context_compacted: [{}],
  sub_agent_activity: [{ event_id: text, agent_thread_id: uuid, agent_path: agentPath, kind: activity }, {}, { occurred_at_ms: int }],
});

const subagent = either(choice('review', 'compact', 'memory_consolidation'), external({ other: text,
  thread_spawn: shape({ parent_thread_id: uuid, depth: int32 }, { agent_path: agentPath, agent_nickname: text, agent_role: text, agent_type: text }) }));
const sessionSource = either(choice('cli', 'vscode', 'exec', 'mcp', 'unknown'), external({ custom: text, internal: choice('memory_consolidation', 'guardian'), subagent }));
const toolFunction = { name: text, description: text, inputSchema: json };
const canonicalTool = tagged({ function: [toolFunction, {}, { deferLoading: bool }],
  namespace: [{ name: text, description: text, tools: array(tagged({ function: [toolFunction, {}, { deferLoading: bool }] })) }] });
const legacyTool = shape(toolFunction, { namespace: text, deferLoading: bool, exposeToContext: bool });
const dynamicTools = either(array(canonicalTool), array(legacyTool));
const sessionMeta = shape({ id: uuid, timestamp: text, cwd: text, originator: text, cli_version: text }, {
  creator_user_id: text, creator_account_id: text, forked_from_id: uuid, forked_from_ordinal_exclusive: uint, parent_thread_id: uuid,
  runtime_workspace_roots: strings, thread_source: text, agent_nickname: text, agent_role: text, agent_type: text, agent_path: text,
  model_provider: text, base_instructions: shape({ text }, { provenance: tagged({ custom: [{}], model: [{ model: text }] }) }),
  dynamic_tools: dynamicTools, memory_mode: text, history_base: shape({ thread_id: uuid, end_byte_offset: positive, end_ordinal_exclusive: positive }),
  subagent_history_start_ordinal: uint, multi_agent_version: multiAgent, context_window: shape({ window_id: text }),
  // The official legacy URL decoder accepts strings and maps invalid URLs to None.
  git: shape({}, { commit_hash: text, branch: text, repository_url: text }),
}, { session_id: uuid, source: sessionSource, history_mode: choice('legacy', 'paginated'),
  selected_capability_roots: array(shape({ id: text, location: tagged({ environment: [{ environmentId: text, path: either(absolute, fileUri) }] }) })) });
const record = tagged({
  session_meta: [{ timestamp: text, payload: sessionMeta }, { ordinal: uint }],
  response_item: [{ timestamp: text, payload: response }, { ordinal: uint, metadata: harness }],
  turn_context: [{ timestamp: text, payload: turnContext }, { ordinal: uint }],
  event_msg: [{ timestamp: text, payload: events }, { ordinal: uint }],
  token_usage_record: [{ timestamp: text, payload: usageRecord }, { ordinal: uint }],
  world_state: [{ timestamp: text, payload: shape({ full: bool, state: object }) }, { ordinal: uint }],
  compacted: [{ timestamp: text, payload: checkedCompacted }, { ordinal: uint }],
  retained_context: [{ timestamp: text, payload: retainedEvent }, { ordinal: uint }],
  inter_agent_communication: [{ timestamp: text, payload: shape({ author: agentPath, recipient: agentPath, content: text, trigger_turn: bool },
    { ...responseCommon, encrypted_content: text }, { other_recipients: array(agentPath) }) }, { ordinal: uint }],
  inter_agent_communication_metadata: [{ timestamp: text, payload: shape({ trigger_turn: bool }) }, { ordinal: uint }],
});
export const knownHistoryRecord = ({ value, numberTokens, scalarStrings }) => scalarStrings !== false && record(value, numberTokens)
  && (value.type !== 'session_meta' || (noRoleAliasConflict(value.payload) && noRoleAliasConflict(value.payload.source?.subagent?.thread_spawn)));
