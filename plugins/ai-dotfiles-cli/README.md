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

## Marketplace temporary files

On Windows, `agent codex marketplace-staging status` inspects leftover
`openai-bundled.staging-<UUID>` directories. After closing Codex/ChatGPT Desktop,
CLI and IDE clients, run `agent codex marketplace-staging clean` from an external
interactive terminal to review and permanently delete eligible directories.
The tool requires at least 24 hours since the newest creation/modification in
each tree, rejects links and locks, and rechecks metadata after confirmation.
It preserves the canonical marketplace, installed plugins, user Skills and
sessions. Cleanup does not fix the upstream updater or prevent recurrence.
See the [cleanup note](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/notes/codex-marketplace-staging-cleanup.md)
for scope, observed evidence and limitations.

## Permission and approval diagnostics

Use `agent codex permission status` to compare config files, Desktop saved choices,
and a task's recorded permissions. In a terminal, running it without options opens
a picker for up to 12 recent sessions, showing project, title, and update time.
Select a number, choose `m` to enter the task ID and project manually, or press
Enter/`q` to cancel. This also works from the `agent codex` interactive menu.

Candidates are ordered by session-record file update time, not last-viewed time.
Titles come from `session_index.jsonl`; project paths come from each record's first
`session_meta` entry. It scans `sessions/`, excluding `archived_sessions/`.
Listing reads metadata only,
does not open SQLite, and falls back to manual entry if discovery fails. Titles
may be missing or stale when the title index is unavailable or outdated.

Explicit options and redirected input/output never open a picker. Without
`--thread`, that mode uses `CODEX_THREAD_ID`; outside a Codex task, pass the ID.
Use `--turn UUID` to inspect an exact turn and
`--project DIRECTORY` when its project differs from the current directory.

```sh
agent codex permission status --thread UUID --project DIRECTORY
agent codex permission status --thread UUID --turn UUID --json
```

`permissions` remains an alias for `permission`, including in the interactive menu.
The diagnostic requires Python 3.11+ (`python` on PATH) in addition to Node.js 24.
It uses the standard TOML parser without third-party dependencies. Before installing
an updated runtime, run `node tools/agent/agent.mjs codex permission status` from
the checkout. `--codex-home DIRECTORY` overrides `CODEX_HOME` or `~/.codex`.
`--profile NAME` is an inspection assumption, not proof of the app's active profile.

The command is read-only. It does not start an app-server, request elevated access,
change app modes, or repair saved state. JSON includes full recorded filesystem
entries with home paths shortened to `~`, but excludes conversation bodies and
unrelated task entries. Treat directory names and task IDs as potentially private.
Config layers are reported independently; the tool does not reproduce Codex's
configuration resolver. Management file locations are candidates, not an exhaustive
search. Missing or malformed records are reported as unavailable evidence.

Exit code 3 means differences or incomplete evidence; it does not mean corruption.
The current diagnostic always reports gaps for live app feature flags, runtime
management/model requirements, launch overrides, and model-facing instructions.
Exit code 1 means inspection/runtime failure and 2 means invalid arguments.
There is no automatic repair. Do not replace the global state file or rewrite
heartbeat permission snapshots based solely on a difference report. The
[Desktop permission troubleshooting note](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/notes/codex-desktop-permission-diagnostics.md)
describes a locally observed menu-based correction, its verification steps, and
the distinction between configuration layers, app selections, and recorded permissions.

## Operational limits and updates

Installed command help is the authority for syntax and supported features. Check the actual entrypoint: another executable named `agent` is not the ai-dotfiles CLI. Update this plugin and the CLI separately when needed; do not bypass a version, ownership, integrity, or permission refusal to match an example.

Session export/archive/delete remain experimental and fixture-tested. Export is a private reference copy, not a restorable backup; deletion requires separate authorization and confirmation. Some operations require Codex clients to be closed and must be handed off to an external terminal. This plugin does not expand sandbox permissions or turn a confirmation token into user authorization.

For command details and validation limits, see [Codex maintenance](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/agent-codex.md) and [session-management notes](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/notes/codex-session-management.md). These human-facing guides are not required reading for every skill invocation; execution guidance is bundled in the relevant skill references.

## Maintenance

Runtime code stays in `tools/agent/`. Generic manager/validator/assembler sources stay with `agent-plugin-tools`; the CLI installer takes its own version-matched runtime copies and never imports an installed plugin cache. User settings, revision state, exports, and private paths do not belong in this package.

Run `npm run check:plugins` and relevant CLI installer tests from the repository root after changes. Package/link checks establish distribution integrity, not skill-selection quality or live client discovery. Preserve those separate validation boundaries when reporting a release.
