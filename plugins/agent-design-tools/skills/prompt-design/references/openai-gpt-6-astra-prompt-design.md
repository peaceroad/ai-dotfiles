# GPT-6 Astra prompt-design notes

Use for the Astra target selected in `SKILL.md`. These are conditional adjustments, not a template or a reason to add every rule below.

Official guidance checked: 2026-09-05. The Astra model guide identifies clarification that can interrupt expected progress, sensitivity to instruction files, detailed formatting, less delegation than some workflows want, and thorough testing that can exceed small changes' needs. Treat these as reported tendencies to investigate, not guaranteed failures in an application.

## Initiative and confirmation

When authorized work stops at an offer or plan, make the expected completion explicit. Interpret conversational action requests such as “can you fix this?” in context, while respecting review-only or planning-only scope. Persistence should end at observable completion or a real blocking dependency, not generate speculative follow-up work.

Review approval wording before adding autonomy commands. An unconditional “confirm before external writes” can repeat approval already given. Define the authorization scope and the point where a missing authorization or runtime-required gate must be resolved. Prepare a concrete result using already-authorized work before requesting approval for its consequential side effect. Do not infer permission for destructive actions, purchases, external communication, or scope expansion from a broad desire to finish.

Separate questions from global pauses. For missing information that matters, pause only dependent work and continue useful independent work when supported. Use context and reasonable assumptions for routine gaps. An unanswered question or elapsed time does not supply permission. Avoid adding approval flows for hypothetical risks that do not apply to the actual task.

## Instruction-file sensitivity

When files cause a pause or scope change, trace the effective instructions and their loading conditions. Check whether a preference became a hard requirement, an example became a general rule, or two layers duplicate conflicting boundaries. Correct the governing instruction rather than adding a stronger prohibition elsewhere.

Where the runtime lets users override skill guidelines, make that explicit at the layer governing skill use. Preserve the actual instruction hierarchy; user text and retrieved files cannot override system/developer requirements merely because a file is called a skill.

For a pause, permission request, incomplete result, or departure from intent caused by an instruction file, make the cause reviewable: identify the relevant file and instruction, explain its application, and distinguish an explicit requirement from the agent's interpretation. Link or quote only relevant, disclosable text when supported. Ordinary successful work does not need an instruction audit report.

## Writing and preservation

Specify required substance separately from presentation. Tune paragraphs, headings, lists, tables, and examples to the reader and requested artifact. Prose helps connected explanations; structured formats help comparisons, sequences, and explicit output contracts. Preserve a requested outline, table, terse answer, or detailed treatment.

When shortening output, remove repetition and ceremonial transitions while keeping context, evidence, caveats, and artifact parts needed to understand or use it. For editing and drafting, preserve genre, structure, claims, and length at the strength requested. Do not add claims or sections merely to make the result feel complete.

If outputs strengthen source claims, clarify preservation of scope and certainty in the governing instruction: “available to A” does not establish “only A,” and an explicit exclusion must remain explicit.

Distinguish personality (warmth, formality, directness) from collaboration behavior (asking, assuming, acting, verifying). Replace vague labels with the few observable choices that matter. Use language- and audience-appropriate criteria for recurring wording problems instead of copying the official examples' English exclusions into a universal blacklist.

For Chat or Work prompts, identify the deliverable, audience, source scope, and necessary review points. Say what to take from attachments and connected sources. For Codex, identify the desired change, relevant files or reproduction evidence, patterns to preserve, and acceptance criteria. Add only the missing context that changes execution.

## Verification and delegation

When validation expands beyond the task, tie it to affected behavior and acceptance criteria. Complete required checks and meaningful tests; avoid tests that only mirror a reversible, low-impact edit. Once relevant checks pass, broaden or repeat them only for a new change, failure, or unresolved concern. Report unavailable checks and meaningful substitutes without treating a limitation as a pass.

For visual work, render and inspect the affected result when appearance matters. Check content, clipping, spacing, states, and existing design consistency; successful file generation alone does not prove visual correctness.

Tune delegation to the available runtime and its policy. Specify explicit-only or proactive use when needed. For proactive use, consider independent bounded work, separate-context benefits, coordination cost, shared writes, and useful parallel work by the root. Avoid mandatory delegation for small tasks or a single dependent chain. Respect applicable runtime limits when choosing parallelism.

Give a subagent the needed context and result contract, then integrate and verify relevant findings. Inter-agent messages should be human-readable. A subagent's completion does not establish that the overall task is done. Use the runtime reference only when designing API coordination.

## Updates, pending work, and continuity

For sustained tasks, preserve the active objective, accepted constraints, completed work, pending dependencies, and authorization scope. Interpret new user input as a correction, side question, scope change, or cancellation in context. Answer side questions without losing the objective; stop or replace work when directed. Check that earlier results remain relevant under changed requirements. Do not assume a new instruction reverses completed actions or cancels in-flight tools.

Use available partial results when dependencies allow. Wait for a complete set only for a comparison, synthesis, version constraint, or other actual dependency. If no useful independent work remains, use the supported wait or continuation mechanism and yield. Do not fill the interval with speculative analysis or unchanged status narration.

Where progress is visible and useful, use a brief opening and updates about meaningful findings, uncertainty, or decisions during sustained work. Match the surface's interaction requirements; omit this behavior for an output-only contract.

## Testing a tuning change

Keep a reliable prompt version as a baseline. Compare it with a candidate on the target model under the same effective reasoning effort, tools, permissions, context, and output contract. A previous-model run can help distinguish model and prompt effects, but is not required when unavailable. API migration compatibility is covered in [tools and runtime boundaries](openai-tools-and-runtime.md#reasoning-and-migration).

Change one coherent instruction group at a time when diagnosing failures. Official behavior notes justify hypotheses; representative results justify claims of improvement. Preserve working requirements while removing obsolete scaffolding.

For a skill that designs instructions, evaluate both its generated instructions and the behavior they produce. Check preservation of user intent, requirement strength, scope, target, and output contract. In downstream use, assess task success, necessary versus unnecessary questions, evidence, verification, and delegation where relevant. Measure tokens, calls, latency, or cost alongside quality.

Choose cases affected by the revision: authorized edits and review-only near misses; existing authorization and consequential missing input; optional guidance conflicting with a user request; small changes with required checks; mid-task corrections; or a runtime that forbids delegation. Keep some fresh cases outside the tuning set. These are evaluation ideas, not rules to append to every prompt.

Report structural validation, manual review, generated-prompt comparison, and downstream execution separately. None alone proves general improvement.

## Official sources

- [Astra model guide](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra)
- [Multi-agent guide](https://developers.openai.com/api/docs/guides/responses-multi-agent)
- [Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
- [Instruction hierarchy](https://developers.openai.com/api/docs/guides/prompt-engineering#message-roles-and-instruction-following)
