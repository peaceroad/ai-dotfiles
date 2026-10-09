# dot-toolkit

An Agent Plugins v1 package for the user's ongoing personal assistant, dot. Version 0.1.0 contains one skill, `dot-guidelines`, which loads common guidance from dot's own cloud. It does not govern ordinary Codex tasks, delegated tasks, or subagents.

The plugin is the entry point; common and private instructions live separately in the cloud. Installing it does not by itself create those files or install the task skills listed in the setup procedure.

The [Japanese user guide](https://github.com/peaceroad/ai-dotfiles/blob/ff7340184e989c9436059239d2f8ef83eec8f9d5/docs/dot-toolkit/README.md) explains the cloud layout, setup choices, access boundaries, updates, and verification. It also links to the separate `dot-setup.md` source; that procedure is not bundled in this plugin.

## First setup

1. Install the plugin in a supporting client.
2. Attach `dot-setup.md` and explicitly ask: “Set up your cloud using this procedure.” The attachment governs; it is not replaced with the latest repository copy.
3. Dot checks existing state and asks once about missing private instructions and additional skill candidates. Choose now, later, or none separately for each. You do not need to create an empty file to say that private instructions are unnecessary.
4. Review the proposed sources, versions, requirements, and changes. Approve common and additional skill changes separately, or skip either group. A candidate list is not an installation request.

The procedure fetches common instructions from its verified repository/path/commit. That configuration pin is independent of skill versions and does not rely on default-branch contents. Use the user's conversational language; English examples do not prescribe replies.

Common configuration can be ready while private inputs or skill selections are pending. Dot reports those parts separately rather than treating missing instructions as unnecessary or calling the entire setup complete. Pending private inputs pause only work that needs them.

## Later changes and interrupted setup

Attach later private files with an explicit request to apply them. Dot compares and updates that scope without repeating common setup or replacing unrelated edits. Any skill additions or updates still need the applicable group's approval.

For an update, specify the intended change or source; the procedure compares it with the existing configuration and adopted inventory. For a retry, retain the supplied procedure and recorded versions. Dot checks the actual outcome before resuming unfinished work, rather than fetching newer versions or repeating changes blindly. Exact skill reproduction also needs the adopted manifest and any required restoration materials.

Version 0.1.0 identifies this initial plugin release. Repository commits identify revisions within it; the version label alone does not identify the contents of a trial ZIP. See `dot/dot-setup.md` for the full placement, comparison, recovery, and reproduction contract.

## Cloud files and ownership

The repository's `dot/AGENTS.md` and `dot/dot-setup.md` are public source templates. Setup places files at these exact locations in dot's cloud, not on the user's computer:

- `/workspace/AGENTS.md`: canonical common guidance and task-loading rules
- `/workspace/.codex/AGENTS-private.md`: direct private instructions and/or conditional references, or an explicit pending/none status
- `/workspace/.codex/dot-setup.md`: authorized setup, update, and reproduction procedure
- `/workspace/.codex/dot-setup-private.md`: additional candidates or their current status
- `/workspace/.agents/skills/`: complete managed skill folders, purpose summaries in `INDEX.md`, and adopted inventory in `skills-manifest.json`

The loader handles explicit initial setup before requiring files that setup creates. During normal work it reads canonical guidance and follows its task-specific routing. Private instructions can be written directly or refer to other documents under stated conditions. INDEX summaries and descriptions help select task skills; the selected instructions and required references are then read in full. Ordinary conversation or a missing file does not authorize provisioning.

## Package and activation

The package contains three files:

- `plugin.json`: the Agent Plugins manifest
- `skills/dot-guidelines/SKILL.md`: the loader skill and its selection description
- `README.md`: this usage guide

There is no skill-level `agents/openai.yaml` in this package. It bundles no private instructions, managed skills, MCP server, or hooks. Do not commit private inputs, actual inventories, acquisition records, restoration materials, or generated ZIPs to the public source. The private-by-default skill inventory is distinct from the Agent Plugins manifest.

Use a client supporting [Agent Plugins v1](https://agent-plugins.org/specification) and [Agent Skills](https://agentskills.io/specification). Resolve any existing installation exposing `dot-guidelines` before activation. Source validation and cloud file placement do not establish client discovery, activation, or persistence; installation is a separate action.

## Background

The common instructions adapt response-quality and complete-reference-loading guidance from [ai-dotfiles common Codex instructions at a pinned revision](https://github.com/peaceroad/ai-dotfiles/blob/5af65a5d4f355f8063b0871ea5baac76d143d5fc/home/.codex/AGENTS.md). Dot-specific scope, layout, and setup remain in the public templates. Their wording alone does not establish improved model performance.
