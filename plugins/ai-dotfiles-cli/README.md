# ai-dotfiles-cli

Skills for using the separately installed ai-dotfiles `agent` command and consulting its saved Codex conversation exports. This plugin contains instructions only: it does not install a CLI, start an MCP server, grant filesystem access, or change user configuration.

## Choose the skill

- [ai-dotfiles-cli](skills/ai-dotfiles-cli/SKILL.md): operate existing ai-dotfiles development targets, source links, shared Marketplaces, consumer Skill copies, and Codex maintenance tools.
- [codex-history](skills/codex-history/SKILL.md): search, read, and summarize already exported conversations, with file/line evidence and coverage warnings. It does not export, archive, delete, or restore sessions.

Generic plugin authoring remains in the independent `agent-plugin-tools` plugin. Prompt and workflow design remain in `agent-design-tools`. These are optional tools for different outcomes, not required dependencies for everyday CLI operation. CLI use is also distinct from implementing the CLI's source code or exporting this repository's dotfiles with `export.js`.

Examples of requests:

- Check this configured Marketplace for drift without changing it.
- Sync only my assigned plugin while preserving other Marketplace entries.
- Preview an export of sessions older than four weeks to my selected directory; keep originals.
- Find the decision about a feature in my existing session exports.

## Install the runtime and instructions separately

The runtime requires Node.js 24 or later. From a user-selected ai-dotfiles checkout, inspect the installer and run:

```sh
node scripts/install-agent.mjs --dry-run
node scripts/install-agent.mjs
agent --help
```

The [CLI installation guide](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/agent-development.md#配置とインストール) covers Windows PATH registration and Unix launchers. The runtime is copied to `~/.agents/ai-dotfiles/runtime/`; the checkout is not needed to execute that installed copy. Codex maintenance tools have additional per-operation requirements shown in their help. Plugin installation does not satisfy those requirements automatically.

Install this plugin from a Marketplace that publishes it, or explicitly register a local developer-source catalog entry and install through the client's current plugin tools. A checkout containing `plugins/ai-dotfiles-cli/` alone is not a Marketplace registration. Do not invent a Marketplace name or edit a generated catalog to install it. The [developer-source setup guidance](https://github.com/peaceroad/ai-dotfiles/blob/main/plugins/agent-plugin-tools/skills/plugin-creator-agent-plugins/references/codex-integration.md) describes that optional path without making the other plugin a runtime dependency.

For standalone use, install the complete selected directory under `skills/`, including its references, through an existing Skill installer or the [source-link workflow](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/skill-links.md). Both distribution paths use this package's source; do not maintain a second editable copy. Keep only one active discovery path per skill name.

### Existing standalone codex-history installations

Earlier CLI installers copied `codex-history` into `~/.agents/skills/`. The current installer neither creates nor updates/removes any Skill. An existing copy remains intact, but is no longer updated by reinstalling the CLI.

Before switching to this plugin, inspect the same-named standalone skills, their source-link declarations, and any local edits. Preserve them in a known location outside active skill discovery and update a link manager's declaration when needed. Install the plugin and verify discovery in a new task. If verification fails, deactivate the plugin copy before restoring the previous path. Do not remove unrelated skills or rely on duplicate-name precedence. This is an explicit switch, not an automatic migration.

The CLI remains usable without either skill. If only this plugin is installed, CLI operations require a compatible runtime; supplied saved files can still be read as unverified reference material when tooling is unavailable. No software is installed implicitly to answer a history question.

## Operational limits and updates

Installed command help is the authority for syntax and supported features. Check the actual entrypoint: another executable named `agent` is not the ai-dotfiles CLI. Update this plugin and the CLI separately when needed; do not bypass a version, ownership, integrity, or permission refusal to match an example.

Session export/archive/delete remain experimental and fixture-tested. Export is a private reference copy, not a restorable backup; deletion requires separate authorization and confirmation. Some operations require Codex clients to be closed and must be handed off to an external terminal. This plugin does not expand sandbox permissions or turn a confirmation token into user authorization.

For command details and validation limits, see [Codex maintenance](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/agent-codex.md) and [session-management notes](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/notes/codex-session-management.md). These human-facing guides are not required reading for every skill invocation; execution guidance is bundled in the relevant skill references.

## Maintenance

Runtime code stays in `tools/agent/`. Generic manager/validator/assembler sources stay with `agent-plugin-tools`; the CLI installer takes its own version-matched runtime copies and never imports an installed plugin cache. User settings, revision state, exports, and private paths do not belong in this package.

Run `npm run check:plugins` and relevant CLI installer tests from the repository root after changes. Package/link checks establish distribution integrity, not skill-selection quality or live client discovery. Preserve those separate validation boundaries when reporting a release.
