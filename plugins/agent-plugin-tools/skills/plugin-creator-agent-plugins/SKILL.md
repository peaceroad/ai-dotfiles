---
name: plugin-creator-agent-plugins
description: "Use when creating, revising, validating, or migrating portable Agent Plugins v1 packages, setting up their local development or Codex installation, or assembling filesystem Marketplaces of plugins and standalone Skills. Use skill-creator for standalone Skill authoring and the built-in plugin-creator for a Codex-specific .codex-plugin/plugin.json source."
metadata:
  version: "0.6.0"
---

# Plugin Creator for Agent Plugins v1

Deliver the requested portable package, development tooling, distribution, or local installation, with evidence appropriate to that outcome. Keep the editable source, generated copies, and client state distinct.

## Scope and authority

For review or planning, inspect and report. For creation or changes, complete the requested work and relevant validation. Infer routine details from the request and repository; ask only when unresolved information changes correctness, scope, or authority, and continue independent work while waiting.

Source editing, shared assembly, installation, and publication have different effects. Perform the stages requested or already authorized; this skill's routes do not expand that scope. Preserve existing authorization, prepare a concrete result before requesting any missing authority, and obey runtime denials.

Skill conventions and examples do not override the user's explicit choices or the runtime's instruction hierarchy. If a rule causes a consequential pause, identify its file or tool contract and explain the requirement, distinguishing it from your interpretation.

## Source and format

- Edit the user-identified source repository. Installed plugin copies, caches, and `${PLUGIN_ROOT}` are derived resources, not editable sources to reverse-copy. Distribution may accept an explicitly selected installed standalone Skill as a snapshot; that does not authorize scanning its installed root.
- The [Agent Plugins specification](https://agent-plugins.org/specification) governs the portable package; the [Agent Skills specification](https://agentskills.io/specification) governs contained skills. Verify current sources when a decision depends on exact fields, versions, or client support. Reuse sufficient current evidence for unchanged contracts.
- Preserve an existing Agent Plugins root `plugin.json`. For a new portable package with no format specified, use Agent Plugins v1. Resolve a consequential format ambiguity from the request and repository before asking.
- Keep portable components, documented client extensions, repository tooling, and distribution metadata in their owning locations. The built-in `plugin-creator` remains separate; use it when the requested source format is Codex-specific.
- For MCP, this skill owns configuration, packaged resources, and integration checks. Use the relevant engineering workflow for the server's application behavior.

## Route the request

Load references for the affected decisions, not every stage a plugin might eventually reach.

| Requested outcome | Reference and tool |
| --- | --- |
| Author or revise the package, contained skills, or MCP configuration | [Authoring](references/authoring.md); use `skill-creator` for skill creation or structural changes. |
| Convert a Codex-native source into a portable source | [Codex migration](references/codex-migration.md). Other source formats need their own verified mapping. |
| Validate source or select checks for a change | [Validation](references/validation.md); `scripts/validate-agent-plugin.mjs`. |
| Install or refresh a developer source, or install from an assembled Marketplace | [Codex integration](references/codex-integration.md); use the repository manager for developer sources and the Codex CLI for assembled copies. |
| Add repeatable repository checks or local version policy | [Repository management](references/repository-management.md); `scripts/scaffold-local-agent-plugin.mjs` only when the extra contract is useful. |
| Assemble or check a shared filesystem Marketplace | [Marketplace distribution](references/marketplace-distribution.md); `scripts/assemble-agent-marketplace.mjs`. |
| Integrate a private assembly configuration or multiple contributors | [Marketplace orchestration](references/marketplace-orchestration.md), alongside the distribution contract. |
| Inspect built-in `plugin-creator` instruction coverage | `node scripts/check-builtin-plugin-creator.mjs`; this read-only probe does not establish runtime support. |

Prefer an existing repository command after inspecting its behavior and side effects. Resolve bundled script paths from this skill directory. Preserve the source and version relationship across the requested stages.

## Completion

Select checks with [validation.md](references/validation.md). Source edits can finish with source validation; installation and new-task discovery apply when that integration is part of the requested outcome.

Report the result, changed source files, material compatibility decisions, and verification limits. For partial failure, distinguish completed effects from pending work and identify the next safe action. Keep the report proportional to the requested outcome.
