# Gemini CLI instructions

Use for instructions consumed by Gemini CLI. Do not treat Antigravity CLI or a Gemini API application as the same runtime. The Gemini 4 design baseline does not establish that a particular CLI release or account exposes a chosen model; check availability when actual execution depends on it.

## Choose persistent context or a skill

Use the project's configured context surface for standing conventions and invariants, and a skill for task-specific expertise. Gemini CLI defaults to `GEMINI.md`, supports configured filenames, and combines global, workspace, and just-in-time context. Inspect what governs the target project before proposing a new file. Merely naming a file `AGENTS.md` does not prove it will be loaded with the current configuration.

Do not move a required repository constraint into a skill whose activation is optional. Conversely, a specialized migration procedure need not appear in every prompt. Keep imported context paths resolvable from their documented base and make necessary resources available in the intended installation.

## Account for discovery, activation, and permissions

The checked CLI contract discovers enabled skill names/descriptions at session start and uses `activate_skill` for matching work. Ordinary authored skills require consent before the body and bundled resources become available; built-in skills are pre-approved. Its discovery precedence, lowest to highest, is built-in, extension, user, then workspace; `.agents/skills/` wins over `.gemini/skills/` at the same tier.

Design descriptions for actual tasks and make each bundled resource's purpose clear. Activation consent is not blanket authorization for commands, network requests, or external mutations. Describe prerequisites and useful failure handling without adding a second approval system in prose. Do not promise execution merely because a script is bundled.

Prefer a focused procedure with task-specific decisions, required evidence, and a usable result. Keep tool details in their actual contracts and project facts in the project's source of truth. Avoid copying installation manuals or hard-coding the author's paths, shell, or credentials.

## Deliver and verify

Deliver the requested context patch or `SKILL.md` and resources, with placement notes separate from instructions. Do not rewrite client settings unless that operation is requested. An API system instruction is not a CLI skill installation.

For a skill, put `SKILL.md` at the directory root with YAML `name` and `description`, then Markdown instructions. Match the name to the directory and use relative paths for bundled resources. Include scripts, references, or assets only when needed. Additional metadata does not grant tool permissions; use the target CLI's actual policy contract.

When runtime testing is in scope, inspect the loaded context and discovered skill version, then check activation and representative execution separately. Include resource access and a task where the skill should remain unused. Use the target CLI's current inspection commands; changes to a file do not prove that a running session reloaded it. Report missing model access or permissions distinctly from instruction defects.

## Sources and refresh conditions

Recheck when placement, reload, activation, model availability, or policy behavior matters.

- [Project context](https://geminicli.com/docs/cli/gemini-md/): context hierarchy, imports, configurable filenames, and inspection.
- [Agent Skills](https://geminicli.com/docs/cli/skills/): discovery and activation contract.
- [Creating Agent Skills](https://geminicli.com/docs/cli/creating-skills/): frontmatter, directory structure, resources, and pre-approved built-ins.
- [Using Agent Skills](https://geminicli.com/docs/cli/using-agent-skills/): current management commands.
