# Gemini 4 API instructions

Use for system instructions, tool descriptions, output contracts, or migration of a Gemini API application. Identify the actual API and SDK from the integration before writing settings or state-handling advice. API examples do not configure Gemini Apps, Gemini CLI, or Antigravity.

## Separate the prompt from the application contract

Put recurring behavior and evidence requirements in the system instruction, task data in the input, tool semantics in tool declarations, and machine-readable output requirements in supported schemas. Use native tool calling instead of asking the model to imitate tool invocations in plain text. Schema validity does not establish factual correctness; define semantic checks where the application needs them.

When reviewing an agent prompt, distinguish the model's decision from the application's execution: who supplies tool results, preserves state, handles failures, and checks completion. Do not promise tools, grounding, file access, or autonomous continuation that the integration has not supplied. Use the workflow-design companion when designing coordination, waiting, recovery, or repeated-work control; implementing an ordinary API tool-call loop alone does not require it.

## Model choice and thinking controls

Keep the established model unless selection or migration is part of the request. If selecting, use these documented tradeoffs as hypotheses to test on the actual workload, not guarantees of task quality:

- **Carbon (`gemini-4-carbon`):** deepest reasoning of the three, with more work on hypotheses and verification for difficult problems. Supports `low`, `medium`, and `high`; default `medium`.
- **Argon (`gemini-4-argon`):** advanced sustained work with less token use and latency than Carbon's positioning. Supports the same three levels; default `medium`.
- **Hydrogen (`gemini-4-hydrogen`):** efficient everyday coding and tool use. Supports `low`, `medium`, `high`, and `xhigh`; default `high`. `minimal` is unsupported.

Use the exact API's supported thinking setting when tuning is requested. A prompt saying “use xhigh” is not configuration. Compare the lowest setting that meets the quality requirement; do not add maximum effort to every prompt. Do not request hidden reasoning to verify thinking level.

For Gemini 4, remove custom `temperature`, `top_p`, and `top_k` settings rather than treating low temperature as an accuracy fix. Hydrogen's guide specifies that in-range values are ignored and out-of-range values produce a 400 error. Diagnose poor source evidence or task ambiguity separately from sampling.

## Context, continuation, and state

Gemini 4 shares a 1,048,576-token window across input, thinking, and output. In Interactions, `max_output_tokens` caps thinking plus the final answer, not just visible text. A small cap can exhaust the answer's budget; tune thinking level separately and retain the application's spending constraint. Request brevity in the output contract rather than treating a tiny total cap as a final-answer length control.

The default combined output limit is 65,536 tokens. Longer decoding requires remaining context capacity and a higher limit through the supported background or client continuation path; `background=true` alone leaves the default limit in place. “1M context” does not promise 1M output in addition to full input. Define useful intermediate artifacts when a job needs durable progress, without forcing every short task through checkpoints.

For Interactions, use the supported `previous_interaction_id` chain when server-side state is intended. For client-managed `generateContent`, preserve the required model turns, tool responses, and thought signatures using the SDK's documented representation. Do not synthesize signatures or copy one across parallel calls. A transcript summary and a cache entry are not equivalent to complete tool-call state.

Gemini 4 and the Interactions API use implicit caching, not explicit cache management. Keep caching distinct from conversation storage and retention. Verify storage and retention requirements against the selected API when they affect the application; do not import Apps history settings.

## Deliver and validate

Provide ready-to-use instruction text, tool/schema changes when requested, and configuration or state prerequisites separately. Do not silently switch API families or a live deployment. For a migration, review model settings and state continuity as well as wording.

Use representative requests to check output meaning, tool results, unavailable evidence, and completion. When integration tests are authorized, include a multi-turn tool exchange and continuation if required by the application. Report instruction review, schema checks, and actual API execution separately.

## Sources and refresh conditions

Recheck exact parameter names, supported features, state handling, and limits for a migration or implementation. These are API contracts, not universal prompt requirements.

- [Carbon](https://aistudio.google.com/docs/whats-new-gemini-4-carbon), [Argon](https://aistudio.google.com/docs/whats-new-gemini-4-argon), and [Hydrogen](https://aistudio.google.com/docs/whats-new-gemini-4-hydrogen): roles, settings, migration.
- [Thinking](https://aistudio.google.com/docs/thinking): API-specific signatures and controls.
- [Long decode](https://aistudio.google.com/docs/long-decode): limits and continuation.
- [Caching](https://aistudio.google.com/docs/caching): caching versus state.
