# Migrate a Codex Plugin to Agent Plugins v1

Use for conversion from a `.codex-plugin/plugin.json` source to a portable Agent Plugins source. This mapping does not cover arbitrary client formats. A model-only instruction update does not require package-format migration.

## Establish the requested result

Identify the source, active consumers, and capabilities to preserve. Use version control or an authorized temporary location outside the plugin root to keep the starting package recoverable. Inspect client registration and installed state when they are part of the migration outcome, without changing them during baseline collection.

For a source-only request, finish portable conversion and source validation, and report client operation as untested. When installation or continued client operation is requested, also use [Codex integration](codex-integration.md) for that client.

## Map components without losing requirements

| Existing artifact | Destination or decision |
| --- | --- |
| Portable root `plugin.json` | Final portable manifest; preserve if already present. |
| `skills/<name>/SKILL.md` and its resources | Preserve as contained Agent Skills after validation. |
| `.codex-plugin/plugin.json` | Migration input. Remove from the final portable package. |
| `.mcp.json` | Convert supported configuration to root `mcp.json`; validate fields and semantics rather than only renaming. |
| `.app.json`, hooks, commands, custom agents, or other native features | Account for every required feature: a documented client extension or a separate derived client-native package when needed. Ask only if omission or separation would materially change the requested result and intent does not resolve it. |
| Skill-local `agents/openai.yaml` | Optional client metadata may remain inside its skill; it is not a portable root component or invented extension. |
| Repository Marketplace and development configuration | Remain outside the portable package contract. |
| Installed cache or `${PLUGIN_ROOT}` | Installation evidence only; never reverse-copy into the source. |

Use [authoring.md](authoring.md) for portable metadata and component rules. Map only fields defined by the current specification. Do not move unknown client fields into root `plugin.json` or invent a reverse-domain namespace. Preserve required application behavior before removing its native representation.

## Construct and verify the candidate

Build root `plugin.json`, contained skills, and `mcp.json` when needed. Keep development and distribution data in their owning locations. Validate the portable source while the original package remains recoverable.

Before a portable-only client test, remove `.codex-plugin/plugin.json` and any obsolete native fallback configuration from the candidate. Keep the recoverable baseline outside that package; renaming a manifest inside the root can leave the test ambiguous. Maintain a still-required native distribution separately from the portable source.

## Interpret evidence and recover

The published Agent Plugins specification defines portable conformance. Current official OpenAI documentation describes a client contract; installed CLI help describes that build's available commands; installation and a new task show actual behavior on the tested surface. These may disagree. Record the build and evidence that matter to the result instead of asserting universal support or rejection.

If a portable-only test fails, inspect manifest validation, Marketplace source selection, snapshot version, cache freshness, CLI build, and client configuration. A document describing only the native format is insufficient evidence of runtime rejection; a successful local test is insufficient evidence for untested versions or publication surfaces.

Reconcile completed effects before retrying, using the integration recovery guidance. Restore an affected working deployment only within the authorized scope. If continued native compatibility is required, maintain a separate derived package; do not silently reintroduce a second manifest into the portable source and call the migration complete.

When a specification lookup or required client check is unavailable, apply [validation.md](validation.md#missing-evidence-and-failures). Preserve completed source work and explain the particular compatibility property left unresolved.

## Completion

The final portable source contains root `plugin.json` and no `.codex-plugin/plugin.json`. Account for converted, removed, or separately distributed native capabilities and any unresolved compatibility or documentation/runtime mismatch. Apply the repository's version policy through the integration workflow; never recreate a native manifest as a cachebuster.
