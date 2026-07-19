# Prompt review checklist

Use this reference for a complex, persistent, production-facing, tool-using, research, or evaluation prompt. Select only the review angles that can change the target prompt; this is not a template that every prompt must satisfy.

## Contents

- Outcome, context, and success
- Procedure, autonomy, and ambiguity
- Grounding and untrusted input
- Output and organization
- Examples and persistent instructions
- Tools, side effects, and coding agents
- Evaluation and runtime boundaries

## Outcome, context, and success

- Is the requested result clear before optional process details?
- Are success criteria expressed as observable behavior or deliverable quality?
- Are required inputs and evidence sources identified?
- If files, links, examples, or retrieved material are supplied, does the prompt say what to use them for?
- Is irrelevant context removed rather than carried forward because it was present in an older prompt?
- Are hard requirements separated from preferences?
- Does the revision preserve the strength of each requirement without inventing numeric tolerances or converting an approximate target into an absolute rule?
- Does the prompt preserve the content that a concise response must not omit?

## Procedure, autonomy, and ambiguity

- Does the requested action level distinguish review, diagnosis, or planning from creation, rewriting, implementation, or external coordination?
- If the user asked only for review or planning, can the agent inspect and report without modifying the artifact?
- Is each exact step necessary, or merely one possible route?
- When order matters for safety, approval, side effects, exact transformation, or a required output field, is that order preserved clearly?
- When order does not matter, can the prompt specify the destination and let the model choose the route?
- Are `always`, `never`, `must`, `only`, and repeated prohibitions reserved for true invariants?
- For judgment calls such as whether to search, ask, use a tool, or continue, does the prompt give a compact decision rule instead of an unconditional command?
- Does the prompt ask a question only for an ambiguity that would materially change the result or make an action unsafe?
- If the ambiguity is minor, can the model state or use a reasonable assumption and continue?

## Grounding and retrieval

For research, QA, or fact-checking prompts, consider whether to define:

- Which claims require source support or citations.
- What counts as enough evidence.
- When to search further and when to stop.
- What to do when evidence is missing or conflicting: ask, qualify, report uncertainty, or omit the claim rather than inventing it.
- Whether sources must be primary, current, independent, or limited to a named corpus.

Do not require citations for every sentence when only a subset of claims needs them. Do not add search steps when the supplied evidence is already sufficient.

## Untrusted input and prompt injection

For prompts that ingest webpages, files, user-submitted text, search results, tool outputs, MCP data, or other untrusted content, check whether the prompt:

- Treats retrieved or user-provided content as data, not as higher-priority instructions.
- Separates trusted instructions from untrusted content with clear labels or delimiters when confusion is plausible.
- Avoids interpolating untrusted variables into higher-priority instruction text.
- Limits sensitive tool calls, data disclosure, and side effects.
- Requires approval or a safer intermediate output when the action cannot be undone easily.

## Output and final checks

- Are audience, required content, format, length, tone, and ordering specified only where they affect usability?
- For a customer-facing or collaborative product, are personality choices such as tone and formality separated from collaboration behavior such as when to ask, assume, take initiative, or check work?
- For editing, rewriting, or summarizing, does the prompt say which artifact, length, structure, genre, and factual claims must be preserved?
- If the target model tends to be concise, does the prompt name the facts, evidence, caveats, or artifact parts that must remain instead of repeating generic brevity commands?
- Is the output over-specified in prose when a structured-output or schema mechanism would be more reliable?
- Are numeric budgets, tolerances, concurrency, and retry counts supplied by the user, tool contract, or runtime rather than invented to make the prompt appear complete?
- For code, documents, data, or other verifiable artifacts, are acceptance criteria and feasible validation steps stated?
- Does the prompt say how to report checks that could not be completed?
- Does a final check test the actual user-facing answer or artifact rather than only an intermediate tool or program result?

## Prompt and context organization

- Keep the core outcome, constraints, output contract, approval boundary, and stop or clarification rules in the main prompt or `SKILL.md`.
- Move long, optional, reusable, or variant-specific material into references only when the runtime can load it reliably.
- Keep one file when criteria are short, tightly related, and usually used together.
- Split when material is large, optional, domain-specific, or reused independently; state when each reference should be read.
- Use clear labels or delimiters when instructions, user input, examples, and source material could be confused.
- Keep the same rule in one authoritative place and define priority if multiple prompt layers can conflict.

## Examples and few-shot material

Examples are optional. Add them when rules alone do not reliably convey:

- Subtle classification or formatting boundaries.
- Tone or transformation behavior.
- Tool selection and recurring edge cases.
- A difficult input-output contract.

Keep examples representative and concise. State important behavior as a rule as well; do not rely on one example to imply a general policy. Remove examples that are stale, too narrow, or likely to be copied literally.

## Persistent instructions

For custom instructions, system or developer instructions, `AGENTS.md`, skills, Gems, or other durable surfaces, check whether the instruction:

- Applies only at the scope where it is valid.
- Uses conditional rules instead of hijacking unrelated future tasks.
- Keeps cross-task preferences separate from one-off task details.
- Defines when to ask and when to proceed with an assumption.
- Avoids imposing one response format, verbosity level, or workflow on every request without need.
- Does not duplicate controls already enforced by the runtime, policy, schema, or tool layer.

## Tools and side effects

Prefer tool-specific selection and argument guidance in tool descriptions when the runtime supports them. Check whether each tool description states only what the model needs to know:

- What the tool does and when it is relevant.
- Required inputs and the useful part of its output.
- Side effects, permissions, and whether retry is safe.
- Material errors, fallbacks, or stop conditions.

Expose only tools relevant to the task. For long or tool-heavy tasks, add status-update rules only when the target surface supports them and the updates help the user; do not turn every routine call into narration.

Also check whether:

- Correctness-critical discovery, retrieval, or validation happens before an action that depends on it.
- Independent reads may run in parallel, dependent decisions remain sequential, and parallel results are synthesized before action.
- Empty, partial, or suspiciously narrow results trigger one or two meaningful fallbacks before the workflow concludes that no result exists.
- Workflows with multiple routing modes define one clear handoff and avoid repeating completed work.
- Runtime-enforceable limits are referenced from configuration or represented by named placeholders instead of being duplicated as arbitrary prose defaults.
- Long-running workflows use a short initial preamble and sparse outcome-based updates at meaningful phase changes rather than narrating routine calls.

## Coding-agent prompts

For Codex-style coding work, check whether the task supplies the parts that matter:

- Desired behavior or bug outcome.
- Relevant code, paths, logs, screenshots, or reproduction steps.
- Constraints and existing patterns that must be preserved.
- Acceptance criteria and how to verify the change.
- The boundary between autonomous edits and actions that require approval.
- For frontend or visual changes, the existing design system, responsive states, and relevant visual constraints to preserve.

Do not require exhaustive repository scans, delegation, planning, or every possible test for all tasks. Use those controls only when task size, uncertainty, or risk justifies them.

For visual artifacts, require rendering and inspection when visual correctness matters. Check layout, clipping, spacing, missing content, and consistency rather than treating successful file generation as sufficient validation.

## Evaluation readiness

Manual review is not proof of improvement. For an important reusable prompt:

- Compare old and revised prompts on the same representative tasks.
- Include normal cases, recurring failures, edge cases, and at least one near-miss.
- Change one coherent instruction group at a time when diagnosing behavior.
- Measure the outcome that matters, such as task success, completeness, required evidence, format validity, tool errors, tokens, latency, or cost.
- Keep some fresh cases outside the tuning set.
- Report what the rewrite is intended to improve rather than declaring victory before testing.

## Runtime, API, and application boundaries

Keep controls outside the prompt when the application can enforce them more reliably. Depending on the target runtime, these may include:

- Structured output and schema validation.
- Model selection, reasoning depth, verbosity, latency, and cost controls.
- Tool schemas, permissions, retries, concurrency, and approval handling.
- Conversation state, caching, memory, and session controls.
- File inputs, retrieval, and file search.
- Sandboxing, network access, secrets, and write boundaries.

Do not verify every possible setting during a wording review. If the deliverable names a concrete capability, parameter, limit, or product behavior, verify it through the relevant official documentation or mark it as needing verification.

For non-OpenAI surfaces, avoid importing OpenAI-specific controls. Use the target product's supported settings and instruction hierarchy.
