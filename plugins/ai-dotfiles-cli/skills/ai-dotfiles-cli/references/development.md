# Development targets

Use for source links and developer plugin targets, not shared distribution or consumer copies. Read the installed command help for exact arguments.

`agent dev` lists configured targets without changing them. Select the local target key and verify its source and intended destination. That key can differ from the package name or Codex Marketplace identifier. The development index defaults to `~/.agents/ai-dotfiles/development.json`; link declarations are separately owned by `~/.agents/ai-dotfiles/skill-links.json`.

## Skill source links

Inspect `agent dev skill link help`. `link` is canonical; `links` is an alias. The bare command opens a human-facing menu.

- `status` and `check` inspect declarations and links; `validate` checks declarations only.
- `sync` creates missing links without replacing existing paths.
- `add <name> <source-directory>` records a declaration; a later `sync` creates its link.
- `update` changes a declaration and retargets an existing matching link.
- `remove` removes the declaration and matching link, never the source.

The shorter `agent dev skill status|check|sync` commands address the same links, not Skills copied from a Marketplace. The mutating declaration commands prompt; use their `--yes` only for an already-authorized scripted change. A declaration and its link are one management relationship: changing just the link can leave drift or let sync recreate it.

Use one active discovery path for a same-named skill. For an authorized plugin installation test, inspect only relevant standalone copies/links, preserve their contents and declarations, and make the selected path inactive before installing the plugin. Do not assume duplicate-name precedence. Removing a declaration is not a temporary disable; plan restoration explicitly. Prefer isolated test storage when possible.

## Developer plugin targets

- `agent dev plugin status <target>` reports the local snapshot.
- `agent dev plugin check <target>` validates the source.
- `agent dev plugin sync <target>` installs or refreshes it in Codex.

Plugin sync does not assemble a shared Marketplace. Repository-managed targets delegate to their configured runner and checks; direct targets provide portable validation and require an explicitly stored `bump` or `keep` version policy before sync. Do not infer that policy from an imported source reference. Source links with the same skill names must not remain active during plugin sync.

Neither path creates a missing developer-source catalog entry. The source must already match a local Marketplace entry. For new setup, preserve the repository's authoring/installation contract; consult an available `plugin-creator-agent-plugins` skill for portable setup, or the repository manager and current Codex help. Its absence does not justify editing a generated catalog or installing from a generated copy as though it were developer source.

Do not change source versions merely to inspect status or retry an uncertain install. A reported matching name/version is not evidence of enabled state, exact resource equality, or successful skill execution. Verify the properties requested; new-task discovery remains a separate integration check when needed.
