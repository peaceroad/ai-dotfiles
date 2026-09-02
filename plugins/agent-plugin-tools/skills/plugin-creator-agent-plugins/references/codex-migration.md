# Migrate a Codex Plugin to Agent Plugins v1

Use this reference when migrating a Codex package built around `.codex-plugin/plugin.json` to a portable Agent Plugins v1 source of truth. It does not define migration mappings for other client-specific plugin formats.

## Evidence and decision model

Keep four questions separate:

1. **Portable conformance:** Does the source satisfy the current published Agent Plugins specification and the Agent Skills specification?
2. **Documented Codex contract:** What format does current official OpenAI documentation claim to support?
3. **Installed Codex behavior:** Does the installed Codex build accept, install, enable, and snapshot the portable package?
4. **Runtime discovery:** In a new Codex task, are the expected skills and MCP servers actually available and usable?

Official OpenAI documentation is evidence of the documented contract, but it may lag or lead an installed runtime. A built-in skill or documentation page that describes only the Codex-native manifest does not prove that the runtime rejects root `plugin.json`. Treat Agent Plugins v1 support as the expected baseline for the current Codex plugin runtime, while still recording the installed build and tested surface rather than generalizing one result to every historical Codex version or publishing path.

Treat the published Agent Plugins specification as normative for the portable package. Treat Codex help, OpenAI documentation, installation snapshots, and new-task behavior as separate evidence about Codex. If current specifications or OpenAI documentation cannot be retrieved securely, do not disable TLS verification or substitute an installed cache as authority; report the retrieval failure and identify any bundled guidance as last-known information.

## Classify the existing artifacts

Identify the source repository, Codex marketplace root, installed cache, intended Codex surfaces, and supported Codex-version range before editing. Use the source repository as the only writable source of truth.

| Existing artifact | Migration treatment |
| --- | --- |
| Root `plugin.json` | Portable manifest and final source of truth. |
| `skills/<name>/SKILL.md` and skill resources | Portable Agent Skills; preserve after validating each skill. |
| Root `mcp.json` | Portable MCP configuration. |
| `.codex-plugin/plugin.json` | Codex-native manifest. Use only as migration input; do not retain it in the final Agent Plugins v1 package. |
| `.mcp.json` | Codex-native MCP configuration. Convert supported servers to root `mcp.json`, validate the portable semantics, then remove it from the portable package. |
| `.app.json`, hooks, commands, custom agents, or other Codex-native components | No Agent Plugins v1 core equivalent. Omit, move to a documented client extension, or maintain in a separate Codex-native distribution when the user explicitly needs that surface. |
| `skills/<name>/agents/openai.yaml` | Skill-local OpenAI metadata. It may remain when the Agent Skills package permits additional files and unsupported clients can ignore it; it is not an Agent Plugins core component or a root client extension. |
| `.agents/plugins/marketplace.json` | Client distribution metadata outside the portable package contract. Keep it at repository or personal marketplace scope. |
| Installed plugin cache or running `${PLUGIN_ROOT}` | Derived installation state. Never copy it back into the source repository. |

Do not invent a reverse-domain extension namespace for client behavior the client has not documented. Do not copy unknown fields from a client-native manifest into root `plugin.json`; map only portable metadata and components defined by the current specification.

## Migration workflow

### 1. Establish the baseline

- Read repository instructions and determine the intended source of truth and Codex surfaces.
- Inspect the installed Codex CLI help before relying on examples in this reference.
- Record the current marketplace registration, installed version, enabled state, source path, and discovered components without mutating them.
- Identify which Codex-native components have no portable equivalent and ask for direction only when dropping or separating one would materially change the requested result.

Read [codex-integration.md](codex-integration.md) for current CLI probes, marketplace registration, installed snapshots, and the distinction between local registration and publication. Record the baseline before changing package structure, but keep those ongoing Codex operations owned by that reference.

### 2. Build the portable source first

1. Add root `plugin.json` with the current published Agent Plugins schema and portable metadata.
2. Keep valid Agent Skills under immediate children of `skills/`.
3. If MCP servers are provided, convert their configuration to root `mcp.json`; do not merely rename `.mcp.json` because fields and failure semantics may differ.
4. Keep marketplace, release, evaluation, and repository-management data outside the portable plugin directory unless the installed plugin needs a resource at runtime.
5. Validate the portable package while the existing Codex-native manifest is still recoverable.

The portable validator and each contained-skill validator establish source conformance only. They do not prove that the installed Codex runtime discovered the package.

### 3. Isolate the Codex manifest reversibly

Before testing a portable-only package, make `.codex-plugin/plugin.json` recoverable through version control or a temporary location outside the plugin root, then remove it from the candidate package. Do not hide or rename it inside the plugin root: a client may still discover it, making the test inconclusive.

The final Agent Plugins v1 source must not contain `.codex-plugin/plugin.json`. If a current Codex portable-only test fails, preserve the failure evidence and diagnose manifest validation, marketplace source selection, installed version, cache state, CLI build, and client configuration before questioning Agent Plugins support. Restore the working tree only as needed to avoid disrupting current users, and do not silently make the Codex manifest a second source of truth. A separate client-native package is an exception for an explicitly targeted historical or different client, not the normal Codex path.

### 4. Test Codex independently

With `.codex-plugin/plugin.json` absent from the candidate package, follow [codex-integration.md](codex-integration.md) to register or confirm the marketplace, install the plugin, inspect the snapshot, and start a new task.

Verify all applicable observations, not merely a zero exit code:

- The installed snapshot identifies the intended plugin and marketplace.
- The installed version matches root `plugin.json`.
- The plugin is enabled.
- A local source resolves to the intended source checkout rather than a cache or another clone.
- A new Codex task discovers the expected skills and MCP servers.
- Representative skill activation or MCP calls work when the package provides them.

An instruction audit such as `scripts/check-builtin-plugin-creator.mjs` reports what the built-in skill describes. It is not a runtime probe. If official OpenAI documentation or the built-in skill still requires `.codex-plugin/plugin.json` while the installed runtime passes the portable-only checks, report the documentation/runtime mismatch and the tested Codex build or surface. Do not generalize that result to untested Codex versions or publishing paths.

### 5. Finalize the boundary

- Remove `.codex-plugin/plugin.json` from the portable source after the portable package and required target-client behavior are verified.
- Remove or separate other obsolete client-native files only after their portable replacement or deliberate omission is accounted for.
- Keep marketplace registration and install state outside the portable contract.
- If an explicitly targeted historical Codex version still cannot load the portable package after its environment and configuration are checked, report that compatibility result. Add a separate derived Codex-native package only when the user needs that distribution; do not reintroduce the Codex manifest into the portable source merely to make the migration appear complete.

Version-based cache refresh is an installation concern, not a package-conversion step. Follow the policy in [codex-integration.md](codex-integration.md), update only root `plugin.json`, and never restore `.codex-plugin/plugin.json` as a cachebuster.

## Completion report

Report the portable source path, removed or separated Codex-native artifacts, specification validation, Codex probes, version and source snapshot, new-task discovery, documentation/runtime mismatches, and checks that could not be run. Distinguish portable conformance from tested Codex compatibility.
