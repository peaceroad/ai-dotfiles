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

- `config.json` is the human-owned assembly definition.
- `schema.json`, `state.json`, `.agents/plugins/marketplace.json`, and configured `plugins/<plugin-name>/` copies are managed outputs. Do not edit them by hand.
- `state.json` records content digests only. It does not replace source manifests or release metadata.
- Paths in `config.json` may be absolute or relative to the Marketplace root. Relative paths suit sibling local repositories; a NAS root that pulls from local drives usually needs absolute source paths.

The same root layout works in a local Git checkout and on an accessible network filesystem. Run Git operations, release publication, NAS uploads, and consumer installation as separate authorized steps.

The assembler validates portable package structure but intentionally does not run source-repository tests, apply a repository version policy, or install through Codex. When a source uses the optional `.agents/plugin-development/` contract, run its repository-owned `validate` command before assembly. `sync` then copies the package version already recorded in the source `plugin.json`; it does not bump that version. This keeps the Repository development flow separate from the shared-distribution flow.

## Non-interactive commands

Running the script without arguments prints help and makes no changes. The standard interface never prompts for terminal input, so an agent or CI job can use it without waiting on an interactive session.

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

Use the same commands with an accessible UNC root when direct NAS assembly is intended:

```powershell
node scripts/assemble-plugin-marketplace.mjs sync '\\server\share\agents\marketplace'
```

The script does not establish network credentials, map a drive, or change share permissions. When a recognized filesystem error occurs, it preserves the operating-system error and reported path, then adds guidance for access denial, a disconnected share, insufficient space or quota, and files in use. Restore access outside this workflow and rerun the same command; the assembler does not silently redirect output or retry indefinitely.

Treat the Marketplace as a single-writer destination. Do not run `init`, `add`, or `sync` concurrently against the same root. If a NAS operation fails, restore the connection or permissions, confirm that no other writer is active, rerun the same command, and use `check` afterward when an independent drift confirmation is useful. A secondary cleanup or rollback failure is reported separately so that it does not hide the original error; inspect the reported temporary or backup path before removing any remnant manually.

## Synchronization guarantees

Before changing output, `sync` validates every configured source with `validate-agent-plugin.mjs`, derives the plugin name from its root `plugin.json`, rejects duplicate names, and checks that existing managed output was not changed outside the assembler. It stages changed packages, validates staged copies, and replaces each package directory before writing the generated Marketplace catalog last. Unchanged package copies are skipped, which reduces local and network filesystem work.

The assembler refuses to overwrite an existing plugin copy or catalog when its content no longer matches either the configured source or the last generated digest. Restore the generated output, preserve the manual work elsewhere, or deliberately create a new Marketplace root; do not bypass the refusal by editing `state.json`.

Removing an entry from `config.json` removes it from the next generated catalog but does not delete its old package directory. `sync` reports the retained unreferenced package. Delete or archive it separately only after confirming the exact target. This keeps pruning explicit and recoverable.

After syncing a local distribution repository, review its normal diff before any commit or push. After syncing a NAS root, use `check` from the same source environment when an independent drift confirmation is warranted. Consumer machines follow [codex-integration.md](codex-integration.md) to register the assembled root and install individual plugins; they do not use the developer manager to install from generated copies.
