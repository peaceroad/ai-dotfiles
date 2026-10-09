# dot-toolkit

An Agent Plugins v1 package for the user's ongoing personal assistant, dot. The name leaves room for future capabilities; version 0.1.0 provides one skill, `dot-guidelines`.

## Contents

- `plugin.json`: portable Agent Plugins manifest
- `skills/dot-guidelines/SKILL.md`: a thin loader for dot's own cloud instructions

The skill applies only to the main ongoing dot conversation. It does not govern ordinary Codex tasks, delegated child tasks, or subagents.

## Required cloud layout

Setup prepares the following files in this dot's own cloud. They are not bundled in this plugin and are not paths on the user's computer:

- `/workspace/AGENTS.md`: canonical common instructions
- `/workspace/.codex/AGENTS-private.md`: private instruction routing, or an explicit pending/none status recorded during authorized setup
- `/workspace/.codex/dot-setup.md`: authorized setup, update, and reproduction procedure
- `/workspace/.codex/dot-setup-private.md`: supplied additional candidates or their current pending/deferred/no-additions status
- `/workspace/.agents/skills/INDEX.md` and `/workspace/.agents/skills/skills-manifest.json`: managed skill discovery and inventory
- `/workspace/.agents/skills/<skill-name>/`: complete managed skill folders

Task-specific private documents are loaded only under the conditions defined in `AGENTS-private.md`.

For an explicitly requested initial setup with a supplied `dot-setup.md`, the loader starts from that procedure before requiring files setup will create. During ordinary work it reads only task-relevant guidance and never provisions missing files, searches alternative configuration locations, or installs tools. Loading a file does not authorize actions. Missing required inputs pause only dependent work, and pending private inputs are never treated as none.

## Public templates and setup

The ai-dotfiles repository keeps the editable public templates outside the plugin:

- `dot/AGENTS.md` is deployed as `/workspace/AGENTS.md`.
- `dot/dot-setup.md` is deployed as `/workspace/.codex/dot-setup.md`.

Repository paths are authoring locations, not alternate runtime locations. To start:

1. Install `dot-toolkit` in a supporting client.
2. Attach only `dot-setup.md` and explicitly ask: “この手順で初期設定して。”
3. Dot retrieves the common instructions from the repository/path/commit identified in that supplied procedure, checks existing state, and asks once about missing private instructions and additional candidates: supply now, later, or none. Each can be chosen separately; dot records the actual choice without requiring an empty file from the user.
4. Review the common and additional skill candidates separately. Only explicitly approved additions or updates are placed; either group can be skipped. Common configuration can proceed while independent private inputs are pending.

The attachment remains the governing procedure; it is not replaced with the latest upstream copy. Its common-instruction pin is separate from selected skill versions and works before or after a default-branch merge. A later private-file attachment plus an apply request updates only that scope after comparison, without repeating common setup. Keep task-specific private documents and their references in private inputs. Follow `dot/dot-setup.md` for placement, verification, recovery, and pinned-version reproduction.

Do not commit private inputs, actual skill inventories, acquisition records, restoration materials, or generated package archives to this public source. The setup procedure defines a project-specific `skills-manifest.json` format; it is separate from the Agent Plugins manifest and is private by default.

## Packaging and activation

This package contains no private instructions, managed skill copies, MCP server, or hooks. The cloud files support normal loading; the explicit setup entry creates the authorized missing files first. They are not package components. Installing the package is a separate action; source validation alone does not establish client discovery, activation, or persistence of the cloud files.

Use a client that supports [Agent Plugins v1](https://agent-plugins.org/specification) and [Agent Skills](https://agentskills.io/specification). If another installation already exposes `dot-guidelines`, resolve that overlap explicitly before activating this package.

## Background

The public common instructions adapt the response-quality and complete-reference-loading guidance from [ai-dotfiles common Codex instructions at a pinned revision](https://github.com/peaceroad/ai-dotfiles/blob/5af65a5d4f355f8063b0871ea5baac76d143d5fc/home/.codex/AGENTS.md). The dot-specific scope, runtime layout, and setup contract are maintained in the public templates above. Their English wording does not prescribe the language of replies or establish better model performance.
