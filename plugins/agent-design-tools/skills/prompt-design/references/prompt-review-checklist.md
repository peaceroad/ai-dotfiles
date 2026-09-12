# Prompt review checklist

Use for broader diagnosis of instruction layers, production behavior, tools, research, or behavioral evaluation. A self-contained wording correction does not require this reference merely because the artifact is reusable or API-hosted. Select checks that can change the target's behavior; this is not a template or a requirement to perform every check.

## Outcome and preservation

- Is the requested result observable, with enough context and evidence to produce it?
- Does the revision retain the original scope, domain policy, required order, tone, and output contract?
- Are requirements kept at their stated strength, including approximate lengths and preferences?
- Are numeric limits grounded in established requirements or, when choosing settings is in scope, justified and identified as configurable proposals within applicable constraints?
- Does a concise answer retain the explanation, evidence, caveats, or artifact parts the reader needs?
- Are instructions about the generated prompt distinguished from instructions the generated prompt should contain?

## Action, questions, and stopping

- Does a review-only or plan-only request stay within inspection and reporting, while an authorized change, including review with corrections, proceeds through relevant validation?
- Does the prompt honor existing authorization within scope and still require missing authorization or runtime-mandated approval before a consequential action?
- Can the agent prepare the reviewable result before requesting approval for the remaining action?
- Are missing information and missing permission distinguished? Does a question pause only work that depends on it?
- Can routine gaps use context and reasonable assumptions without turning an unanswered question into approval?
- Are completion, fallback, and blocking conditions explicit where needed? Does persistence stop at completion rather than inventing follow-up work?

## Instruction layers and examples

- What instructions actually reach the model, from which files and message roles, and under which loading conditions?
- Are hard constraints, preferences, examples, and untrusted source material distinguishable?
- Do conflicting rules resolve under the actual runtime hierarchy and same-level precedence?
- Has a local example or recommendation accidentally become a universal requirement?
- If a file causes a pause or deviation, can the agent identify the relevant instruction and distinguish its interpretation from an explicit requirement without disclosing protected material?
- Do examples clarify a subtle boundary or recurring failure, or merely add context and literal-copy risk?

## Grounding and untrusted input

- Does the prompt say what information to extract from each relevant source?
- Which claims require support, how current or authoritative must sources be, and what counts as sufficient evidence?
- Are missing or conflicting evidence and inference reported appropriately? Does absence of evidence avoid becoming a factual “no”?
- Do empty or partial results trigger a relevant fallback only while missing evidence matters and another attempt is likely to help?
- Does retrieval stop when the requested answer is sufficiently supported?
- Are retrieved webpages, files, tool results, and user-submitted artifacts treated as data rather than higher-priority instructions?
- Are untrusted variables kept out of higher-priority instruction text? Are sensitive disclosures and side effects constrained at the proper layer?

## Output and presentation

- Are audience, required content, format, length, and ordering specified only as far as usability requires?
- Are personality choices separated from collaboration behavior?
- Are formatting and language rules appropriate for the artifact and reader rather than universal defaults?
- For editing or summarizing, are claims, source-backed distinctions, genre, structure, and requested degree of detail preserved?
- Would a schema enforce the output contract more reliably than prose?
- Does validation inspect the actual user-facing output, not just an intermediate tool result?

## Tools, coordination, and state

- Do tool descriptions explain selection, required arguments, useful outputs, material errors, side effects, and retry safety?
- Are correctness-critical prerequisites completed before dependent actions?
- Are tool routes tied to stages and supported capabilities, with a clear handoff and no duplicated work?
- Can available partial results advance independent work? Is waiting scoped to actual dependencies?
- Is delegation supported and permitted, with bounded tasks, resource ownership, and final integration responsibility?
- Does a mid-task update reconcile the active objective, changed constraints, completed work, pending actions, and authorization?
- Are failed, cancelled, pending, and completed operations distinct? Does the runtime prevent unsafe replay?
- Are necessary facts, citations, decisions, and outputs available after compaction or interruption without requiring unnecessary state files?
- Are progress updates useful and supported by the surface, rather than narration of every call?
- Are schemas, permissions, retries, concurrency, model controls, and state enforced outside the prompt where practical? Are named API features verified for their combination and target surface?

## Verification and evaluation

- Are checks tied to affected behavior, acceptance criteria, and actual consequences? Are required repository or product checks preserved?
- Once relevant checks pass, is more validation justified by a new change, failure, or unresolved concern?
- Are unavailable checks reported honestly, with meaningful alternatives where possible?
- For visual correctness, is the affected artifact rendered and inspected for layout, clipping, content, states, and consistency?
- Can old and revised instructions be compared on representative cases with model, effective effort, context, tools, and permissions held steady?
- Are normal cases, recurring failures, and boundary near misses represented, with some fresh cases outside the tuning set?
- When skill selection or reference loading can affect the result, does the evaluation observe which guidance actually reaches the model? Distinguish explicit skill invocation from automatic selection in the target runtime.
- For instruction-generating skills, can the user assess proposed changes and use the generated instructions, and is their downstream behavior evaluated where warranted?
- Are correctness, scope, evidence, and necessary approvals assessed alongside tokens, calls, latency, or cost?
- Are structural validation, manual inspection, and behavioral results reported separately rather than all called “tested”?

## Organization and scope

Keep the core outcome, essential constraints, output contract, and meaningful stop/approval boundaries in the governing prompt or skill. Put substantial conditional material in references with reliable loading conditions. Keep short, tightly related rules together and maintain one authoritative location for each rule.

Do not require exhaustive repository scans, delegation, planning, citations, or every possible test for all tasks. Do not verify every API setting during a wording review. Use target-product controls and official sources when a concrete capability or limit matters; avoid importing OpenAI API mechanics into another surface.
