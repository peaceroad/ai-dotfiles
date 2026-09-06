# OpenAI tools and runtime boundaries

Use for API routing, asynchronous execution, multi-agent coordination, conversation state, caching, or migration that affects instruction design. For managed products such as Codex, use their exposed contracts and documentation instead. This is a decision aid, not an integration manual.

Official guidance checked: 2026-09-05. Verify the relevant official documentation before prescribing fields or compatibility. Individual feature support does not establish that a combination works.

## Tool contracts and routing

Put selection guidance, arguments, useful return fields, material errors, side effects, and retry behavior in tool definitions when supported. The application validates arguments and permissions for each call. Retain broad outcome and approval rules in their governing layer.

| Route | Suitable stage | Required boundary |
| --- | --- | --- |
| Direct call | One operation, adaptive retrieval, semantic judgment, approval-sensitive action, or native output inspection | Inspect evidence before dependent decisions |
| Programmatic Tool Calling (PTC) | Predictable data flow that code can filter, join, sort, deduplicate, aggregate, or validate into a smaller result | Eligible tools, result shape, evidence fields, failure behavior, and return to model judgment |
| Async direct tool | Slow client-executed function/custom tool with useful independent work | Pending-job tracking and a wait before relying on an unavailable result |
| Subagent | Bounded work benefiting from independent execution or context | Delegation policy, resource ownership, configured limits, and final integration |

Multiple calls alone do not justify PTC or subagents. Parallelize independent reads when allowed; keep dependent decisions and required approvals ordered. Define the handoff and fallback where routes meet so completed work is not repeated. Respect actual tool and application limits when proposing a routing design.

In the API, PTC runs JavaScript in isolated hosted V8; do not assume Node.js, filesystem access, direct networking, or persistent JavaScript state. The application still executes client-owned calls. Deferred tools must be discovered before a program that needs them starts.

Preserve source identifiers, evidence, citations, and native artifacts needed for the final result. Test `program_output` and the final assistant message separately. Compare direct and programmatic routes on the same cases; smaller intermediate output is useful only if the final answer remains correct, complete, and evidenced.

## Async work and steering

With async tool calling, the application marks supported function/custom tools `async: true`, executes and tracks jobs, and returns results with the original `call_id`. It does not move those jobs to OpenAI or make hosted built-in tools asynchronous.

Specify what can progress independently, which results the next decision needs, and what constitutes completion. Dispatch is not success. A wait tool is application-defined; use the actual runtime contract rather than assuming a built-in `wait_for_tasks`. In the documented pattern, unique handles map to original calls/jobs and results arrive on their original calls before wait status. The application owns failures, duplicate handling, cancellation, and job lifetime.

Async tools use direct calls and cannot be configured for PTC. In API Multi-agent mode, do not combine async tools with parallel tool calls. Verify these gates before adopting a combination; do not apply them as blanket restrictions on another runtime's tools.

Mid-turn steering accepts user updates during Astra Responses generation over WebSocket. Acceptance queues an update; it does not prove application by the model. Steering neither reverses earlier actions nor cancels started tools.

The prompt reconciles new requirements with completed and pending work. The application tracks acknowledgments, required tool results or approvals, continuations, and disconnect recovery. Do not duplicate accepted steering or assume pending input survived a lost connection. Reconcile actual state before replaying side effects.

For workflow architecture, use an applicable workflow-design skill for state transitions and recovery instead of reproducing a complete orchestrator in a prompt.

## State and caching

Separate visible history, opaque reasoning/compaction state, and durable task evidence. Preserve the requirements, decisions, pending dependencies, authorization scope, citations, and outputs needed for continuation or audit in the runtime or an authorized artifact location. A separate state file is not required for every task.

For manually managed API history, preserve required items in order, including tool relationships, encrypted reasoning, and assistant `phase`. Follow the selected continuation contract; request-level `instructions` are not automatically inherited through `previous_response_id`. Persisted reasoning is model-family-dependent; do not assume it carries across model families.

Use compaction when context growth justifies it and the configured features support it. Treat returned items as opaque and follow the endpoint's output contract. Standalone compact output is the next context window; do not arbitrarily prune it.

For prompt caching, keep reusable instructions and tool definitions stable and append changing content. Distinguish supplied tools from currently callable tools; use supported selection or deferred loading where useful. Measure input, cache reads/writes, latency, and cost together. Neither fewer prompt tokens nor a higher hit rate alone establishes improvement. Do not add irrelevant text merely to reach a cache threshold.

## Reasoning and migration

Keep model, effort/mode, verbosity, and output schemas in supported runtime controls. Preserve task-specific requirements in the prompt. For an actual Astra API migration, consult the Astra model guide and model page:

- Preserve the current effective effort when supported. Migrate `none` or `minimal` to a `low` baseline and compare. The API lists `low`, `medium`, `high`, `xhigh`, and `max`; product or harness settings may differ.
- Astra tool calling requires Responses. Remove unsupported sampling/log-probability parameters as documented; a generic endpoint schema does not establish model support.
- Evaluate prompt, model, and effort changes separately. Explore other supported efforts when measured quality, latency, or cost justifies it; do not mandate an effort sweep for a wording edit.
- When migrating from GPT-5.5 or earlier, check the move from `prompt_cache_retention` to `prompt_cache_options.ttl`, cache boundaries, and cache-write billing. Do not present this as a new required change for every GPT-5.6-to-Astra migration.
- Verify processing-mode and data-residency compatibility when relevant. Keep current pricing, availability, and latency claims out of durable instructions.

Configuration updates change effort between Astra responses while preserving the request-level prefix. They require standard, single-agent mode and cannot combine with automatic compaction/truncation or standalone `/responses/compact`. The documented explicit `compaction_trigger` path requires a fresh effort update afterward. Verify sequencing and effective-effort reporting in the implementation; these details do not belong in an ordinary task prompt.

## Runtime stops

Distinguish clarification from a permission denial, required approval, or safety block. Autonomy instructions cannot bypass these controls.

Misalignment monitoring can flag or stop consequential workflows asynchronously. A flag requires review and does not by itself establish misconduct; a stop does not undo earlier actions. On a blocking `misalignment_policy_violation`, stop dispatching, avoid automatic retries of the blocked workflow, preserve relevant records under the application's data policy, and surface the available error for review.

## Official sources

- [Programmatic Tool Calling](https://developers.openai.com/api/docs/guides/tools-programmatic-tool-calling)
- [Tool search](https://developers.openai.com/api/docs/guides/tools-tool-search)
- [Multi-agent](https://developers.openai.com/api/docs/guides/responses-multi-agent)
- [Async tool calling](https://developers.openai.com/api/docs/guides/async-tool-calling)
- [Mid-turn steering](https://developers.openai.com/api/docs/guides/steering)
- [Reasoning state](https://developers.openai.com/api/docs/guides/reasoning#preserve-reasoning-across-calls)
- [Conversation state](https://developers.openai.com/api/docs/guides/conversation-state)
- [Compaction](https://developers.openai.com/api/docs/guides/compaction)
- [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)
- [Astra model guide](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra)
- [Astra model page](https://developers.openai.com/api/docs/models/gpt-6-astra)
- [Configuration updates](https://developers.openai.com/api/docs/guides/reasoning#change-reasoning-mid-conversation)
- [Misalignment monitoring](https://developers.openai.com/api/docs/guides/safety-checks/misalignment-monitoring)
