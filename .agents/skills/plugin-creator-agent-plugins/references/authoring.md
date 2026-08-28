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

Match the `name` in `SKILL.md` to its parent directory and make the `description` state both capability and trigger conditions. Keep skill-specific executable code, references, and output assets inside that skill directory. The Agent Skills specification permits additional files and directories, but `SKILL.md` should make their purpose and loading conditions discoverable.

Agent Plugins discovers plugin skills only from immediate children of the plugin's `skills/` directory. Other skill scanners may use different discovery behavior. Do not vendor another complete skill with a nested `SKILL.md` merely as a reusable reference. Install it separately when it must remain an independent skill, or incorporate only the necessary guidance into ordinary reference files while respecting its license.

Use `skill-creator` when creating or structurally revising a contained skill. Review its trigger description against neighboring skills so the plugin does not introduce ambiguous routing.

Skill-local client metadata such as `skills/<name>/agents/openai.yaml` may remain when the Agent Skills package permits additional files and clients that do not understand it can safely ignore it. Treat that file as optional metadata for the named client, not as an Agent Plugins core component or a root `plugin.json` extension. Do not invent a root extension namespace merely to reclassify existing skill-local metadata.

Repository-wide development, release, and evaluation scripts may remain outside the distributed plugin when they are not needed at runtime. Include only resources that the installed plugin must access.

When repeatable local plugin management needs repository-specific tests or version policy, keep that development contract outside portable `plugin.json`. Use [repository-management.md](repository-management.md) for the optional per-plugin `.agents/plugin-development/<plugin-name>.json` scaffold; do not require it for a simple package.

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

This skill owns the MCP packaging boundary: `mcp.json`, packaged paths and resources, portable configuration, and integration validation. Implement or debug the server's application-specific behavior with the relevant engineering workflow, then validate its packaged startup and representative tool calls here.

## Client-specific features

Use a reverse-domain namespace only when the target client owns and documents it. Put manifest data under the same namespace in `plugin.json` `extensions`, and put extension files in a top-level directory named with that namespace when the client requires files. Some extensions use only one of those surfaces, so follow the target client's specification. A namespace or behavior invented by a plugin author will not become recognized merely by appearing in the package.

If no documented namespace exists, keep the portable package separate from the client-specific package or retain the compatibility files documented by that client. When several formats must coexist, keep one source of truth and generate derived compatibility files where practical.

## Repository and distribution data

Marketplace catalogs, signing, installation policy, evaluations, and release automation can live outside the portable package. Their presence at the repository root is compatible with Agent Plugins as long as the marketplace points to a conforming plugin directory.

Propagate changes in one direction from the source of truth to installed copies. Do not edit a cache or installed copy and copy it back into the repository.
