# Repository-owned local management

Use this reference when an Agent Plugins v1 repository needs repeatable local validation or installation with repository-specific checks. Keep this development contract outside the portable plugin manifest.

This is a developer-source workflow. It owns repository validation and local installation, not the assembly of copies for a shared Marketplace. After the configured checks pass, use [marketplace-distribution.md](marketplace-distribution.md) as a separate distribution step when the package must be shared.

## Choose the smallest path

- For a package that needs only portable validation or a one-time local install, call `scripts/manage-local-agent-plugin.mjs` with the plugin root. Do not add repository configuration.
- When validation must consistently include repository-owned tests, generated-file checks, or a local version policy, scaffold a repository-owned runner and configuration.
- Preserve an existing repository management command when it provides behavior the template cannot express. Migrate only after matching its observable validation and installation guarantees.

## Scaffold a self-contained repository runner

From this skill directory, initialize a repository that already contains its plugin and local Marketplace entry:

```powershell
node scripts/scaffold-local-agent-plugin.mjs init 'C:\path\to\repository' 'plugins\my-plugin' --bump-version
```

Use `--keep-version` instead when the repository does not use version-based local cache freshness. `init` refuses an existing configuration for the same plugin, reuses byte-identical managed files, and validates the new configuration before returning. It creates:

```text
.agents/
└── plugin-development/
    ├── my-plugin.json
    └── schema.json
scripts/
├── local-plugin.mjs
└── validate-agent-plugin.mjs
```

The runner, validator, and schema are generated files. Keep repository-specific behavior out of them. Their source tests remain in this skill rather than being copied into every repository. Refresh the generated files explicitly after this skill changes:

```powershell
node scripts/scaffold-local-agent-plugin.mjs refresh 'C:\path\to\repository'
```

`refresh` leaves every per-plugin configuration unchanged, updates changed shared files, and validates all configured plugins in filename order. It skips byte-identical files and refuses target files that do not carry the template marker. Review source changes before refreshing a repository with release or compatibility constraints.

Use the read-only mode in reviews or CI to detect missing, changed, or unmanaged generated files without updating them:

```powershell
node scripts/scaffold-local-agent-plugin.mjs refresh 'C:\path\to\repository' --check
```

This mode compares templates byte for byte only: it makes no writes and does not run Repository checks. Run `node scripts/local-plugin.mjs validate` separately when CI must also validate the portable package and Repository-specific contract. The comparison requires this skill's template source. During development, pin a Git commit or immutable artifact because metadata alone does not identify a changing working copy. After a skill version is published, increment it whenever a template or generated behavior changes; CI can then pin that published artifact instead of assuming Repository files alone prove they match the latest template.

## Repository configuration

`.agents/plugin-development/<plugin-name>.json` is the repository-owned source of truth for local development of one plugin. Its filename must match the `name` in that plugin's `plugin.json`. These files and the shared `schema.json` are not Agent Plugins v1 components and must not be represented in portable `plugin.json`.

Keep the custom `.agents/plugin-development/` directory at the Repository root. The `.agents/` tree is not Marketplace-only: documented subtrees include `.agents/plugins/` for Repository Marketplace catalogs and `.agents/skills/` for Repository-scoped skills. `plugin-development/` is this skill's convention, not a directory discovered by Agent Plugins or Codex. Its separate name keeps the development contract outside the portable package and the documented discovery subtrees. This placement also works when a multipurpose Repository contains one or more plugins.

If the current execution environment cannot write the Repository's `.agents/` subtree, do not switch to a different source-of-truth location or silently choose a fallback file. Use `prepare` to write only a new pending configuration to an explicit writable path; it does not create or update the Repository scaffold files:

```powershell
node scripts/scaffold-local-agent-plugin.mjs prepare 'C:\path\to\repository' 'plugins\my-plugin' 'C:\path\to\pending-config.json' --bump-version
```

The pending output directory must already exist, the output must be outside `.agents/plugin-development/`, and `prepare` never overwrites an existing file. It validates the portable plugin and its Marketplace binding before writing the same base configuration that `init` would use. If that plugin already has a Repository configuration, `prepare` fails because the normal `import` path cannot consume a replacement. Add any required Repository checks to a newly prepared file, then ask the user to import it from a terminal that can write the Repository:

```powershell
node scripts/scaffold-local-agent-plugin.mjs import 'C:\path\to\repository' 'C:\path\to\pending-config.json'
```

`import` derives the target filename from the selected plugin's `plugin.json`, normalizes Repository-relative paths, creates missing managed files, and validates the imported configuration. It refuses an existing target or modified managed file, rolls back the copied configuration if validation fails, and retains the pending source in every case. After success, the user may remove that temporary source and run the Repository's normal installation command. The scaffold adds command-specific recovery guidance when `EACCES` or `EPERM` prevents a write. If no pending file can be written safely, stop and provide the equivalent `init` command or exact manual steps instead.

```json
{
  "$schema": "./schema.json",
  "schemaVersion": 1,
  "pluginRoot": "plugins/my-plugin",
  "versionPolicy": "bump",
  "minimumNodeMajor": 24,
  "checks": [
    {
      "name": "repository tests",
      "command": "${NODE}",
      "args": ["scripts/validate-repository.mjs"]
    }
  ]
}
```

- `pluginRoot` selects the portable package in a Repository that may contain other files or plugins. Plugin name, version, and other package metadata are always read from that package's `plugin.json`; do not duplicate them in this configuration.
- `marketplaceRoot` is optional and defaults to the repository root. Set it only when the Marketplace catalog lives under a different repository directory. The selected plugin path and manifest name must match exactly one local entry in that catalog.
- `pluginRoot`, `marketplaceRoot`, check `cwd`, and path-like check commands are repository-relative and may not escape the repository, including through links.
- `versionPolicy` is `bump` or `keep`. Explicit CLI flags override it.
- `minimumNodeMajor` is optional and applies whenever the configuration is used.
- `checks` run after portable package and Marketplace-entry validation during `validate` and `install`. They run in order and stop at the first failure. During `install`, every check completes before version, Marketplace, or installed-state changes begin.
- `${NODE}` selects the Node.js executable running the manager. A bare executable name uses normal process lookup. A path-like command must point to a file inside the repository.
- Commands and arguments remain separate and run with `shell: false`. Checks are a read-only validation contract; the runner cannot enforce that property, so review repository-owned commands before adding them. Do not put command lines, secrets, environment overrides, publication, deployment, or destructive operations in this validation configuration.

Repository checks may call stable repository-owned test or validation scripts. Keep detailed test logic in those scripts rather than expanding the configuration into a second build system. A check must not invoke `scripts/local-plugin.mjs`, because that would recurse into the same configured check list.

## Run and update

From the repository root:

```powershell
node scripts/local-plugin.mjs status
node scripts/local-plugin.mjs validate
node scripts/local-plugin.mjs install
```

If the Repository contains exactly one per-plugin configuration, the runner selects it automatically. If it contains multiple configurations, pass the intended file explicitly so that a command cannot act on the wrong plugin:

```powershell
node scripts/local-plugin.mjs validate --config '.agents/plugin-development/my-plugin.json'
node scripts/local-plugin.mjs install --config '.agents/plugin-development/my-plugin.json'
```

Running without arguments displays help. The manager itself does not change the plugin version, Marketplace registration, or installed plugin during `status` or `validate`; configured checks must also remain read-only. `install` validates the portable package, validates the configured Marketplace entry, runs repository checks, applies the chosen local version policy, installs through Codex, and verifies both the reported snapshot and installed manifest.

The configuration is pinned for one process invocation. Re-run the command after changing it. The runner does not create checkpoints, logs, or mutable state files; the source manifest, Marketplace catalog, repository tests, Codex registration, and installed snapshot remain the authoritative artifacts for their respective concerns.
