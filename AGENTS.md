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
