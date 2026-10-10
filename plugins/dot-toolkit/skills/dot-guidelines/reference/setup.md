# Setup and private inputs

Use for an explicit request to set up dot's own cloud or apply supplied private inputs. Attachment alone is not an apply request. Follow [dot-guidelines](../SKILL.md) for authority, preservation, privacy, and reuse of current checks.

Route by the requested change, even in a new environment. For private instructions only, use **Optional private inputs** and **Verify and report** below: compare the affected instructions, references, and retained pending decisions, then apply and read back that scope. Skip initial candidate selection and unrelated skill/helper checks. For a requested initial setup, follow the full procedure; skill-only changes use [skills maintenance](skills-maintenance.md).

## Establish the starting point

Inspect the selected environment, allowed scope, and relevant existing files before proposing or saving changes. Read private content only when this setup needs it. Use [computer checks](computer-checks.md) when a helper is needed for the requested inspection or managed-file verification; choose the checks that answer that question. An existence check does not read private content or establish write permission.

Use the actual client-provided `dot-guidelines` and the references needed for this operation, at one identified version. Reuse a current installation check; if availability is unknown, resolve it without assuming absence. When installation is needed, follow the [plugin README](../../../README.md) and verify access from the main dot. A ZIP, repository copy, or local Codex installation is not that evidence. Review and explicitly requested file-only work can continue while plugin-dependent completion is pending. Do not install, reinstall, or upgrade automatically.

Version 0.2 owns common guidance in the plugin. Do not create permanent `/workspace/AGENTS.md` or `/workspace/.codex/dot-setup.md` copies. When old files or inventory are present, use [migration](migrations/0.1-to-0.2.md) before switching their authority. Preserve any supplied edited procedure and source identity; resolve a conflict with the requested version rather than silently replacing it with a newer procedure.

## Optional private inputs

`/workspace/.codex/AGENTS-private.md` holds actual private instructions, direct text and/or conditional references. Create it only when there is content to apply. Preserve supplied reference names, scopes, and loading conditions, and verify referenced documents in the authorized private location.

During initial setup, if their status is unknown, ask once whether private instructions and additional skill candidates will each be supplied now, later, or are unnecessary. Keep the decisions separate. Silence is neither a choice nor approval. A deferred input blocks only a known dependent task; continue independent setup and normal work.

Retain decisions and unresolved inputs privately only when needed to resume. Use existing records when available; no new always-read state file, candidate-file template, operation log, or empty instruction file is required. Inputs attached to a single request may be sufficient. Preserve existing candidate files such as `dot-setup-private.md` and prior pending choices; optional does not mean disposable. Do not replace substantive private documents with status summaries.

Before writing private inputs, compare the affected current contents with the inspected state and reconcile intervening edits. Preserve common guidance, adopted skills, and prior decisions. Update any retained pending decision after verifying the applied result. Keep private contents, filenames beyond these public conventions, and actual setup records out of public reports.

## Choose skills separately

A new setup need not adopt any task skills or create an empty catalog. If skills are selected, read [skills maintenance](skills-maintenance.md) before source acquisition or placement; it owns version selection, file comparison, INDEX, and manifests. Cloud placement and Web-client installation are separate; leave existing client installations alone unless that change is requested.

Offer these common candidates from [peaceroad/ai-dotfiles](https://github.com/peaceroad/ai-dotfiles), normally `main`, without automatically selecting them:

- `agent-workflow-design` at `plugins/agent-design-tools/skills/agent-workflow-design`: recurring or long-running agent workflow design, including waiting and recovery; uses applicable instruction-design and skill-authoring guidance.
- `prompt-design` at `plugins/agent-design-tools/skills/prompt-design`: creating and reviewing model-facing instructions; requires its applicable target references and skill-authoring guidance for structural changes.
- `agent-improve` at `plugins/agent-eval-tools/skills/agent-improve`: evidence-based evaluation and comparisons; executing trials also needs a suitable harness, available capabilities, and authorized scope and budget.
- `plugin-creator-agent-plugins` at `plugins/agent-plugin-tools/skills/plugin-creator-agent-plugins`: portable plugin authoring and validation; check the selected tools' runtime needs. Its standalone workflows do not require the `agent` CLI.

Keep common candidates and privately supplied additional candidates separate when presenting and approving changes. These groups describe selection provenance, not repository visibility. Show each proposed skill's purpose, source/path, resolved version, requirements, existing status, and action: retain, add, update, conflict, or skip. Reuse clear approval covering the exact operation, targets, version scope, and destination; otherwise obtain the missing group's approval. Approval of one group does not approve the other. Either can be skipped, and no additions does not authorize updates or removals.

Deduplicate an identical authorized source/path/commit placement without treating the other group's selection as approved. Resolve affected same-name/source/version conflicts before placement; an unselected candidate does not block independent approved work. Preserve installed skills omitted from selection. Do not automatically add upstream or dependency skills; explain a required missing dependency and obtain the necessary resolution.

## Verify and report

Read back changed private files and references. For skill changes, validate the affected files, manifests, and INDEX through the maintenance procedure. Before claiming plugin-dependent setup is ready, establish access to the installed entry and resources needed for this operation; a still-current check suffices. If their identity changes during work, reconcile before continuing.

Report what was applied, retained, or skipped, what was verified, and any unresolved target with the input needed to resume. For initial setup, include plugin identity/availability and the separate private-input and skill-group decisions. A scoped private-input change needs only its result and material dependencies, not the full setup checklist. Keep file checks, installed-resource access/execution, and behavioral claims distinct; report only observations actually made. Confidential contents stay out of the report.
