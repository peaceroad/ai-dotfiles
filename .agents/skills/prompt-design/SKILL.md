---
name: prompt-design
description: "Use when designing, reviewing, or rewriting model-facing instruction text, including prompts, system/developer/agent/tool instructions, prompt templates, evaluation prompts, Codex skills, Gemini prompts, Gemini Gem instructions, and Gemini image or video generation prompts. For OpenAI or Codex artifacts, default to current GPT-5.6 guidance unless another target is named; use skill-creator first for Codex skill creation or structural changes. Do not use when the deliverable is an article about prompting, a factual source check, a summary, ordinary code, or generated media rather than model-facing instruction text."
---

# Prompt Design

Use this skill when the artifact being created or edited is model-facing instruction text. Do not trigger it merely because the topic is prompting.

For a Codex skill, use `skill-creator` as the primary structural workflow and this skill as the prompt-quality review layer. For an article or guide about prompting, use the appropriate writing or source-review skill instead.

## Default target

When creating, reviewing, or editing an OpenAI or Codex model-facing artifact and the user does not name a different target model or runtime, treat GPT-5.6 as the target and load the GPT-5.6 reference. This includes Codex skills, `AGENTS.md`, system or developer instructions, agent prompts, and tool instructions. Do not ask the user to add “for GPT-5.6.” An explicitly named target model or non-OpenAI product takes precedence.

## Core stance

- Start from the result: what the model should produce or accomplish, what evidence it may use, what makes the result complete, and when it should stop or fall back.
- Include only context, constraints, output requirements, approval boundaries, and examples that materially change behavior.
- Preserve required procedures when sequence matters for safety, compliance, side effects, data transformation, or an output contract. Otherwise, avoid prescribing every reasoning or execution step.
- State a rule once. Reconcile conflicts rather than repeating or strengthening the same instruction in several places.
- Distinguish hard requirements from preferences and runtime controls.
- Preserve the strength of each requirement. Do not turn a preference or approximate target into an absolute rule or invented numeric threshold.
- Preserve the requested scope and degree of detail. Do not expand a compact task into an exhaustive policy, taxonomy, or workflow unless the added structure prevents a likely failure or the user asks for it.
- Keep prompt wording separate from schemas, permissions, tool definitions, retrieval, memory, caching, model choice, reasoning level, verbosity controls, and eval harnesses when the runtime can enforce them.
- Ask a focused question only when an important ambiguity would change the result or make an action unsafe. Otherwise, make a reasonable assumption and proceed.
- Do not claim that a rewrite is objectively better without representative testing.

## Workflow

1. Identify the artifact, target model or product surface, instruction hierarchy, runtime, user-visible outcome, and requested action level. If an OpenAI or Codex target is implicit, apply the GPT-5.6 default instead of asking the user to specify it.
2. Read the complete prompt and any model-facing text it depends on, including tool descriptions, schemas, examples, reference-loading rules, or higher-priority instructions when provided.
3. Preserve product intent, domain policy, required order, tone, operational boundaries, and any artifact structure or factual claims the task says to retain before simplifying anything.
4. Classify each important instruction as an outcome, context, hard constraint, preference, approval boundary, output contract, stop or clarification rule, tool rule, or runtime control.
5. Resolve contradictions, duplicates, vague referents, impossible requirements, and rules placed in the wrong layer.
6. If the user asked only for review, evaluation, diagnosis, or a plan, report prioritized findings and do not edit files or silently replace the prompt. Otherwise, apply the smallest rewrite that makes the intended behavior clearer and more testable. Do not add a framework merely for neatness. If a necessary operational value is unspecified, prefer a named placeholder, a runtime-enforced setting, or a decision rule over an arbitrary hard-coded number.
7. For production, persistent, or reusable prompts, establish the current behavior before changing the prompt, then identify representative tasks and failure cases that can compare the old and revised versions. Change one coherent instruction group at a time when diagnosing a regression.

When instructions conflict, prioritize safety, policy, permissions, and platform limits; then the primary deliverable and user intent; correctness and grounding; required output contract; and finally style preferences.

## Reference loading

Load only what the target requires:

- For every OpenAI or Codex prompt, instruction, or skill creation/review/editing task, read [references/openai-gpt-5.6-prompt-design.md](references/openai-gpt-5.6-prompt-design.md) unless the user explicitly targets another model or non-OpenAI runtime.
- For complex, persistent, production-facing, tool-using, research, or evaluation prompts, read [references/prompt-review-checklist.md](references/prompt-review-checklist.md).
- For a Codex skill `description` or trigger boundary, read [references/skill-description-review.md](references/skill-description-review.md). Use `skill-creator` first for skill creation or structural changes.
- For a prompt intended for Gemini, including a task prompt used through a Gem, read [references/gemini-prompt-design.md](references/gemini-prompt-design.md).
- When creating or updating a Gem or its `Knowledge` files, also read [references/gemini-gems-prompt-design.md](references/gemini-gems-prompt-design.md).
- For a prompt that generates or edits images or videos through Gemini or a Gem, also read [references/gemini-media-generation-prompt-design.md](references/gemini-media-generation-prompt-design.md).

For an OpenAI or Codex model migration, durable skill or system-instruction update, production prompt, tool-routing design, Programmatic Tool Calling workflow, long-running agent prompt, or explicit request for current model guidance, verify the current official prompt and model guides through the relevant documentation skill. Also verify any named capability, parameter, product behavior, or limit. Routine wording changes do not require a documentation lookup.

For Gemini work, verify current official Google documentation when the deliverable depends on a named model, supported capability or modality, product behavior, limit, or preview feature. Do not import Gemini API parameters or code into a prompt for Gemini Apps or a Gem unless the user explicitly targets the API.

## Compact review pass

- **Outcome:** Is the requested result visible and testable? Are success conditions stated without forcing an unnecessary route?
- **Context:** Is only relevant context supplied, with clear guidance on what to take from files, links, examples, or retrieved material?
- **Constraints:** Are true invariants separated from preferences? Are broad `always`, `never`, `only`, and repeated prohibitions justified?
- **Autonomy:** Is the model free to choose a valid route where appropriate? Are approval and side-effect boundaries stated once and at the correct layer?
- **Grounding:** Does the prompt say when evidence, citations, search, uncertainty, or a clarifying question matters?
- **Output:** Are audience, required content, format, length, ordering, and final checks specified only as far as the task needs?
- **Tools and runtime:** Are prerequisite retrieval, tool routing, schemas, permissions, retries, handoffs, model controls, and state management enforced outside the prompt where possible?
- **Safety:** Is untrusted content treated as data rather than instructions, and are sensitive actions constrained?
- **Evaluation:** Can the old and revised prompts be compared on the same representative tasks and failure cases?

## Common improvements

Prefer these changes when they affect behavior:

- Put the desired result before optional process details.
- Replace duplicated prohibitions with one conditional decision rule.
- Compress related preservation constraints into one positive rule instead of expanding them into a long blacklist.
- Keep a created prompt proportional to the request. Add only the rules, sections, schemas, and examples needed to prevent plausible failures or satisfy an explicit contract.
- Say what must remain in a concise answer instead of adding several generic brevity commands.
- State what to extract from attached or retrieved sources instead of attaching broad context without a purpose.
- Keep task-specific requirements in the task prompt and durable cross-task preferences in the appropriate persistent instruction surface.
- Use examples only for subtle boundaries, transformations, tool choice, tone, or recurring edge cases.
- Define what to do when evidence is missing instead of allowing the model to fill gaps.

Avoid by default:

- A mandatory Role/Goal/Context/Constraints/Output template for every prompt.
- Instructions to reveal chain-of-thought or to "think harder" instead of selecting supported runtime settings and evaluating results.
- Exact steps that merely restate an obvious path.
- Large tool catalogs, long tool descriptions, or examples unrelated to the task.
- A full rewrite when a small patch preserves intent more reliably.

## Output style

Match the output to the requested action. For review, evaluation, diagnosis, or planning only, provide findings and a prioritized plan without modifying files or presenting a silent replacement as completed work. For creation, rewriting, or fixing, provide the ready-to-use prompt or make the requested file change, then report validation and any remaining uncertainty.

When several local revisions to existing model-facing instruction text are easier to review individually, use a compact change-by-change format by default, but not as a mandatory wrapper. Use labels in the user's language. A typical item may include:

```text
Change 1: Ambiguous scope
Before: ...
After: ...
Reason: ...
```

Keep the issue label to a short phrase. If the findings need substantive explanation before the changes, summarize it once before the change list instead of expanding each label. Omit the label and its separator when it would merely repeat the reason. Keep the reason concise, and include only the minimum source wording needed when it materially clarifies a source-dependent correction. Bold only the changed spans when that makes the difference easier to see. If the prompt needs a broad rewrite, show the complete revised prompt and summarize the major changes instead of manufacturing a long line-by-line diff.

This format applies to reporting revisions to prompts and other model-facing instructions. It does not prescribe how to report edits to an article, technical document, book manuscript, or other artifact merely because that artifact was produced with a reviewed prompt. When the task directly updates a file and a concise completion report is more useful, report the changed file, major changes, validation, and remaining issues instead.

For prompt creation, provide the ready-to-use prompt first and add only the adaptation or runtime notes that the user needs. Keep prompt theory brief unless the user asks for a detailed explanation.
