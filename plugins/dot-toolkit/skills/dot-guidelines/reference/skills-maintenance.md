# Cloud skill maintenance

Use for authorized additions, updates, selection changes, comparisons, reproduction, and interrupted maintenance. The common scope and stop rules remain in [dot-guidelines](../SKILL.md). This is a dot-toolkit convention, not an Agent Skills or Agent Plugins inventory standard.

## Ownership and source identity

- `/workspace/.agents/skills/<name>/` contains every adopted skill file, including references, scripts, templates, and assets.
- `/workspace/.agents/skills-state/INDEX.md` owns intentional selection for normal work.
- `/workspace/.agents/skills-state/manifests/<name>.json` owns each skill's source identity and expected raw-byte hashes. A manifest does not select its skill.

For new placement or an upstream update, use the requested commit, or resolve the requested branch/tag once to an immutable Git commit. Default to `main` only if no ref was specified; do not guess another ref if it is absent. Use the same resolution for skills acquired together from that repository. Verify archive content against that commit; a filename is not evidence. For edited sources, preserve the requested local changes and base identity instead of fetching newer content.

Repair, reproduction, retry, and continuation reuse the recorded commit and intended changes. Never turn them into an upstream upgrade by resolving a fresh HEAD. If identity or required content is unavailable, pause that target rather than inventing metadata. Source snapshots may live in projects or downloads; do not copy `.git` or depend on an installed cache as editable source.

## INDEX contract

INDEX is a selected list, not a generated inventory of all manifests. Preserve its membership during description refreshes or format migration. Change membership only within the requested selection scope. Never reconstruct a missing or damaged established INDEX from all manifests. Inspect current files and known selection evidence; ask only for the selection that cannot be established. New-environment absence and a valid empty selection are different from loss or corruption.

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

Each level-two entry heading is a link whose text is the skill name and whose target is exactly `../skills/<name>/SKILL.md`, as above. Use `---` for its terminator, with blank lines between those parts. Prefix every description line with `> `, or `>` for an empty line. Remove exactly one quote prefix when reading its value. Only those top-level lines have structural meaning; this is not a general Markdown parser. A title with no entries intentionally selects nothing. Reject duplicates, unexpected content, malformed links, and out-of-scope targets without rewriting them.

Read each selected skill's frontmatter and preserve its **full parsed description value**, including meaningful line breaks and paragraphs, rather than shortening it into a purpose summary. Interpret quoted/folded/literal YAML appropriately using available reliable reading capability; when ambiguous, resolve only that entry instead of guessing and writing back. The helper validates quoted-line structure and presence, not YAML semantics or equality with frontmatter. A changed `SKILL.md` hash detects bytes changing; it does not prove description equality.

## Per-skill manifest, schema 1

Each UTF-8 JSON file is an object with these required fields:

- `schemaVersion`: integer `1`, independent of plugin version `0.2.0` and old inventory schema 4
- `name`: the skill directory name, lowercase letters/digits and single hyphens, up to 64 characters
- `source`: object with `repository` (source repository identifier), `path` (repository-relative skill directory or `.`), `ref` (requested ref), and `commit` (resolved full 40- or 64-character lowercase hexadecimal Git commit)
- `files`: nonempty array of `{ "path": "SKILL.md", "sha256": "<64 lowercase hex digits>" }` records, one per adopted regular file

File paths are relative to that skill directory with `/` separators; no absolute paths, empty components, `.`/`..`, backslashes, control characters, or duplicate paths. Include `SKILL.md`. Do not include INDEX, other manifests, selection flags such as `enabled`/`selected`, credentials, or reading/operation history. Source metadata identifies origin, not authority to execute it or proof of publisher trust.

Optional `localChanges` is a nonempty string describing intentionally adopted edits; optional `verification` is an object containing only a nonempty `summary` string for a concise check result. Use ordinary metadata strings without control characters. Neither is a restoration mechanism or a substitute for comparing files. Keep only information needed to explain the adopted state. Preserve older restoration materials when present, but do not require patches, snapshots, backup generations, or a new logging framework for this format.

Compute SHA-256 from stored raw bytes, without line-ending, encoding, or BOM conversion. Compare against the existing trusted record **before** changing it. Unexplained additions, deletions, or modifications remain discrepancies; never replace expected hashes with current hashes merely to make a check pass. Only establish new expected hashes after the intended adoption and its source/local changes have been verified.

Hashes cannot restore content. If a lost local edit is absent from retained files and available source, report it as unrecoverable rather than inventing it from a hash. Byte equality does not verify executable bits, ownership, link identity, or runtime requirements. Links and unsupported file types require an explicit resolution before operating on the affected skill; do not omit them and claim complete adoption.

## Apply and resume

1. Inspect the current INDEX, affected manifests, full file differences, and source commit for this operation. Keep unselected managed skills intact. For legacy inventory, use [migration](migrations/0.1-to-0.2.md).
2. Prepare the requested complete skill contents. Read selected entrypoints and placement/verification references; check terms, dependencies, required resources, and code requirements. Confirm references are accessible within the agreed placement scope. Do not acquire unrequested dependencies to hide a packaging problem.
3. Immediately before each write, recheck current contents against the inspected state. Serialize changes to the same files; reconcile concurrent edits without overwriting them.
4. Apply authorized file and manifest changes, then update only affected INDEX descriptions or approved membership. Keep incomplete/mixed-version targets out of use while their files and records disagree. Do not silently fall back to another version.
5. Read back and compare files and records. Run the relevant read-only [computer checks](computer-checks.md), inspect required references and descriptions, and report remaining differences. Return a skill to use only when its affected checks agree.

There is no multi-file atomicity or recovery-engine guarantee. After interruption, inspect actual files, manifests, INDEX, and any retained intent before continuing only unfinished authorized work. Preserve newer edits. If the source SHA, selection, or intended local change is unknown, pause only that target. A readable file is not evidence of write permission; verify each authorized write separately. Keep the original source resolution through retries, and do not report failed or unverified updates as complete.

For reproduction, obtain recorded sources and any retained content needed for local edits, then compare every expected file and unexpected extra against the manifest. A backup is optional, not assumed. Claim only the file/content identity actually verified, not an identical execution environment. No helper performs updates, restores files, or selects skills for you.
