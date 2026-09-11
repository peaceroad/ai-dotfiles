# agent-design-tools

An Agent Plugins v1 package for designing, reviewing, and improving model-facing instructions and agent workflows. This README is a user guide; each skill's `SKILL.md` defines its instructions and reference-loading conditions.

## Choose a skill

| Skill | Use it for |
| --- | --- |
| [prompt-design](skills/prompt-design/SKILL.md) | The meaning, strength, scope, and output requirements of model-facing instructions: prompts, system/developer/agent/tool instructions, `AGENTS.md`, skills, and evaluation prompts. Provides the shared design method and OpenAI-specific references. |
| [prompt-gemini-reference](skills/prompt-gemini-reference/SKILL.md) | Gemini-specific guidance alongside `prompt-design`, including text prompts, Gem Instructions and Knowledge, and image/video prompts. Provides references, not a generation tool. |
| [agent-workflow-design](skills/agent-workflow-design/SKILL.md) | How repeated or long-running work starts, progresses, waits, handles new instructions, recovers, and completes. Covers control ownership, authorization, evaluation, and improvement from execution evidence. |

Use `prompt-design` and `agent-workflow-design` together when a workflow needs model-facing instructions as well as execution control. For Codex skill creation or structural changes, use the built-in `skill-creator` for skill structure; it is provided separately from this plugin. A wording correction alone does not require workflow design, and ordinary task execution does not require these design skills merely because it uses several steps or tools.

For Gemini instruction design, `prompt-gemini-reference` first uses the shared method in `prompt-design`, then loads only the relevant Gemini references. The dependency is one-way: `prompt-design` does not require this supplement, and users may choose another Gemini-specific skill instead. When installing skills individually, include the complete `prompt-design` and `prompt-gemini-reference` directories, with their references, as siblings under the skill installation root. Installing this plugin includes both. Do not activate duplicate standalone and plugin copies of the same skill.

## Target model

`prompt-design` and `agent-workflow-design` select the model that will use the resulting instructions or workflow from the request, established conversation context, or the artifact's deployment context. For OpenAI or Codex work with no established target, they default to **GPT-6 Astra**.

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

`prompt-design` selects Astra or GPT-5.6 references according to the design target, with official guidance or an applicable specialized skill for other targets. Migration or comparison work may need guidance for more than one model. A model-independent wording correction for GPT-5.6 can skip its dedicated reference. OpenAI API tools and state management have a separate reference when relevant to the request.

`prompt-gemini-reference` uses the shared `prompt-design` method and bundled Gemini guidance to deliver the requested prompt or review. It adds Gem, media-input understanding, or image/video generation references only when needed. Ordinary design work can proceed from those references; official sources resolve explicit current-guidance requests, migrations, and consequential facts that available evidence does not establish reliably. Unresolved capabilities do not block independent wording or composition work, but remain identified rather than promised.

The maintained baseline is Gemini 3 and later, without pinning an unspecified minor version or changing the deployment. Omni, Veo, and Imagen use their own version-specific guidance. A Gemini target does not load Astra guidance merely because Codex is designing the prompt.

Input-media prompts address evidence in supplied images, clips, audio, or documents; generation prompts address new or edited media. Requests for prompt text do not authorize generation; when execution is also requested, the chosen Gemini surface needs its own available workflow. Neither this skill nor this plugin supplies that access or silently substitutes another provider.

`agent-workflow-design` selects references for control and coordination, state and recovery, improvement from evidence, or maintenance records according to the design needs. Its GPT-5.6 supplement applies when retaining, adapting, or comparing a GPT-5.6 workflow and model or runtime differences matter. Model-specific prompting advice remains in `prompt-design`.

## Sources for agent and harness improvement

These sources informed [Agent and harness improvement](skills/agent-workflow-design/references/agent-improvement-and-rsi.md). They are background reading, not additional execution requirements. Other-model examples offer design options, not evidence of the target model's behavior.

- [OpenAI: Research acceleration: The view inside OpenAI](https://openai.com/index/research-acceleration-view-inside-openai/): research assistance and progress toward RSI, with activity metrics, human steering, and shifting bottlenecks limiting conclusions about overall acceleration.
- [OpenAI Cookbook: Agent Improvement Loop with Traces, Evals, and Codex](https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop): connects execution evidence, evaluation, and a reviewed configuration change.
- [OpenAI Cookbook: Iterating Development Workflows with Codex](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex): artifact ownership, observed progress, and evidence-backed retrospective decisions.
- [Anthropic: How Warp builds self-improving agents](https://claude.com/blog/how-warp-builds-self-improving-agents-on-claude): specific user feedback leading to small, reviewable skill changes.
- [Anthropic: Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps): tests removal of model-compensating scaffolding and where an evaluator still adds value.

## Documentation and evaluation

The following repository documents are in Japanese:

- [Skill roles and responsibilities](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/notes/skill-creator-prompt-design-agent-workflow-design.md)
- [Prompt-design evaluation](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/prompt-design/README.md) and [model-reference review](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/prompt-design/model-reference-review.md)
- [Gemini reference separation](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/prompt-design/gemini-reference-review.md#2026年9月11日補助スキルへの分離)
- [Workflow-design evaluation](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/agent-workflow-design/README.md) and [follow-up review](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/agent-workflow-design/second-review.md)

These records distinguish design decisions, static checks, generated instructions or workflows, downstream trials, and untested areas. They do not establish general optimality or production reliability.
