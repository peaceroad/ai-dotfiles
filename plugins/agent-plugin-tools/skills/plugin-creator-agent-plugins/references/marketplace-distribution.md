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
- New package digests use `sha256-tree-v2:`: UTF-8 byte ordering of entry names, relative paths, entry types, SHA-256 file-content digests, and relative symlink targets. They exclude host permission bits, ownership, and timestamps so a checkout or mount can be verified on another OS. This verifies content, not executable permissions; manage permissions locally and invoke scripts through their declared interpreter when needed. Copying preserves permissions where the filesystem supports them, but permission-only changes do not trigger synchronization.
- Legacy `sha256:` package digests remain verifiable using their original permission-sensitive algorithm. A full sync writes the new format after normal overwrite checks; an existing copy must match the current source or its recorded legacy digest. Migrate in the original filesystem environment before moving legacy output between OSes. Never discard a failed legacy check or edit state to force migration. Consumers must be updated before consuming the new catalog. The catalog schema remains version 1; the digest prefix identifies the algorithm. Generated catalog-file hashes remain plain `sha256:` byte hashes.
- Paths in `config.json` may be absolute or relative to the Marketplace root. Relative paths suit sibling local repositories; a NAS root that pulls from local drives usually needs absolute source paths. A standalone Skill entry may also record an optional public HTTP or HTTPS `sourceUrl`; omit it for private Skills without a stable URL. Because the URL is published in the Skill catalog, reject credentials, query parameters, and fragments.

The `.agents/marketplace-development/` name is intentionally scoped to Marketplace-wide assembly state because one root may distribute both plugins and standalone Skills. Experimental versions used `.agents/plugin-marketplace-development/`. The current tools reject that retired layout so it cannot be silently ignored. With no Marketplace sync running, rename the whole directory to `.agents/marketplace-development/` and do not keep both paths.

Keep a repository Skill as the normal source of truth. An explicitly configured installed Skill may be copied from `~/.agents/skills/<name>` as a durable snapshot for reuse on another machine, but the snapshot and generated Marketplace copy do not become editable sources. Do not scan or publish the installed Skill root implicitly. Preserve optional provenance such as the upstream repository URL, and check redistribution terms before sharing third-party material beyond the authorized audience.

For private external configuration, `--merge`, or contributor/consumer ownership, use [marketplace-orchestration.md](marketplace-orchestration.md). Detect an existing orchestrator-owned configuration before choosing `init` or `add`; do not replace its reference file with a standalone definition.

The assembler accepts only schema version 2 for both root and external assembly definitions. It rejects earlier configuration versions rather than migrating them implicitly.

The assembler validates portable package structure but does not run source-repository tests or apply a version policy. When a source uses `.agents/plugin-development/`, run its repository-owned `validate` before assembly. `sync` copies the version already recorded in source `plugin.json`.

## Non-interactive commands

Running the script without arguments prints help and makes no changes. The standard interface never prompts for terminal input, so an agent or CI job can use it without waiting on an interactive session.

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

`init` creates the development configuration and managed schema; `add` updates the configuration. Neither assembles package copies or catalogs. Assemble or refresh the distribution explicitly:

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

A scoped operation reads every configured `plugin.json` to preserve unique names and verify the expected catalog structure, but validates, hashes, and compares only the selected package. Without an orchestrator merge, it requires the generated schema, catalog, and catalog digest from a prior full sync to be current. If Marketplace membership, name, display name, plugin name, or category changed, run a full `sync` instead. A successful scoped result certifies only the named plugin; run a full `check` when handing off or releasing the whole Marketplace. A handoff limited to one package may retain the scoped result and its stated limit.

Use `--skill <name>` for the corresponding scoped standalone-Skill operation. Because the Skill catalog includes content digests, a scoped Skill sync updates both the selected copy and its catalog entry while preserving unrelated entries.

Use the same commands with an accessible UNC root when direct NAS assembly is intended:

```powershell
node scripts/assemble-agent-marketplace.mjs sync '\\server\share\agents\marketplace'
```

The script does not establish network credentials, map a drive, or change share permissions. For recognized filesystem errors, it preserves the original error and path and adds recovery guidance. It does not redirect output or retry indefinitely; reconcile the destination before retrying as described below.

Treat the Marketplace as a single-writer-at-a-time destination. The direct assembler does not acquire a writer lock; serialization must come from the caller or orchestrator. Do not run `init`, `add`, or direct assembler `sync` commands concurrently against the same root. A higher-level multi-contributor workflow may serialize writers with a Marketplace-owned lock and use scoped merge operations, but different plugins do not make concurrent catalog or state writes safe. After an interrupted or failed NAS operation, inspect reported effects and current source/output state, restore access within the authorized environment, and confirm that no writer remains active. Resume the intended sync only when its sources and ownership still match, then run `check` for the affected scope. A secondary cleanup or rollback failure is reported separately so that it does not hide the original error; inspect the reported temporary or backup path before removing any remnant manually.

## Synchronization guarantees

A sync stages and verifies copies before replacement, but it is not a transaction over every package, catalog, and state file. A failure after some replacements can leave mixed generations. Reconcile that state before retrying; do not infer rollback from the exit code or bypass an overwrite refusal by editing digests.

Before changing output, a full `sync` validates every configured source, derives plugin names from `plugin.json` and Skill names from `SKILL.md`, rejects duplicate names within each component type, and checks that existing managed output was not changed outside the assembler. It rejects broken or absolute symbolic links and links that resolve outside the package root. It stages changed packages, validates staged copies, and replaces each package directory before writing the generated catalogs. Unchanged copies are skipped, which reduces local and network filesystem work. Scoped `sync --plugin <name>` and `sync --skill <name>` preserve overwrite protection for the selected copy but intentionally do not certify unrelated contents. With `--merge`, the assembler also verifies that entries outside the selected name still match the current catalogs before changing the selected entry.

The assembler refuses to overwrite an existing package copy or catalog when its content no longer matches either the configured source or the last generated digest. Restore the generated output, preserve the manual work elsewhere, or deliberately create a new Marketplace root; do not bypass the refusal by editing `state.json`.

Removing an entry from the selected assembly definition removes it from the next generated catalog but does not delete its old package directory. `sync` reports the retained unreferenced package. Delete or archive it separately only after confirming the exact target. This keeps pruning explicit and recoverable.

After syncing a local distribution repository, review its normal diff before any commit or push. After syncing a NAS root, use `check` from the same source environment when an independent drift confirmation is warranted.

Consumer machines follow [Codex integration](codex-integration.md) to register the assembled root and install individual plugins; they do not use the developer manager to install plugins from generated copies. For standalone Skills, use the optional [ai-dotfiles consumer commands](ai-dotfiles-cli.md#published-content-on-a-consumer-machine) or an equivalent installer that verifies this custom catalog and protects unmanaged or locally changed destinations. The portable Agent Skills specification does not standardize the catalog or its installation commands.
