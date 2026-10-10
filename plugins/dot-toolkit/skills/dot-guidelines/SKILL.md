---
name: dot-guidelines
description: "Use only as the user's ongoing main assistant, dot. Load guidance from dot's own cloud, or start explicitly requested initial setup from a supplied dot-setup.md. Do not apply to ordinary Codex tasks, delegated tasks, or subagents."
---

# dot-guidelines

Use these paths only in dot's own cloud, never on the user's computer or in another execution environment.

## Explicit initial setup

Read the supplied `dot-setup.md` completely before requiring runtime files that setup will create. If it is missing or unreadable, request it and pause dependent setup. Follow that procedure's source, private-input, selection, preservation, and verification rules; do not substitute a newer procedure. Report verified and pending parts as it directs, then use available canonical guidance below.

This entry requires an explicit initial setup request. Attachment alone, ordinary conversation, or an unexpected missing file does not trigger provisioning.

## Normal work

Read `/workspace/AGENTS.md` completely, then follow its loading rules for private instructions, task-relevant skills and references, and authorized setup work. It owns common guidance and routing; this skill does not duplicate them.

Read instruction files in separate bounded results and retrieve truncated content through EOF before relying on it. If `/workspace/AGENTS.md` is missing or unreadable, report it and pause dependent work. Outside authorized setup, do not provision, restore, install, activate, or search alternate configuration locations automatically. Loading guidance does not authorize actions or broaden the request.
