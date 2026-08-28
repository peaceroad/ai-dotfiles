---
name: plugin-creator-agent-plugins
description: Use when creating, updating, auditing, validating, or refreshing local Codex installations of portable Agent Plugins v1 packages, or migrating a Codex-specific plugin to that format, including root plugin.json, contained Agent Skills, MCP packaging through mcp.json, documented client extensions, and optional Codex marketplace integration. Use skill-creator for a standalone Agent Skill, and use the built-in plugin-creator when the source of truth is only the Codex-specific .codex-plugin/plugin.json format.
metadata:
  version: "0.2.0"
---

# Plugin Creator for Agent Plugins v1

Create, update, audit, and validate plugins whose portable Agent Plugins v1 package is the source of truth. Keep Codex-specific distribution and installation data separate from the portable package.

## Sources of truth and boundaries

- Treat the current [Agent Plugins specification](https://agent-plugins.org/specification) as normative for the portable package. Check the current specification and the target client's official documentation when exact fields, versions, or client behavior could change the result.
- Follow the current [Agent Skills specification](https://agentskills.io/specification) for skills contained in a plugin.
- Edit the source repository or another writable source of truth identified by the user. Do not reverse-copy from an installed plugin, a client cache, or the running `${PLUGIN_ROOT}`.
- Do not modify the built-in `plugin-creator`. This skill provides the Agent Plugins v1 path alongside it.
- Do not treat marketplace metadata, installation state, caches, or publication settings as portable Agent Plugins v1 components.
- Use `skill-creator` instead when the task concerns a standalone Agent Skill rather than a plugin package.
- For MCP servers, this skill covers plugin packaging, configuration, and integration validation. Use the relevant engineering workflow to implement or debug the server itself, then return here to validate the package boundary.
- This skill provides a focused migration path from a Codex-specific plugin package to an Agent Plugins v1 source of truth. It does not claim migration coverage for other client formats or keep client-native manifests inside the portable source by default.

## Route the request

Load only the material needed for the request.

- **Create, update, or review a package, its contained skills, or its MCP integration:** Read [authoring.md](references/authoring.md).
- **Migrate a Codex-specific plugin to Agent Plugins v1:** Read [codex-migration.md](references/codex-migration.md) first, then load the authoring, validation, and Codex-integration references it calls for.
- **Validate conformance:** Read [validation.md](references/validation.md), then use `scripts/validate-agent-plugin.mjs` where Node.js is available.
- **Register, install, or refresh through a Codex marketplace:** Validate the portable source first, then read [codex-integration.md](references/codex-integration.md). Prefer a repository-owned management script; when none exists, use `scripts/manage-local-agent-plugin.mjs` for the shared Agent Plugins v1 and Codex integration boundary.
- **Give a repository a repeatable local manager or repository-specific validation checks:** Read [repository-management.md](references/repository-management.md). Scaffold the managed runner only when configuration adds value; keep simple packages on the direct manager path.
- **Check whether the built-in `plugin-creator` describes Agent Plugins v1:** Run `node scripts/check-builtin-plugin-creator.mjs`. This is a read-only instruction check and does not establish runtime support.
- **Create or update only the Codex-specific legacy format:** Use the built-in `plugin-creator`.

If an existing root `plugin.json` declares the Agent Plugins schema, preserve that portable format. For a new portable plugin whose format is otherwise unspecified, use Agent Plugins v1. Ask only when the format choice would materially change the deliverable and neither the request nor the existing repository resolves it.

## Working principles

1. For a change request, inspect the repository instructions, existing manifests, distribution path, and target clients. For a review or diagnosis, report findings without editing unless the user also requests changes.
2. Separate the portable core, documented client extensions, compatibility files, and distribution metadata. Do not present a client-specific feature as portable.
3. Start new packages with only the components they provide. Do not create empty `skills/`, `mcp.json`, or client-extension directories.
4. For an existing package, identify its source of truth and active consumers before changing compatibility files. Make removal reversible until the portable replacement is verified. When the requested destination is an Agent Plugins v1 source of truth, remove `.codex-plugin/plugin.json` from the final portable package; keep any still-required client-native distribution as a separate derived package rather than a second manifest inside that source.
5. When adding or updating a plugin-contained skill, keep its trigger boundary distinct from neighboring skills and keep runtime resources inside that skill's directory. Do not nest another `SKILL.md` beneath a skill merely to reuse it; discovery behavior differs across clients.
6. If the repository already provides validation or installation scripts, inspect their behavior and side effects, then prefer that repository contract over duplicating the same steps manually.
7. After changes, validate the portable package and check each target client's behavior separately. Report checks that could not be run instead of treating them as successful.

## Completion

Report the changed source of truth, portable components, retained compatibility files, validation performed, and unresolved checks. If the plugin was reinstalled in Codex, tell the user to verify it in a new task because an existing task may retain previously loaded instructions or tool definitions.
