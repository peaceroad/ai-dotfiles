# Gemini Gem instructions and Knowledge

Use for classic Gemini Apps Gems with persistent Instructions and Knowledge. Read [Gemini prompt design](gemini-prompt-design.md) for instruction wording; select any media-input or generation supplement through the [entry point](../SKILL.md). This is an authoring reference; producing instruction text does not itself create, save, or share a Gem.

Official guidance checked: 2026-09-06. Gems from Google Labs are Opal-powered mini-app workflows, a different authoring surface. If that is the target, design its inputs, steps, outputs, and handoffs using its current guidance instead of assuming the classic Instructions/Knowledge setup applies. Infer the intended surface from context; clarify only if the distinction changes the work and remains unresolved.

## Define behavior across conversations

Put the Gem's repeated purpose, important constraints, output contract, and Knowledge usage in its Instructions. Define what each new request supplies and how to handle missing evidence or unavailable actions. Role and tone belong here only when they affect the result.

State which rules are requirements and which are defaults the user may override. Do not let material submitted for editing override the instructions, but honor an explicit user preference when the Gem's contract permits it. Ask for missing information only when it materially affects the result; do not turn Google's brainstorming or editing examples into mandatory interviews.

Treat the editor's automatic instruction rewrite as a draft. Check that it preserves scope, requirements, exceptions, and output intent before saving. Keep setup steps, attachment administration, and human-maintainer notes outside the model-facing text unless the Gem itself needs them.

## Assign roles to Knowledge

Use Knowledge for detailed criteria, terminology, examples, and background. Describe each source's role and any needed priority in Instructions, distinguishing normative guidance from evidence and examples. Keep the essential condition of a governing rule in Instructions and link to its supporting detail; avoid competing copies of the same rule.

Choose the split by how the material is used:

- Keep a concise, coherent reference together when most requests use it as a whole.
- Separate large or specialized material when conditional use or independent maintenance helps. Give each file a descriptive name and explain when it matters.
- Resolve conflicting rules at their governing source. Add an index or reading order when it clarifies file selection or dependencies, without creating another copy of the rules.

File names and consultation instructions guide source use; they do not prove that every relevant passage was retrieved. When testing a Gem that depends on long or multiple sources, include requests that require the important passages.

## Source access, updates, and sharing

When setup or sharing depends on these conditions, apply the entry point's verification rules to the relevant product facts:

- **Drive files:** The help documentation requires Keep Activity and the Google Workspace connection for adding them. Drive-backed sources use the current file version. For repeatable evaluations, identify the source revision or use a fixed copy.
- **Notebook sources:** The Gem help documentation still uses the name NotebookLM, now renamed Gemini Notebook. Confirm the attachment option in the intended surface. The current sharing help excludes notebook sources from shared Gems; do not promise that a personal notebook-backed Gem can be shared unchanged.
- **Shared Gems:** People with access can view Instructions and uploaded files; editors can change or delete them. File permissions and organizational Drive settings affect access. Include sensitive material only within the user's authorized sharing scope, and surface a visibility conflict when it affects the requested setup.

An attached source does not grant access to other files or conversations. Keep plan, account, region, file-limit, and connection details in setup notes when needed, rather than hard-coding them into reusable instructions.

## Citations and validation

Specify citations when the task needs them and the surface supports them. In the checked product, disabling Knowledge citations also disables citations for files uploaded later in that Gem's chats. Do not promise visible citations when that setting is off or invent a reference that was not consulted.

For an actual Gem setup or update, preview representative requests and save the change separately; previewing does not save the Gem. Choose checks that bear on the change: ordinary use, a permitted preference override, missing evidence, conflicting Knowledge, unavailable sources, or the required output/citation format. For a shared Gem, verify the intended recipient's source access when it is part of the authorized work.

Report the completed work and any material limits without a mandatory stage-by-stage recap. Describe prepared instruction files or a preview accurately; neither is a saved Gem.

## Official sources

- [Tips for creating custom Gems](https://support.google.com/gemini/answer/15235603)
- [Use Gems in Gemini Apps](https://support.google.com/gemini/answer/15146780)
- [Share a Gem](https://support.google.com/gemini/answer/16504957)
- [Gems from Google Labs](https://support.google.com/gemini/answer/16802014)
- [NotebookLM renamed Gemini Notebook](https://blog.google/innovation-and-ai/products/gemini-notebook/notebooklm-gemini-notebook/)
