# Gemini 4 API instructions

Use for system instructions, tool descriptions, output contracts, or migration of a Gemini API application. Identify the actual API and SDK from the integration before writing settings or state-handling advice. API examples do not configure Gemini Apps, Gemini CLI, or Antigravity.

## Separate the prompt from the application contract

Put recurring behavior and evidence requirements in the system instruction, task data in the input, tool semantics in tool declarations, and machine-readable output requirements in supported schemas. Use native tool calling instead of asking the model to imitate tool invocations in plain text. Schema validity does not establish factual correctness; define semantic checks where the application needs them.

When reviewing an agent prompt, distinguish the model's decision from the application's execution: who supplies tool results, preserves state, handles failures, and checks completion. Do not promise tools, grounding, file access, or autonomous continuation that the integration has not supplied. Use the workflow-design companion when designing coordination, waiting, recovery, or repeated-work control; implementing an ordinary API tool-call loop alone does not require it.

## Model choice and thinking controls

Keep the established model unless selection or migration is part of the request. If selecting, use these documented tradeoffs as hypotheses to test on the actual workload, not guarantees of task quality:

- **Carbon (`gemini-4-carbon`):** deepest reasoning for difficult problems, with more work on hypotheses and verification. Supports `low`, `medium`, and `high`; default `medium`.
- **Neon (`gemini-4-neon`):** complex coding, analysis, and knowledge work between Hydrogen's speed and Carbon's depth. Supports `low`, `medium`, `high`, and `xhigh`; default `high`. `minimal` is unsupported.
- **Argon (`gemini-4-argon`):** advanced sustained work with less token use and latency than Carbon's positioning. Supports `low`, `medium`, and `high`; default `medium`.
- **Hydrogen (`gemini-4-hydrogen`):** efficient everyday coding and tool use. Supports `low`, `medium`, `high`, and `xhigh`; default `high`. `minimal` is unsupported.

Use the exact API's supported thinking setting when tuning is requested. A prompt saying “use xhigh” is not configuration. Compare the lowest setting that meets the quality requirement; do not add maximum effort to every prompt. Do not request hidden reasoning to verify thinking level.

Within Gemini 4, migration to Neon keeps the request schema but can change the effective thinking level when Carbon or Argon defaults were implicit. Check that setting and paid-tier access; reserve `xhigh` for problems where the added reasoning justifies its latency and token use. Model selection or tuning needs representative evaluations, not an effort sweep for ordinary wording edits.

For Gemini 4, remove custom `temperature`, `top_p`, and `top_k` settings rather than treating low temperature as an accuracy fix. Hydrogen's guide specifies that in-range values are ignored and out-of-range values produce a 400 error. Diagnose poor source evidence or task ambiguity separately from sampling.

## Context, continuation, and state

Gemini 4 shares a 1,048,576-token window across input, thinking, and output. In Interactions, `max_output_tokens` caps generated tokens including thinking, tool calls, and the final answer, not just visible text. A small cap can exhaust the answer's budget; tune thinking level separately and retain the application's spending constraint. Request brevity in the output contract rather than treating a tiny total cap as a final-answer length control.

The default combined output budget is 65,536 tokens; distinguish it from each continuation hop's cap, which depends on the model and streaming mode. Longer decoding requires remaining context capacity and a higher budget through a supported continuation path; `background=true` alone leaves the default budget in place. “1M context” does not promise 1M output in addition to full input.

For client-side Interactions continuation, use a compatible SDK or the documented token protocol. Keep the model, tools, instructions, and generation settings unchanged across hops; asking “continue” is a different operation. `requires_continuation` is not completion. Save the merged result from SDK `create`: fetching its final hop's ID returns only that hop, not the merged output. If designing compaction around long decode, compact after the turn completes and use the selected API's context measure rather than cumulative billed input tokens. Define intermediate artifacts only when durable progress is needed.

For Interactions, use the supported `previous_interaction_id` chain when server-side state is intended. For client-managed `generateContent`, preserve the required model turns, tool responses, and thought signatures using the SDK's documented representation. Do not synthesize signatures or copy one across parallel calls. A transcript summary and a cache entry are not equivalent to complete tool-call state.

Gemini 4 and the Interactions API use implicit caching, not explicit cache management. Keep caching distinct from conversation storage and retention. Verify storage and retention requirements against the selected API when they affect the application; do not import Apps history settings.

## Deliver and validate

Provide ready-to-use instruction text, tool/schema changes when requested, and configuration or state prerequisites separately. Do not silently switch API families or a live deployment. For a migration, review model settings and state continuity as well as wording.

Use representative requests to check output meaning, tool results, unavailable evidence, and completion. When integration tests are authorized, include a multi-turn tool exchange and continuation if required by the application. Report instruction review, schema checks, and actual API execution separately.

## Sources and refresh conditions

Recheck exact parameter names, supported features, state handling, and limits for a migration or implementation. These are API contracts, not universal prompt requirements.

- [Carbon](https://aistudio.google.com/docs/whats-new-gemini-4-carbon), [Neon](https://aistudio.google.com/docs/whats-new-gemini-4-neon), [Argon](https://aistudio.google.com/docs/whats-new-gemini-4-argon), and [Hydrogen](https://aistudio.google.com/docs/whats-new-gemini-4-hydrogen): roles, settings, migration.
- [Thinking](https://aistudio.google.com/docs/thinking): API-specific signatures and controls.
- [Long decode](https://aistudio.google.com/docs/long-decode): limits and continuation.
- [Caching](https://aistudio.google.com/docs/caching): caching versus state.
- [Cloud Neon developer guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-4-neon): Enterprise Agent Platform conventions, continuation, and compaction measures; verify against the chosen API rather than copying Cloud fields into AI Studio requests.
