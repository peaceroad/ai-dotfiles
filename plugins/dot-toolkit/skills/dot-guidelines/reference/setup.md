# Setup and private inputs

Use for an explicit request to set up dot's own cloud or apply supplied private inputs. Attachment alone is not an apply request. Follow the scope, preservation, and permission boundaries in [dot-guidelines](../SKILL.md).

## Establish the starting point

Read [computer checks](computer-checks.md) and inspect the relevant current state before proposing or saving changes. Confirm the selected environment, allowed writes, required commands, and existing files. Read private content only when this setup needs it; a diagnostic existence check does not read that content for you.

Use the actual client-provided `dot-guidelines` and its bundled references. Identify the plugin version or resource identity when exposed. If installation is needed, follow this toolkit's ChatGPT Web route in the [plugin README](../../../README.md), then verify that the ongoing main dot can access the installed skill. Uploading a ZIP or reading repository source does not establish installation; a local Codex installation does not establish availability in dot's cloud. If installation status is unknown, resolve that uncertainty rather than claiming absence. Continue review or explicitly requested file-only work while plugin-dependent completion remains pending. Do not install, reinstall, or upgrade automatically.

Version 0.2 owns common guidance in the plugin. Do not create permanent `/workspace/AGENTS.md` or `/workspace/.codex/dot-setup.md` copies. When old files or inventory are present, use [migration](migrations/0.1-to-0.2.md) before switching their authority. Preserve any supplied edited procedure and source identity; resolve a conflict with the requested version rather than silently replacing it with a newer procedure.

## Optional private inputs

`/workspace/.codex/AGENTS-private.md` holds actual private instructions, direct text and/or conditional references. Create it only when there is content to apply. Preserve supplied reference names, scopes, and loading conditions, and verify referenced documents in the authorized private location.

During initial setup, if their status is unknown, ask once whether private instructions and additional skill candidates will each be supplied now, later, or are unnecessary. Keep the decisions separate. Silence is neither a choice nor approval. A deferred input blocks only a known dependent task; continue independent setup and normal work.

Retain decisions and unresolved inputs privately only when needed to resume. Use existing records when available; no new always-read state file, candidate-file template, operation log, or empty instruction file is required. Inputs attached to a single request may be sufficient. Preserve existing candidate files such as `dot-setup-private.md` and prior pending choices; optional does not mean disposable. Do not replace substantive private documents with status summaries.

For later private inputs, apply only the explicitly requested private scope after comparison. Preserve common guidance, adopted skills, and prior decisions; do not repeat initial setup. Update any retained pending decision after verifying the applied result. Keep private contents, filenames beyond these public conventions, and actual setup records out of public reports.

## Choose skills separately

Read [skills maintenance](skills-maintenance.md) for source selection, placement, INDEX, and manifests. A new setup need not install any task skills or create an empty catalog. Cloud placement and Web-client installation are separate; leave existing client installations alone unless that change is requested.

Offer these common candidates from [peaceroad/ai-dotfiles](https://github.com/peaceroad/ai-dotfiles), normally `main`, without automatically selecting them:

- `agent-workflow-design` at `plugins/agent-design-tools/skills/agent-workflow-design`: recurring or long-running agent workflow design, including waiting and recovery; uses applicable instruction-design and skill-authoring guidance.
- `prompt-design` at `plugins/agent-design-tools/skills/prompt-design`: creating and reviewing model-facing instructions; requires its applicable target references and skill-authoring guidance for structural changes.
- `agent-improve` at `plugins/agent-eval-tools/skills/agent-improve`: evidence-based evaluation and comparisons; executing trials also needs a suitable harness, available capabilities, and authorized scope and budget.
- `plugin-creator-agent-plugins` at `plugins/agent-plugin-tools/skills/plugin-creator-agent-plugins`: portable plugin authoring and validation; check the selected tools' runtime needs. Its standalone workflows do not require the `agent` CLI.

Keep common candidates and privately supplied additional candidates separate when presenting and approving changes. These groups describe selection provenance, not repository visibility. Show each proposed skill's purpose, source/path, resolved version, requirements, existing status, and action: retain, add, update, conflict, or skip. Reuse clear approval covering the exact operation, targets, version scope, and destination; otherwise obtain the missing group's approval. Approval of one group does not approve the other. Either can be skipped, and no additions does not authorize updates or removals.

Deduplicate an identical authorized source/path/commit placement without treating the other group's selection as approved. Resolve affected same-name/source/version conflicts before placement; an unselected candidate does not block independent approved work. Preserve installed skills omitted from selection. Do not automatically add upstream or dependency skills; explain a required missing dependency and obtain the necessary resolution.

## Verify and report

Read back changed private files and references, and validate any managed skills and selected INDEX using the maintenance procedure. Confirm the installed entry and resources are accessible before claiming plugin-dependent setup is ready. Keep the current operation's resources at one identified version; if they change during work, reconcile before continuing.

Report the common plugin identity and availability, private inputs applied or pending, skill groups added/updated/retained/skipped, and any unresolved target with its next needed input. Do not reproduce confidential instructions. Distinguish verified files, installed-resource retrieval and script execution, current-conversation loading, implicit selection, and continuity across an observed boundary. A successful source check or file placement does not establish automatic discovery, runtime behavior, or persistence.
