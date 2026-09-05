# GPT-5.6 workflow notes

Use for a GPT-5.6 workflow target, including a named Sol, Terra, or Luna variant, when model or runtime differences affect the design. The shared workflow references remain the foundation; GPT-5.6 does not select a separate mandatory architecture.

Use `prompt-design` and its [GPT-5.6 notes](../../prompt-design/references/openai-gpt-5.6-prompt-design.md) for instruction wording and model settings. For API integration, use its [tools and runtime reference](../../prompt-design/references/openai-tools-and-runtime.md) and verify support for the selected model and product.

## Adapting control and continuity

When revising an existing GPT-5.6 workflow, use a working configuration as the comparison baseline. The legacy design's useful distinctions—observable completion, remaining work, retry versus replan, and runtime ownership of controls—are retained in the shared references. Restore an explicit state field or controller step only when it resolves a concrete gap.

Check asynchronous execution, steering, cancellation, and continuation against the actual runtime. A workflow designed by Astra does not establish GPT-5.6 support for its mechanisms. Where a mechanism is unavailable, use supported orchestration to preserve the needed behavior, or report the specific gap. Do not infer support or lack of support from the model generation alone.

When supported Programmatic Tool Calling is relevant, put predictable filtering, joins, aggregation, or validation in a bounded program. Keep decisions that need fresh interpretation of intermediate evidence at a model decision point. Define what returns to the model, including evidence needed for the final deliverable, and which existing limits govern that stage. Use the shared loop reference when the request calls for choosing new limits.

If a program's result feeds a final assistant response, check both: a correct intermediate result can still lose a required fact, citation, or caveat in the final answer. Choose the calling route by task shape and end-to-end results, not by the number of tools available.

## Evidence and provenance

For a model migration or a consequential control change, compare affected behavior on the selected GPT-5.6 variant and runtime, using a working baseline and cases suited to the change. Astra simulations and old source files do not establish GPT-5.6 execution quality.

Historical input: commit `16c9655` (2026-09-02), this skill's `SKILL.md` and `references/loop-patterns-and-control.md`. Current official guidance also favors lean instructions and workload-specific validation: [GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.6), checked 2026-09-06.
