# Integrate a Local Agent Plugin with Codex

Use this reference after validating a portable Agent Plugins v1 source package that must be tested through a local Codex marketplace. Registering a marketplace here makes a local path or Git source recognizable to Codex; it does not by itself upload the plugin to a public directory.

This reference owns recurring Codex operations after a portable source exists: marketplace registration, installation, refresh, snapshot inspection, and new-task verification. It does not convert a Codex-native package. For that one-time structural change, read [codex-migration.md](codex-migration.md) first.

## Check before installation

1. Read the repository instructions and inspect any existing management scripts.
2. Confirm that the marketplace entry points to the same source of truth being edited.
3. Validate the portable `plugin.json`, contained skills, and `mcp.json` when present.
4. Check `codex plugin --help` and the relevant subcommand help for the installed CLI. Prefer the current CLI when its command syntax differs from these examples. Keep the Agent Plugins specification authoritative for the portable package itself.

Useful read-only probes in versions that expose them include:

```powershell
codex plugin --help
codex plugin marketplace list --json
codex plugin list --available --json
```

Command availability and JSON fields can change. Inspect help and identify entries by plugin and marketplace names rather than relying on array position.

## Marketplace registration

List local marketplaces and their roots:

```powershell
codex plugin marketplace list
```

If the repository marketplace is not registered, add its root:

```powershell
codex plugin marketplace add 'C:\path\to\repository'
```

Do not add a duplicate when the client already discovers the personal default marketplace. If the existing marketplace name or root is uncertain, inspect the list instead of guessing and creating another entry.

## Install or refresh

If the repository supplies a script that combines validation and reinstallation, inspect its help and side effects, then prefer it. Otherwise, confirm the marketplace and plugin names before installing:

```powershell
codex plugin add '<plugin-name>@<marketplace-name>'
```

Use a repository-owned script or this skill's manager only with a developer-controlled source package. A consumer installing from an assembled shared Marketplace should register that Marketplace and use the Codex CLI directly. Do not use the developer manager to install from the generated copy: its optional local version policy and source-oriented checks belong upstream, before Marketplace assembly. If the shared root has not been assembled yet, follow [marketplace-distribution.md](marketplace-distribution.md) first.

Do not uninstall before an ordinary update. Consider the current CLI's documented removal flow only after confirming that reinstalling cannot refresh the plugin.

If an old cache remains, do not edit `~/.codex/plugins/cache/` or copy from it back to the source repository. Use the repository's update script when it manages a single cachebuster. In general-purpose work, do not append version suffixes unless the target client requires them.

Do not change the portable version during `status` or `validate`. Change it during `install` only when Codex demonstrably uses the version for cache freshness and the repository has chosen an automatic local-development policy. When a repository uses a suffix such as `0.1.0+agent.<UTC timestamp>`:

- Preserve the repository's base-version policy.
- Replace one existing local-development suffix rather than appending suffixes repeatedly.
- Validate the source before changing the version, update root `plugin.json` once, validate the updated manifest, install, and compare the installed snapshot with the new source version.
- Do not create or update `.codex-plugin/plugin.json` as a cachebuster.

Prefer a repository-owned management script for this sequence when one exists. If that script depends on this skill's validator and the validator is unavailable, fail with the expected path and remediation; do not copy a validator from an installed cache or unrelated checkout.

After installation, use `codex plugin list --available --json` or its current equivalent to confirm the intended plugin and marketplace, source version, enabled state, and local source path when applicable. Verify the result in a new Codex task. A task that was already running may retain skill instructions or tool definitions loaded at startup.

## Included local-development manager

When a developer-controlled Agent Plugins v1 repository has no management script of its own, use the common manager included with this skill. Run it from the skill root or pass its absolute path:

```powershell
node scripts/manage-local-agent-plugin.mjs status 'C:\path\to\plugin-root'
node scripts/manage-local-agent-plugin.mjs validate 'C:\path\to\plugin-root'
node scripts/manage-local-agent-plugin.mjs install 'C:\path\to\plugin-root' --bump-version
```

If the repository must run the same repository-specific checks on every validation and install, use the optional self-contained scaffold in [repository-management.md](repository-management.md). Do not add configuration merely to avoid passing a plugin path once.

The manager discovers a local marketplace entry by walking from the plugin root toward its ancestors and then checking the default personal marketplace. Use `--marketplace-root <root>` when the intended root must override that order. It never edits marketplace files or installed caches.

`status` and `validate` are read-only. `install` validates the portable package, registers a matching non-default local marketplace when needed, installs the plugin, and compares the Codex snapshot and installed manifest with the source. It replaces existing build metadata with `+agent.<UTC timestamp>` only when `--bump-version` is specified or the current version already uses that managed suffix. Use `--keep-version` for a repository that does not use version-based local cache freshness. For a new repository without either policy, the manager stops and requires an explicit choice; it does not invent a version.

In direct mode, this manager owns only the reusable Agent Plugins v1 validation and Codex installation boundary. It does not infer a repository's application tests, generated files, MCP behavior checks, release process, or publication policy. When those checks must share the same entrypoint, use the explicit Repository development contract in [repository-management.md](repository-management.md).

## Format boundary

Do not replace the portable Agent Plugins v1 source of truth merely because the built-in OpenAI `plugin-creator` or another Codex document describes `.codex-plugin/plugin.json`. Treat root `plugin.json` support as the expected baseline for the current Codex plugin runtime, and do not add the Codex manifest to the portable source as a precaution. A separate client-native package is appropriate only for an explicitly targeted historical or different client that still requires it.

`node scripts/check-builtin-plugin-creator.mjs` inspects only whether the built-in skill instructions describe Agent Plugins v1. It does not prove support in the Codex runtime. Verify runtime behavior separately with the installed CLI and an actual local installation.

Official OpenAI documentation, built-in skill instructions, CLI command availability, successful installation, installed snapshots, and component discovery answer different questions and can temporarily disagree. Do not use documentation wording alone to infer runtime rejection, and do not use one successful installation to claim support across untested Codex versions or publishing surfaces. For migration from `.codex-plugin/plugin.json`, read [codex-migration.md](codex-migration.md) and use its portable-only verification gate; the final portable source must not retain the Codex manifest.
