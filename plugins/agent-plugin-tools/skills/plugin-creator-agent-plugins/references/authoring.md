# Author and Maintain Agent Plugins v1

Use this reference when creating, updating, or reviewing the structure of a portable plugin. The current Agent Plugins specification remains normative; this file covers recurring authoring decisions.

## Portable package

The minimum package contains only a root `plugin.json`. Add a component only when the plugin actually provides it.

```text
my-plugin/
├── plugin.json                 required
├── skills/                    when the plugin provides Agent Skills
│   └── my-skill/
│       └── SKILL.md
├── mcp.json                   when the plugin provides MCP servers
└── com.example.client/        only for a client-defined namespace
```

The portable Agent Plugins v1 components are Agent Skills and MCP servers. Do not represent hooks, custom agents, commands, LSP integrations, UI, or marketplace data as portable components.

## `plugin.json`

Place the minimum manifest at the plugin root:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-plugin"
}
```

Agent Plugins v1.0.0 permits these top-level keys: `$schema`, `name`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, and `extensions`. Do not add component paths such as `skills`, `mcpServers`, `hooks`, `agents`, or `commands`; portable components are discovered at fixed locations.

A plugin name is 1 to 64 characters and may contain lowercase ASCII letters, digits, hyphens, and periods. It must begin and end with a letter or digit and must not contain `--` or `..`. The specification does not require the directory name to match, but matching them is the safer default for distribution and discovery.

Add only metadata backed by real project information. Agent Plugins v1 does not itself require `version` to use SemVer, so do not invent a stricter requirement unless the repository or distribution channel imposes one.

## Agent Skills

Place each plugin-provided skill directly under `skills/`:

```text
skills/
└── my-skill/
    ├── SKILL.md
    ├── scripts/
    ├── references/
    └── assets/
```

Match the `name` in `SKILL.md` to its parent directory and make the `description` state both capability and trigger conditions. Keep skill-specific executable code, execution references, and output assets inside that skill directory. The Agent Skills specification permits additional files and directories, but `SKILL.md` should make their purpose and loading conditions discoverable.

Place documentation by its role, loading cost, and distribution needs. Keep required instructions, contracts, evidence, and source links in the relevant skill or execution reference, with conditions for reading or verifying them. Prefer the plugin-root `README.md` for concise background sources and explanations; use suitable project notes for detailed rationale and evaluation records, or for background to standalone skills without a plugin. Reuse existing documents and keep background reading optional. Before moving material, inspect its callers, preserve constraints and attribution, and check access from the installed package. Link to published project notes by URL when they are not bundled.

Agent Plugins discovers plugin skills only from immediate children of the plugin's `skills/` directory. Other skill scanners may use different discovery behavior. Do not vendor another complete skill with a nested `SKILL.md` merely as a reusable reference. Install it separately when it must remain an independent skill, or incorporate only the necessary guidance into ordinary reference files while respecting its license.

Use `skill-creator` when creating or structurally revising a contained skill. Check its trigger against neighboring skills and review the instructions and resources affected by the change.

Preserve the established target model, runtime, and output contract. For OpenAI or Codex instructions without a target model, use GPT-6 Astra for design; do not turn this into a portable package requirement or client setting. Use `prompt-design` or `agent-workflow-design` when available and relevant, without making the package depend on those separate plugins. For model-dependent decisions, consult current model guidance; a model upgrade should include affected references and examples, not just the entrypoint. The [Astra guide](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra) is a source for that case, not required reading for model-independent packaging.

Skill-local client metadata such as `skills/<name>/agents/openai.yaml` may remain when the Agent Skills package permits additional files and clients that do not understand it can safely ignore it. Treat that file as optional metadata for the named client, not as an Agent Plugins core component or a root `plugin.json` extension. Do not invent a root extension namespace merely to reclassify existing skill-local metadata.

Repository-wide development, release, and evaluation scripts may remain outside the distributed plugin when they are not needed at runtime.

When repeatable local plugin management needs repository-specific tests or version policy, keep that development contract outside portable `plugin.json`. Use [repository-management.md](repository-management.md) for the optional per-plugin `.agents/plugin-development/<plugin-name>.json` scaffold; do not require it for a simple package.

When local discovery through source links is part of the request, use [Codex integration](codex-integration.md#choose-the-source-and-execution-path).

## MCP servers

Add a root `mcp.json` only when the plugin provides MCP servers:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "example": {
      "type": "stdio",
      "command": "node",
      "args": ["${PLUGIN_ROOT}/server/index.js"],
      "cwd": "${PLUGIN_ROOT}"
    }
  }
}
```

Agent Plugins v1.0.0 supports `stdio`, `streamable-http`, and legacy HTTP+SSE through `sse`. Prefer `streamable-http` for new remote integrations; `sse` is deprecated and client support is optional. Do not put an entire shell command line in `command`. A bundled executable uses a `./` plugin-relative path that remains inside the plugin root; a non-bundled executable uses a bare name. Use only absolute HTTP or HTTPS URLs, require HTTPS outside loopback, omit fragments and user information, and do not embed credentials in the package. Use `${PLUGIN_ROOT}` for read-only package resources and `${PLUGIN_DATA}` in supported fields for persistent writable state. Keep `cwd` within the selected root after resolving `.` and `..` segments.

Validate affected packaged startup and representative calls using [validation.md](validation.md).

## Client-specific features

Use a reverse-domain namespace only when the target client owns and documents it. Put manifest data under the same namespace in `plugin.json` `extensions`, and put extension files in a top-level directory named with that namespace when the client requires files. Some extensions use only one of those surfaces, so follow the target client's specification. A namespace or behavior invented by a plugin author will not become recognized merely by appearing in the package.

If no documented namespace exists, maintain a separate derived client-specific package when that client is required. For conversion to a portable source, use [codex-migration.md](codex-migration.md) to account for client-native features and remove the old manifest from the final portable package. Do not silently discard a required capability or invent an extension to preserve it.

## Repository and distribution data

Marketplace catalogs, signing, installation policy, evaluations, and release automation can live outside the portable package. Their presence at the repository root is compatible with Agent Plugins as long as the marketplace points to a conforming plugin directory.
