# Assemble a shared plugin Marketplace

Use this reference when multiple portable Agent Plugins must be collected into one filesystem-backed Codex Marketplace for a checked-out distribution repository, a NAS share, or another accessible directory. This workflow assembles files only. It does not commit, push, publish, authenticate to a share, register the Marketplace on consumer machines, or install plugins for them.

## Distribution boundary

Keep each portable plugin's development repository as its source of truth. Treat the assembled Marketplace as generated distribution output:

```text
plugin source repositories
        ↓ assemble-plugin-marketplace.mjs
Marketplace root
├── .agents/
│   ├── plugin-marketplace-development/
│   │   ├── config.json
│   │   ├── schema.json
│   │   └── state.json
│   └── plugins/
│       └── marketplace.json
└── plugins/
    └── <plugin-name>/
```

- By default, `config.json` is the human-owned assembly definition.
- `schema.json`, `state.json`, `.agents/plugins/marketplace.json`, and configured `plugins/<plugin-name>/` copies are managed outputs. Do not edit them by hand.
- `state.json` records content digests only. It does not replace source manifests or release metadata.
- Paths in `config.json` may be absolute or relative to the Marketplace root. Relative paths suit sibling local repositories; a NAS root that pulls from local drives usually needs absolute source paths.

An orchestrator that owns a separate private configuration may call `sync` or `check` with `--config <configuration>`. The assembler then reads that external, schema-version-1 assembly definition instead of the root `config.json`; relative plugin sources still resolve from the Marketplace root. It does not copy the external definition into the Marketplace. The orchestrator owns any safe, source-path-free reference file it creates at the normal `config.json` location. Do not mix an orchestrator-managed reference configuration with direct `init` or `add` commands in the same Marketplace root.

The same root layout works in a local Git checkout and on an accessible network filesystem. Run Git operations, release publication, NAS uploads, and consumer installation as separate authorized steps.

The assembler validates portable package structure but intentionally does not run source-repository tests, apply a repository version policy, or install through Codex. When a source uses the optional `.agents/plugin-development/` contract, run its repository-owned `validate` command before assembly. `sync` then copies the package version already recorded in the source `plugin.json`; it does not bump that version. This keeps the Repository development flow separate from the shared-distribution flow.

## Non-interactive commands

Running the script without arguments prints help and makes no changes. The standard interface never prompts for terminal input, so an agent or CI job can use it without waiting on an interactive session.

The `init` and `add` commands are the low-level interface for a standalone Marketplace whose root `config.json` is human-owned. Do not use them when `~/.agents/development.json` or another orchestrator-owned configuration is the source of truth; use that orchestrator's configuration and `sync` commands instead.

Initialize a Marketplace definition:

```powershell
node scripts/assemble-plugin-marketplace.mjs init `
  'C:\path\to\marketplace-root' `
  --name 'team-agents' `
  --display-name 'Team Agents'
```

Add an initial plugin during `init` by repeating `--plugin`. One `--category` applies to those initial entries:

```powershell
node scripts/assemble-plugin-marketplace.mjs init `
  'C:\path\to\marketplace-root' `
  --name 'team-agents' `
  --display-name 'Team Agents' `
  --plugin 'C:\path\to\first\plugins\first-plugin' `
  --plugin 'C:\path\to\second\plugins\second-plugin' `
  --category 'Productivity'
```

Add a later plugin with its own category:

```powershell
node scripts/assemble-plugin-marketplace.mjs add `
  'C:\path\to\marketplace-root' `
  'C:\path\to\source\plugins\another-plugin' `
  --category 'Developer tools'
```

`init` and `add` update only the development configuration. Assemble or refresh the distribution explicitly:

```powershell
node scripts/assemble-plugin-marketplace.mjs sync 'C:\path\to\marketplace-root'
```

Check for source, catalog, schema, state, or copied-plugin drift without writing:

```powershell
node scripts/assemble-plugin-marketplace.mjs check 'C:\path\to\marketplace-root'
```

After a full sync, limit validation and copying to one configured plugin when an unrelated source is still under development:

```powershell
node scripts/assemble-plugin-marketplace.mjs sync 'C:\path\to\marketplace-root' `
  --plugin 'another-plugin'

node scripts/assemble-plugin-marketplace.mjs check 'C:\path\to\marketplace-root' `
  --plugin 'another-plugin'
```

A scoped operation reads every configured `plugin.json` to preserve unique names and verify the expected catalog structure, but validates, hashes, and compares only the selected package. Without an orchestrator merge, it requires the generated schema, catalog, and catalog digest from a prior full sync to be current. If Marketplace membership, name, display name, plugin name, or category changed, run a full `sync` instead. A successful scoped result certifies only the named plugin; run a full `check` at a release or handoff boundary.

To use an assembly definition owned by another local workflow without publishing it into the Marketplace root:

```powershell
node scripts/assemble-plugin-marketplace.mjs sync 'C:\path\to\marketplace-root' `
  --config 'C:\path\to\private-effective-config.json'

node scripts/assemble-plugin-marketplace.mjs check 'C:\path\to\marketplace-root' `
  --config 'C:\path\to\private-effective-config.json'
```

The external file uses the same `source`-based schema-version-1 structure as the normal human-owned `config.json`. Keep it private when it contains machine-specific absolute paths, and let its owning workflow manage creation and cleanup.

An orchestrator that connects multiple developers to one shared Marketplace may combine `--config`, `--plugin`, and `--merge`. In that mode, the external definition contains the selected source plus existing generated plugin copies for catalog context. The assembler preserves every catalog entry except the selected plugin and updates that one entry, its package copy, and state. The orchestrator must validate the source-free Marketplace reference, hold a Marketplace-wide writer lock across reading the reference, running the assembler, and updating the reference, and clearly report that unrelated plugin contents were not checked. Do not invoke `--merge` manually with an improvised configuration.

If an orchestrator supports changing between complete single-owner management and scoped multi-contributor management, make the transition explicit. Before narrowing a complete definition to contributor scope, require a successful full `check` so every configured source, package copy, catalog, schema, state, and reference is synchronized. Before expanding a contributor definition into the complete source of truth, require locally resolvable sources for every plugin already present in the shared Marketplace. Refuse either transition when its evidence is incomplete rather than inferring ownership from the generated copies.

Use the same commands with an accessible UNC root when direct NAS assembly is intended:

```powershell
node scripts/assemble-plugin-marketplace.mjs sync '\\server\share\agents\marketplace'
```

The script does not establish network credentials, map a drive, or change share permissions. When a recognized filesystem error occurs, it preserves the operating-system error and reported path, then adds guidance for access denial, a disconnected share, insufficient space or quota, and files in use. Restore access outside this workflow and rerun the same command; the assembler does not silently redirect output or retry indefinitely.

Treat the Marketplace as a single-writer-at-a-time destination. Do not run `init`, `add`, or direct assembler `sync` commands concurrently against the same root. A higher-level multi-contributor workflow may serialize writers with a Marketplace-owned lock and use scoped merge operations, but different plugins do not make concurrent catalog or state writes safe. If a NAS operation fails, restore the connection or permissions, confirm that no other writer is active, rerun the same command, and use `check` afterward when an independent drift confirmation is useful. A secondary cleanup or rollback failure is reported separately so that it does not hide the original error; inspect the reported temporary or backup path before removing any remnant manually.

## Synchronization guarantees

Before changing output, a full `sync` validates every configured source with `validate-agent-plugin.mjs`, derives the plugin name from its root `plugin.json`, rejects duplicate names, and checks that existing managed output was not changed outside the assembler. It stages changed packages, validates staged copies, and replaces each package directory before writing the generated Marketplace catalog last. Unchanged package copies are skipped, which reduces local and network filesystem work. A scoped `sync --plugin <name>` preserves this overwrite protection for the selected copy but intentionally does not inspect unrelated package contents. With `--merge`, it also verifies that entries outside the selected name still match the current catalog before changing the selected entry.

The assembler refuses to overwrite an existing plugin copy or catalog when its content no longer matches either the configured source or the last generated digest. Restore the generated output, preserve the manual work elsewhere, or deliberately create a new Marketplace root; do not bypass the refusal by editing `state.json`.

Removing an entry from the selected assembly definition removes it from the next generated catalog but does not delete its old package directory. `sync` reports the retained unreferenced package. Delete or archive it separately only after confirming the exact target. This keeps pruning explicit and recoverable.

After syncing a local distribution repository, review its normal diff before any commit or push. After syncing a NAS root, use `check` from the same source environment when an independent drift confirmation is warranted. Consumer machines follow [codex-integration.md](codex-integration.md) to register the assembled root and install individual plugins; they do not use the developer manager to install from generated copies.
