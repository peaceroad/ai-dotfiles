# dot-toolkit

An unofficial, experimental plugin for keeping recurring instructions and file-based skills within reach of your main dot, without explaining their locations on every request. Version **0.2.0** provides `dot-guidelines`, a common skill with setup and maintenance procedures. Your private instructions and chosen task skills are added separately.

## 1. Install in ChatGPT Web

Obtain the ZIP or a shared plugin from its maintainer. To package the source yourself, check out the intended 0.2 revision and ZIP the contents of [plugins/dot-toolkit/](https://github.com/peaceroad/ai-dotfiles/tree/main/plugins/dot-toolkit): `plugin.json`, `README.md`, and `skills/` must be at the archive root, without an enclosing directory. Keep generated ZIPs uncommitted and exclude private files.

For a Git checkout, run this from the repository root after selecting the intended revision. Choose a different output name if that ZIP already exists:

```sh
git archive --format=zip --output=../dot-toolkit-0.2.0.zip HEAD:plugins/dot-toolkit
```

This writes the plugin-only ZIP beside the checkout. It includes committed `HEAD` contents, not uncommitted edits.

Start in ChatGPT Web with the account and workspace you use for dot.

- If you received a ZIP, add it through the available plugin-upload feature. Upload access depends on your account and workspace. Eligible administrators can use their workspace's Plugins page in the admin console, then Add → Upload plugin.
- If the plugin was shared with you, open that `dot-toolkit` in ChatGPT's Plugins directory.

Open its details, select Install plugin if offered, and confirm it is installed and available. Uploading a ZIP is a separate step from checking installation. See OpenAI's [plugin installation and ZIP-upload instructions](https://help.openai.com/en/articles/20001256-plugins-in-chatgpt) for current availability and permissions.

Attaching a ZIP to a conversation, saving it to the Library, or extracting it in the cloud is not installation. This guide chooses the Web route for dot-toolkit; it does not claim that every plugin can only be installed on the web.

Next, ask your main dot: “Check that you can read the installed dot-toolkit's dot-guidelines.” Verify the actual installed common skill, any bundled references needed for the intended task, and the intended version where identifiable. Repository source access or a local Codex installation is not proof that dot can use that version. Resolve conflicting copies rather than assuming synchronization between environments.

## 2. Request cloud setup if needed

To add file-based private instructions or task skills, ask: “Set up your cloud with dot-toolkit.” The [setup procedure](skills/dot-guidelines/reference/setup.md) is bundled; a separate `dot-setup.md` attachment is unnecessary. Common guidance does not require you to create private files or adopt task skills.

Choose now, later, or none separately for private instructions and additional skill candidates. dot checks existing files and edits before making changes. It retains only decisions needed to resume; empty or status-only instruction files are unnecessary.

During setup, dot presents these common candidates and explains their uses:

- `agent-workflow-design`: design recurring or long-running agent workflows
- `prompt-design`: create and revise model-facing instructions
- `agent-improve`: compare skills or plugins and run improvement experiments
- `plugin-creator-agent-plugins`: create, validate, and package plugins

Before asking you to choose, dot shows each candidate's source, proposed version, requirements, and changes. Approve the common and additional groups separately, or skip either. Listing candidates does not authorize placement, and a pending input blocks only work that concretely depends on it.

Approved task skills are copied as complete folders into dot's cloud. This is separate from installing dot-toolkit itself or registering skills through ChatGPT. Existing client-installed skills are not automatically duplicated, updated, or removed.

## 3. Use dot for ordinary requests

After installation and any needed setup checks, make an ordinary request. For example, if you adopted `prompt-design`, ask: “Make this request clearer and less ambiguous.” The guidance directs dot to choose relevant skills from their descriptions and read the required instructions before working. You do not need to name the skill in that request.

Genuinely absent optional files do not trigger replacement setup. Unreadable files, malformed catalogs, or loss of previously used guidance are reported separately; only dependent work pauses. `dot-guidelines` applies to the main dot, not as blanket policy for ordinary Codex tasks or subagents.

You do not need to arrange a fresh-context or environment test before ordinary use. Implicit selection and continuity in the actual main dot remain unverified for 0.2. Maintainer acceptance checks separately cover installed resources, helper execution, selection, and continuity; source tests and file hashes are not behavioral evidence. Migration retains its stricter checks before old files are retired.

## Later changes

- **Private instructions or task skills:** name the intended change. The [maintenance procedure](skills/dot-guidelines/reference/skills-maintenance.md) compares current files with the adopted record, preserves unexplained edits, and changes only approved skills and catalog membership. Retries reuse the pinned commit. Hashes cannot restore lost edits.
- **An existing 0.1 setup:** explicitly request [migration](skills/dot-guidelines/reference/migrations/0.1-to-0.2.md). It preserves current skill bytes and selected membership; upstream updates are separate. Modified or unidentifiable old common instructions are archived without overwrite and are not automatically adopted as private guidance. Old files are retired only after preservation and the installed replacement route are verified.
- **The plugin package:** update through its installation source, then verify the version your main dot can read. Plugin updates do not automatically update private files or cloud-managed task skills.

## Files and checks

Common instructions and setup procedures stay in the plugin. Version 0.2 does not maintain common runtime copies at `/workspace/AGENTS.md` or `/workspace/.codex/dot-setup.md`.

In dot's cloud:

- `/workspace/.codex/AGENTS-private.md` holds optional private instructions and conditional references.
- `/workspace/.agents/skills/<name>/` holds each adopted skill, including its references, scripts, and assets.
- `/workspace/.agents/skills-state/INDEX.md` selects skills for ordinary use. It links to `../skills/<name>/SKILL.md` and preserves each full parsed description. It is not regenerated from all manifests.
- `/workspace/.agents/skills-state/manifests/<name>.json` records a skill's source and raw-byte hashes using [schema 1](skills/dot-guidelines/reference/skills-maintenance.md#per-skill-manifest-schema-1). A manifest does not select its skill.

The bundled [computer checks](skills/dot-guidelines/reference/computer-checks.md) require **Node.js 24 or later** and use built-in modules only. `inspect-computer.mjs` checks known paths, including private-file existence only; `check-skill-index.mjs` checks catalog structure and targets; `verify-skill-files.mjs` compares file bytes. They emit JSON: exit `0` means complete or verified within scope, `1` means a mismatch, and `2` means unverified evidence or an error. They never write, fetch, install, repair, or change selection. They do not prove semantic correctness, safe code, write permission, user-computer access, or persistence.

The package contains `plugin.json`, this README, `skills/dot-guidelines/SKILL.md`, its four conditional references, and the three helpers with `lib.mjs`. It contains no MCP server, hooks, or skill-level `agents/openai.yaml`. The removed `dot/AGENTS.md` and `dot/dot-setup.md` sources remain in Git history.

## Scope and further reading

This toolkit does not replace dot's built-in settings, permissions, or memory. Files do not authorize execution, installation, external actions, or live migration. Keep private instructions, actual inventories, environment observations, and generated ZIPs out of public source and packages.

The [Japanese guide](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/dot-toolkit/README.md) covers the user journey; the [acceptance guide](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/dot-toolkit/setup.md#読み込みと自動選択の受け入れ確認) explains verification. Those pages may be newer than this package. Product help is available in [Getting started with your dot](https://help.openai.com/en/articles/20001530-getting-started-with-your-dot) and the [privacy and safety FAQ](https://help.openai.com/en/articles/20001529-dots-privacy-security-and-safety-faqs).

Response-quality and complete-reading principles adapt [ai-dotfiles common Codex instructions at a pinned revision](https://github.com/peaceroad/ai-dotfiles/blob/5af65a5d4f355f8063b0871ea5baac76d143d5fc/home/.codex/AGENTS.md). Their wording alone is not evidence of improved model performance. The package format follows [Agent Plugins v1](https://agent-plugins.org/specification) and [Agent Skills](https://agentskills.io/specification); its cloud layout and management records are dot-toolkit conventions.
