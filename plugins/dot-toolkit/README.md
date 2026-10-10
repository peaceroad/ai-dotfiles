# dot-toolkit

An unofficial, experimental setup and configuration toolkit for the user's ongoing personal assistant, dot. It manages instruction files and skill copies in dot's own cloud; it does not replace dot's built-in settings, permissions, or memory.

The Agent Plugins v1 package, version 0.1.0, contains one skill: `dot-guidelines`. This loader connects the ongoing main dot conversation to common guidance stored in its cloud. Installing the plugin does not create the common or private instruction files or install the task skills listed in the setup procedure.

You can use the setup procedure to place agent skills in `/workspace/.agents/skills/` to try skills under development or use file-based skills without registering them through the Web app. dot-toolkit organizes those files and their reference paths, reducing the need to explain where skills are stored on each request. Supported Web installation is another option. Cloud placement is separate from app registration, does not establish automatic discovery, and does not automatically duplicate or migrate existing installations.

The [current Japanese user guide](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/dot-toolkit/README.md) explains the cloud layout, setup choices, access boundaries, updates, and verification. It may describe a newer revision than this package. It also links to the separate `dot-setup.md` source; that procedure is not bundled in this plugin. For task-specific guidance when another agent handles part of the work, see [instruction scope and handoff](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/dot-toolkit/instructions.md#別のエージェントへ仕事を任せるとき).

## First setup

1. Install the plugin in a supporting client.
2. Attach `dot-setup.md` and explicitly ask: “Set up your cloud using this procedure.” The attachment governs; it is not replaced with the latest repository copy.
3. dot checks existing state and asks once about missing private instructions and additional skill candidates whose status is unknown. Choose now, later, or none separately for each. You do not need to create an empty file to say that private instructions are unnecessary.
4. Review the proposed sources, versions, requirements, and changes. Approve common and additional skill changes separately, or skip either group. A candidate list is not an installation request.

Setup follows your conversational language; the English examples do not require English replies. Source versions and later updates are explained in the [setup and update guide](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/dot-toolkit/setup.md).

Common configuration can be ready while private inputs or skill selections are pending. dot reports those parts separately rather than treating missing instructions as unnecessary or calling the entire setup complete. Only a concrete, known dependency on an unresolved private input pauses work; unknown future instructions do not block ordinary requests.

## Later changes and interrupted setup

Attach later private files with an explicit request to apply them. dot compares and updates that scope without repeating common setup or replacing unrelated edits. Any skill additions or updates still need the applicable group's approval.

For an update, specify the intended change or source; the procedure compares it with the existing configuration and adopted inventory. For a retry, retain the supplied procedure and recorded versions. dot checks the actual outcome before resuming unfinished work, rather than fetching newer versions or repeating changes blindly. Exact skill reproduction also needs the adopted manifest and any required restoration materials.

Version 0.1.0 identifies this initial plugin release. Repository commits identify revisions within it; the version label alone does not identify the contents of a trial ZIP. See `dot/dot-setup.md` for the full placement, comparison, recovery, and reproduction contract.

## Cloud files and ownership

The repository's `dot/AGENTS.md` and `dot/dot-setup.md` are public source templates. Setup places files at these exact locations in dot's cloud, not on the user's computer:

- `/workspace/AGENTS.md`: required canonical common guidance and task-loading rules
- `/workspace/.codex/AGENTS-private.md`: optional direct private instructions and/or conditional references
- `/workspace/.codex/dot-setup.md`: authorized setup, update, and reproduction procedure
- `/workspace/.codex/dot-setup-private.md`: supplied additional candidates, when any
- `/workspace/.agents/skills/`: complete managed skill folders, purpose summaries in `INDEX.md`, and adopted inventory in `skills-manifest.json`

The loader handles explicit initial setup before requiring files that setup creates. During normal work it reads the required canonical guidance and follows the optional-file and task-routing rules defined there. If the private instruction file or managed INDEX is genuinely absent, work continues without private additions or selection from an unknown cloud inventory. No replacement, alternate-location search, or skill installation follows from that absence. Client-exposed skills remain available even without a cloud INDEX; an existing empty INDEX is also valid. Selected skills and required references must be read in full before dependent work.

A read error or access denial is not absence. A previously used guidance file disappearing is not a fresh unconfigured state either. dot reports unreadable guidance, including optional files, and any missing required common guidance, selected skill, required reference, or previously used guidance file. Only dependent work pauses.

Keep each private input's state with the private setup records under `/workspace/.codex/` used for the common-source identity, reusing existing records when available. Distinguish inputs awaiting an answer or delivery, explicitly deferred, explicitly unnecessary, and supplied. Absence alone is not a choice of none. Do not create empty or status-only instruction or candidate files, or a new always-read status file, to represent these decisions. Consult the records during authorized setup or resumption, or when a concrete task depends on an unresolved input, rather than during unrelated work. Missing optional files do not cause repeated setup questions, and ordinary conversation does not authorize provisioning.

## Package and activation

The package contains three files:

- `plugin.json`: the Agent Plugins manifest
- `skills/dot-guidelines/SKILL.md`: the loader skill and its selection description
- `README.md`: this usage guide

There is no skill-level `agents/openai.yaml` in this package. It bundles no private instructions, managed skills, MCP server, or hooks. Do not commit private inputs, actual inventories, acquisition records, restoration materials, or generated ZIPs to the public source. The private-by-default skill inventory is distinct from the Agent Plugins manifest.

Use a client supporting [Agent Plugins v1](https://agent-plugins.org/specification) and [Agent Skills](https://agentskills.io/specification). Resolve any existing installation exposing `dot-guidelines` before activation.

## Verification status

Automated checks have covered the public files' structure and consistency and the evaluation code's behavior. Implicit skill selection in an actual main dot conversation, and continuity across conversation or environment boundaries, are not yet sufficiently verified. Source validation and cloud file placement do not establish client discovery, activation, or persistence. Report these outcomes separately, with the version and conditions actually checked; see the Japanese user guide for the acceptance checks.

## Official resources

For product setup, features, and safety controls, see OpenAI's documentation below. This repository's `/workspace` paths, loading rules, and setup procedure are `dot-toolkit` conventions, not built-in dot behavior.

- [Getting started with your dot](https://help.openai.com/en/articles/20001530-getting-started-with-your-dot)
- [Dots privacy, security, and safety FAQs](https://help.openai.com/en/articles/20001529-dots-privacy-security-and-safety-faqs)
- [Meet dots — ChatGPT Learn](https://learn.chatgpt.com/docs/dots)

## Background

The common instructions adapt response-quality and complete-reference-loading guidance from [ai-dotfiles common Codex instructions at a pinned revision](https://github.com/peaceroad/ai-dotfiles/blob/5af65a5d4f355f8063b0871ea5baac76d143d5fc/home/.codex/AGENTS.md). dot-specific scope, layout, and setup remain in the public templates. Their wording alone does not establish improved model performance.
