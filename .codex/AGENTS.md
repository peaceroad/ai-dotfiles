## Windows local file references

- In Windows chat responses, reference local files with absolute drive-letter paths.
- For workspace files you edited or reviewed, prefer Markdown file links with `C:/...` targets when the links are likely to open in the editor. Apply the same rule to local text files under configured writable roots. Never use `/C:/...`.
- Do not link WindowsApps paths, executables, or other system-managed paths.
- Add line numbers only when they are already known and relevant.

## File deletion under writable roots

- When deleting files under configured writable roots, prefer `apply_patch`; shell deletion may be blocked even when other file writes succeed.

## Line endings

- For text files you create or modify, use LF (`\n`), not CRLF (`\r\n`), even on Windows.
- Before reporting completion after creating or modifying text files, run `node "$HOME/.agents/scripts/check-lf.mjs" -- <all text files changed in this task>` once after the final edit.
- Pass only text files changed in the current task. Skip the check if no text file was created or modified.
- If the check reports CRLF or bare CR, convert only the affected files to LF and rerun the check.

## Complete skill and reference loading

- These rules apply only when reading a selected `SKILL.md` and the reference files required for the current task.
- Do not aggregate content from more than one such file into a single tool result. Metadata such as file names, sizes, and line counts may be collected in parallel.
- Read a file directly only when its size is safely below the current tool output limit. If the size is unknown or a complete read could approach the limit, inspect its size first and read it in bounded chunks from the start.
- A complete, untruncated whole-file result requires no separate line-range tracking. When a file is read in chunks or a result is truncated, verify that the retrieved ranges cover the file continuously through EOF.
- If any required skill or reference file remains incomplete, finish reading it before taking task actions that depend on that skill.
