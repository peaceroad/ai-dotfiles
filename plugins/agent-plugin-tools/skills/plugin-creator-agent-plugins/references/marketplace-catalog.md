# Edit a GitHub-reference marketplace catalog

Use this workflow for a human-owned catalog that points at GitHub plugin repositories without copying their contents. For filesystem package assembly, use [Marketplace distribution](marketplace-distribution.md). Existing assembler-managed catalogs are generated outputs and must not be edited through this workflow.

Run `node scripts/manage-marketplace-catalog.mjs --help` from this skill directory, or use its verified absolute path. The helper works independently of ai-dotfiles. In an established ai-dotfiles workflow, prefer its `agent dev marketplace catalog` entrypoint when available; neither route changes the ownership boundary.

## Native files, separate host contracts

Select one root and an explicit format for each operation:

- `codex`: `.agents/plugins/marketplace.json`.
- `claude`: `.claude-plugin/marketplace.json`, including an explicitly supplied or existing owner.

The selected manifest is the only source of truth. The helper does not convert, synchronize, or write the other format. Host-specific metadata and unrelated entries must survive edits; preservation of an unsupported entry is not validation of its semantics.

Catalog and entry names follow separate native rules, not portable package-name rules. New custom catalogs cannot use the checked host-reserved names. Existing reserved names remain readable and editable with a warning because their source-dependent exceptions cannot be established offline. Contextual impersonation checks and live host registration remain unverified.

New Codex entries include `AVAILABLE` installation, `ON_INSTALL` authentication, and a default `Productivity` category. Use `--category` to choose another category on add/update; a marketplace category can override the upstream plugin's category. Existing policies and omitted metadata are not backfilled. These are desktop catalog authoring fields, not workspace role/access settings: ChatGPT workspace import manages those settings separately.

The supported authoring subset is GitHub HTTPS repositories at their root (`url`) or a repository-relative subdirectory (`git-subdir`). New references explicitly choose `ref` for a mutable branch/tag or `sha` for a fixed commit. Do not present a branch reference as a version pin. Catalog authoring does not prove the referenced package's name, availability, license, security, or host support.

## Operations and effects

`init`, `list`, `check`, `add`, `update`, and `remove` act only on the selected local catalog. Read the helper's help for exact required options and examples. Use `--dry-run` to preview an intended mutation. Applying requires interactive confirmation or an explicitly authorized `--yes`; this flag does not disable safety checks.

`update` changes only supplied fields and refuses unsupported selected sources. `remove` can delete a uniquely named unsupported listing without interpreting its source; unsafe details are hidden in the preview. It never removes source files or installed copies. Do not rebuild entries from a minimal template and lose existing extension fields. Resolve duplicate identities and ambiguous source-field changes explicitly. No-op operations leave the original bytes unchanged; actual edits may normalize JSON formatting.

The helper refuses managed assembly roots and unsafe redirected destinations. It serializes cooperating local writers and checks the inspected baseline before replacing a single file. This is not a guarantee against an uncooperative editor, hostile filesystem replacement, arbitrary NAS failures, or power loss. A rejected replacement can have an unknown outcome, and failed cleanup can follow a saved change. Inspect the catalog and operation-owned temporary state before retrying; never force-remove a lock merely because it is old. If artifact ownership could not be verified after creation, inspect the reported leftover rather than deleting an unverified path automatically.

## Publication and verification boundaries

The helper does not access the network, authenticate, fetch sources, run plugins, commit, push, or install. `$schema` and metadata URLs are data, not instructions to retrieve content. Offline checks validate supported syntax and report unsupported scope; they cannot verify private access or live host behavior.

A private source can still have its repository name disclosed by a public catalog. Never place credentials in references. Review publication scope and redistribution terms before sharing; actual private references and environment observations do not belong in public examples or logs.

OpenAI workspace import and Claude Code consume different native catalogs. Acceptance of a catalog or portable package does not imply that every skill, MCP server, hook, or client extension works identically. Do not describe external-reference cross-import as verified merely because a host accepts a compatible manifest format.

Daily sync and `Sync now` belong to the host, not this helper. Test an upstream-only update while leaving the catalog unchanged before claiming automatic propagation; test pinned and floating references separately. Host import/installation tests need their own authorized destination and should not run merely to complete local source validation.

## Official references

- [OpenAI workspace import, Git references and sync](https://learn.chatgpt.com/docs/enterprise/plugin-management).
- [Claude marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference).
- [Claude organization distribution](https://support.claude.com/en/articles/13837433-manage-plugins-for-your-organization): organization sync has deployment constraints distinct from direct Claude Code registration, including marketplace repository visibility requirements.
- [Codex native identifier validation](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/codex-rs/core-plugin-common/src/plugin_id.rs) and [reserved marketplace policy](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/codex-rs/core-plugins/src/marketplace_policy.rs), checked November 1, 2026. These do not establish a separate workspace-import schema or installed-client version.
- [OpenAI marketplace metadata](https://developers.openai.com/plugins/build/plugins#marketplace-metadata): desktop authoring guidance and policy/category fields.
