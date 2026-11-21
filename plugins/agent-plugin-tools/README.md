# Agent Plugin Tools

Use [plugin-creator-agent-plugins](skills/plugin-creator-agent-plugins/SKILL.md) to turn skills or an MCP server into a portable Agent Plugins v1 package, check a package you already have, or prepare it for distribution. The plugin includes the authoring skill, Node.js tools, and templates. To use the skill, install `agent-plugin-tools` from a Marketplace that offers it. You can also run the bundled tools directly from a checkout. The standalone workflows need neither the ai-dotfiles CLI nor a separate ai-dotfiles installation.

## Choose the package format

A portable plugin has a `plugin.json` at its root. Use this skill to create that package or assess a migration to it. For a Codex-specific source with `.codex-plugin/plugin.json`, use Codex’s built-in `plugin-creator`. For a standalone Codex skill or changes to a contained skill’s structure, use `skill-creator`.

Packaging and validation require no default model. When writing instructions inside a skill, preserve the intended model and runtime. If available, `prompt-design` helps select guidance and revise the wording, and `agent-workflow-design` helps design workflow controls. If `prompt-design` is unavailable and the destination is unspecified, keep the instructions model-independent. Check any required capability against the intended deployment. [Contained skill authoring](skills/plugin-creator-agent-plugins/references/authoring.md)

## Request the outcome you need

- “Package this skill and validate the source.” This produces a package and the source-check result.
- “Review this Codex-native package for migration.” This identifies what the portable package can preserve and which features require a client-specific package.
- “Install this developer source in Codex and keep its version.” This also requires a working Codex CLI and a local catalog entry for the source.
- “Sync just this plugin to our shared Marketplace.” This updates the selected distribution copy while preserving other contributors’ entries.
- “Preview adding this GitHub plugin to our catalog.” This shows the proposed reference edit. The upstream package stays in its repository.

Ask for installation, shared distribution, or publication when that stage is part of the job. A request to review a package can finish with findings, and a source edit can finish with validation.

## Local development

**To check a package**, run the bundled validator from the `skills/plugin-creator-agent-plugins/` directory of an installed plugin or checkout. This example checks Agent Plugin Tools itself. Replace `../..` with your package root to check another plugin.

```sh
node scripts/validate-agent-plugin.mjs ../..
```

The validator prints `OK` or `FAILED` and a summary of package contents. For a repository with its own validation command, use that command to include project-specific checks. [Validation scope](skills/plugin-creator-agent-plugins/references/validation.md)

**To try a developer source in Codex**, first identify the manager for the source and installation. Use its entry point so that its checks and version policy apply. For a standalone source, the bundled manager requires a matching entry in `<marketplace-root>/.agents/plugins/marketplace.json`. Both the manager and the repository scaffold expect that entry to exist. [Management boundaries](skills/plugin-creator-agent-plugins/references/management-boundaries.md) · [Minimal catalog entry and source path](skills/plugin-creator-agent-plugins/references/codex-integration.md#provide-the-developer-source-catalog-entry)

From the same skill directory, the following commands inspect a source and install it while preserving its version. Replace the example path with your local plugin root. Run only the status command if you want to inspect the current state.

```powershell
node scripts/manage-local-agent-plugin.mjs status 'C:\path\to\plugin-root'
node scripts/manage-local-agent-plugin.mjs install 'C:\path\to\plugin-root' --keep-version
```

Installation includes validation. Use the established version policy. When none exists and no version change was requested, use `--keep-version`. Reserve `--bump-version` for an intended development-version change.

The manager compares the reported plugin identity, version, and source path when available. To verify skill discovery or MCP behavior, check enabled state and exercise the component in a new task. Use one active copy of a given skill name so you can tell which one ran. After an interrupted install, inspect the source, Marketplace registration, and client state before retrying. The manager has no cross-process lock, and some changes may already have taken effect. [Codex integration and recovery](skills/plugin-creator-agent-plugins/references/codex-integration.md)

## Select a workflow

- **Create or migrate a package.** Use the [authoring guide](skills/plugin-creator-agent-plugins/references/authoring.md) for manifests, skills, MCP configuration, and supported client extensions. Use the [migration guide](skills/plugin-creator-agent-plugins/references/codex-migration.md) to map an existing Codex-native source.
- **Keep checks with the source repository.** Configure repository checks and version policy in the source project. When adopting a template update, `refresh --check` compares the generated runner files. Run the repository checks separately. [Repository management](skills/plugin-creator-agent-plugins/references/repository-management.md)
- **Distribute package copies.** The filesystem assembler creates or checks a Marketplace on local storage, Git, or NAS. Consumers install published copies through Codex. For private assembly definitions or multiple contributors, use the established owner’s synchronization process. [Marketplace distribution](skills/plugin-creator-agent-plugins/references/marketplace-distribution.md) · [Marketplace orchestration](skills/plugin-creator-agent-plugins/references/marketplace-orchestration.md)
- **Maintain a catalog of GitHub references.** Use the catalog helper when the plugins should stay in their source repositories. It can inspect the catalog, preview an edit, or apply a guarded change. [Reference catalogs](skills/plugin-creator-agent-plugins/references/marketplace-catalog.md)
- **Operate an ai-dotfiles-managed target.** The separate [ai-dotfiles-cli plugin](https://github.com/peaceroad/ai-dotfiles/tree/main/plugins/ai-dotfiles-cli) documents `agent` operations for source links, shared Marketplaces, and installation of standalone skills.

## Compatibility and maintenance notes

**Upgrading a filesystem Marketplace.** If your Marketplace still records package digests in the legacy `sha256:` format, update consumers to support `sha256-tree-v2:` before distributing the new catalog. Run a full sync in the original filesystem environment before moving the Marketplace across operating systems. The current format tracks package content and excludes permission bits, so a permission-only change is handled locally. [Digest format and migration](skills/plugin-creator-agent-plugins/references/marketplace-distribution.md#distribution-boundary)

**Reading tool diagnostics.** The scaffold, assembler, and built-in instruction probe display paths using `~` or `[external]/<name>` where appropriate. Treat the probe’s JSON `skillPath` as a display label. For a later filesystem operation, use the actual input path.

The Japanese [design review and follow-up audit](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/agent-plugin-tools/astra-review.md) records the evaluated cases, observed results, and verification limits.
