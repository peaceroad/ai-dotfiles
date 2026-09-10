# Gemini prompt design

Use for model-facing text intended for Gemini Apps, Gems, or a Gemini API application. Apply the shared method from `prompt-design` through this skill's [entry point](../SKILL.md). Also read [Gem design](gemini-gems-prompt-design.md) for persistent Gem instructions and Knowledge, or [media prompts](gemini-media-generation-prompt-design.md) for image/video generation and editing.

Official guidance checked: 2026-09-06. Preserve the established target model and product surface. Gemini Apps, classic Gems, Gems from Labs, and API applications do not expose identical tools, state, or controls. Verify only the capabilities that affect the task; this reference does not prescribe API parameters or migrate models.

## State the result and needed detail

Google's Gemini 3 guidance emphasizes direct instructions and efficient answers. State the task and intended result plainly. When the deliverable needs explanation, specify the audience and useful context, evidence, assumptions, or worked examples instead of imposing blanket brevity. Use persona, task, context, and format as optional design lenses, not required headings.

## Place instructions and context deliberately

- Put essential behavior and output requirements in the available instruction surface, or near the beginning of a standalone prompt. A heading labelled "system" does not create system-level authority.
- For long inputs, place the reference context before the specific question, then clearly connect that question to the supplied material. Keep governing rules distinct from the task-specific request at the end.
- Use consistent Markdown headings or tags when needed to distinguish instructions, inputs, examples, and evidence. A short request does not need elaborate delimiters.
- Identify multimodal inputs by role and, where useful, page, timestamp, or image label. Say which evidence to extract, compare, or preserve; do not assume an attachment is decorative.

Quoted, attached, or retrieved content is data unless the governing instructions designate its instructional role. An instruction embedded in material being edited does not become a command to the assistant.

## Define the evidence boundary

Specify whether the task is extraction from supplied material, interpretation with labelled inference, or research using external sources. Preserve scope and certainty when transforming claims. Missing factual information stays unknown unless the task explicitly defines an absence rule, such as treating an unlisted item as outside a supplied allowlist. Use a strict context-only rule when the task requires it, without importing that restriction into ordinary analysis or creative work.

For time-sensitive work, use a trustworthy current date and appropriate sources. Do not copy a fixed year or knowledge-cutoff date from a sample prompt into durable instructions. If the needed fact cannot be verified, state the consequential uncertainty rather than inventing it.

Describe tools and citations in terms of what the selected surface actually provides. A general Gemini capability does not establish access to a particular file, connector, browser, or execution environment. Tool failure should have a useful fallback or stopping condition, not a promise of unavailable access.

## Examples, reasoning, and task stages

Use examples when they clarify subtle tone, transformations, classification boundaries, formats, or recurring mistakes. Keep them consistent with the written rules and vary incidental details so the model can generalize the intended pattern.

Thinking-capable models already reason internally. Request the evidence, calculation, decision rationale, or intermediate artifact the user needs. Add stages when outputs must be checked, combined, approved, or reused; do not require a visible plan or exhaustive pre-action checklist for every request. For agent work, specify meaningful completion and recovery conditions while leaving room to adapt to new evidence.

## Review and maintain

When testing revised instructions, include cases beyond the examples and target the changed behavior: for instance, required explanation under a brevity preference or missing evidence under a context-only rule. Successful sample answers alone do not establish reliability across tasks.

For model-dependent decisions, consult the selected model's current guide as well as general prompting advice. Older examples can retain outdated sampling controls, fixed dates, or broad behavioral templates. API configuration belongs in the integration; writing a setting into a Gem prompt does not configure the product.

## Official sources

- [Prompt design strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies)
- [Latest model guidance](https://ai.google.dev/gemini-api/docs/latest-model)
- [Gemini API release notes](https://ai.google.dev/gemini-api/docs/changelog)
- [Gemini Apps release notes](https://gemini.google/release-notes/)
- [Tips for creating custom Gems](https://support.google.com/gemini/answer/15235603)
