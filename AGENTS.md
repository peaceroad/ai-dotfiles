# Repository instructions

## Privacy of repository content

- Keep useful, publishable evaluation definitions and behavioral evidence for this repository's skills, instructions, and workflows in `evals/`, with interpretation and maintenance rationale in `docs/`. This includes task inputs, responses, criteria, case-level judgments, and relevant source versions, after checking for personal information, secrets, private task material, and actual-environment details covered below. Choose the location by what the evidence helps maintain, not by which plugin performed the evaluation; other projects' evaluations follow their owner's storage policy.
- Treat details of the user's actual environment as private, even when names and paths are anonymized. Do not record local inventory, configuration details, diagnostic logs, or environment measurements (such as file counts, storage usage, operational timestamps, or machine-performance benchmarks) in repository files unless the user explicitly requests their inclusion. This applies across documentation, notes, examples, tests, and exports.
- Preserve reusable findings about private environments as generalized behavior, requirements, and verification methods; use synthetic examples or fixtures instead of copying local observations. General platform requirements and facts from public sources may remain, with attribution where appropriate.
- Local execution alone does not make skill or workflow evaluation evidence private. Keep raw runtime records outside the repository by default; select publishable evidence rather than copying complete logs. Label excerpts and transformations, preserve the meaning and provenance of responses, and state missing conditions that limit interpretation. Do not invent replacements and present them as observed output.
- Retain evaluation evidence for a concrete maintenance use, such as a baseline, regression case, adoption or rejection rationale, or an evaluator defect. A no-change result can be useful evidence; neither a successful change nor every completed run requires an archived repository record. Publication suitability and maintenance value are separate decisions.

## Public exports

- `home/.agents/` and `home/.codex/` are export destinations for publishable files from the user's home directory. Avoid introducing personal usernames, machine-specific absolute paths, or credentials. These destinations are distinct from repository-root `.agents/` and `.codex/`.
- For scripts exported to this repository, keep usernames and expanded home-directory paths out of normal output, help, and errors. Use actual paths internally and public-safe forms such as `~` for display.
- Preserve the sensitive-information checks in `export.js`. Scope any necessary exception to a specific target and check.

## Export validation

- After changing `export.js` or `export.yaml`, run `node --check export.js` and `npm run check`. Do not run `npm run build` while the dry run has outstanding findings.
- For export work in the Windows Codex sandbox, complete the checks and ask the user to run `npm run build`; writes to `home/.agents/` and `home/.codex/` can fail with `EPERM` there.

## Dependencies

- Add an external dependency only when a clear requirement cannot be met with standard modules alone.

## CLI and plugin ownership

- Keep CLI runtime sources in `tools/agent/` and generic plugin helpers in `plugins/agent-plugin-tools/`. The installer copies a version-matched runtime from those sources; runtime execution must not depend on an installed plugin cache or skill discovery path.
- Keep ai-dotfiles-specific operating instructions and `codex-history` in `plugins/ai-dotfiles-cli/`. Keep `agent-plugin-tools` independently usable without that plugin or the CLI, including the minimal guidance needed to respect an existing manager. Do not duplicate CLI procedures in generic authoring references.
- Keep CLI installation separate from skill installation. `scripts/install-agent.mjs` installs runtime files and schemas, not skills or user settings. Preserve existing standalone skills and local edits; any switch between standalone and plugin discovery is an explicit operation, not installer cleanup.

## Codex session maintenance

- Before changing session export or deletion, read the relevant acceptance conditions in `docs/plans/ai-dotfiles-session-preservation-plan.md` and the current contract in `docs/agent-codex.md`. Review selection, saved coverage, pre-operation checks, post-operation verification, and retry behavior together. Do not equate a rollout ID set with a physical file inventory, or an unreadable inventory with an empty one.
- Keep regression and real CLI compatibility checks in disposable synthetic homes. A successful fake CLI or exit code alone does not establish startup safety or completed deletion. Record supported and unverified conditions separately; mark a plan complete only for the acceptance conditions actually verified. Reuse inventories within one inspection, and rebuild them at confirmation and mutation boundaries.

## Documentation layout and language

- Put plugin usage and setup guidance in `plugins/<plugin>/README.md`. Keep individual skill roots free of `README.md`; keep each skill's entry-point instructions and reference-loading conditions in `SKILL.md`. Purpose-specific README files within assets or templates may remain with those resources.
- Use English by default for this file and for descriptions, instructions, references, READMEs, UI metadata, and generic templates under `plugins/`. Preserve the language needed by language-specific examples, quotations, evaluation inputs, and translation targets.
- Use Japanese by default for user-facing explanations, public notes, and evaluation write-ups under `docs/`. Create parallel language versions of a document only when there is a concrete user need.

## Skill and plugin reference placement

- Choose reference placement by its role in execution and its loading cost. Keep needed instructions, contracts, evidence, and source links in the relevant skill or reference, with clear conditions for when to read or verify them.
- For plugins, prefer `plugins/<plugin>/README.md` for concise background sources and explanations that should accompany the plugin. For standalone skills, prefer suitable existing project notes under `docs/` for background sources and rationale worth retaining. Use project notes for detailed design rationale and evaluation records when useful for maintenance. Choose by role, length, and distribution needs; reuse suitable documents and link between them without making background required reading for ordinary execution.
- Before moving or removing material, inspect its content and callers, preserve required constraints and attribution, and check that required material remains accessible from the intended installation. Do not relocate links mechanically or optimize for fewer URLs alone.
