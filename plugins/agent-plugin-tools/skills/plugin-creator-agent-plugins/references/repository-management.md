# Repository-owned local management

Use this reference when an Agent Plugins v1 repository needs repeatable local validation or installation with repository-specific checks. Keep this development contract outside the portable plugin manifest.

This is a developer-source workflow. It owns repository validation and local installation, not the assembly of copies for a shared Marketplace. After the configured checks pass, use [marketplace-distribution.md](marketplace-distribution.md) as a separate distribution step when the package must be shared.

## Choose the smallest path

- For a package that needs only portable validation or a one-time local install, call `scripts/manage-local-agent-plugin.mjs` with the plugin root. Do not add repository configuration.
- When a developer exposes contained skills through user-scoped links for iterative authoring, use repository validation as the normal path. Run `install` only for a plugin integration check after making same-named direct links inactive; see [codex-integration.md](codex-integration.md).
- When validation must consistently include repository-owned tests, generated-file checks, or a local version policy, scaffold a repository-owned runner and configuration.
- Preserve an existing repository management command when it provides behavior the template cannot express. Migrate only after matching its observable validation and installation guarantees.

## Scaffold a self-contained repository runner

From this skill directory, initialize a repository that contains its plugin and a [local Marketplace entry pointing to that source](codex-integration.md#provide-the-developer-source-catalog-entry):

```powershell
node scripts/scaffold-local-agent-plugin.mjs init 'C:\path\to\repository' 'plugins\my-plugin' --bump-version
```

Use `--keep-version` when the repository does not use version-based local cache freshness; select this policy from the request and repository as described in [codex-integration.md](codex-integration.md#version-policy). The example's bump flag is not a default requirement. `init` refuses an existing configuration for the same plugin, reuses byte-identical managed files, and validates the new configuration before returning. It creates:

```text
.agents/
└── plugin-development/
    ├── my-plugin.json
    └── schema.json
scripts/
├── local-plugin.mjs
└── validate-agent-plugin.mjs
```

The runner, validator, and schema are generated files. Keep repository-specific behavior out of them; their source tests remain in this skill. Refresh when adopting changes to those templates or their generated behavior:

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

Keep `.agents/plugin-development/` at the repository root, outside the portable package. It is this skill's convention, not a directory discovered by Agent Plugins or Codex; it is separate from `.agents/plugins/` catalogs and `.agents/skills/` discovery.

```json
{
  "$schema": "./schema.json",
  "schemaVersion": 1,
  "pluginRoot": "plugins/my-plugin",
  "versionPolicy": "bump",
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
- `minimumNodeMajor` is optional and applies whenever the configuration is used. Set it from actual runtime or repository requirements rather than copying a value from an example.
- `checks` run after portable package and Marketplace-entry validation during `validate` and `install`. They run in order and stop at the first failure. During `install`, every check completes before version, Marketplace, or installed-state changes begin.
- `${NODE}` selects the Node.js executable running the manager. A bare executable name uses normal process lookup. A path-like command must point to a file inside the repository.
- Commands and arguments remain separate and run with `shell: false`. Checks are a read-only validation contract; the runner cannot enforce that property, so review repository-owned commands before adding them. Temporary test fixtures may be appropriate; source, registration, installation, and publication state must remain unchanged. Do not put command lines, secrets, environment overrides, publication, deployment, or destructive operations in this validation configuration.

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

The configuration is read once per invocation; rerun after changing it. The runner creates no recovery log or checkpoint. Reconcile current source and client state using [Codex recovery](codex-integration.md#interruption-and-recovery).

## When scaffold writes are unavailable

If the current execution environment cannot write the Repository's `.agents/` subtree, retain that source-of-truth location. For a new configuration, use `prepare` with an authorized writable temporary path when it can advance the task; it does not create or update the Repository scaffold files:

```powershell
node scripts/scaffold-local-agent-plugin.mjs prepare 'C:\path\to\repository' 'plugins\my-plugin' 'C:\path\to\pending-config.json' --bump-version
```

The pending output directory must already exist, the output must be outside `.agents/plugin-development/`, and `prepare` never overwrites an existing file. It validates the portable plugin and its Marketplace binding before writing the same base configuration that `init` would use. It refuses an existing repository configuration because `import` cannot replace one. Add required check definitions to the pending configuration; `import` runs them after generating the runner. Import through an available authorized execution path; if only the user's terminal can write the target, explain the observed denial and provide the concrete command:

```powershell
node scripts/scaffold-local-agent-plugin.mjs import 'C:\path\to\repository' 'C:\path\to\pending-config.json'
```

`import` derives the target filename from the selected plugin's `plugin.json`, normalizes Repository-relative paths, creates missing managed files, and validates the imported configuration. It refuses an existing target or modified managed file, rolls back the copied configuration if validation fails, and retains the pending source in every case. After success, the user may remove that temporary source and run the Repository's normal installation command. The scaffold adds command-specific recovery guidance when `EACCES` or `EPERM` prevents a write. If no pending file can be written safely, stop and provide the equivalent `init` command or exact manual steps instead.

## Interruption and changed requirements

Shared scaffold files and per-plugin configurations need serialized writes within a repository. `refresh` and `import` are not whole-repository transactions: a later validation failure can leave managed files already updated. Inspect the reported paths and current diff before rerunning; preserve per-plugin configuration and repair only the incomplete operation. For installation effects, use [Codex recovery](codex-integration.md#interruption-and-recovery).

A user correction can change the remaining configuration or install target. Reconcile it against the source and any completed effects before invoking the next command. If another operation is still running, use the runtime's supported wait or result mechanism; do not overlap a conflicting refresh or install. Once the requested runner and checks are verified, stop unless assembly or installation is also in scope.
