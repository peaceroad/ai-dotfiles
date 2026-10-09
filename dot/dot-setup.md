This procedure governs authorized setup, updates, and reproduction in dot's own `/workspace` cloud. A file attachment or review request alone does not authorize execution. Stay within the requested scope and current permissions. Complete step 1 before saving files or proposing changes.

Skills and plugins may also be installed through supported Web-client features when available. This procedure covers explicitly requested cloud-file management; copying a skill here does not register it with the app or imply that an existing app installation should be duplicated or migrated.

File placement is separate from running bundled code, installing runtimes or plugins, enabling discovery, changing external-service settings, or starting automations. Handle those effects only as separately authorized. Use the user's conversational language; the English examples below do not prescribe the language of replies.

## Start with this file

With `dot-toolkit` installed, attach this `dot-setup.md` and explicitly ask: “Set up your cloud using this procedure.” Read the supplied procedure completely before requiring files setup will create. It governs initial setup; do not silently replace it with a newer repository copy. Keep it and any specified edited-source identity available for resumption.

Unless the user supplies or specifies another common-instruction source, obtain the complete `AGENTS.md` from:

- Repository: `https://github.com/peaceroad/ai-dotfiles`
- Repository path: `dot/AGENTS.md`
- Commit: `221c7e47f3e54ed02937d7a60117ce708a25e360`

Verify the repository, path, and commit, and read the document completely before adoption. This pin does not depend on default-branch contents. It selects common instructions only; skill versions are selected separately below. If the user specifies another branch or tag for common instructions, resolve it once to a commit, record that resolution with the current private setup records, and reuse it on retry. If verification fails, request the document or a supported source rather than guessing another ref.

In an established runtime, use the canonical files at the paths below and apply only the requested changes. For identical skill reproduction, also obtain the adopted manifest and required restoration materials.

## 1. Inspect the environment and existing state

Check the working directory, `/workspace/shared/`, writable scope, required commands, and capacity. Read existing instructions, sources, managed copies, INDEX, and manifest; identify same-named files, links, skills, local edits, and incomplete operations. During authorized initial setup, absent files are creation targets; unreadable existing files are not absent.

Compare additions, modifications, deletions, and extra files, distinguishing upstream deletions from user additions. Reuse identical contents and preserve unrelated edits. Use only supplied or verified-accessible inputs. Resolve missing information, incompatible sources, ambiguous scope, conflicts, or missing authority before dependent work; ask only when they cannot be resolved within the request. Pause only that dependent work. Do not replace unreadable sources, restore app custom rules or connection permissions from documents, or bypass an access denial through another route.

Use these exact runtime locations: `/workspace/AGENTS.md` for common instructions, `/workspace/.codex/` for setup and private documents, and `/workspace/.agents/skills/` for managed skills. Repository publication paths are not runtime alternatives. Create project, download, tool, and output directories under `/workspace/shared/` only as needed, following the common instructions. Use the supported approval flow for restricted writes; on denial, stop the affected action without substituting a path, changing permissions, or placing links in protected locations. Do not infer persistence from directory names.

## 2. Establish the canonical instructions

For initial setup, save the verified common instructions as `/workspace/AGENTS.md` and the supplied procedure as `/workspace/.codex/dot-setup.md`. Use explicit absolute references between runtime locations. For updates, compare existing files under step 1 before adopting changes; do not import another environment's configuration paths.

`dot-guidelines` loads the canonical files; it is not another common-instruction copy. Installing or replacing that plugin is separate from placing these files. When plugin work is requested, verify client support and effective discovery and resolve duplicate discovery explicitly.

Export additional common-instruction copies only when the operating environment requires them. Derive them from the canonical copy, record the version or date/time and content match, and never edit or overwrite copies independently without reviewing differences. The skill manifest holds only a reference to the canonical file.

### Private inputs now or later

`/workspace/.codex/AGENTS-private.md` may contain direct private instructions, conditional references, or both. Separate documents are optional. `/workspace/.codex/dot-setup-private.md` holds additional skill candidates or their current status.

For missing inputs whose status is unknown, ask once whether each will be supplied now, later, or is unnecessary: “For private instructions and additional skill candidates, would you like to provide them now, later, or use none for this setup? You can choose separately for each.” Continue independent common work. A no-additions choice concerns only candidates, not whether private instructions apply.

During authorized initial setup, create only missing records:

- Preserve supplied private instructions, references, scopes, and loading conditions. If instructions are missing or deferred, record them as pending in `AGENTS-private.md`, without inventing their contents or claiming none apply. An explicit no-private-instructions choice permits dot to write that declaration; the user need not supply an empty file.
- Preserve supplied additional candidates in `dot-setup-private.md`, or record their pending, deferred, or no-additions status. Listing candidates does not approve their installation.

Never overwrite existing private documents with minimal records. Missing, deferred, explicitly none, and supplied inputs remain distinct. Silence is not a decision; do not repeat an answered or pending question unless a specific task now depends on it. While instructions are pending, proceed only with independent work and report any material dependency.

Save supplied referenced private documents under `/workspace/.codex/`, retaining their filenames and conditions, and verify their explicit references. Keep private filenames, purposes, contents, candidates, and decisions out of public documents, PRs, and logs.

Later private files require an apply request. Compare and apply only that private scope, preserving existing common configuration, adopted skills, and prior decisions. Do not refetch or redo common setup; skill additions and updates still follow the separate selection process below.

## 3. Select and place skills

### Inputs and version selection

- New placements or upstream updates: use the specified commit, or resolve the specified branch's latest HEAD once per repository at acquisition time. Use that commit consistently across selected skills from the repository. Default to `main` only when no ref is specified; ask if it does not exist. Tags, releases, and archives require contents verifiable against a pinned Git commit. Otherwise request a supported source; do not invent a commit or extend the manifest format.
- Edited sources: use the specified local sources and scope without fetching newer upstream contents.
- Reproduction, repair, retry, or interrupted work: use the manifest or interim records' versions and intended changes, not the latest upstream version.

### Skill candidates and selection

Keep **common candidates** listed here separate from **additional candidates** in private inputs. These groups describe selection provenance, not repository visibility; additional candidates may come from public sources.

Common candidates come from [peaceroad/ai-dotfiles](https://github.com/peaceroad/ai-dotfiles), normally `main`. Paths identify whole skill folders; verify their entry points and requirements at the proposed version.

- `agent-workflow-design`: `plugins/agent-design-tools/skills/agent-workflow-design`. Designs recurring or long-running workflows, including tool roles, waiting, recovery, and evaluation. Uses `prompt-design` for model-facing instructions and `skill-creator` for skill creation or structural changes.
- `prompt-design`: `plugins/agent-design-tools/skills/prompt-design`. Designs, reviews, and revises model-facing instructions. Requires applicable target references; skill creation or structural changes use `skill-creator` first.
- `agent-improve`: `plugins/agent-eval-tools/skills/agent-improve`. Evaluates skills and plugins, compares versions, and runs evidence-based improvement experiments. Evaluation needs a suitable harness, available execution capabilities, and an agreed scope and budget; placement does not install or authenticate a runner.
- `plugin-creator-agent-plugins`: `plugins/agent-plugin-tools/skills/plugin-creator-agent-plugins`. Authors, validates, migrates, and packages Agent Plugins v1. Check runtime requirements before using bundled tools; standalone workflows do not require the `agent` CLI or `ai-dotfiles-cli` plugin.

Present each group separately before placement. For each candidate, show purpose, source/path, proposed version, use requirements, installed status, and action: unchanged, add, update, conflict, or skip. Distinguish retained versions from proposed upstream updates.

Obtain explicit approval for each group's selected additions and updates; common-group approval does not approve the additional group. Reuse clear authorization for the exact operation, targets, version scope, and destination, while honoring current action-time approval requirements. Either group may be skipped; no additions does not authorize updates or removals. Ask about missing approval with the reviewed targets and actions, for example: “For the [common/additional] group, may I proceed with [names and proposed additions or updates]?” Keep the two decisions separate and pause only dependent work when one remains unresolved or inaccessible.

Deduplicate identical repository, source path, and resolved commit into one authorized placement without approving the other group's selection. Resolve conflicting proposed placements or conflicts with installed skills, including differing sources or versions for the same name/destination and repository-wide version requirements, before changing the affected skills. Merely listing an unselected candidate does not block an approved placement. Preserve installed skills omitted from selection; removal needs its own authorization. Do not automatically add new upstream skills or dependency skills. Explain missing dependencies and pause affected work until an authorized resolution is available.

### Placement and recovery

Place approved managed copies at `/workspace/.agents/skills/<skill-name>/`. Record resolved versions in interim records; catalog registration and automatic discovery require their own authorized work and verification.

1. Acquire each selected skill's entire folder and required dependency files; state the acquisition scope rather than defaulting to a full repository. Retain active sources in projects and retrieved snapshots in downloads. For Git checkouts, use the pinned commit tree without `.git`; uncommitted edits or additions require intentional-change restoration materials.
2. Read each `SKILL.md` and all placement/verification materials completely, retrieving omitted portions individually. Check terms of use, dependencies, bundled code, and name conflicts.
3. Preserve references, assets, scripts, and templates. Reject extraction paths or links escaping the destination. Runtime files must stay inside selected managed skill directories, and cross-skill relative references must remain valid. For dependencies outside those directories, request a self-contained source or explicitly agreed packaging change; do not copy untracked dependencies. License and setup reference material may be retained separately.
4. Compare adopted source contents with managed copies and check internal references. Counts alone do not establish equality. Keep incomplete updates out of everyday use until placed contents and records agree; do not use mixed-version copies.

For supported archives, verify contents against the pinned commit and retain the artifact hash in an acquisition record; the archive name does not establish the commit. Distinguish acquisition scope and omissions from Git-history presence. If an operation's outcome is unknown, inspect actual state before retrying. Resume only unfinished authorized work using the recorded versions. Do not automatically synchronize source edits into managed copies.

## 4. Management files and completion

These records describe managed cloud copies, not the client's installed-skill inventory. An empty cloud inventory does not establish that no Web-installed skills exist.

- `/workspace/.agents/skills/INDEX.md`: skill names, purposes, relative `SKILL.md` links, and a manifest pointer. It also points explicitly to `/workspace/AGENTS.md` and `/workspace/.codex/dot-setup.md`.
- `/workspace/.agents/skills/skills-manifest.json`: currently adopted versions and contents, using the format below. Keep candidates, selection/approval decisions, operation history, and reading logs outside it. Detailed acquisition records may be referenced rather than copied into it. Retain unfinished work separately until reconciled with actual state; do not accumulate history in candidate lists.

Preserve INDEX and manifest when the adopted set, source revisions, contents, and management references are unchanged, unless an actual verification must be recorded. Skill updates require corresponding source, file, hash, and verification records after comparison, even with no new skills. Preserve unrelated records and edits. Procedure-only or candidate-list edits do not change managed skills, INDEX, or manifest.

For an empty initial setup with no installed skills and no selected placements, a new INDEX may say “No adopted skills”; use empty `sources`, `skills`, and `files` arrays. This records an empty adopted inventory, not rejection of pending candidates. Do not relabel existing inventories to match an example, or clear records for skipped/no-additions groups. If repair materials are missing, request them rather than substituting an upstream version.

Read saved files back and verify the canonical instructions, private-document references, adopted skills, content comparisons, and INDEX/manifest consistency. Report storage locations and loading method, changed versus unchanged skills, and the actual status of common configuration, each skill group, and private inputs. Unresolved targets mean partial completion with the inputs needed to resume; skipped or explicitly unnecessary work is not pending.

Report unverified automatic loading, script behavior, external links, or persistence separately. File comparisons do not establish those properties. If supported automatic loading cannot be verified, explicitly identify and read the canonical guidance at the start of work.

## 5. Manifest format and verification

`/workspace/.agents/skills/skills-manifest.json` is JSON identifying the versions and contents of placed skills. The format below is `schema_version: 4`. Version 4 explicitly supports the `/workspace` runtime boundary; it is not interchangeable with the previous shared-directory-only version 3 contract. An authorized migration from version 3 must verify the existing adopted bytes and pinned sources, rewrite the environment references to these exact locations, and revalidate them. Do not relabel an unverified record or claim unchanged version 3 conformance. Do not reinterpret or overwrite unsupported versions by guessing; ask how to handle them. Treat the manifest as private by default because it may contain private information such as source names. This format applies to Git repositories from which a pinned commit can be acquired. Do not reuse it for archives whose commits cannot be verified; define the acquired artifact and restoration method separately. This is a setup-specific inventory and reproduction record, not an Agent Skills or Agent Plugins standard. `schema_version` identifies this record format, not a skill release; `resolved_commit` identifies source content. Do not add a `$schema` URL unless a matching schema for this exact format is actually maintained.

- Root: `schema_version` is the integer 4; `created_at` and `verified_at` are ISO 8601 date/time strings with time zones; `managed_root` is the string `.`; `runtime_root` is the string `../..`, resolving from the manifest directory to `/workspace`; and `canonical_instructions` is `../../AGENTS.md`, resolving to `/workspace/AGENTS.md`. `verified_at` records when the current comparison was actually performed. Do not update a past verification timestamp and treat that as reverification. `created_at` records the first creation of this environment's manifest. For a new installation before any comparison, keep incomplete work in interim records instead of inventing a verification time. Empty discrepancy arrays alone are not evidence of a completed comparison.

- `sources`: An array of sources. Each element has string fields `id`, `repository_url`, `visibility` (`public` or `private`), `requested_branch`, `resolved_commit` (a 40-character lowercase hexadecimal Git commit ID), `source_type`, `source_root`, and `acquired_and_verified_at`, plus boolean fields `git_history` and `git_checkout`. The acquisition-record fields `receipt_path` and `receipt_sha256` are optional and must be supplied as a pair. The branch-resolution timestamp `head_resolved_at` is also optional. Do not duplicate `id` values. `source_type` describes how the pinned contents were acquired; it is not an enumerated package type. `git_checkout` is true only for an actual Git working checkout, and `git_history` is true only when history was acquired; it does not imply a complete history. Both `acquired_and_verified_at` and optional `head_resolved_at` use ISO 8601 date/time strings with explicit time zones.

- `skills`: An array of currently adopted skills. Each element has string fields `name`, `source_id`, `source_path`, `managed_path`, and `upstream_relationship`, plus an array `intentional_changes`. Do not duplicate `name` values. Each `source_id` references one existing source. Each `managed_path` is a single-level directory name identical to the skill name, with its entry-point `SKILL.md` directly inside it.

- `files`: An array of all files in the managed copies. Each element has string fields `relative_path` and `sha256`, and a nonnegative integer `size` in bytes. Do not duplicate paths. Verify that each file belongs to exactly one adopted skill.

- `sha256_tree` is the comparison value for all managed copies together. `tree_hash_algorithm` is a string describing the calculation method below. All SHA-256 values use 64-character lowercase hexadecimal notation.

- `verification` is an object containing comparison results. `skill_count`, `managed_file_count`, and `source_to_managed_byte_equality_checked` are nonnegative integers. `mismatches`, `missing_files`, `extra_managed_files`, and `verification_exclusions` are arrays of strings. Entries in the discrepancy arrays identify the affected paths and problems. Entries in the exclusions array identify checks not performed in this verification. `skill_count` and `managed_file_count` equal the lengths of `skills` and `files`. `source_to_managed_byte_equality_checked` counts distinct file pairs actually compared with the recorded upstream bytes, not successful matches or attempts. It may be smaller than `managed_file_count` when intended edits add files. Check all adopted files against their expected contents separately.

`canonical_instructions`, `source_root`, and `receipt_path` are relative to the directory containing the manifest. Resolve paths against `/workspace/.agents/skills/` and require the canonical instruction path to resolve to `/workspace/AGENTS.md`. `source_root` and `receipt_path` must resolve within `/workspace/shared/projects/` or `/workspace/shared/downloads/`; their normal forms begin `../../shared/projects/` or `../../shared/downloads/`. The runtime boundary is `/workspace`, not the source-storage directory. Resolve symlinks before checking these boundaries, and reject paths that escape the applicable root. `source_path` is relative to the source repository; `managed_path` and `files[].relative_path` are relative to the managed-copy root. These latter three path types use `/` separators and must not be absolute or contain empty components, `.`, `..`, or newlines, with one exception: `source_path` may be exactly `.` to identify a skill whose `SKILL.md` is at the repository root. This exception does not allow `./` prefixes or dot components in other paths. Links must not reference locations outside the allowed scope either. In another dot-owned cloud, verify that this exact `/workspace` layout is supported before reproduction. Do not silently switch to another runtime layout; a different layout requires an explicit contract change.

To identify an original file, select the source and pinned commit using its skill's `source_id`, then append the portion of the file path relative to `managed_path` to `source_path`. When `source_path` is `.`, resolve that portion directly from the source repository root. The branch name records acquisition intent; the commit records the adopted version. Keep source material separate from managed copies, and do not automatically propagate source edits.

Calculate each file's SHA-256 from its stored raw bytes, without converting line endings, character encoding, or BOM. To calculate the overall comparison value, sort by the UTF-8 bytes of `relative_path` in ascending order. Construct each line as “lowercase SHA-256, two ASCII spaces, relative_path, LF,” concatenate the lines, and calculate the SHA-256 of the resulting UTF-8 byte sequence. Include every file under each adopted skill; exclude the root INDEX and manifest. JSON formatting and key order are not part of the comparison. For readable, stable diffs, serialize `sources` by `id`, `skills` by `name`, and `files` by `relative_path`, using ascending UTF-8 byte order. Preserve the application order of `intentional_changes`. Array formatting and this presentation order do not change the adopted contents; never reorder restoration instructions just to obtain a sorted file.

`upstream_relationship` must be one of `matches_upstream` (identical to the recorded upstream revision), `intentionally_modified` (intentional local changes), or `unverified_or_unresolved` (not verified, or differences remain unresolved). When it is `matches_upstream`, `intentional_changes` is an empty array. For intentional changes, each element records string fields `description`, `format` (`patch` or `skill-snapshot`), `artifact_path`, `artifact_sha256`, and `apply_instructions`. Artifact locations are relative to the manifest and must resolve within `/workspace/shared/projects/` or `/workspace/shared/downloads/`, including after symlink resolution. A patch must be applicable against the recorded commit. A snapshot must be a single archive containing the entire modified skill. Instructions must cover additions, deletions, replacements, and application order. Supply restoration materials with the manifest, and compare restored contents against `files`. Do not treat hashes alone as sufficient to restore edits. `intentionally_modified` requires a nonempty restoration list. Until the intended changes and restoration materials are established, use `unverified_or_unresolved`. Discrepancy arrays report unresolved deviations from the intended adopted contents, including approved changes. Expected differences from raw upstream belong in `intentional_changes`; they do not by themselves make reproduction fail. Do not regenerate expected hashes from unexplained current files merely to make verification pass.

To reproduce a pinned version, secure access to the sources, pinned commits, adopted skills, and required restoration materials. Verify the SHA-256 values of restoration materials and any acquisition records used. Acquisition records are supporting material: their absence alone must not block reproduction if the recorded commit can be acquired and all files compared. For every file in the managed copies, check missing or extra entries, size, SHA-256, and the overall comparison value. Mark completion only after verifying that each adopted skill has its entry point, all required references are present, and no unresolved differences remain. Acquiring the latest version is not a substitute for reproducing a pinned version. Recreate environment-specific records, such as timestamps and verification results, in the new environment.

Keep detailed acquisition logs and Git blob information in acquisition records, and purposes and loading instructions in INDEX. Do not put reading logs in the manifest or repeat the same version information for every file. Do not infer automatic loading, runtime behavior, working external links, or persistence from successful file comparisons. Hashes detect content differences against a trusted record; they do not authenticate the publisher or establish that code is safe. This format compares relative file paths and raw bytes, not executable permissions, ownership, timestamps, or symbolic-link identity. If reproduction depends on unsupported file types or metadata, pause that part and define the additional restoration requirements rather than claiming an identical environment.
