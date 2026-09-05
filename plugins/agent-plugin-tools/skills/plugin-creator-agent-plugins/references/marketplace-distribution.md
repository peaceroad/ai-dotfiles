# Assemble a shared Agent Marketplace

Use this reference when portable Agent Plugins, standalone Agent Skills, or both must be collected into one filesystem-backed Marketplace for a checked-out distribution repository, a NAS share, or another accessible directory. This workflow assembles files only. It does not commit, push, publish, authenticate to a share, register the Marketplace on consumer machines, or install its contents for them.

## Distribution boundary

Keep each portable plugin's development repository as its source of truth. Treat the assembled Marketplace as generated distribution output:

```text
plugin and Skill sources
        ↓ assemble-agent-marketplace.mjs
Marketplace root
├── .agents/
│   ├── marketplace-development/
│   │   ├── config.json
│   │   ├── schema.json
│   │   └── state.json
│   ├── plugins/
│   │   └── marketplace.json
│   └── skills/
│       └── catalog.json
├── plugins/
│   └── <plugin-name>/
└── skills/
    └── <skill-name>/
```

- By default, `config.json` is the human-owned assembly definition.
- `schema.json`, `state.json`, `.agents/plugins/marketplace.json`, `.agents/skills/catalog.json`, and configured package copies are managed outputs. Do not edit them by hand.
- `state.json` records content digests only. It does not replace source manifests or release metadata.
- Paths in `config.json` may be absolute or relative to the Marketplace root. Relative paths suit sibling local repositories; a NAS root that pulls from local drives usually needs absolute source paths. A standalone Skill entry may also record an optional public HTTP or HTTPS `sourceUrl`; omit it for private Skills without a stable URL. Because the URL is published in the Skill catalog, reject credentials, query parameters, and fragments.

The `.agents/marketplace-development/` name is intentionally scoped to Marketplace-wide assembly state because one root may distribute both plugins and standalone Skills. Experimental versions used `.agents/plugin-marketplace-development/`. The current tools reject that retired layout so it cannot be silently ignored. With no Marketplace sync running, rename the whole directory to `.agents/marketplace-development/` and do not keep both paths.

Keep a repository Skill as the normal source of truth. An explicitly configured installed Skill may be copied from `~/.agents/skills/<name>` as a durable snapshot for reuse on another machine, but the snapshot and generated Marketplace copy do not become editable sources. Do not scan or publish the installed Skill root implicitly. Preserve optional provenance such as the upstream repository URL, and check redistribution terms before sharing third-party material beyond the authorized audience.

An orchestrator that owns a separate private configuration may call `sync` or `check` with `--config <configuration>`. The assembler then reads that external schema-version-2 assembly definition instead of the root `config.json`; relative plugin and Skill sources still resolve from the Marketplace root. It does not copy the external definition into the Marketplace. The orchestrator owns any safe, source-path-free reference file it creates at the normal `config.json` location. Do not mix an orchestrator-managed reference configuration with direct `init` or `add` commands in the same Marketplace root.

The same root layout works in a local Git checkout and on an accessible network filesystem. Run Git operations, release publication, NAS uploads, and consumer installation as separate authorized steps.

The assembler validates portable package structure but intentionally does not run source-repository tests, apply a repository version policy, or install through Codex. When a source uses the optional `.agents/plugin-development/` contract, run its repository-owned `validate` command before assembly. `sync` then copies the package version already recorded in the source `plugin.json`; it does not bump that version. This keeps the Repository development flow separate from the shared-distribution flow.

## Non-interactive commands

Running the script without arguments prints help and makes no changes. The standard interface never prompts for terminal input, so an agent or CI job can use it without waiting on an interactive session.

The `init` and `add` commands are the low-level interface for a standalone Marketplace whose root `config.json` is human-owned. Do not use them when `~/.agents/development.json` or another orchestrator-owned configuration is the source of truth; use that orchestrator's configuration and `sync` commands instead.

Initialize a Marketplace definition:

```powershell
node scripts/assemble-agent-marketplace.mjs init `
  'C:\path\to\marketplace-root' `
  --name 'team-agents' `
  --display-name 'Team Agents'
```

Add an initial plugin during `init` by repeating `--plugin`. One `--category` applies to those initial entries:

```powershell
node scripts/assemble-agent-marketplace.mjs init `
  'C:\path\to\marketplace-root' `
  --name 'team-agents' `
  --display-name 'Team Agents' `
  --plugin 'C:\path\to\first\plugins\first-plugin' `
  --plugin 'C:\path\to\second\plugins\second-plugin' `
  --category 'Productivity'
```

Add a later plugin with its own category:

```powershell
node scripts/assemble-agent-marketplace.mjs add `
  'C:\path\to\marketplace-root' `
  'C:\path\to\source\plugins\another-plugin' `
  --category 'Developer tools'
```

For a standalone Skill, add a `skills` entry to the schema-version-2 human-owned configuration. `sourceUrl` is optional and is provenance only; omit it when no stable public URL exists.

```json
{
  "$schema": "./schema.json",
  "schemaVersion": 2,
  "name": "team-agents",
  "displayName": "Team Agents",
  "plugins": [],
  "skills": [
    {
      "source": "C:/path/to/repository/skills/my-skill",
      "sourceUrl": "https://github.com/example/repository"
    }
  ]
}
```

`init` and `add` update only the development configuration. Assemble or refresh the distribution explicitly:

```powershell
node scripts/assemble-agent-marketplace.mjs sync 'C:\path\to\marketplace-root'
```

Check for source, catalog, schema, state, or copied-package drift without writing:

```powershell
node scripts/assemble-agent-marketplace.mjs check 'C:\path\to\marketplace-root'
```

After a full sync, limit validation and copying to one configured plugin when an unrelated source is still under development:

```powershell
node scripts/assemble-agent-marketplace.mjs sync 'C:\path\to\marketplace-root' `
  --plugin 'another-plugin'

node scripts/assemble-agent-marketplace.mjs check 'C:\path\to\marketplace-root' `
  --plugin 'another-plugin'
```

A scoped operation reads every configured `plugin.json` to preserve unique names and verify the expected catalog structure, but validates, hashes, and compares only the selected package. Without an orchestrator merge, it requires the generated schema, catalog, and catalog digest from a prior full sync to be current. If Marketplace membership, name, display name, plugin name, or category changed, run a full `sync` instead. A successful scoped result certifies only the named plugin; run a full `check` at a release or handoff boundary.

Use `--skill <name>` for the corresponding scoped standalone-Skill operation. Because the Skill catalog includes content digests, a scoped Skill sync updates both the selected copy and its catalog entry while preserving unrelated entries.

To use an assembly definition owned by another local workflow without publishing it into the Marketplace root:

```powershell
node scripts/assemble-agent-marketplace.mjs sync 'C:\path\to\marketplace-root' `
  --config 'C:\path\to\private-effective-config.json'

node scripts/assemble-agent-marketplace.mjs check 'C:\path\to\marketplace-root' `
  --config 'C:\path\to\private-effective-config.json'
```

The external file uses the same `source`-based schema-version-2 structure as the normal human-owned `config.json`. Keep it private when it contains machine-specific absolute paths, and let its owning workflow manage creation and cleanup.

An orchestrator that connects multiple developers to one shared Marketplace may combine `--config`, one of `--plugin` or `--skill`, and `--merge`. In that mode, the external definition contains the selected source plus existing generated copies for catalog context. The assembler preserves every unrelated catalog entry and updates only the selected copy, its catalog entry, and state. The orchestrator must validate the source-free Marketplace reference, hold a Marketplace-wide writer lock across reading the reference, running the assembler, and updating the reference, and clearly report that unrelated contents were not checked. Do not invoke `--merge` manually with an improvised configuration.

If an orchestrator supports complete single-owner management, scoped multi-contributor management, and read-only consumption, make every transition explicit. Before narrowing a complete definition to contributor or consumer scope, require a successful full `check` so every configured source, package copy, catalog, schema, state, and reference is synchronized. Before expanding a contributor or consumer definition into the complete source of truth, require locally resolvable sources for every plugin and Skill already present in the shared Marketplace. A consumer may list and install published content but must not invoke development synchronization. Refuse a transition when its evidence or authority is incomplete rather than inferring ownership from generated copies.

Use the same commands with an accessible UNC root when direct NAS assembly is intended:

```powershell
node scripts/assemble-agent-marketplace.mjs sync '\\server\share\agents\marketplace'
```

The script does not establish network credentials, map a drive, or change share permissions. When a recognized filesystem error occurs, it preserves the operating-system error and reported path, then adds guidance for access denial, a disconnected share, insufficient space or quota, and files in use. Restore access outside this workflow and rerun the same command; the assembler does not silently redirect output or retry indefinitely.

Treat the Marketplace as a single-writer-at-a-time destination. Do not run `init`, `add`, or direct assembler `sync` commands concurrently against the same root. A higher-level multi-contributor workflow may serialize writers with a Marketplace-owned lock and use scoped merge operations, but different plugins do not make concurrent catalog or state writes safe. If a NAS operation fails, restore the connection or permissions, confirm that no other writer is active, rerun the same command, and use `check` afterward when an independent drift confirmation is useful. A secondary cleanup or rollback failure is reported separately so that it does not hide the original error; inspect the reported temporary or backup path before removing any remnant manually.

## Synchronization guarantees

Before changing output, a full `sync` validates every configured source, derives plugin names from `plugin.json` and Skill names from `SKILL.md`, rejects duplicate names within each component type, and checks that existing managed output was not changed outside the assembler. It rejects broken or absolute symbolic links and links that resolve outside the package root. It stages changed packages, validates staged copies, and replaces each package directory before writing the generated catalogs. Unchanged copies are skipped, which reduces local and network filesystem work. Scoped `sync --plugin <name>` and `sync --skill <name>` preserve overwrite protection for the selected copy but intentionally do not certify unrelated contents. With `--merge`, the assembler also verifies that entries outside the selected name still match the current catalogs before changing the selected entry.

The assembler refuses to overwrite an existing package copy or catalog when its content no longer matches either the configured source or the last generated digest. Restore the generated output, preserve the manual work elsewhere, or deliberately create a new Marketplace root; do not bypass the refusal by editing `state.json`.

Removing an entry from the selected assembly definition removes it from the next generated catalog but does not delete its old package directory. `sync` reports the retained unreferenced package. Delete or archive it separately only after confirming the exact target. This keeps pruning explicit and recoverable.

After syncing a local distribution repository, review its normal diff before any commit or push. After syncing a NAS root, use `check` from the same source environment when an independent drift confirmation is warranted. Consumer machines follow [codex-integration.md](codex-integration.md) to register the assembled root and install individual plugins; they do not use the developer manager to install plugins from generated copies. When the optional `ai-dotfiles` CLI is installed, standalone Skills use its higher-level `agent marketplace skill list|install|update|remove` commands, which verify the Skill catalog, protect unmanaged or locally changed destinations, and serialize local mutations with a user-scoped lock. Other consumers must provide an equivalent checked installation boundary; the portable Agent Skills specification does not standardize this custom filesystem catalog.
