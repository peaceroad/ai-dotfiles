# agent-design-tools

Use this plugin to write instructions an agent can follow or to design how an agent will carry out a recurring job. It bundles three skills in an Agent Plugins v1 package.

## Choose a skill

- **[prompt-design](skills/prompt-design/SKILL.md)** writes and reviews prompts, `AGENTS.md`, skill instructions, and tool descriptions. Choose it when the work depends on what the model should understand, preserve, or return.
- **[agent-workflow-design](skills/agent-workflow-design/SKILL.md)** designs how work starts, who does it, when to wait, how to resume, and what counts as done. Choose it when those decisions affect the outcome. It uses `prompt-design` if the workflow also needs instructions for a worker.
- **[gemini-instruction-design](skills/gemini-instruction-design/SKILL.md)** writes instructions for Gemini Apps, Gemini CLI, Antigravity, and the API, including prompts for images and video. Ask for this skill directly. It loads the shared design skills it needs.

For a new Codex skill or a change to its structure, start with Codex’s separately provided `skill-creator` and use `prompt-design` for the instructions.

## Example requests

- “Rewrite this system prompt so that a missing record and a negative finding produce distinct results. Preserve the JSON output format.”
- “Design a weekly documentation check that can resume after an interruption without publishing the same update twice.”
- “Turn these editorial guidelines into a Gemini Apps Skill. Return the skill file and the references it needs.”

Include the existing instructions or an example of the problem when you have one. Say whether you want findings, revised text, or files. In Codex you can also name a skill explicitly, for example `$prompt-design`.

## Model targeting

If you ask Codex to “write a prompt” or “write instructions for a skill” and the destination is unspecified, `prompt-design` designs for **GPT-6.2 Astra**. A model established by the request, conversation, or existing deployment takes precedence. A migration uses the requested destination. Shared instructions must work for all their intended models.

GPT-6.2 Sol uses the same family guide, with observations specific to Astra identified separately. Choose GPT-6 Astra when maintaining instructions for that earlier model. This choice determines which design guidance the author uses. The host controls which model actually runs. [GPT-6.2 family notes](skills/prompt-design/references/openai-gpt-6.2-prompt-design.md) · [GPT-6 Astra notes](skills/prompt-design/references/openai-gpt-6-astra-prompt-design.md)

`agent-workflow-design` has no default worker model. It preserves assigned models and starts from configured or inherited settings. When choosing a model is part of the task and the runtime allows it, it weighs the subtask’s difficulty, required capabilities, latency, and cost. Both Astra and Sol can be considered where available. [Worker assignment guidance](skills/agent-workflow-design/references/loop-patterns-and-control.md#parallel-work-and-resource-control)

## How Gemini design works

Name the Gemini product if it affects the result. An Apps Skill needs importable files, while an API integration may also depend on tool definitions, model settings, or how it carries state between calls. For a plain text prompt, the shared method usually suffices. For an Apps Skill that writes image prompts, the skill combines the Apps and image guidance.

The general-purpose references cover **Gemini 4 Carbon, Neon, Argon, and Hydrogen**. For a new API image prompt with no established model, the image guide starts with Nano Banana 2.1. For video, the guide starts with Omni 1.2 Flash and covers Cloud Veo when explicitly selected. The deliverable is the prompt or skill files. Importing a skill, activating it, or generating media requires access to the destination product. [Image prompts](skills/gemini-instruction-design/references/image-prompts.md) · [Video prompts](skills/gemini-instruction-design/references/video-prompts.md)

## Installation and updates

Install `agent-design-tools` through a host that supports Agent Plugins v1 to get all three skills and their references. The package requires no MCP server or separate service configuration. For a source managed with ai-dotfiles, follow the [development guide](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/agent-development.md).

For a standalone installation, place each complete skill directory under the host’s skill root. Gemini design requires `prompt-design`. Add `agent-workflow-design` when designing delegation, waiting, retries, or recovery. Install companions as siblings or make them discoverable through the host’s skill catalog. Keep one active installation per skill name and use its manager to apply updates.

**Upgrading from `prompt-gemini-reference`?** From version 0.4.0, use `gemini-instruction-design` for that work. Update invocations that use the old name and replace the old installation through its manager.

## Design sources

For ordinary work, each skill selects its bundled references. For a migration, a request for current guidance, or a consequential question about a product capability, verify the guidance for the intended model and product.

- OpenAI’s prompting guides inform the model-specific advice on writing, preserving requirements, and completing delegated work. [GPT-6.2 prompting guide](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6.2-astra#prompting-best-practices) · [Prompting in Codex](https://learn.chatgpt.com/guides/prompting-gpt-6-2-astra) · [Rethinking skills and prompts for GPT-6 Astra](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)
- Google’s developer guides inform the Gemini references on model selection, migration, and API settings. Each bundled reference lists the sources for its product or medium. [Carbon](https://aistudio.google.com/learn/gemini-4-carbon-developer-guide) · [Neon](https://aistudio.google.com/docs/whats-new-gemini-4-neon) · [Argon](https://aistudio.google.com/learn/gemini-4-argon-developer-guide) · [Hydrogen](https://aistudio.google.com/docs/whats-new-gemini-4-hydrogen)
- The [workflow improvement reference](skills/agent-workflow-design/references/agent-improvement-and-rsi.md) draws on published examples of evaluation, human review, and changes informed by execution evidence. [OpenAI research acceleration](https://openai.com/index/research-acceleration-view-inside-openai/) · [Agent Improvement Loop](https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop) · [Iterating Development Workflows with Codex](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex) · [Warp’s use of feedback](https://claude.com/blog/how-warp-builds-self-improving-agents-on-claude) · [Anthropic’s harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps)

## Design and evaluation records

The repository keeps the following maintenance records in Japanese. They identify what was checked against documentation, tried with a model, or exercised in a downstream task.

- **Prompt and workflow design.** The 2026-11-21 review covers GPT-6.2 prompting, Responses API context and compaction, and worker assignment. The earlier GPT-6 Astra prompting review dates to 2026-09-12. [GPT-6.2 review and trial scope](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/prompt-design/gpt-6.2-design-review.md) · [Prompt-design review index](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/prompt-design/README.md)
- **Gemini.** The 2026-11-21 Neon documentation review builds on the 2026-11-15 source review and records which product capabilities still need live verification. [Neon review](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/prompt-design/gemini-4-neon-review.md) · [Gemini 4 redesign and source review](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/prompt-design/history/gemini-4-rewrite.md)
- **Skill responsibilities and workflow results.** [How the design skills work together](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/prompt-design/skill-creator-prompt-design-agent-workflow-design.md) · [Workflow-design evaluations](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/agent-workflow-design/README.md)
