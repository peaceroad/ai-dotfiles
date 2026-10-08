# dot-toolkit

An Agent Plugins v1 package for the user's ongoing personal assistant, dot. The name leaves room for future capabilities; version 0.1.0 provides one skill, `dot-guidelines`.

## Contents

- `plugin.json`: portable Agent Plugins manifest
- `skills/dot-guidelines/SKILL.md`: a thin loader for dot's own cloud instructions

The skill applies only to the main ongoing dot conversation. It does not govern ordinary Codex tasks, delegated child tasks, or subagents.

## Required cloud layout

The following are separately provisioned files in this dot's own cloud, not files bundled in this plugin or paths on the user's computer:

- `/workspace/AGENTS.md`: canonical common instructions
- `/workspace/.codex/AGENTS-private.md`: private instruction routing and references to task-specific private documents
- `/workspace/.codex/dot-setup.md` and `/workspace/.codex/dot-setup-private.md`: authorized setup, update, and reproduction procedures and inputs
- `/workspace/.agents/skills/INDEX.md` and `/workspace/.agents/skills/skills-manifest.json`: managed skill discovery and inventory
- `/workspace/.agents/skills/<skill-name>/`: complete managed skill folders

Task-specific private documents are loaded only under the conditions defined in `AGENTS-private.md`.

The loader reads only task-relevant guidance. It does not provision missing files, search alternative configuration locations, or install tools. Loading a file does not authorize actions. Missing required inputs are reported, and only dependent work pauses.

## Public templates and setup

The ai-dotfiles repository keeps the editable public templates outside the plugin:

- `dot/AGENTS.md` is deployed as `/workspace/AGENTS.md`.
- `dot/dot-setup.md` is deployed as `/workspace/.codex/dot-setup.md`.

Repository paths are authoring locations, not alternate runtime locations. For authorized setup, provide these two documents plus your own `AGENTS-private.md` and `dot-setup-private.md`. If no private conditions apply, say so in the routing file; if no additional skills are selected, say so in the setup inputs. Keep task-specific private documents and their references in those private inputs. Review existing files before adopting an update, and follow `dot/dot-setup.md` for placement, verification, and pinned-version reproduction.

Do not commit private inputs, actual skill inventories, acquisition records, restoration materials, or generated package archives to this public source. The setup procedure defines a project-specific `skills-manifest.json` format; it is separate from the Agent Plugins manifest and is private by default.

## Packaging and activation

This package contains no private instructions, managed skill copies, MCP server, or hooks. The external cloud paths are runtime prerequisites, not package components. Installing the package is a separate action; source validation alone does not establish client discovery, activation, or persistence of the cloud files.

Use a client that supports [Agent Plugins v1](https://agent-plugins.org/specification) and [Agent Skills](https://agentskills.io/specification). If another installation already exposes `dot-guidelines`, resolve that overlap explicitly before activating this package.

## Background

The public common instructions adapt the response-quality and complete-reference-loading guidance from [ai-dotfiles common Codex instructions at a pinned revision](https://github.com/peaceroad/ai-dotfiles/blob/5af65a5d4f355f8063b0871ea5baac76d143d5fc/home/.codex/AGENTS.md). The dot-specific scope, runtime layout, and setup contract are maintained in the public templates above. Their English wording does not prescribe the language of replies or establish better model performance.
