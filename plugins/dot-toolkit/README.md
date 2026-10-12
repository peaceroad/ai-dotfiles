# dot-toolkit

An unofficial, experimental plugin for your ongoing main dot. It helps dot use private instructions and deliberately selected skills without asking you for their locations on every request. It supports complete cloud-managed plugin packages and standalone skills.

The bundled `dot-guidelines` skill provides common guidance and reads setup, inspection, maintenance, or migration instructions when needed. It does not bundle your private instructions or the additional plugins you choose.

## Install and start

Install **dot-toolkit itself in ChatGPT Web**, using a ZIP or a shared plugin supplied by its maintainer. Use the account and workspace where you use dot. Uploading a ZIP and installing the plugin are separate steps; attaching a ZIP to a conversation or extracting it into the cloud is not installation. Availability and upload permissions depend on the workspace. See OpenAI's [plugin installation guide](https://help.openai.com/en/articles/20001256-plugins-in-chatgpt).

Then ask your main dot:

> Check that you can read the installed dot-toolkit's dot-guidelines.

Check the actual installed entrypoint and the bundled resources needed for the task, including the intended version where available. Reading repository files or a local Codex installation does not establish availability in dot. Reuse a current successful check unless access, version, or environment changes.

If you want private instructions or additional skills managed as cloud files, ask:

> Set up your cloud with dot-toolkit.

You can choose private instructions and additional skill candidates independently: provide them now, defer them, or skip them. There is no need to create empty private files. The common candidates cover workflow design (`agent-workflow-design`), prompt design (`prompt-design`), evaluation (`agent-improve`), and plugin authoring (`plugin-creator-agent-plugins`). They are proposals, not automatic installations.

dot identifies each candidate's purpose, source, pinned revision, requirements, and proposed changes. For a plugin source, it preserves the **whole package**, including its manifest, skills, references, scripts, and any MCP or extension files. You choose which of its skills belong in the ordinary selection list. Package placement and skill selection are separate decisions.

Once the needed guidance is available, ask for the work itself. For example, after selecting `prompt-design`, ask “Make this request clearer and less ambiguous.” Routine requests, including creating or organizing files, use the common guidance without repeating initial setup or inspecting every installed package. Project-related documents and deliverables stay in the existing project layout; standalone document directories are optional.

## Managed cloud files

These paths are conventions for **dot's cloud**, not the user's computer or ChatGPT's complete plugin inventory:

| Path | Purpose |
| --- | --- |
| `/workspace/.codex/AGENTS-private.md` | Optional private instructions and conditional references |
| `/workspace/.agents/plugins/<plugin-name>/` | Complete adopted plugin package, preserving source layout |
| `/workspace/.agents/plugins-state/manifests/<plugin-name>.json` | Package provenance and raw-byte file hashes |
| `/workspace/.agents/skills/<skill-name>/` | Existing standalone skills, still supported |
| `/workspace/.agents/skills-state/manifests/<skill-name>.json` | Existing standalone schema-1 records, unchanged |
| `/workspace/.agents/skills-state/INDEX.md` | One deliberately selected catalog for both kinds of skill |

Plugin catalog entries use `plugin-name:skill-name` and link to `../plugins/plugin-name/skills/skill-name/SKILL.md`. Standalone entries retain `../skills/skill-name/SKILL.md`. The qualified catalog name does not change the source skill's frontmatter `name`. Each entry retains the full parsed description so dot can select relevant guidance.

A provenance record is separate from the upstream `plugin.json`; it does not rewrite the package or select every bundled skill. INDEX is not regenerated from all installed packages or records. If multiple applicable sources remain ambiguous, identify the intended source rather than silently combining them. An explicitly requested source takes precedence; otherwise deliberately selected cloud guidance takes precedence over an applicable same-name client copy.

Existing 0.2 standalone skills and private instructions need **no mandatory migration**. An explicit conversion to a plugin package is a separate change that preserves local edits and selected membership. The older [0.1-to-0.2 migration procedure](skills/dot-guidelines/reference/migrations/0.1-to-0.2.md) remains available for old common files and records.

Upgrading from 0.3 to 0.4 requires no data conversion. When the user reports an installation update or an explicit check observes the installed version transition, dot briefly offers a [workspace review](skills/dot-guidelines/reference/migrations/0.3-to-0.4.md) unless available history shows it was already addressed. If history is unavailable, it makes a conditional offer without asking you to reconstruct past handling. You can also request organization of folders created under 0.3 or earlier at any time, including usable folders you want to arrange more consistently. The update alone does not authorize file organization.

## Updates and maintenance

Ask for the specific instructions, package, standalone skill, or selection change you want. dot compares current files against their adoption records before changing them, pins the source to a resolved commit, and preserves unexplained edits. A retry uses that same commit. Hashes detect byte differences; they cannot recover lost content or prove code safety.

Plugin updates replace the package as a coordinated unit, while selection stays per skill. New bundled skills are not selected automatically. If an update removes or renames a selected skill, dot confirms how to handle that selection before applying the update. Selection-only changes leave package contents and adopted versions unchanged. Dependencies outside the package are considered separately.

Updating the Web-installed dot-toolkit does not update private files or cloud-managed packages. Likewise, copying a package into the cloud does not update its Web installation. See the bundled [maintenance procedure](skills/dot-guidelines/reference/skills-maintenance.md) for the record and preservation contracts.

## MCP and other executable components

Preserving MCP configuration, server code, or extension files does not register, start, or authenticate them. Enabling a component requires a separate request and the permissions supported by the target environment.

Keep these checks distinct: cloud file placement, Web plugin installation, a local MCP protocol test, and a tool actually being available in the dot conversation. Success at one does not establish the others. A CLI run is also not an MCP tool call. dot-toolkit itself includes no MCP server or hooks.

An optional [skill-diff example](https://github.com/peaceroad/ai-dotfiles/tree/main/examples/skill-diff-plugin) demonstrates a separate plugin with one skill, shared comparison logic, a CLI, and a stdio MCP adapter. It compares local snapshots supplied by dot; it is not required for setup and is not included in this package.

## Inspection and verification

The [read-only helpers](skills/dot-guidelines/reference/computer-checks.md) require **Node.js 24 or later** and use built-in modules only:

- `inspect-computer.mjs`: checks known paths and runtime availability; private-file existence only.
- `check-skill-index.mjs`: checks catalog structure, selected records, and targets for standalone and plugin skills.
- `verify-skill-files.mjs`: compares relative paths and raw-byte hashes. Use `--skill <name>` or `--all` for standalone skills; `--plugin <name>` or `--all-plugins` for plugin packages.

They emit JSON and never write, fetch, install, repair, or change selection. Exit `0` means complete or verified within the requested scope, `1` a mismatch, and `2` unverified evidence or an error. Passing checks do not establish description semantics, write permission, automatic loading, persistence, or MCP availability.

Actual main-dot selection and continuity require separate observations. Source tests and synthetic cases do not establish those behaviors; see the [acceptance guide](https://github.com/peaceroad/ai-dotfiles/blob/main/evals/dot-toolkit/README.md).

## Package from source

Use the maintainer's specified tag or commit, or the commit containing this guide if none is specified. After checking out that revision, run from the repository root:

```sh
git rev-parse HEAD
git show HEAD:plugins/dot-toolkit/plugin.json
git archive --format=zip --output=../dot-toolkit-0.4.0.zip HEAD:plugins/dot-toolkit
```

Confirm version `0.4.0` before archiving. The ZIP contains committed `plugin.json`, `README.md`, and `skills/` at its root, without an enclosing directory. Uncommitted edits are excluded. Choose a different output name if needed; do not commit generated ZIPs or include private files.

## Scope and background

`dot-guidelines` applies to the ongoing main dot, not ordinary Codex tasks or other agents. When delegating, pass the task, relevant conditions, intended project/output locations, and needed task skills rather than imposing all main-dot guidance. The receiving agent verifies access to the needed resources in its environment before dependent work. Task skills may still apply to delegated work. A role label or matching path alone does not establish the environment, access, or authority. Private instructions, actual inventories, and environment observations stay outside public source and packages. This toolkit does not replace built-in settings, permissions, or memory.

The [Japanese guide](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/dot-toolkit/README.md) covers setup and everyday use. Repository pages may be newer than an installed package. Product help: [Getting started with your dot](https://help.openai.com/en/articles/20001530-getting-started-with-your-dot) and the [privacy and safety FAQ](https://help.openai.com/en/articles/20001529-dots-privacy-security-and-safety-faqs).

The three response-quality bullets and four complete-loading bullets reproduce the corresponding text from [ai-dotfiles common Codex instructions at a pinned revision](https://github.com/peaceroad/ai-dotfiles/blob/5af65a5d4f355f8063b0871ea5baac76d143d5fc/home/.codex/AGENTS.md). The package format follows [Agent Plugins v1](https://agent-plugins.org/specification) and [Agent Skills](https://agentskills.io/specification); the cloud layout and management records are dot-toolkit conventions.
