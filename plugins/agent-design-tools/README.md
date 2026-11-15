# agent-design-tools

Design prompts, reusable instructions, and agent workflows with three complementary skills. This Agent Plugins v1 package provides the design methods and references; the resulting instructions target the model and runtime established by your request.

## Choose a skill

- **[prompt-design](skills/prompt-design/SKILL.md):** Write, review, or revise prompts, system and tool instructions, `AGENTS.md`, skills, and evaluation prompts. Use it to clarify intent, scope, constraints, evidence, and output requirements. It provides the shared method and OpenAI-specific guidance.
- **[gemini-instruction-design](skills/gemini-instruction-design/SKILL.md):** Design Gemini 4 prompts, Gemini Apps Skills, CLI and Antigravity instructions, API instructions, and Nano Banana or Omni media prompts. Invoke this skill alone for Gemini work: it reads `prompt-design` and adds `agent-workflow-design` when execution control needs design.
- **[agent-workflow-design](skills/agent-workflow-design/SKILL.md):** Design repeated or long-running work, tool or agent coordination, waiting, interruption, recovery, and improvement from execution evidence. It uses `prompt-design` when the workflow also needs model-facing instructions.

For Codex skill creation or structural changes, use the separately provided `skill-creator` for skill structure. A wording edit or an ordinary API tool-call loop does not by itself need workflow design. These skills are for designing the work; an ordinary task does not need them just because it takes several steps.

## Example requests

In Codex, you can name the skill explicitly:

```text
Use $prompt-design to revise this system prompt. Preserve its JSON output
contract and distinguish missing evidence from a negative finding.
```

```text
Use $gemini-instruction-design to turn these editorial guidelines into a
Gemini Apps Skill. Return SKILL.md and the references it needs.
```

```text
Use $agent-workflow-design to design a recurring documentation check.
Specify what triggers work, what happens while a build is pending, and
how interrupted work resumes without publishing the same change twice.
```

Supply the current instructions and relevant examples or constraints when available. Say whether you want a review, a rewrite, files, or an implementation. For Gemini, name Apps, Gemini CLI, Antigravity, or the API when it affects the artifact; established conversation context is sufficient.

## How Gemini design works

The general-purpose baseline is **Gemini 4 Carbon, Argon, and Hydrogen**. Image prompts center on **Nano Banana 2.1**, retaining 2, Lite, or Pro for an established target or relevant tradeoff. Video prompts center on **Omni 1.2**; an explicitly selected Cloud Veo target uses its own contract. Image and video families have separate model identities.

The Gemini skill first reads the shared design method, then selects from seven references: Apps Skills, Gemini CLI, Antigravity, API instructions, multimodal inputs, image prompts, and video prompts. Ordinary text prompts need no extra surface reference unless a capability affects the result. Mixed work combines the relevant guidance: an Apps Skill that writes image prompts uses both Apps and image references.

The workflow companion is conditional on designing execution control, such as delegation, waiting, retries, cancellation, or recovery. Using Antigravity or stating a completion condition alone does not require it. Gemini-specific choices stay in the Gemini skill; the shared skills need no Gemini-specific customization. The generated Skill or prompt should contain the guidance its destination needs, not links to the author's installed design skills.

Bundled references support ordinary design. Migrations, requests for the latest guidance, and consequential uncertain capabilities call for checking official sources. Apps, CLI, Antigravity, and API support are checked separately. The plugin provides no Gemini connector or generation tool: delivering prompt text or a Skill package does not establish that it has been imported, activated, or executed.

## Model targeting

The skills retain a target established by your request, conversation, or deployment. An explicit migration request selects the new design target. For OpenAI or Codex work with no established target, the default is **GPT-6 Astra**. Other targets use their official guidance or an applicable model-specific skill when model behavior affects the design.

The model running these skills and the model that will use their output can differ. Designing Gemini instructions in Codex does not select OpenAI guidance for that output. Reference selection does not switch the running model or change a deployment. Each `SKILL.md` owns the detailed loading conditions.

## Installation and updates

Install the `agent-design-tools` directory through a host that supports Agent Plugins v1. The package includes all three skills and their resources; it has no MCP server or separate service configuration. Host support determines discovery and invocation syntax. For ai-dotfiles-managed development or distribution, follow the repository's [development guide](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/agent-development.md).

For standalone installation, install complete skill directories, including references, under the host's skill root. Gemini design requires `prompt-design`; add `agent-workflow-design` for workflow design. Sibling directories make those dependencies directly resolvable. The entry point can also resolve companions through the installed skill catalog and reports a missing required companion.

Version **0.4.0** replaces `prompt-gemini-reference` with `gemini-instruction-design`. Update explicit invocations and use the existing installation manager to replace older installed copies. Choose either standalone or plugin discovery for a given skill to avoid duplicate versions. Editing this repository does not update an installed copy by itself.

## Design sources

The Gemini references were checked against official documentation on **2026-11-15**. This is a documentation review date, not evidence of live client testing. Each reference retains its sources and the conditions that call for verification. The following sources explain broader design choices and are optional background reading.

The OpenAI references retain their earlier documentation-review dates: Astra prompting, **2026-09-12**; API tools and runtime guidance, **2026-09-05**. These dates do not constitute a new specification review.

For Gemini, the [Carbon developer guide](https://aistudio.google.com/learn/gemini-4-carbon-developer-guide) and [Argon developer guide](https://aistudio.google.com/learn/gemini-4-argon-developer-guide) inform the focus on outcomes, verification feedback, appropriate media, and lessons from sustained work. Their example agent arrangements are design options. [Hydrogen's guide](https://aistudio.google.com/docs/whats-new-gemini-4-hydrogen) supplies its thinking, output-budget, and API conditions.

The workflow references draw on these sources for [agent and harness improvement](skills/agent-workflow-design/references/agent-improvement-and-rsi.md). Examples from other models are not evidence of the selected model's behavior.

- [OpenAI: Rethinking skills and prompts for GPT-6 Astra](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra): precise discovery, selective reference loading, and reassessment of older instructions.
- [OpenAI: Research acceleration](https://openai.com/index/research-acceleration-view-inside-openai/): research assistance, human steering, and limits on claims about overall acceleration or RSI.
- [OpenAI Cookbook: Agent Improvement Loop](https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop): execution evidence, evaluation, and reviewed configuration changes.
- [OpenAI Cookbook: Iterating Development Workflows with Codex](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex): artifact ownership and evidence-backed retrospectives.
- [Anthropic: How Warp builds self-improving agents](https://claude.com/blog/how-warp-builds-self-improving-agents-on-claude): user feedback leading to focused skill revisions.
- [Anthropic: Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps): testing which model-supporting instructions and evaluator stages remain useful.

## Design and evaluation records

These repository documents are in Japanese:

- [Skill roles and responsibilities](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/notes/skill-creator-prompt-design-agent-workflow-design.md)
- [Prompt-design evaluations](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/prompt-design/README.md), including model-reference and revision history
- [Astra review and evaluation updates](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/prompt-design/astra-blog-review.md)
- [Gemini 4 redesign](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/prompt-design/gemini-4-rewrite.md) and [current prompting and Skills audit](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/prompt-design/gemini-4-prompt-audit.md)
- [Workflow-design evaluations](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/agent-workflow-design/README.md) and [follow-up review](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/agent-workflow-design/second-review.md)

The records distinguish source review, structural checks, generated artifacts, downstream trials, and untested behavior. They do not establish general optimality or production reliability.
