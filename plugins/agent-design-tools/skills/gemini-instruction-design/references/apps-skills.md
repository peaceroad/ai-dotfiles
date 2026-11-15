# Gemini Apps Skills

Use for reusable Gemini Apps instructions. An Apps Skill that authors prompts for another tool needs that tool's prompt guidance too; designing such a skill does not establish that Apps can execute the tool.

## Design selection and the recurring job

Choose a coherent recurring outcome. Write the name and description so Gemini can recognize requests that need this skill without reading its body. The checked Apps guidance describes metadata first, instructions when relevant, then resources as needed. It recommends a short description of one or two sentences, within 1,024 characters.

Distinguish what the skill does from what its output does. A skill that *writes meeting-summary prompts* should not activate simply to summarize meeting notes. Use realistic user phrasing and a nearby exclusion when needed; avoid broad descriptions such as “help with Gemini” or “use for all documents.”

Put recurring behavior, essential constraints, output expectations, and resource-selection conditions in the instructions. Keep each request's source material and changing preferences in the task input. Preserve the difference between a requirement and a default that users may override. Treat an editor's automatic rewrite as a draft and compare it against that contract.

## Assign resources a role

Use references for substantial criteria, terminology, examples, and background. Name the situation in which each is needed and distinguish governing guidance from evidence or examples. Keep the essential condition of a rule in the instructions, its detail in one reference. Split material for meaningful conditional use, not to satisfy a file-count target.

If the skill relies on another skill, establish its availability and how it is selected. Otherwise include the necessary guidance in the deliverable. Do not emit links to the author's `prompt-design` installation or Codex-specific tools. A reference filename is a reading instruction, not proof that the material was retrieved.

## Deliver the requested form

For editor content, provide the name, description, instructions, and any necessary attachment mapping. For a portable file package, place `SKILL.md` at its root, with YAML `name` and `description` followed by Markdown instructions. Use a lowercase hyphenated name matching the folder and relative paths to bundled resources. Follow the Agent Skills format for portability, but verify destination support for optional fields; do not copy Codex's `agents/openai.yaml` into the Apps contract.

The checked upload contract accepts a skill file, folder, or ZIP and limits combined uploads to 100 MB. ZIP packaging does not make archives valid reference attachments. Check every resource's format: `.py` and `.js` are supported, while `.ts`, `.tsx`, `.jsx`, `.sql`, audio/video, and legacy Office files are among the unsupported types. Adapt an unsupported resource to a usable supported form; renaming its extension does not make code executable. Scripts cannot depend on internet access. Skills work with Keep Activity off, but connected features requiring it do not.

The help documents Drive, Photos, and Notebooks attachment selectors. Downloaded ZIPs exclude connected Drive files and notebooks, so identify those dependencies separately rather than claiming the ZIP contains everything needed. The help gives differing instructions for updating files; verify the target UI when that operation matters. For text-only authorship, keep setup uncertainty in delivery notes.

For sharing, establish intended visibility of instructions and resources, recipient access, and the supported sharing mechanism before claiming the package works for recipients. Attaching one source does not grant access to unrelated files or chats.

## Check selection separately from task success

Review the generated instructions against an ordinary request, a nearby non-target request, missing material, conflicting reference content, and a permitted user preference change when relevant. Check whether the output can be used without inaccessible dependencies. For example, a brand-writing skill needs both the required brand passages and a way to handle a missing approved product claim.

When Apps execution is authorized and available, distinguish import, save, enablement, automatic selection, reference use, and task completion. Explicitly invoking a skill does not test automatic selection; a prepared ZIP does not prove successful import. Report the stage actually observed.

## Sources and refresh conditions

Recheck for import, sharing, connected sources, execution capabilities, or changed UI behavior; ordinary wording can use the bundled design guidance.

- [Writing effective skills](https://support.google.com/gemini/answer/17102773?hl=en): selection, focus, description, and resource loading.
- [Create and manage skills](https://support.google.com/gemini/answer/17094296?hl=en): supported uploads, connected sources, downloads, sharing, and execution restrictions.
- [Agent Skills specification](https://agentskills.io/specification): portable file structure and metadata; optional fields still need destination support.
