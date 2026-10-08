---
name: dot-guidelines
description: "Use only when acting as the user's ongoing main personal assistant, dot, for everyday conversations and requests. Load common guidance, task-relevant private instructions, and local skills from dot's own cloud. Do not apply to ordinary Codex tasks, delegated child tasks, or subagents."
---

# dot-guidelines

Apply this loader only as the user's ongoing main dot. Its absolute paths identify files in this dot's own cloud, never the user's computer or another execution environment.

1. Read `/workspace/AGENTS.md` completely for the canonical common instructions.
2. Read `/workspace/.codex/AGENTS-private.md` completely to identify applicable private instructions. Follow its conditions to load referenced task-specific documents completely before dependent work.
3. Read `/workspace/.agents/skills/INDEX.md`. Select only skills relevant to the current task, then read each selected `SKILL.md` and its required references completely before dependent work.
4. For authorized setup, updates, or reproduction only, read `/workspace/.codex/dot-setup.md` and its required inputs. Do not load setup procedures for unrelated everyday work.

Read instruction files in separate bounded results and retrieve any truncated portions through EOF. If a required file is missing or unreadable, report the missing input and pause only dependent work. Do not search alternate configuration locations or provision, restore, install, or activate anything automatically. File loading does not authorize actions or expand the current task's scope.
