---
name: prompt-gemini-reference
description: "Use with prompt-design to design, review, or adapt Gemini instructions, including text prompts, Gems, and image/video generation or editing prompts. Not for general Gemini questions or generating media."
---

# Gemini Prompt Reference

Use `prompt-design` for the shared method and reporting rules, and the relevant guidance here to produce the requested Gemini prompt or review.

The maintained baseline is Gemini 3 and later, including native image models in that family, not earlier generations. When no exact model is established, use that prompting baseline without inventing a model ID or changing the deployment. Omni, Veo, and Imagen have separate model lineages and controls.

## Start with the shared design method

Read [prompt-design](../prompt-design/SKILL.md) first unless it is already loaded for this task. If installed separately, use the available `prompt-design` skill; if neither path is available, report the missing companion rather than silently installing it or claiming to have followed it. The companion is included in the same plugin and is also needed for standalone use.

Preserve Gemini as the design target when applying the shared method. Do not load Astra guidance just because Codex or an OpenAI model is doing the design. Read another model's guidance only when an explicit comparison, migration, or identified design question needs it; do not treat its behavior or controls as Gemini facts.

## Read only the relevant references

- **All Gemini instruction design:** Read [Gemini prompt design](references/gemini-prompt-design.md).
- **Gem Instructions or Knowledge:** Also read [Gem design](references/gemini-gems-prompt-design.md).
- **Prompts for understanding supplied images, video, audio, or documents:** Also read [media input design](references/gemini-media-input-prompt-design.md). This covers extracting, comparing, and interpreting evidence, not generating media.
- **Image/video generation or editing prompts:** Also read [media generation design](references/gemini-media-generation-prompt-design.md). Merely attaching a generation reference does not require the input-analysis supplement; use both when the task also needs substantial analysis. A Gem that designs media prompts may also need Gem design.

## Use bundled guidance; verify consequential gaps

Ordinary text prompts, Gem instructions, and media briefs can be completed with the shared method and bundled references when those cover the design decisions. Do not turn a design request into a documentation survey or return source links in place of the requested prompt.

Use official Google sources for an explicit current-guidance request, a model migration, or a consequential model/product fact that the available evidence does not establish reliably. Check the relevant fact, not every linked page; reuse sufficient current evidence. This includes uncertain or changed input modes, controls, limits, and product behavior. Routine wording, composition, and preservation decisions do not need a lookup merely because the target is Gemini.

If a necessary fact cannot be verified, finish the independent design work and identify the specific dependency without promising unsupported behavior. Clarify the model or surface only when that unresolved choice changes the result. Keep API settings and setup notes separate from prompt text; writing them into a Gem does not configure the product.

## Keep design and execution distinct

For instruction text alone, deliver and review the prompt without generating samples, saving a Gem, or changing product settings. If execution is also requested, use the available workflow for the requested Gemini surface within the existing authorization. This skill provides no connector or generation tool; report missing access without substituting another provider. Distinguish a reviewed prompt from a saved Gem or verified generated output.
