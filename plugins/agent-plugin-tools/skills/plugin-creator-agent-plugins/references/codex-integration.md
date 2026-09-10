# Integrate a Local Agent Plugin with Codex

Use for requested local installation, refresh, or integration testing after a portable source or assembled Marketplace exists. A local Marketplace registration makes its catalog available to Codex; it is distinct from publication and plugin installation. Package-format conversion is covered in [codex-migration.md](codex-migration.md).

## Choose the source and execution path

For an existing managed link or developer target, use [management boundaries](management-boundaries.md) to select the entrypoint. The source and installation boundaries below still apply; installing a plugin from an assembled Marketplace uses Codex directly.

| Input and purpose | Path |
| --- | --- |
| Iterative work on source skills | Existing user-scoped source links and repository validation. Use a new task to exercise revised instructions when needed. |
| Developer-controlled plugin source | Prefer its repository-owned manager after inspecting checks and side effects; otherwise use this skill's manager. |
| Assembled shared Marketplace | Register the assembled root and install with the current Codex CLI. Keep version policy and repository tests upstream. |

Direct-link testing does not establish plugin installation, MCP integration, client extensions, cache refresh, or Marketplace resolution. Use installation when those properties belong to the requested outcome. Source-only work does not require switching discovery paths.

For requested source-link setup or changes, prefer the existing local link manager after inspecting its help and effects. A manager may own both a declaration and the actual link; editing just one can leave drift or let a later sync recreate a removed link. Keep the selected source and its files intact.

Before installation or an installation test, inspect only the same-named standalone skills relevant to the plugin, including direct directories and managed links. Installing alongside them can expose different effective skill versions; do not rely on duplicate-name precedence. Use an isolated client environment when practical. Otherwise preserve user-edited contents, link targets, and manager declarations before making the selected discovery paths inactive within the authorized scope. Keep one discovery path active and retain a restoration plan. An unregister/remove command is not necessarily a temporary disable operation; confirm what it removes before using it. Do not remove unrelated links or installed skills. Registration alone does not activate another copy.

## Establish the installation inputs

Identify the exact plugin and Marketplace, source root, current version policy, and requested client. Validate the source and any required repository checks before installation effects. For a request that includes assembly, complete `sync` and the appropriate `check` before installing the generated copy; see [marketplace-distribution.md](marketplace-distribution.md).

Inspect the installed CLI's help for the operations needed. These examples match `codex-cli 0.153.4` help checked on 2026-09-06; they are not a promise for other builds:

```powershell
codex plugin --help
codex plugin marketplace list --json
codex plugin list --available --json
```

Read-only listing establishes the current registration and snapshot. Select by plugin and Marketplace identity, including source path where available, rather than array position. If a command or JSON contract changed, use the current documented equivalent or repair the repository wrapper before relying on its result.

### Provide the developer-source catalog entry

For a new developer source, the manager and repository scaffold require a local entry in `<marketplace-root>/.agents/plugins/marketplace.json`; neither creates it. If no matching entry exists, create or extend the catalog as part of the requested repository setup or local installation, preserving unrelated entries. A minimal catalog for `<marketplace-root>/plugins/my-plugin` is:

```json
{
  "name": "local-plugins",
  "plugins": [
    {
      "name": "my-plugin",
      "source": { "source": "local", "path": "./plugins/my-plugin" }
    }
  ]
}
```

The entry name must match root `plugin.json`. Resolve `source.path` from the selected Marketplace root, not from `.agents/plugins/`. This shape follows the [Codex Marketplace catalog documentation](https://learn.chatgpt.com/docs/enterprise/plugin-management) and the bundled manager's binding checks; it is not part of portable Agent Plugins v1. Use the intended existing Marketplace name when extending a catalog. Do not run the shared assembler to create this developer-source entry: it produces a generated copy. For an already assembled Marketplace, use its generated catalog without hand-editing it.

### Register and install

Register the intended root only when it is not already registered or discovered as the personal default Marketplace:

```powershell
codex plugin marketplace add 'C:\path\to\marketplace-root'
codex plugin add '<plugin-name>@<marketplace-name>'
```

An existing name pointing at another root needs reconciliation, not duplicate registration. Do not uninstall before an ordinary refresh; consider documented removal only after establishing that reinstalling cannot refresh the plugin. Do not hand-edit a client cache.

## Included developer manager

Run from the skill root or pass the script's absolute path:

```powershell
node scripts/manage-local-agent-plugin.mjs status 'C:\path\to\plugin-root'
node scripts/manage-local-agent-plugin.mjs validate 'C:\path\to\plugin-root'
node scripts/manage-local-agent-plugin.mjs install 'C:\path\to\plugin-root' --keep-version
```

These commands are alternatives by task, not a mandatory sequence. `install` includes portable validation and configured repository checks. Direct mode owns portable validation and Codex installation; it does not infer application tests, releases, or publication policy. Use [repository-management.md](repository-management.md) when those checks need a shared development entrypoint.

The manager finds a local Marketplace entry by walking source ancestors, then checking the personal default Marketplace. `--marketplace-root <root>` selects a different intended root. It never edits the catalog or installed cache directly, and refuses installation from a generated shared Marketplace copy.

### Version policy

`status` and `validate` do not change the version, registration, or installed state. For `install`, select policy from the request and repository:

- `--keep-version` preserves the source version, including an absent version.
- `--bump-version` replaces build metadata with one `+agent.<UTC timestamp>` suffix. It requires an existing source version and preserves its base before `+`.
- Explicit flags override repository `versionPolicy`. Without either, an existing managed suffix implies bump; otherwise the manager requires a choice.

The CLI's explicit-choice requirement does not by itself require a user question. Use an established policy; if none exists and the request does not call for a version change, use `--keep-version`. Adopt bump only for an authorized local-development policy supported by cache-freshness evidence. Do not add suffixes as a precaution or change portable version rules to match a client convention.

A higher-level index may require an explicit stored version policy. Preserve that contract instead of inferring permission from an imported source reference or a suffix; see [management boundaries](management-boundaries.md). Developer-manager inputs must still resolve to the source package's own Marketplace entry.

### What the command establishes

The manager validates before mutation, optionally updates root `plugin.json`, registers a matching non-default Marketplace if needed, calls Codex, and compares the reported installed manifest and snapshot with the source identity and version. It also checks a reported local source path when available. It does not check enabled state or component execution, and equal name/version values do not prove byte-for-byte resource equality.

For a refresh, inspect affected installed resources when freshness is in doubt. Check enabled state separately and verify required skills or MCP behavior in a new task. Do not create an extra task merely to satisfy this reference if the runtime requires explicit user authorization for task creation; report the remaining new-task check or use an already authorized test surface.

## Interruption and recovery

Installation is a sequence of effects, not a transaction across the source and client. The manager restores the original manifest only if validation immediately after its version change fails. A later registration, install, or snapshot failure can leave the new source version, Marketplace registration, or installed plugin in place.

After interruption or an uncertain result, inspect the source manifest, registration, install result when retained, and current snapshot before replaying. If the requested version is already installed, continue the missing verification. If installation remains incomplete, resume under the existing authority and version policy; avoid another bump merely to retry the same intended version. Use `--keep-version` for that retry when the current source is still the validated candidate and the repository contract permits it.

Serialize operations on the same source or client installation. This manager has no cross-process lock. A pending command must finish or be reconciled before a conflicting version change, reinstall, or restoration. New user input can change the remaining work but does not reverse effects already performed.

If a runtime denies a write, keep the completed source work and report the denied operation and available recovery command. Do not change locations or bypass the denial. Restore a prior installation or discovery path only within the authorized scope, using the recorded state rather than assumed defaults.

## Format compatibility

Preserve the portable root `plugin.json`; a native-format example in built-in `plugin-creator` instructions does not establish runtime rejection. `scripts/check-builtin-plugin-creator.mjs` inspects instruction wording only. For a conversion or documentation/runtime mismatch, use [codex-migration.md](codex-migration.md#interpret-evidence-and-recover). Report installed identity, version, tested build, and material verification limits.
