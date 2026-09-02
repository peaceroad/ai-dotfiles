# OpenAI GPT-5.6 prompt-design notes

Use this reference for every OpenAI or Codex model-facing artifact when the user does not explicitly name another target model or runtime. This includes prompts, system and developer instructions, tool instructions, `AGENTS.md`, and Codex skill creation or editing. GPT-5.6 is the default; the user does not need to request it. This file is a review aid, not a mandatory prompt template.

## Contents

- Source and scope
- Outcome, evidence, and stopping conditions
- Chat, Work, and Codex prompts
- Response style and editing
- Autonomy and approval boundaries
- Tool routing and Programmatic Tool Calling
- Grounding and retrieval budgets
- Long-running workflows and state
- Reasoning effort and migration
- Validation and visual work
- Primary official sources

## Source and scope

Treat current official guidance as the source of truth. Use this local reference for routine review, and follow the documentation-lookup rule in `SKILL.md` when a task depends on current model behavior, product or API details, or an official example.

Keep model configuration, prompt wording, tool definitions, state handling, and evals separate. A prompt review may identify all of these layers, but change only the layer the user authorized.

## Outcome, evidence, and stopping conditions

State the destination before optional process detail. A lean GPT-5.6 prompt normally identifies:

- The user-visible outcome.
- Relevant context and available evidence.
- Hard safety, business, evidence, permission, and side-effect constraints.
- Success criteria, required output, and validation requirements.
- Stopping, fallback, or clarification conditions when they affect behavior.

Leave room for the model to choose an efficient search, tool, or reasoning path unless order is itself a requirement. Preserve exact sequence for safety, compliance, approvals, destructive actions, exact transformations, or required output fields.

When revising or migrating an existing prompt or tool configuration, use the most reliable known working version as the baseline when one is available. Remove one coherent group of instructions, examples, or tools at a time, then rerun the same evals. Trim repeated rules, stale workarounds, examples that do not change behavior, process instructions for reliable default behavior, and unrelated tools. Keep requirements that define the outcome, evidence, permissions, routing, output, validation, or stop conditions.

Review the remaining instructions for contradictions. Conflicting prompt contracts can create more instability than missing detail. State true invariants once. For judgment calls such as whether to search, ask, use a tool, retry, or stop, prefer a compact decision rule over unconditional `always`, `never`, `must`, or `only` language.

Preserve explicit user values. When a value is implicit, provide decision criteria and let the model use the context or schema instead of inventing a universal default or keyword map.

## Chat, Work, and Codex prompts

ChatGPT does not require rigid syntax or a template with every field filled. Begin with the requested result, then add only the goal, context, output, boundaries, and stop rules that change behavior.

When attaching files or using connected sources, say what information to take from each relevant source. Put preferences that should apply across tasks in the appropriate persistent instruction surface; keep one-off details in the current prompt.

For ChatGPT Work, define the deliverable, source scope, audience, review points, and the distinction between required and optional work when the task is large or long-running. Specify approval points only where the user needs control.

For Codex, give:

- The desired behavior or change.
- Relevant code, file paths, logs, screenshots, or reproduction steps.
- Constraints and existing patterns to preserve.
- Acceptance criteria and how the result should be tested or otherwise verified.

In the IDE, open files can supply context, but naming the relevant area still reduces ambiguity. In the CLI, name paths or attach them with the supported mention mechanism. Request a plan only when task size, uncertainty, risk, or the user's desired review point justifies one.

## Response style and editing

GPT-5.6 tends to be more concise than GPT-5.5. Broad brevity commands may remove evidence, caveats, or required artifact parts. When brevity matters, state both what may be omitted and what must remain.

For API applications, use supported verbosity controls for the default level of detail and keep task-specific length, structure, and required content in the prompt. Verify current control names before recommending them.

For customer-facing assistants and collaborative products, separate:

- **Personality:** tone, warmth, directness, formality, humor, empathy, and polish.
- **Collaboration style:** when to ask, assume, take initiative, explain tradeoffs, check work, or handle uncertainty.

Keep both short. Replace broad labels such as “friendly” or “empathetic” with the writing choices that matter. Avoid blanket language rules unless they are true product requirements.

For editing, rewriting, summarizing, or customer-facing drafting, state the preservation requirements that matter to the task, such as the requested artifact, length, structure, genre, factual claims, and source-backed distinctions. Keep the preservation rule compact and at the strength the user requested. Do not invent numeric tolerances, enumerate every conceivable claim type, or turn an approximate target into an absolute constraint. Improve clarity, flow, and correctness without adding new claims, sections, features, or promotional tone unless requested.

## Autonomy and approval boundaries

Match the action level authorized by the request:

- For answer, explanation, review, diagnosis, or planning, inspect and report. Do not implement changes unless the user also asks for them.
- For change, build, rewrite, or fix requests, make the requested in-scope local changes and run relevant non-destructive validation without asking again.
- Require confirmation for external writes, destructive actions, purchases, or material scope expansion.

Name safe local actions when ambiguity would otherwise cause unnecessary pauses. Keep the policy in one place and state each rule once. Repeating “ask first,” “do not mutate,” or “wait for approval” can stall safe, authorized work.

For long-running work, identify the current layer: research, design, implementation, review, or external coordination. Do not let the prompt silently authorize movement from one layer to another.

## Tool routing and Programmatic Tool Calling

Expose only task-relevant tools. A tool description should state what the tool does, when to use it, important return fields or types, and material error behavior.

If correctness depends on prerequisite discovery, retrieval, or validation, say so. Parallelize independent reads when safe; keep dependent decisions sequential; synthesize parallel results before acting. If a tool result is empty, partial, or suspiciously narrow, try the most relevant available fallback before concluding that no result exists. Continue only while the missing evidence matters and another attempt is likely to add information.

Use Programmatic Tool Calling (PTC) for bounded, predictable reduction of several tool results or large intermediate outputs, such as filtering, joining, sorting, ranking, deduplication, batching, aggregation, or deterministic validation. Multiple, parallel, or dependent calls alone do not justify PTC.

Prefer direct tool calls when:

- One call is sufficient or intermediate results are already small.
- Each result may change the next decision.
- The workflow needs semantic judgment between calls.
- An action requires approval.
- The final answer must preserve citations or native artifacts.

When both routes are available, define the bounded PTC stage, eligible tools, output schema, evidence fields, concurrency, retry and stop limits, fallback, and one clear handoff back to direct model judgment. Tell the model not to switch routes or repeat completed work.

Use actual tool or application limits when available. Do not invent universal call-count, concurrency, retry, or token budgets merely to make a prompt look complete. If the implementation has not chosen them, keep the developer instruction conditional on configured limits, use clearly named placeholders, and recommend enforcing the values in the runtime rather than duplicating arbitrary numbers in prose. Keep the orchestration contract proportional to the workflow; do not add a general-purpose data-processing policy when a few routing and validation rules are sufficient.

Test the `program_output` and final assistant `message` separately. Compare direct and programmatic routes on the same representative tasks. Count lower tokens, latency, cost, calls, turns, or retries as an improvement only when the final answer remains correct, complete, and properly evidenced.

## Grounding and retrieval budgets

For grounded answers, define which claims need support, what counts as enough evidence, and what to do when evidence is missing or conflicting. Absence of evidence must not automatically become a factual “no.”

For research and synthesis:

- Cite only retrieved sources and attach citations to the claims they support.
- Separate inference from directly supported fact.
- State material conflicts between sources.
- Narrow the answer or report missing evidence instead of guessing.
- Stop retrieval when the core request has sufficient support; search again only for a required missing fact, requested exhaustiveness, a named artifact, or an otherwise unsupported important claim.

For creative drafting, distinguish source-backed facts from creative wording. Do not invent names, metrics, dates, roadmap status, customer outcomes, or product capabilities to strengthen a draft.

## Long-running workflows and state

When the target surface supports visible progress and the work is multi-step or tool-heavy, request a short preamble before the first tool call and sparse, outcome-based updates at major phase changes. Omit this rule when progress is not visible or would add no user value. Do not narrate routine calls.

When managing history manually, preserve and resend previous user inputs and every response output item. For `store: false` or Zero Data Retention, also replay the encrypted reasoning items returned by the API. With `reasoning.context: all_turns`, continue with `previous_response_id` to make earlier reasoning available to the model. Treat these as runtime concerns, not prose instructions, and verify current API behavior before changing an implementation.

When compaction is available and context growth justifies it, prefer the runtime's automatic or configured-threshold behavior. When the runtime supports explicit compaction and the application needs a deliberate checkpoint, use a meaningful workflow boundary rather than compacting after every turn. Treat returned compaction items as opaque state, not as a human-readable record or the sole store of critical facts. State which working facts must survive into the next phase. If the work must preserve provenance, support later review or handoff, or resume reliably across sessions or interruptions, keep the facts, citations, decisions, open questions, and outputs needed for that purpose in durable artifacts outside the compacted conversation state. Keep the prompt functionally consistent after compaction.

Reuse persisted reasoning only while the objective, assumptions, and priorities remain stable. Stale reasoning can add tokens, latency, and anchoring. Keep reusable prompt prefixes stable for caching, and use explicit cache breakpoints only when measurement shows a benefit.

## Reasoning effort and migration

Keep model choice, reasoning effort, reasoning mode, and verbosity in the runtime or UI layer when supported. Do not substitute prompt phrases such as “think harder,” “use Pro,” or “show your chain of thought” for runtime configuration.

When moving an existing application to GPT-5.6:

1. Switch the model while preserving the current reasoning effort.
2. Run representative evals before changing the prompt.
3. Test the same effort and one level lower; use higher settings only when evals show a meaningful gain.
4. Remove obsolete scaffolding, repeated instructions, irrelevant examples, and unrelated tools one coherent group at a time.
5. Add only the smallest targeted instruction that fixes a measured regression.
6. Rerun the same cases after each prompt or reasoning change.

Reserve `max` for the hardest quality-first workloads; do not recommend it globally. Before increasing effort, check for a missing success criterion, dependency rule, tool-routing rule, or verification loop. Verify current supported settings before giving implementation advice.

Debug regressions with a small set of real traces. Identify the failure mode and likely instruction or contradiction, make a surgical edit, and rerun the same cases. Do not rewrite a working prompt stack all at once.

## Validation and visual work

Give the model access to relevant validation tools and state what checks matter. For code, prefer targeted tests for changed behavior, applicable type or lint checks, affected-package builds, and a minimal smoke test when full validation is too expensive. If a check cannot run, report why and name the next-best check.

For frontend changes, provide product context, preserve the existing design system, components, states, and responsive behavior, and avoid unrequested features or decoration. Render and inspect the result before finalizing.

For visual artifacts, inspect layout, clipping, spacing, missing content, and visual consistency. For dense or coordinate-sensitive images, choose image detail intentionally and verify current cost and latency implications.

For implementation plans, include the requirements, named resources or files, state transitions or data flow, validation, failure behavior, material privacy or security constraints, and unresolved questions that affect implementation.

## Primary official sources

- [Model and prompting guidance: Using GPT-5.6](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.6)
- [Instruction hierarchy: OpenAI Model Spec](https://model-spec.openai.com/)
- [Programmatic Tool Calling](https://developers.openai.com/api/docs/guides/tools-programmatic-tool-calling)
- [Compaction](https://developers.openai.com/api/docs/guides/compaction)
- [Building Reliable Agents with Memory and Compaction](https://developers.openai.com/cookbook/examples/agents_sdk/building_reliable_agents_memory_compaction)
- [Prompting - ChatGPT Learn](https://learn.chatgpt.com/docs/prompting#prompting-overview)

These pages can change. Verify current pages when a deliverable depends on model capabilities, parameters, modes, prices, limits, or product behavior.
