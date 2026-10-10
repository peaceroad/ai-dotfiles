# dot-toolkit

An unofficial, experimental plugin that helps your main dot use recurring private instructions and self-authored or developing skills without being told their locations on every request. Version **0.2.0** bundles `dot-guidelines` for common guidance and conditional setup, inspection, maintenance, and migration procedures.

Private instructions and task skills are added separately, only when wanted. This cloud-file workflow does not replace ChatGPT's normal skill or plugin installation features.

## 1. Install in ChatGPT Web

Obtain a ZIP or shared plugin from its maintainer. A shared plugin needs no ZIP preparation.

To package the source yourself, use the maintainer's specified tag or commit. If none is specified, use the commit containing this guide and check that `plugins/dot-toolkit/plugin.json` declares version `0.2.0`. After checking out that revision, run from the repository root:

```sh
git rev-parse HEAD
git show HEAD:plugins/dot-toolkit/plugin.json
git archive --format=zip --output=../dot-toolkit-0.2.0.zip HEAD:plugins/dot-toolkit
```

The first two commands show the selected commit and version. The last creates a ZIP beside the checkout, with `plugin.json`, `README.md`, and `skills/` at its root, without an enclosing directory. Choose another output name if it already exists. The archive uses committed contents, excluding uncommitted edits. Keep generated ZIPs uncommitted and private files out of the package.

In ChatGPT Web, select the account and workspace you use for dot:

- **ZIP:** use the available plugin-upload feature. Eligible workspace administrators with upload access can open Plugins in the admin console, then Add → Upload plugin.
- **Shared plugin:** open the shared `dot-toolkit` in ChatGPT's Plugins directory.

Open the plugin details, select Install plugin if offered, and confirm it is installed and available. Upload and installation are separate checks; permissions and availability depend on your account and workspace. See OpenAI's [plugin installation and ZIP-upload instructions](https://help.openai.com/en/articles/20001256-plugins-in-chatgpt) if those options are missing.

Attaching a ZIP to a conversation, saving it to the Library, or extracting it in the cloud does not install a plugin. This guide uses the Web route for dot-toolkit; other plugins may support other routes.

Next, ask your main dot:

> Check that you can read the installed dot-toolkit's dot-guidelines.

Check the actual installed common skill and the bundled references needed for the intended task, including the intended version where identifiable. Repository access or a local Codex installation is not proof of availability in dot's cloud. If access fails, inspect the account, workspace, plugin state, and known version instead of repeatedly reinstalling or assuming synchronization. Reuse a current check unless the version or environment changes, access fails, or new evidence is needed.

## 2. Request cloud setup if needed

To manage private instructions or task skills as cloud files, ask: “Set up your cloud with dot-toolkit.” The [setup procedure](skills/dot-guidelines/reference/setup.md) is bundled; no separate `dot-setup.md` attachment is needed. You can use common guidance without creating private files or adopting task skills.

Choose now, later, or none separately for private instructions and additional skill candidates, if those decisions are not already known. dot checks existing files and edits, preserves pending inputs needed for resumption, and creates no empty instruction placeholders.

Initial setup offers these common candidates:

- `agent-workflow-design`: design recurring or long-running agent workflows
- `prompt-design`: create and revise model-facing instructions
- `agent-improve`: compare skills or plugins and run improvement experiments
- `plugin-creator-agent-plugins`: create, validate, and package plugins

dot shows each proposed skill's purpose, source, version, requirements, current placement, and changes. Approve additions and updates for the common and additional groups separately, or skip either. Existing authorization for that exact scope is reused. Listing a candidate does not approve placement, and a pending input pauses only dependent work.

Approved skills are copied as complete folders into dot's cloud. This is separate from installing dot-toolkit or registering skills through ChatGPT. Existing client-installed skills and unselected dependencies are not automatically copied, updated, or removed. See [maintenance](skills/dot-guidelines/reference/skills-maintenance.md) for version and preservation rules.

If you already use a 0.1 setup, request migration as described below instead of treating it as a new setup.

## 3. Make ordinary requests

Once dot can read the common skill and any settings needed for the task are ready, ask for the work itself. For example, after adopting `prompt-design`, ask: “Make this request clearer and less ambiguous.” The guidance directs dot to select relevant skills from their descriptions and read their instructions before dependent work; you need not name the skill or its path.

Routine work does not repeat installation checks, initial setup questions, or all-skill inspections. Genuinely absent optional files leave independent work and client-provided skills available. Unreadable files, malformed selection lists, or loss of previously used guidance pause only the affected work.

Implicit selection and continuity in the actual main dot remain unverified for 0.2. Users do not need to arrange a fresh-context test before ordinary use. Maintainer acceptance checks distinguish installed-resource access, helper execution, selection, and continuity; source tests and hashes are not behavioral evidence.

## Later changes

- **Private instructions:** specify the content and scope to apply. Even for the first private file, dot compares and verifies only the affected instructions and references; this does not require full initial setup or unrelated skill checks.
- **Task skills or their selection:** request the change. Selection-only work preserves skill contents and versions; removing an entry needs no source retrieval or repair. [Maintenance](skills/dot-guidelines/reference/skills-maintenance.md) preserves unexplained edits and unselected skills, pins source commits, and compares affected files and records before completion. Retries keep the recorded version; hashes cannot restore lost edits.
- **An existing 0.1 setup:** explicitly request [migration](skills/dot-guidelines/reference/migrations/0.1-to-0.2.md). It keeps adopted skill bytes and selected membership. Old common instructions are compared with their known adopted version; changed or unidentifiable contents are archived in full without overwrite and are not automatically adopted as private guidance. Old files are retired only after preservation and the installed replacement route are verified.
- **The plugin package:** update through its installation source, then verify the version your main dot can read. This does not automatically update private files or cloud-managed task skills.

## Files and checks

Common guidance and procedures stay in the plugin. Version 0.2 does not maintain common runtime copies at `/workspace/AGENTS.md` or `/workspace/.codex/dot-setup.md`.

The cloud files have separate roles:

- `/workspace/.codex/AGENTS-private.md`: optional private instructions and conditional references
- `/workspace/.agents/skills/<name>/`: each complete adopted skill, including references, scripts, and assets
- `/workspace/.agents/skills-state/INDEX.md`: the deliberately selected skills for ordinary use, with links to `../skills/<name>/SKILL.md` and full parsed descriptions
- `/workspace/.agents/skills-state/manifests/<name>.json`: source identity and raw-byte hashes under [schema 1](skills/dot-guidelines/reference/skills-maintenance.md#per-skill-manifest-schema-1)

A manifest does not select its skill. INDEX is not regenerated from all manifests. These paths are conventions for dot's cloud, not the user's computer or the client's complete installed-skill inventory.

The [read-only helpers](skills/dot-guidelines/reference/computer-checks.md) use **Node.js 24 or later**, with built-in modules only. Choose a helper when the task needs its evidence:

- `inspect-computer.mjs`: fixed paths and runtime; private-file existence only
- `check-skill-index.mjs`: catalog structure, selected manifests, and targets
- `verify-skill-files.mjs`: exact relative paths and raw-byte hashes

They emit JSON: exit `0` means complete or verified within scope, `1` a mismatch, and `2` unverified evidence or an error. They never write, fetch, install, repair, or change selection. A passing check does not prove description semantics, code safety, write permission, automatic loading, or persistence.

The package contains this README, `plugin.json`, one skill, four conditional references, and three helpers with `lib.mjs`. No MCP server, hooks, or skill-level `agents/openai.yaml` is included. Historical `dot/AGENTS.md` and `dot/dot-setup.md` remain in Git history.

## Scope and further reading

`dot-guidelines` applies to the ongoing main dot, not ordinary Codex tasks or subagents. It does not replace built-in settings, permissions, or memory. Files do not authorize execution, installation, external actions, or live migration. Keep private instructions, actual inventories, environment observations, and generated ZIPs out of public source and packages.

The [Japanese guide](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/dot-toolkit/README.md) covers everyday use; the [acceptance guide](https://github.com/peaceroad/ai-dotfiles/blob/main/evals/dot-toolkit/README.md) covers maintainer verification. Those pages may be newer than this package. Product help is available in [Getting started with your dot](https://help.openai.com/en/articles/20001530-getting-started-with-your-dot) and the [privacy and safety FAQ](https://help.openai.com/en/articles/20001529-dots-privacy-security-and-safety-faqs).

Response-quality and complete-reading principles adapt [ai-dotfiles common Codex instructions at a pinned revision](https://github.com/peaceroad/ai-dotfiles/blob/5af65a5d4f355f8063b0871ea5baac76d143d5fc/home/.codex/AGENTS.md). Their wording alone is not evidence of improved model performance. The package format follows [Agent Plugins v1](https://agent-plugins.org/specification) and [Agent Skills](https://agentskills.io/specification); its cloud layout and management records are dot-toolkit conventions.
