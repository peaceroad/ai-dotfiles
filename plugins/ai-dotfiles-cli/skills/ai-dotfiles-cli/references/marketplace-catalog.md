# GitHub-reference catalogs

Use `agent dev marketplace catalog` to edit a human-owned marketplace manifest, not to copy packages, update source code, or install plugins. The explicit root and `--format codex|claude` select one native manifest; no development index or generated assembly configuration is required.

## Choose the intended change

- `init` creates a missing catalog; it does not adopt or overwrite an existing one.
- `list` and `check` are offline inspections. `check` returns nonzero when references are unsupported or not fully verified; this is not a verdict that every host rejects the catalog. `list` can display these entries with warnings. A valid reference does not establish remote existence, private access, package identity, host compatibility, or update freshness.
- `add` registers a plugin reference. `update` changes only specified catalog fields, not the remote plugin.
- `remove` removes only the uniquely named listing, including an unsupported source that needs cleanup. Unsafe source details are hidden in its preview. It does not delete source repositories, installed plugins, workspace copies, or other entries.

Keep catalog editing, Git publication, workspace import, and client installation separate. A request for one does not authorize the others. Use the selected format's native file as the source of truth; do not maintain another desired-state registry or assume editing one format updates the other.

New Codex entries use `AVAILABLE`/`ON_INSTALL` policy and the `Productivity` category unless `--category` is supplied. The category can override upstream classification; use an appropriate value when known. Existing policies remain unchanged, and repository policy fields do not configure ChatGPT workspace access. Existing reserved catalog names produce a warning rather than proving a host-specific source exception.

## Inspect before applying

Inspect the proposal using `--dry-run` before noninteractive application, or review the built-in confirmation in an interactive terminal. Use `--yes` only for an already-authorized noninteractive change. It skips the prompt, not ownership, path, baseline, or lock checks.

Preserve unrelated entries, extension fields, and recorded identities. Resolve a conflicting name or ambiguous source change rather than replacing the whole catalog. Do not bypass an assembler-ownership refusal by invoking another helper or editing generated JSON. A format flag chooses serialization, not ownership.

After a failed or interrupted operation, inspect the actual catalog before retrying. Replacement errors can leave the write outcome unknown; a post-write cleanup failure can mean the change was saved. Do not interpret either as an unchanged catalog. Read-only lock investigation can proceed, but establish that relevant writers have stopped before removing a leftover lock or retrying a write; elapsed time is not evidence that a writer stopped. Report the selected manifest and actual changed fields without copying private paths or sensitive reference values into shared reports.

## Distribution and updates

After an authorized edit, normal Git review and publication can carry the catalog change to its consumers. The command does not commit, push, register a marketplace, or request host synchronization.

For ChatGPT workspace imports, daily checks and manual `Sync now` are host operations. A fixed SHA remains fixed until changed; a branch is mutable. Do not promise that an upstream-only change with an unchanged catalog is detected automatically without an integration check for that host. Local validation alone does not prove propagation.

Public catalogs expose their listed repository identifiers, including references to private repositories. Use synthetic examples in public reports and verify the intended audience before publishing actual references. Credentials do not belong in catalog URLs.
