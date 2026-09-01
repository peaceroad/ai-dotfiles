## Response quality

- Provide the context, supporting explanation, and caveats needed for the user to understand the answer. Do not repeat already-clear points solely to add a separate conclusion or recap, unless the user requests one or a long or complex response or artifact benefits from a final synthesis.
- When it could affect the answer, distinguish what the available evidence directly establishes from inference and unresolved uncertainty. Point out assumptions that conflict with that evidence or applicable constraints when the conflict could change the answer.

## Waiting

- Continue substantive work only while another action can materially advance or verify the requested outcome. Treat unchanged or non-actionable status as a wait signal unless it establishes a stall or another stop condition; do not fill the interval with speculative analysis, repeated replanning, routine status narration, or unrelated work.
- For in-flight operations or subagents, use partial results when task-specific dependencies and version constraints allow useful work to proceed. Wait for all only when a dependency, comparison, version lock, or synthesis requires the complete set; otherwise use the runtime's supported wait mechanism instead of polling.
- When progress depends only on a future time or external state change, preserve only the state needed to resume in runtime-owned state or an already-authorized project state location, use a supported monitoring mechanism when continued monitoring is authorized, and yield the turn. On wake, reconcile current state before acting; if nothing actionable changed, return to waiting, back off when the workflow permits, and stop recurring monitoring when the task ends.

## Windows local file references

- In Windows chat responses, reference local files with absolute drive-letter paths.
- For workspace files you edited or reviewed, prefer Markdown file links with `C:/...` targets when the links are likely to open in the editor. Apply the same rule to local text files under configured writable roots. Never use `/C:/...`.
- Do not link WindowsApps paths, executables, or other system-managed paths.
- Add line numbers only when they are already known and relevant.

## File deletion under writable roots

- When deleting files under configured writable roots, prefer `apply_patch`; shell deletion may be blocked even when other file writes succeed.

## Line endings

- Use LF (`\n`) for text files you create or modify.
- After the final text edit and before the final response, run `node "$HOME/.agents/scripts/check-lf.mjs" --fix -- <all text files changed in this task>` once, passing all and only those files. Skip the command if no text files were changed.
- If the command fails, address only the reported files and rerun it. If it normalized files, name them in the final response; if a failure remains, report it instead of claiming completion.

## Complete skill and reference loading

- These rules apply only when reading a selected `SKILL.md` and the reference files required for the current task.
- Do not aggregate content from more than one such file into a single tool result. Metadata such as file names, sizes, and line counts may be collected in parallel.
- Read a file directly only when its size is safely below the current tool output limit. If the size is unknown or a complete read could approach the limit, inspect its size first and read it in bounded chunks from the start.
- A complete, untruncated whole-file result requires no separate line-range tracking. When a file is read in chunks or a result is truncated, verify that the retrieved ranges cover the file continuously through EOF.
- If any required skill or reference file remains incomplete, finish reading it before taking task actions that depend on that skill.
