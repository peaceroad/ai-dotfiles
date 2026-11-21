# Repository instructions

This file guides work on ai-dotfiles. The [root README](README.md) is the Japanese entry point for users. Edit this file for repository-wide rules. For changes to the shared Codex instructions exported to [home/.codex/AGENTS.md](home/.codex/AGENTS.md), follow the public export process below.

## CLI and plugin ownership

- Edit plugin source under `plugins/<plugin>/`. Installed plugins, Codex caches, and assembled Marketplace packages are downstream copies. Use the existing manager when testing or updating an installation.
- The CLI runtime belongs in `tools/agent/`. Generic package validators, local-install helpers, and Marketplace authoring tools belong in `plugins/agent-plugin-tools/`. The installer copies a version-matched set from these sources. Keep the installed CLI independent of plugin caches and skill discovery paths.
- Put ai-dotfiles-specific operating instructions and `codex-history` in `plugins/ai-dotfiles-cli/`. Keep generic authoring tools usable independently, with just enough guidance to respect an existing manager. Link to CLI procedures where needed.
- `scripts/install-agent.mjs` installs the CLI runtime and schemas. Preserve user settings, standalone skills, and local edits. Switching a skill between standalone and plugin discovery requires an explicit migration separate from CLI installation.
- Use standard modules where they meet the requirement. Add an external dependency only for a clear unmet need.

## Skill and plugin reference placement

- Keep the entry point and decisions needed on ordinary runs in `SKILL.md`. Put specialized instructions, contracts, evidence, and source links in the skill or its bundled references. Say when to read a reference or verify a source.
- Put setup, usage, and concise background that should ship with a plugin in `plugins/<plugin>/README.md`. Keep individual skill roots free of README files. An asset or template can have its own purpose-specific README.
- Use existing project notes in `docs/` for standalone skill background, detailed design rationale, and evaluation write-ups. Link to optional background where useful. When moving or removing material, check its content and callers, preserve constraints and attribution, and verify that an installed skill can still reach everything needed at runtime.
- Write this file and plugin descriptions, instructions, references, READMEs, UI metadata, and generic templates in English by default. Japanese is the default for the root README and for user-facing guides, public notes, and evaluation write-ups under `docs/`. Preserve the language required by examples, quotations, evaluation inputs, and translation targets. Maintain parallel translations only for a concrete reader need.

## Privacy of repository content

- Treat actual-environment details as private even after anonymization. Keep local inventories, configuration details, diagnostic logs, operational timestamps, and measurements such as file counts, storage use, and machine benchmarks out of all repository files unless the user explicitly requests their inclusion. This includes examples, tests, notes, and exports.
- Express reusable findings as behavior, requirements, or verification methods. Use synthetic fixtures for environment-specific examples. Attribute general platform facts to public sources when appropriate.
- For skills, instructions, and workflows maintained here, store publishable evaluation definitions and behavioral evidence in [evals/](evals/README.md). Put interpretation and maintenance rationale in `docs/`. Other projects follow their owner's policy, including when they use this repository's evaluator.
- Retain evidence for a concrete maintenance decision, such as a baseline, a regression, an adopted or rejected change, or an evaluator defect. A no-change result can qualify. Select inputs, responses, criteria, case judgments, and source versions only after checking for personal information, secrets, private task material, and environment details.
- Keep raw runtime records outside the repository by default. Local runs can yield publishable evidence. Label excerpts, transformations, and synthetic examples, preserve provenance and meaning, and state missing conditions that limit interpretation. Never present invented output as an observation.

## Public exports

- `export.yaml` selects files from the user's home. `export.js` writes the public copies under `home/.agents/` and `home/.codex/`. Make persistent changes at the authorized source before exporting. Repository-root `.agents/` and `.codex/` have separate project scope.
- Keep usernames, machine-specific absolute paths, and credentials out of public files. In exported scripts, resolve real paths internally and use public-safe forms such as `~` in output, help, and errors. Preserve the sensitive-information checks in `export.js` and scope any necessary exception to a specific target and check.
- After changing `export.js` or `export.yaml`, run `node --check export.js` and `npm run check` (synthetic export inputs). Before a real export, run `npm run check:export` against the intended home files. Resolve outstanding findings before writing and inspect the generated diff before publication. See the [export guide](docs/export.md).
- In the Windows Codex sandbox, finish the checks and ask the user to run `npm run build` for the real export. Writes to the public home destinations can fail there with `EPERM`.

## Validation by change

- Use [package.json](package.json) for the current test commands. `npm run check` covers the synthetic export, CLI, skill links, plugin helpers, and package tests. Run the dedicated `npm run check:eval-tools` or `npm run check:dot-toolkit` when changing the corresponding runner, cases, or dot instructions and setup. For a documentation-only change, check the affected commands, paths, and section links, including inbound links to renamed headings.
- Report what the checks exercised. A package check establishes structure, and a model or host behavior claim needs evidence from the relevant execution path. See the [CLI test conditions](docs/agent-development.md#検証範囲と実環境での確認) for OS-specific, opt-in, and skipped cases.

## Codex session maintenance

Before changing session export or deletion, read the [current contract](docs/agent-codex.md) and the relevant [preservation acceptance conditions](docs/plans/ai-dotfiles-session-preservation-plan.md). Review selection, saved coverage, pre-operation checks, post-operation verification, and retry as one change.

- Verify the physical file inventory as well as rollout IDs. Treat an unreadable inventory as unknown. Reuse an inventory within one inspection and rebuild it at confirmation and mutation boundaries.
- Preserve thread-owned message boards and attachment membership rows across export, pre-delete comparison, completion checks, and retry. Treat referenced paths as opaque. Test failed synchronization before deletion separately from hash integrity. Report an accepted OS flush separately from any claim about device durability after power loss.
- Run regression and real CLI compatibility checks in disposable synthetic homes. Verify startup and completed deletion from their actual outcomes. A successful fake CLI or exit code alone is insufficient. Record supported and unverified conditions separately and mark a plan complete only for the acceptance conditions actually verified.
