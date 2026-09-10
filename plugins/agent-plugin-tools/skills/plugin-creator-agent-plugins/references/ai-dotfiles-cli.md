# Use the optional ai-dotfiles CLI

Use this reference when ai-dotfiles `agent` is available or owns the selected development workflow. It connects the commands to this skill's existing contracts; it is not a dependency, a replacement for those references, or a complete CLI manual.

This plugin bundles its validation, developer-installation, repository-scaffolding, and standalone-assembly helpers with their resources. Run those from the installed skill directory without an ai-dotfiles checkout. It does not bundle `agent`, `manage-skill-links.mjs`, the shared-Marketplace orchestrator, or the consumer Skill installer; do not assume these are available merely because this plugin is installed.

## Establish the tool and configuration owner

If an `agent` entrypoint is available, inspect `agent --help` and confirm that it is the ai-dotfiles CLI exposing `dev skill`, `dev plugin`, and `dev marketplace`; another program named `agent` is not interchangeable. Use the installed help for supported syntax, and prefer explicit actions and targets over opening menus for routine execution. If it is unavailable, inspect the selected configuration directly rather than attempting CLI discovery through missing commands.

With the CLI and an existing development index, `agent dev` lists configured targets without changing them. Select by the local target key and verify its source and intended destination. Target keys can differ from package names and the Marketplace identifier used by Codex. Relevant default configuration locations are:

- `~/.agents/ai-dotfiles/development.json`: local plugin and Skill sources, Marketplace connections, assignments, and management modes.
- `~/.agents/ai-dotfiles/skill-links.json`: user-scoped source-link declarations, separate from Marketplace assignments.
- `<marketplace-root>/.agents/marketplace-development/config.json`: the shared reference that `agent dev marketplace sync` generates or updates with `managedBy: "ai-dotfiles/agent-dev"`, without publishing private local source paths.

The marker declares the management workflow; it is readable without the CLI but is not authentication or proof of who wrote the file. The bundled assembler's standalone `init` creates a source-based configuration without this marker. Its schema describes both forms; it does not add the marker to a configuration. Respect configured overrides and inspect only configuration relevant to the task.

Choose the path from the available evidence:

- For an existing manager-owned target, prefer its manager. If the CLI is absent, use a known standalone entrypoint only when it preserves the same contract; otherwise report the unavailable management operation. The direct assembler rejects a marked reference as its normal source configuration. Do not work around that refusal with an improvised `--config` file.
- For a new standalone setup or an existing source-based configuration whose format and workflow have been verified, use the repository commands or bundled helpers in the other references. A missing marker alone is not sufficient to classify an existing target as standalone.
- If the selected configuration cannot be read or its format or management workflow is unclear, leave that existing shared target unchanged and report the uncertainty. Continue independent source work or validation.

Do not install ai-dotfiles automatically, adopt an unrelated target because its CLI is present, or remove a management marker to bypass these boundaries.

## Source links

For requested link setup or changes, inspect `agent dev skill link help`. `agent dev skill link` opens the human-facing menu; `link` is canonical and `links` is an alias. `status` and `check` inspect declarations and links; `validate` checks the declaration file only. `sync` creates missing links without replacing existing paths. The shorter `agent dev skill status|check|sync` commands act on these same links, not Marketplace Skill copies.

`add <name> <source-directory>` records a source but needs `sync` to create its link. `update` changes a declaration and retargets an existing matching link; `remove` removes the declaration and matching link, never the source. These three actions prompt for confirmation; use `--yes` only for an already-authorized scripted change. Apply the discovery-path and restoration rules in [Codex integration](codex-integration.md#choose-the-source-and-execution-path), especially before a plugin installation test.

## Developer plugin targets

Use `agent dev plugin status <target>` for the reported local snapshot, `check <target>` for validation, and `sync <target>` for Codex installation or refresh. **Plugin sync installs locally; it does not assemble a shared Marketplace.**

For a repository-managed target, these delegate to its runner and checks; see [repository management](repository-management.md). A direct target's check covers portable validation only, and its sync requires an explicit stored `bump` or `keep` policy. Preserve that gate and any same-named source-link refusal. Neither form creates a missing developer-source catalog entry; use [Codex integration](codex-integration.md) for catalog binding, version policy, installation evidence, and recovery.

## Shared Marketplace targets

Use `agent dev marketplace status <target>` for metadata and `check <target>` for a read-only consistency report. Retain the complete report, including scope and failed step, when the share is inaccessible or consistency cannot be verified; unavailable data does not establish missing or matching contents.

`agent dev marketplace configure [<target>]` is the interactive entrypoint for local source targets, Marketplace connections, assignments, and management modes. `setup` is an alias. It does not assemble packages or register the Marketplace in Codex. Use it only when configuration changes are requested or needed within authorized setup; a missing target is not permission to choose new ownership.

`agent dev marketplace sync <target>` assembles the shared distribution through the orchestrator. In `authoritative` mode, an unscoped sync uses the complete local assignment set. In `contributor` mode, it processes only local assignments as successive scoped operations and preserves unassigned entries. Consumer mode rejects development check/sync. Add `--plugin <local-target>` or `--skill <local-target>` for one assigned package; successful scoped work does not certify unrelated contents. Use [Marketplace distribution](marketplace-distribution.md) for copy guarantees and [orchestration](marketplace-orchestration.md) for configuration ownership and recovery, not as alternate commands that bypass the orchestrator.

If full sync stops on a shared revision change, `agent dev marketplace check <target> --interactive` offers importing shared assignments or explicitly switching to contributor. Unlike plain check, accepting a choice writes local configuration and revision state. Importing assignments does not update local source contents: review or update those repositories before syncing them back. Status and plain check never accept a revision, and changes do not automatically switch the management mode.

## Published content on a consumer machine

`agent marketplace list [<target>]` or `agent marketplace skill list [<target>]` lists standalone Skills. Use `agent marketplace skill install|update <skill-name> [<target>]` or `remove <skill-name>` for managed local copies. These commands verify the custom Skill catalog, protect unmanaged or locally changed destinations, and serialize local mutations. They neither create development links nor update the shared source.

For plugins, register the assembled Marketplace and install through Codex as described in [Codex integration](codex-integration.md). Adding a connection to the ai-dotfiles index is not Codex registration. Without ai-dotfiles, plugin consumers can still use Codex directly; standalone Skill consumers need an equivalent checked installer for this custom catalog, not an assumed standard Agent Skills installation command.
