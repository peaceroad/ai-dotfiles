# Validate Agent Plugins v1

Use this reference after creating or changing a portable package, or while auditing conformance.

## Included validator

When Node.js is available, run this command from the skill root:

```powershell
node scripts/validate-agent-plugin.mjs 'C:\path\to\plugin-root'
```

Add `--json` for machine-readable output:

```powershell
node scripts/validate-agent-plugin.mjs 'C:\path\to\plugin-root' --json
```

The script currently validates Agent Plugins specification version 1.0.0 and reports that version in its result. It rejects other schema versions instead of guessing compatibility. Check the current specification before adding support for a newer version.

The script checks:

- The presence and JSON syntax of root `plugin.json`, its v1.0.0 schema identifier, allowed keys, and basic field types.
- Plugin-name syntax.
- Immediate children of `skills/`, their `SKILL.md` files, and basic `name` and `description` fields.
- The basic structure of optional `mcp.json`, transport-specific fields, `command` and `cwd` containment, and remote URL semantics.
- Reverse-domain client-extension namespaces. Extension contents remain client-defined.
- Symbolic links or junctions that resolve outside the package.

This is not a complete JSON Schema implementation, a complete YAML parser, or a validator for client extensions. It does not replace validation against the current official schemas, an official Agent Skills validator, or behavior checks in each target client.

After changing the validator, local plugin manager, Repository scaffold, Marketplace assembler, or built-in compatibility checker, run the related test scripts:

```powershell
node scripts/validate-agent-plugin.test.mjs
node scripts/manage-local-agent-plugin.test.mjs
node --test scripts/scaffold-local-agent-plugin.test.mjs
node --test scripts/assemble-plugin-marketplace.test.mjs
node scripts/check-builtin-plugin-creator.test.mjs
```

`scripts/manage-local-agent-plugin.mjs validate <plugin-root>` calls this bundled validator through the common local-development interface. A Repository scaffold may add structured Repository checks through a per-plugin `.agents/plugin-development/<plugin-name>.json` file; those checks supplement rather than replace portable validation, the official Agent Skills validator, or target-client behavior checks.

## Additional checks

When available, run the official Agent Skills `skills-ref validate` command for each contained skill. Also use a Codex-bundled skill validator or repository-specific checks when available, after confirming what each validator covers.

If a repository management script depends on this skill's bundled validator and the expected file is missing, stop with a clear error that names the missing path. Do not copy a validator from an installed plugin cache, another checkout, or an unrelated skill directory. If the official Agent Skills validator is unavailable, report it as unrun and identify any Codex-bundled validator as a separate, narrower check.

When current specifications must be retrieved and the connection fails, do not disable TLS verification or silently continue as though current guidance was confirmed. Report the retrieval failure, use bundled references only as explicitly identified last-known guidance, and avoid changing version-sensitive rules until the current normative source can be checked.

When the package includes MCP, client extensions, or compatibility files, check these separately:

- MCP startup, each configured transport, and representative tool calls.
- Absence of credentials from manifests, headers, and packaged environment files.
- Actual client support for the declared namespace and file layout.
- Installation, update, and rollback behavior when a legacy format remains.
- Whether the marketplace points to the intended source of truth.
- Skill and MCP discovery in a new task after installation.

Do not report an unrun check as successful. State what could not be verified and why.
