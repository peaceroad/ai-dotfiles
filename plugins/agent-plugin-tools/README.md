# Agent Plugin Tools

Create, validate, migrate, and locally install portable Agent Plugins v1 packages, or assemble a filesystem Marketplace of plugins and standalone Agent Skills. This plugin contains one skill, [plugin-creator-agent-plugins](skills/plugin-creator-agent-plugins/SKILL.md).

The portable source uses root `plugin.json`. Use the built-in `plugin-creator` when the intended source format is Codex-specific `.codex-plugin/plugin.json`, and `skill-creator` when creating or structurally changing an individual skill.

## Request the outcome you need

Examples:

- Create a minimal portable plugin containing the supplied skill; finish the source and validation.
- Review this Codex-native package for portable migration and report any required features that need a separate client package.
- Install this developer source locally, preserving its version.
- Sync one selected plugin into an existing shared Marketplace while preserving other contributors' entries.

Source edits can finish with source validation. Local installation, shared assembly, and publication are separate outcomes; include the stages you need in the request. A review-only request produces findings.

For contained OpenAI or Codex instructions with no established target model, the authoring guidance uses GPT-6 Astra. It preserves an explicit target model and does not change client settings or require Astra to use the package. `prompt-design` and `agent-workflow-design` can assist when available; this plugin has no runtime dependency on them.

## Local development

This plugin bundles the Node.js helpers and templates for portable validation, developer-source installation, repository scaffolding, and standalone Marketplace assembly. No ai-dotfiles checkout is required; Codex installation also needs a working Codex CLI. Prefer an existing command in the plugin's development repository when it also runs the required project checks.

For source validation, run from this plugin's `skills/plugin-creator-agent-plugins/` directory, including when using an installed copy, or resolve the script's absolute path there:

```powershell
node scripts/validate-agent-plugin.mjs 'C:\path\to\plugin-root'
```

For repeated skill authoring, user-scoped links can point to the source. Plugin installation is useful when checking the manifest, MCP servers, client extensions, or distribution path. Avoid testing with same-named source links and installed copies simultaneously; see [Codex integration](skills/plugin-creator-agent-plugins/references/codex-integration.md).

If you use ai-dotfiles, the skill's [optional CLI integration](skills/plugin-creator-agent-plugins/references/ai-dotfiles-cli.md) covers source links, developer plugin targets, shared Marketplace management, and standalone Skill installation. `agent dev skill link` opens the source-link menu; plugin `sync` installs locally, whereas Marketplace `sync` assembles shared copies. Check `agent --help` and `agent dev skill link help` for the installed command's behavior. User guides cover [development and Marketplace setup](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/agent-development.md) and [skill links](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/skill-links.md).

The `agent` CLI, its source-link manager, shared-Marketplace orchestration, and standalone-Skill installer are supplied separately by ai-dotfiles, not bundled with this plugin. The bundled helpers do not replace all of those features. Whether a shared configuration is managed is determined from its contents and the established workflow, not from whether `agent` is installed on the current PC; see [configuration ownership](skills/plugin-creator-agent-plugins/references/ai-dotfiles-cli.md#establish-the-tool-and-configuration-owner).

A developer-source install or repository scaffold requires a matching local entry in `<marketplace-root>/.agents/plugins/marketplace.json`. Neither helper creates that entry. The [catalog setup example](skills/plugin-creator-agent-plugins/references/codex-integration.md#provide-the-developer-source-catalog-entry) shows the minimum JSON and the root-relative source path. Shared assembly creates a generated distribution copy and is a different workflow.

Run the developer manager from this skill's directory:

```powershell
node scripts/manage-local-agent-plugin.mjs status 'C:\path\to\plugin-root'
node scripts/manage-local-agent-plugin.mjs validate 'C:\path\to\plugin-root'
node scripts/manage-local-agent-plugin.mjs install 'C:\path\to\plugin-root' --keep-version
```

These are task-specific alternatives. `install` already includes validation. Preserve the established version policy; if none exists and no version change is requested, use `--keep-version`. Use `--bump-version` only for an intended local-development version policy. A higher-level repository command may require an explicit stored policy.

The manager checks reported identity, version, and available source-path information. It does not establish enabled state, byte-for-byte resource equality, or component execution. Confirm required behavior in a new task when integration is in scope. Installation can leave partial effects after failure and has no cross-process lock; inspect the current source and client state before retrying.

## Select a workflow

| Work | Detailed reference |
| --- | --- |
| Manifest, contained skills, MCP, and documented client extensions | [Authoring](skills/plugin-creator-agent-plugins/references/authoring.md) |
| Checks appropriate to the affected behavior and their limits | [Validation](skills/plugin-creator-agent-plugins/references/validation.md) |
| Codex-native source conversion and preservation of required features | [Migration](skills/plugin-creator-agent-plugins/references/codex-migration.md) |
| Developer installation, consumer installation, refresh, and recovery | [Codex integration](skills/plugin-creator-agent-plugins/references/codex-integration.md) |
| Repository-owned checks and generated runners, including `prepare` and `import` | [Repository management](skills/plugin-creator-agent-plugins/references/repository-management.md) |
| Local, Git, or NAS Marketplace assembly and drift checks | [Marketplace distribution](skills/plugin-creator-agent-plugins/references/marketplace-distribution.md) |
| Private assembly definitions, contributor ownership, and orchestration | [Marketplace orchestration](skills/plugin-creator-agent-plugins/references/marketplace-orchestration.md) |

Keep repository-specific behavior in the per-plugin configuration or its check scripts. Refresh generated runners when adopting template changes; `refresh --check` compares generated files without running repository checks. Shared Marketplace consumers install through Codex rather than invoking the developer manager against generated copies.

The [Astra review and follow-up audit](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/agent-plugin-tools/astra-review.md) records the design decisions, frozen evaluation inputs, observed checks, and remaining limits. That record is for maintainers and is not required reading when using the skill.

Marketplace package digests now use the portable `sha256-tree-v2:` content format. Update consumers before distribution, and run a full sync in the original environment to migrate permission-sensitive legacy digests. File permissions remain a local execution concern; permission-only changes do not trigger copying. See the [distribution contract](skills/plugin-creator-agent-plugins/references/marketplace-distribution.md#distribution-boundary).
