# Repository instructions

## Public exports

- `home/.agents/` and `home/.codex/` are export destinations for publishable files from the user's home directory. Avoid introducing personal usernames, machine-specific absolute paths, or credentials. These destinations are distinct from repository-root `.agents/` and `.codex/`.
- For scripts exported to this repository, keep usernames and expanded home-directory paths out of normal output, help, and errors. Use actual paths internally and public-safe forms such as `~` for display.
- Preserve the sensitive-information checks in `export.js`. Scope any necessary exception to a specific target and check.

## Export validation

- After changing `export.js` or `export.yaml`, run `node --check export.js` and `npm run check`. Do not run `npm run build` while the dry run has outstanding findings.
- For export work in the Windows Codex sandbox, complete the checks and ask the user to run `npm run build`; writes to `home/.agents/` and `home/.codex/` can fail with `EPERM` there.

## Dependencies

- Add an external dependency only when a clear requirement cannot be met with standard modules alone.

## Documentation layout and language

- Put plugin usage and setup guidance in `plugins/<plugin>/README.md`. Keep individual skill roots free of `README.md`; keep each skill's entry-point instructions and reference-loading conditions in `SKILL.md`. Purpose-specific README files within assets or templates may remain with those resources.
- Use English by default for this file and for descriptions, instructions, references, READMEs, UI metadata, and generic templates under `plugins/`. Preserve the language needed by language-specific examples, quotations, evaluation inputs, and translation targets.
- Use Japanese by default for user-facing explanations, public notes, and evaluation write-ups under `docs/`. Create parallel language versions of a document only when there is a concrete user need.

## Skill and plugin reference placement

- Choose reference placement by its role in execution and its loading cost. Keep needed instructions, contracts, evidence, and source links in the relevant skill or reference, with clear conditions for when to read or verify them.
- For plugins, prefer `plugins/<plugin>/README.md` for concise background sources and explanations that should accompany the plugin. For standalone skills, prefer suitable existing project notes under `docs/` for background sources and rationale worth retaining. Use project notes for detailed design rationale and evaluation records when useful for maintenance. Choose by role, length, and distribution needs; reuse suitable documents and link between them without making background required reading for ordinary execution.
- Before moving or removing material, inspect its content and callers, preserve required constraints and attribution, and check that required material remains accessible from the intended installation. Do not relocate links mechanically or optimize for fewer URLs alone.
