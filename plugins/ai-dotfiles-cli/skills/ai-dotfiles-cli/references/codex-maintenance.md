# Codex maintenance and session exports

Use the relevant `agent codex <tool> help` before maintenance. These are ai-dotfiles helpers, not official Codex subcommands. Installed help supplies current supported versions, OS restrictions, and confirmation syntax. Do not expand a diagnostic request into repair.

## Diagnostics and workarounds

Begin with the relevant read-only `status`, not every tool. `git-acl` needs a selected repository and is Windows-only, as is `disk-pressure`. `skill-validator-utf8` can be invoked explicitly across OSes but is normally unnecessary with UTF-8 Python defaults; an unknown validator version is not permission to patch it. `log-policy` controls future retained SQLite logs; it does not remove existing rows or guarantee disk space recovery.

Use supported repair/apply/restore operations only for an authorized change and a recognized state. Preserve version/hash/schema guards. When clients must be closed or the tool requires an external terminal, hand off the exact command and conditions. Do not shut down the host running the task, loosen permissions, or patch source databases to bypass a refusal. No status result alone authorizes a workaround.

## Session selection and export

`session list` and ordinary `session plan` inspect metadata. A selection can be a UUID, `--before YYYY-MM-DD`, or `--before 4w`; dates use UTC midnight and weeks use the invocation time. Updated time is not last-viewed time. Plans account for descendants and protected groups; do not turn a filtered list into a handwritten recursive delete.

For an authorized export, review `session plan export <selection>` with the intended output. `session export` copies reference material; it does not move or delete originals and is not a restorable backup. It retains raw records, a readable record view, inherited prefixes when available, and supported media. Coverage warnings and a completed manifest have different meanings: completion does not guarantee every attachment or an exact UI transcript.

Local attachment collection requires the explicit `--attachments-from <directory>` boundary and supported structured references. Do not collect a project, follow paths in prose/tool outputs, or download remote attachments. Current local bytes are not necessarily the historical originals. Exports may contain credentials and other private information; never publish them as ordinary project artifacts.

The parent output directory must already exist, outside Codex storage and Git repositories. `session config --output <directory>` changes the default destination, not existing files. Settings live in `~/.agents/ai-dotfiles/codex-session-export.json` (`AGENT_CODEX_EXPORT_CONFIG` can override that file). Previous directories are remembered; `--output` overrides one export, while history `--in` selects one saved location. Moving existing exports is a separate requested filesystem operation: preserve snapshot folders and `batches/` together and check them at the new location before discarding anything.

## Confirmation and deletion

Use explicit command options for automation. Where supported, obtain a fresh plan token and pass `--confirm <token>` only for the operation and scope already authorized by the user. The token binds a reviewed state; it is not permission in itself. For destination changes use `config --output <directory> --dry-run`, then the corresponding confirmation token. Changes invalidate plans; do not invent or reuse a stale token.

Export keeps originals by default. `--after keep` suppresses follow-up; `--after review-delete` is a separate review, and non-interactive export does not thereby delete. To consider deletion of exactly a saved batch, use `history batches` to identify its receipt, then `session plan delete --exported <batch-id> --in <directory>`. Review excluded families and warnings; a receipt is neither deletion authority nor proof of restoration. Never rerun the original date selector as a substitute for the exported batch.

Archive and delete have additional CLI/OS and closed-client requirements. Archive is not a space-saving substitute for deletion, and associated managed worktrees may have their own client lifecycle. Deletion is irreversible in this tool. Review that consequence and preserve required work before any authorized deletion. Keep export and deletion confirmations separate and retain the live/saved byte and protection checks. If these operations cannot run while this task is active, provide an external-terminal handoff rather than bypassing the check.

After partial failure, report completed groups and unresolved state; do not assume rollback or retry automatically. Keep fixture-tested behavior distinct from real-history validation. Exit code 3 reports export coverage warnings or excluded deletion families, not unconditional success; use the installed help for the exact operation's result contract.
