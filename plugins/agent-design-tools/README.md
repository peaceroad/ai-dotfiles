# agent-design-tools

An Agent Plugins v1 package for designing, reviewing, and improving model-facing instructions and agent workflows. This README is a user guide; each skill's `SKILL.md` defines its instructions and reference-loading conditions.

## Choose a skill

| Skill | Use it for |
| --- | --- |
| [prompt-design](skills/prompt-design/SKILL.md) | The meaning, strength, scope, and output requirements of model-facing instructions: prompts, system/developer/agent/tool instructions, `AGENTS.md`, skills, and evaluation prompts. Includes Gemini prompts, Gems, and image/video generation prompts. |
| [agent-workflow-design](skills/agent-workflow-design/SKILL.md) | How repeated or long-running work starts, progresses, waits, handles new instructions, recovers, and completes. Covers control ownership, authorization, evaluation, and improvement from execution evidence. |

Use both when a workflow needs model-facing instructions as well as execution control. For Codex skill creation or structural changes, use the built-in `skill-creator` for skill structure; it is provided separately from this plugin. A wording correction alone does not require workflow design, and ordinary task execution does not require these design skills merely because it uses several steps or tools.

## Target model

Both skills select the model that will use the resulting instructions or workflow from the request, established conversation context, or the artifact's deployment context. For OpenAI or Codex work with no established target, they default to **GPT-6 Astra**.

| Request or deployment context | Design target |
| --- | --- |
| Create new OpenAI or Codex instructions or a workflow without specifying a target | Astra |
| Explicitly request GPT-5.6 | GPT-5.6 |
| Give no new target, but the existing deployment is known to use GPT-5.6 | Retain GPT-5.6 |
| Ask to migrate GPT-5.6 instructions or a workflow to Astra | Switch the design target to Astra |
| Specify Gemini or a Gem, or establish that target in the conversation | Gemini |

You do not need to name the model in every request. The skills use evidence about the target; wording style alone cannot reliably identify a model.

**The design target does not automatically follow the model running the skill.** For example, even when GPT-5.6 runs a skill, an unspecified OpenAI or Codex design target defaults to Astra. Choosing references does not change the running model or deployment settings.

## Reference selection

`prompt-design` selects Astra, GPT-5.6, or Gemini references according to the design target. Migration or comparison work may need guidance for more than one model. A model-independent wording correction for GPT-5.6 can skip its dedicated reference. Additional references cover Gem Instructions and Knowledge, Gemini image and video prompts, and OpenAI API tools and state management when relevant to the request.

`agent-workflow-design` selects references for control and coordination, state and recovery, improvement from evidence, or maintenance records according to the design needs. Its GPT-5.6 supplement applies when retaining, adapting, or comparing a GPT-5.6 workflow and model or runtime differences matter. Model-specific prompting advice remains in `prompt-design`.

## Documentation and evaluation

The following repository documents are in Japanese:

- [Skill roles and responsibilities](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/notes/skill-creator-prompt-design-agent-workflow-design.md)
- [Prompt-design evaluation](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/prompt-design/README.md) and [model-reference review](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/prompt-design/model-reference-review.md)
- [Workflow-design evaluation](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/agent-workflow-design/README.md) and [follow-up review](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/agent-workflow-design/second-review.md)

These records distinguish design decisions, static checks, generated instructions or workflows, downstream trials, and untested areas. They do not establish general optimality or production reliability.
