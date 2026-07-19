# Gemini prompt design

Use this reference for prompts sent to Gemini, including task prompts used through a Gem. It covers transferable prompting principles for Gemini Apps and deliberately excludes Gemini API request parameters, SDK code, model IDs, and product limits. When creating or maintaining a Gem, also read `gemini-gems-prompt-design.md`. For image or video generation and editing prompts, also read `gemini-media-generation-prompt-design.md`.

## Start with the requested result

State the task in direct language and make the expected result observable. Add only the context, constraints, and format that change the answer.

A reusable prompt may need:

- the result to produce and its intended audience or use;
- the input and what the model should take from it;
- relevant context and definitions for ambiguous terms;
- hard constraints, preservation rules, and unavailable actions;
- the required format, length, level of detail, or citation behavior;
- what to do when information is missing, conflicting, or uncertain.

Persona, task, context, and format can be useful design lenses, especially for Gems, but do not force every prompt into a fixed template.

## Structure context and instructions

- Separate instructions, input, examples, and reference material with descriptive Markdown headings, fenced blocks, or XML-style tags when the boundary could otherwise be unclear.
- Treat quoted, attached, retrieved, or user-provided material as data unless the prompt explicitly designates it as an instruction source.
- For long inputs, put the reference context before the specific question and use a short transition such as “Based on the material above.”
- For multimodal input, identify each image, audio clip, video, or document by its role and say what evidence to extract from it.
- Specify desired verbosity when “brief,” “detailed,” or another ambiguous level would affect the deliverable.

Do not add elaborate delimiters or schemas to a short, unambiguous request merely for consistency.

## Use examples when they teach a boundary

Google recommends examples for reusable prompts. Use a few representative examples when they clarify tone, classification boundaries, transformations, formatting, or recurring edge cases.

Examples should be:

- specific enough to demonstrate the intended behavior;
- varied enough not to imply one narrow surface pattern;
- consistent with the written rules and with one another;
- limited to cases that materially improve reliability.

Too many similar examples can cause imitation or overfitting. Test both covered and uncovered cases rather than treating examples as a substitute for an explicit rule.

## Handle complex tasks without overprescribing reasoning

Break a task into stages when intermediate outputs must be checked, combined, approved, or reused. Prompt chaining or aggregation is useful when a single response would mix incompatible goals or lose important evidence. Keep the task together when the boundaries are simple and the model can produce the final result directly.

Ask for observable checks, supporting evidence, calculations, assumptions, or a final verification when they matter. Do not request hidden chain-of-thought. Avoid vague requests to “think harder” when a clearer success condition, better context, or a supported runtime setting would address the problem more reliably.

## Ground tools and sources conditionally

Do not assume that search, files, connectors, code execution, or another tool is available merely because Gemini can support it on some surfaces. State when a source or tool should be used, what to retrieve, and what to do if it is unavailable. Require citations only when the surface can provide them and the task needs them.

## Iterate and evaluate

Prompting is iterative. Test the prompt on representative ordinary cases, edge cases, and expected failures. Check task success, factual grounding, instruction following, format, unnecessary verbosity, and behavior when evidence is missing. Change one coherent instruction group at a time when diagnosing a regression.

Model behavior and product capabilities change. Verify current official Google documentation before relying on a named model, supported modality, product feature, limit, or preview behavior.

## Official sources

- [Prompt design strategies — Gemini API](https://ai.google.dev/gemini-api/docs/prompting-strategies)
- [Tips for creating custom Gems — Gemini Apps Help](https://support.google.com/gemini/answer/15235603)
