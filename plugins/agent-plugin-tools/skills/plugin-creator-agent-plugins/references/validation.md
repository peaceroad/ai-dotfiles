# Validate Agent Plugins v1

Select evidence for the requested outcome and affected behavior. Portable validation, repository checks, distribution drift checks, installation snapshots, and runtime discovery establish different properties.

## Choose the validation boundary

| Change or requested outcome | Relevant evidence |
| --- | --- |
| Package or contained-skill edit | Portable validation, applicable skill validation, and review of affected instructions, references, and resources. |
| Instruction structure or behavior | Representative activation and task cases where useful; distinguish manual review, simulated decisions, and real execution. |
| Helper script or generated runner change | Related script tests and the affected generated behavior. |
| MCP or client-extension change | Configuration and resource checks plus packaged startup, affected transports, or representative calls in the required client. |
| Shared Marketplace assembly | Source checks owned by the repository, then assembler `sync` and a scoped or full `check` appropriate to the handoff. |
| Client installation or refresh, including when part of a migration | Intended source and version, install result and snapshot, enabled state, and discovery or representative use in a new task. |

Run required repository checks. Reuse evidence from a command that already performed a check on the same relevant state; do not duplicate the sequence by hand. After relevant checks pass, broaden or repeat them only for a new change, failure, or unresolved concern. A wording edit does not by itself require installation, MCP calls, or tests of unaffected clients.

Do not start a live effect solely to fill a verification checklist. Prepare what is authorized; report a required but unavailable integration check separately. Source completion and verified client operation may have different statuses.

## Included validator

Run from the skill root, or use the script's absolute path:

```powershell
node scripts/validate-agent-plugin.mjs 'C:\path\to\plugin-root'
node scripts/validate-agent-plugin.mjs 'C:\path\to\plugin-root' --json
```

Choose the normal or JSON form for the consumer; running both is unnecessary. The validator targets Agent Plugins 1.0.0 and rejects other schema identifiers. Check the normative specification before adding version support.

It checks root manifest syntax, allowed keys and basic types; plugin names; immediate skill directories and basic frontmatter; optional MCP configuration including command, cwd, and URL rules; extension namespace syntax; and links escaping the package.

It is a partial structural validator, not a complete JSON Schema implementation, YAML parser, client-extension validator, secret scanner, or runtime test. It does not establish semantic instruction quality or whether Codex enables and discovers the components. Use applicable skill-specific checks and inspect credentials, packaged resources, or documented extension support when those surfaces change. A schema check cannot sandbox commands launched by the package.

`scripts/manage-local-agent-plugin.mjs validate <plugin-root>` calls this validator. A configured repository runner additionally validates its Marketplace binding and runs its declared checks. The direct manager does not infer application-specific tests; see [repository-management.md](repository-management.md).

For new or structurally revised skills, run an available skill validator after checking what it covers. For a small edit, use the repository's relevant checks without adding validators merely because they are installed.

## Helper regression tests

Run tests for changed helpers and affected consumers. These are the bundled entrypoints, not a requirement to run every suite for each prose edit:

```powershell
node scripts/validate-agent-plugin.test.mjs
node scripts/manage-local-agent-plugin.test.mjs
node --test scripts/scaffold-local-agent-plugin.test.mjs
node --test scripts/assemble-agent-marketplace.test.mjs
node scripts/check-builtin-plugin-creator.test.mjs
```

Generated runners share the manager and validator implementations. For a template change, include scaffold checks and any repository-required consumer checks. Keep tests about observable guarantees, such as refusing invalid sources before mutation or preserving unrelated output, rather than matching revised instruction wording.

## Missing evidence and failures

If a command's required validator is missing, report the expected path and repair the dependency from its authoritative source before running that dependent command. Do not substitute a validator copied from an installed cache or unrelated checkout. Independent inspection can continue.

If current specifications cannot be retrieved securely, report the retrieval failure and identify bundled guidance as last-known information. Keep TLS verification enabled. Continue version-independent work; defer a version-sensitive change that requires unavailable normative evidence.

Report what failed, what was verified, and what remains unknown. Use [Codex integration](codex-integration.md#interruption-and-recovery) or [Marketplace distribution](marketplace-distribution.md#synchronization-guarantees) to reconcile effects before retrying a failed mutation. A nonzero exit code does not prove that nothing changed.
