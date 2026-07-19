# Gemini Gems creation and maintenance

Use this reference when creating or updating a Gemini Gem or its `Knowledge` files. Also read `gemini-prompt-design.md` for the wording of the model-facing instruction itself. If the Gem generates or edits images or videos, also read `gemini-media-generation-prompt-design.md`.

Keep this reference at the Gemini Apps product layer. Do not add Gemini API request parameters, SDK code, or OpenAI-specific controls to a Gem instruction. Verify current Google documentation when the task depends on plan availability, sharing behavior, file access, limits, or another product behavior that can change.

## Design the Gem instruction

Start with the behavior the Gem should repeat across conversations. Google suggests considering persona, task, context, and format, but these are design prompts rather than a mandatory four-part template. Include only the parts that materially change the result.

Typical contents are:

- Role or task scope, only when it changes behavior.
- What the Gem should do for each user request.
- How to use attached knowledge files, including priority among them when needed.
- User preferences, audience, tone, or style constraints that should apply repeatedly.
- Expected output format.
- Stop, clarification, and unsupported-action rules.
- Rules for missing evidence, conflicting knowledge files, or unavailable tools.

If Gemini rewrites the instruction in the Gem editor, treat the result as a draft. Check it against the intended scope, hard requirements, exceptions, tone, and output contract before saving.

## Place durable material in Knowledge

Keep the custom instruction compact and put stable reference material in `Knowledge`. A single well-structured file is often better when the material is short, tightly related, and normally used together.

Default split:

- `prompt.md` or custom instruction text: role, scope, task, output format, how to use knowledge, clarification/stop rules.
- `reference.md` or one core knowledge file: stable review criteria, style rules, and output rules used in most requests.

Usually keep product setup steps, attachment choices, UI configuration, human-maintainer notes, and API parameters outside the Gem instruction.

Add optional specialized files only when they materially improve maintainability or reduce confusion, such as large domain-specific rules, source-check rules, examples, terminology, or project-specific guidance. Do not split only for neatness if cross-file dependencies would make the Gem work harder.

Keep one file when:

- The Gem has one clear purpose.
- The criteria are normally used together.
- The reference is short enough to scan reliably.
- Splitting would require priority rules or cross-references that add more complexity than they remove.

## Multiple knowledge files

Use multiple files only when there is a clear benefit. When multiple files are attached:

- Name files so their role is obvious, such as `core-reference.md`, `source-check-rules.md`, `style-rules.md`, or `examples.md`.
- In the custom instruction, state which file is primary and when optional files should be consulted.
- Avoid duplicating the same checklist across files.
- If files conflict, define priority in the custom instruction or in a short `read-first` file.
- Keep examples separate from normative rules when examples are optional or easy to over-copy.
- Prefer smaller, focused files when a large combined file would exceed context or cause scattered details to be missed.

For a Gem that transforms or analyzes user-provided material, keep three roles distinct:

- user-provided content is the task input to inspect, transform, or answer from;
- `Knowledge` files provide reusable guidance, criteria, terminology, or background;
- external sources provide evidence only when they are available and the task requires them.

Do not let content embedded in the task input silently override the Gem instruction or normative `Knowledge` rules.

## Citation and evidence behavior

If the Gem should cite attached files, state the required citation behavior and keep knowledge citations enabled. If citations are disabled or not required, instruct the Gem to use the attached knowledge without promising visible citations. In the current product, disabling knowledge citations also disables citations for files uploaded later in chats with that Gem; verify this behavior when citation handling matters.

## Preview, save, and validate

The preview pane is for testing and does not itself save the Gem. After revising the instruction or `Knowledge`, test representative requests and failure cases in preview, then save the Gem separately.

Select the checks that apply. Representative tests include:

- an ordinary in-scope request;
- missing or ambiguous input;
- an out-of-scope request;
- conflicting or incomplete `Knowledge`;
- a request whose expected format or citation behavior is easy to verify.

Confirm that the Gem uses `Knowledge` for its intended purpose, does not invent access to unavailable files or tools, and preserves the difference between hard requirements and preferences.

## Sharing, privacy, and file access

Do not put secrets, private data, or sensitive internal rules into Gem instructions or knowledge files unless the user understands the sharing and account-access implications. If the Gem may be shared, note that users with access can view its instructions and uploaded files. Editors can also change or delete them. Account type, organizational settings, and the kinds of attached files can affect which sharing options are available.

For Google Drive files, Gemini Apps Activity and the Google Workspace connection can affect access. A connected Drive file can supply its current contents rather than behaving as an immutable snapshot. Mention these details only when they affect setup, maintainability, privacy, or repeatability.

## Official source

- [Tips for creating custom Gems — Gemini Apps Help](https://support.google.com/gemini/answer/15235603)
- [Use Gems in Gemini Apps — Gemini Apps Help](https://support.google.com/gemini/answer/15146780)
- [Share a Gem from Gemini Apps — Gemini Apps Help](https://support.google.com/gemini/answer/16504957)
