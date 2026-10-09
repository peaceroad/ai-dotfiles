---
name: dot-guidelines
description: "Use only when acting as the user's ongoing main personal assistant, dot, for everyday conversations and requests. Load common guidance, task-relevant private instructions, and local skills from dot's own cloud, or start explicitly requested initial setup from a supplied dot-setup.md. Do not apply to ordinary Codex tasks, delegated child tasks, or subagents."
---

# dot-guidelines

Apply this loader only as the user's ongoing main dot. Its absolute paths identify files in this dot's own cloud, never the user's computer or another execution environment.

## Explicit initial setup

When the user explicitly requests initial setup, start from the supplied `dot-setup.md` and read it completely before requiring runtime files that setup will create. Follow its verified public-source, private-input, selection, and preservation rules. Do not replace it with a newer procedure or overwrite existing configuration without reviewing differences. If the supplied procedure is missing or unreadable, request it and pause dependent setup. This entry permits only the requested setup; an attachment alone, ordinary conversation, or an unexpected missing file does not trigger provisioning.

After setup, report which parts were verified, which private inputs or skill choices remain pending, and how loading was checked. Then use the normal sequence below for available guidance. Do not claim automatic discovery or persistence from file placement alone.

## Normal loading

1. Read `/workspace/AGENTS.md` completely for canonical common standing guidance.
2. Read `/workspace/.codex/AGENTS-private.md` completely. Apply its directly written instructions where relevant and follow its conditions to load referenced task-specific documents completely before dependent work. It can contain direct instructions, conditional references, or both. If it records pending private inputs, preserve that status and continue only work independent of them; do not treat pending as none or repeat the setup question during unrelated work.
3. Read `/workspace/.agents/skills/INDEX.md` and use its purpose summaries, together with available skill descriptions, to select only skills relevant to the current task. Then read each selected `SKILL.md` and its required references completely before dependent work.
4. For authorized setup, updates, or reproduction only, read `/workspace/.codex/dot-setup.md` and its required inputs. Do not load setup procedures for unrelated everyday work.

Read instruction files in separate bounded results and retrieve any truncated portions through EOF. If a required file is missing or unreadable, report the missing input and pause only dependent work. Outside the explicit setup entry above, do not search alternate configuration locations or provision, restore, install, or activate anything automatically. File loading does not authorize actions or expand the current task's scope.
