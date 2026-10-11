# Cloud skill and plugin maintenance

Use for authorized additions, updates, selection changes, comparisons, reproduction, and interrupted maintenance. The common scope and stop rules remain in [dot-guidelines](../SKILL.md). This is a dot-toolkit convention, not an Agent Skills or Agent Plugins inventory standard.

## Choose the operation

- **Selection or description only:** preserve skill files, source versions, and manifests. Inspect the current INDEX and the entries affected by the request. For an addition or description refresh, read the selected entry's current frontmatter and check its recorded identity and required files. Removing an entry does not require retrieving or repairing that skill. Recheck INDEX before writing, change only the approved membership or descriptions, then validate the resulting selection.
- **Add or update skill or plugin contents:** use the source and manifest contracts below, followed by **Apply and resume**.
- **Comparison or reproduction:** use the recorded identity and the checks needed for the requested result. A comparison does not authorize writes; reproduction does not authorize an upgrade.
- **Interrupted work:** inspect the actual state and retained intent, then resume only the unfinished part of the authorized operation.

Use the [computer checks](computer-checks.md) that support that operation. INDEX-only work needs no new source acquisition or blanket hash verification of unselected skills.

## Package scope

Adopt each standalone skill as a complete folder at `/workspace/.agents/skills/<name>/`, including its references, scripts, templates, and assets. Record provenance in `/workspace/.agents/skills-state/manifests/<name>.json` using schema 1 below. Existing 0.2 placements and manifests remain valid: there is no automatic move, rename, or duplicate cleanup. If a user requests a conversion, compare source identity, local edits, selected membership, and references before agreeing the affected changes.

Adopt a plugin as one complete package at `/workspace/.agents/plugins/<plugin-name>/`, with provenance at `/workspace/.agents/plugins-state/manifests/<plugin-name>.json`. Preserve upstream `plugin.json`, unqualified `SKILL.md` names, root resources, MCP configuration, client-extension directories, and internal relative layout. A skill may refer outside its own folder to resources inside its package; validate containment at the package root. Do not flatten, split, rename, or rewrite source files to make cloud discovery work. MCP-only packages with no skills may be retained without INDEX entries.

Before placement, verify `plugin.json` and its plugin name, source repository/path and fixed commit, complete file inventory, references, requirements, and local differences. A different repository/path claiming an already adopted plugin name is an identity collision: do not overwrite it or invent an alias. Identical repository/path/commit acquisitions may be deduplicated. An update to the same source replaces the whole package only within the approved version scope. Missing, extra, or changed local bytes must be explained and preserved or explicitly resolved before replacement. Reject path escapes, symlinks, hardlinks, and unsupported file types rather than omitting or dereferencing them and claiming a complete copy. These filesystem-copy constraints are stricter than portable plugin client behavior; the checks are not a full Agent Plugins validator.

Copying MCP configuration or extensions does not register, start, authenticate, or enable them. Inspect required package resources without running bundled code merely to place it. Any requested activation needs the actual client's supported integration, permissions, and separate verification; do not claim that copying makes it work.

## Pin source identity

For new placement or an upstream update, use the requested commit, or resolve the requested branch/tag once to an immutable Git commit. Default to `main` only if no ref was specified; do not guess another ref if it is absent. Use the same resolution for packages acquired together from that repository. Verify archive content against that commit; a filename is not evidence. For edited sources, preserve the requested local changes and base identity instead of fetching newer content.

Repair, reproduction, retry, and continuation reuse the recorded commit and intended changes. Never turn them into an upstream upgrade by resolving a fresh HEAD. If identity or required content is unavailable, pause that target rather than inventing metadata. Source snapshots may live in projects or downloads; do not copy `.git` or depend on an installed cache as editable source.

## INDEX contract

`/workspace/.agents/skills-state/INDEX.md` owns intentional per-skill selection for normal work, for both standalone skills and plugin skills. It is not a generated inventory of all manifests. Preserve its membership during description refreshes or format migration. Change membership only within the requested selection scope. Never reconstruct a missing or damaged established INDEX from all manifests. Inspect current files and known selection evidence; ask only for the selection that cannot be established. New-environment absence and a valid empty selection are different from loss or corruption.

The entire format is a `# Skills` title followed by zero or more entries:

```markdown
# Skills

## [example-skill](../skills/example-skill/SKILL.md)

> Full description from this skill's frontmatter.
> A second line is retained.
>
> A new paragraph is retained too.
> ## Headings inside descriptions remain quoted.
> ---

---
```

Standalone headings use the skill name and exactly `../skills/<name>/SKILL.md`, as above. Plugin headings use a qualified selection key and an exact package link:

```markdown
## [example-plugin:example-skill](../plugins/example-plugin/skills/example-skill/SKILL.md)

> Full description from the unchanged source skill.

---
```

These two forms may coexist in the same INDEX, including the same unqualified skill name in different packages. A plugin name follows Agent Plugins syntax (lowercase ASCII letters, digits, hyphens and periods, 1–64 characters, alphanumeric endpoints, no `--` or `..`); a skill name follows the standalone name rule below. Qualification does not change the source frontmatter `name`. Do not impose a combined-name length limit on this file convention. Duplicate full selection keys are invalid. Use `---` for its terminator, with blank lines between those parts. Prefix every description line with `> `, or `>` for an empty line. Remove exactly one quote prefix when reading its value. Only those top-level lines have structural meaning; this is not a general Markdown parser. A title with no entries intentionally selects nothing. Reject duplicates, unexpected content, malformed links, and out-of-scope targets without rewriting them.

Read each selected skill's frontmatter and preserve its **full parsed description value**, including meaningful line breaks and paragraphs, rather than shortening it into a purpose summary. Interpret quoted/folded/literal YAML appropriately using available reliable reading capability; when ambiguous, resolve only that entry instead of guessing and writing back. The helper validates quoted-line structure and presence, not YAML semantics or equality with frontmatter. A changed `SKILL.md` hash detects bytes changing; it does not prove description equality.

## Per-skill manifest, schema 1

Each UTF-8 JSON file is an object with these required fields:

- `schemaVersion`: integer `1`, independent of plugin version `0.3.0` and old inventory schema 4
- `name`: the skill directory name, lowercase letters/digits and single hyphens, up to 64 characters
- `source`: object with `repository` (source repository identifier), `path` (repository-relative skill directory or `.`), `ref` (requested ref), and `commit` (resolved full 40- or 64-character lowercase hexadecimal Git commit)
- `files`: nonempty array of `{ "path": "SKILL.md", "sha256": "<64 lowercase hex digits>" }` records, one per adopted regular file

File paths are relative to that skill directory with `/` separators; no absolute paths, empty components, `.`/`..`, backslashes, control characters, or duplicate paths. Include `SKILL.md`. Do not include INDEX, other manifests, selection flags such as `enabled`/`selected`, credentials, or reading/operation history. Source metadata identifies origin, not authority to execute it or proof of publisher trust.

Optional `localChanges` is a nonempty string describing intentionally adopted edits; optional `verification` is an object containing only a nonempty `summary` string for a concise check result. Use ordinary metadata strings without control characters. Neither is a restoration mechanism or a substitute for comparing files. Keep only information needed to explain the adopted state. Preserve older restoration materials when present, but do not require patches, snapshots, backup generations, or a new logging framework for this format.

Compute SHA-256 from stored raw bytes, without line-ending, encoding, or BOM conversion. Compare against the existing trusted record **before** changing it. Unexplained additions, deletions, or modifications remain discrepancies; never replace expected hashes with current hashes merely to make a check pass. Only establish new expected hashes after the intended adoption and its source/local changes have been verified.

Hashes cannot restore content. If a lost local edit is absent from retained files and available source, report it as unrecoverable rather than inventing it from a hash. Byte equality does not verify executable bits, ownership, link identity, or runtime requirements. Links and unsupported file types require an explicit resolution before operating on the affected skill or package; do not omit them and claim complete adoption.

## Per-plugin provenance, schema 1

Use the same fields, raw-byte hash rules, optional informational metadata, and validation constraints as the standalone manifest above, with these differences: require `"kind": "plugin"`; `name` is the plugin name; `source.path` identifies the package root; file paths are relative to that root and include `plugin.json` and every adopted package file. This is a separate dot-toolkit provenance file, never an edit to upstream `plugin.json`. It records the complete package and fixed source commit, not selected skills. No `selected`, `enabled`, or selection list belongs in either provenance format.

## Apply and resume

1. Inspect the current INDEX, affected manifests, full file differences, and source commit for this operation. Keep unrelated managed skills and packages intact; unselected files within an approved whole-package update remain part of that update. For legacy inventory, use [migration](migrations/0.1-to-0.2.md).
2. Prepare the requested complete standalone skill or plugin contents. Read selected entrypoints and placement/verification references; check terms, dependencies, required resources, and code requirements. Confirm references are accessible within the agreed placement scope. Do not acquire unrequested dependencies to hide a packaging problem.
3. For a plugin update, compare the current selected skills with the candidate package before any write. Preserve selection for unchanged skill identities; do not select newly added skills automatically. If a selected skill was deleted or renamed, pause that package update until the user resolves removal or replacement of the affected selection. Show the proposed INDEX changes together with the whole-package update. Do not silently infer a rename from similar contents. INDEX-only changes never acquire or update the package.
4. Immediately before each write, recheck current contents against the inspected state. Serialize changes to the same files; reconcile concurrent edits without overwriting them.
5. Apply authorized file and manifest changes, then update only affected INDEX descriptions or approved membership. Keep incomplete/mixed-version targets out of use while their files and records disagree. Do not silently fall back to another version.
6. Read back and compare files and records. Run the relevant read-only [computer checks](computer-checks.md), inspect required references and descriptions, and report remaining differences. Return a skill to use only when its affected checks agree.

There is no multi-file atomicity or recovery-engine guarantee. After interruption, inspect actual files, manifests, INDEX, and any retained intent before continuing only unfinished authorized work. Preserve newer edits. If the source SHA, selection, or intended local change is unknown, pause only that target. A readable file is not evidence of write permission; verify each authorized write separately. Keep the original source resolution through retries, and do not report failed or unverified updates as complete.

For reproduction, obtain recorded sources and any retained content needed for local edits, then compare every expected file and unexpected extra against the manifest. A backup is optional, not assumed. Claim only the file/content identity actually verified, not an identical execution environment. No helper performs updates, restores files, or selects skills for you.
