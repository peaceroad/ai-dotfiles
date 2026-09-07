# Orchestrate shared Marketplace assembly

Use when a private configuration, multiple contributors, or a higher-level development index owns assembly. Read [marketplace-distribution.md](marketplace-distribution.md) for the assembler's file layout and synchronization guarantees. Ordinary standalone assembly does not need this reference.

## Configuration ownership

An orchestrator that owns a separate private configuration may call `sync` or `check` with `--config <configuration>`. The assembler then reads that external schema-version-2 assembly definition instead of the root `config.json`; relative plugin and Skill sources still resolve from the Marketplace root. It does not copy the external definition into the Marketplace. The orchestrator owns any safe, source-path-free reference file it creates at the normal `config.json` location. Do not mix an orchestrator-managed reference configuration with direct `init` or `add` commands in the same Marketplace root.

The `init` and `add` commands are the low-level interface for a standalone Marketplace whose root `config.json` is human-owned. Do not use them when `~/.agents/ai-dotfiles/development.json` or another orchestrator-owned configuration is the source of truth; use that orchestrator's configuration and `sync` commands instead.

## External definitions and scoped merging

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

## Completion and recovery

Treat the writer lock as an orchestrator guarantee: the assembler does not acquire it. Preserve its identity and lifetime through reconciliation of a failed sync and reference update. After a lost response, inspect the reference, catalogs, digests, and selected source before retrying under the same ownership. Do not start another writer while the prior one may still run. Report selected-package success separately from full Marketplace consistency.
