---
name: prompt-gemini-reference
description: "Use with prompt-design to design, review, or adapt Gemini instructions, including text prompts, Gems, and image/video generation or editing prompts. Not for general Gemini questions or generating media."
---

# Gemini Prompt Reference

Supplement `prompt-design` with guidance for the established Gemini target. Keep the shared design method and reporting rules in that skill; use this one for Gemini-specific decisions.

## Start with the shared design method

Read [prompt-design](../prompt-design/SKILL.md) first unless it is already loaded for this task. If installed separately, use the available `prompt-design` skill; if neither path is available, report the missing companion rather than silently installing it or claiming to have followed it. The companion is included in the same plugin and is also needed for standalone use.

Preserve Gemini as the design target when applying the shared method. Do not load Astra guidance just because Codex or an OpenAI model is doing the design. Read another model's guidance only when an explicit comparison, migration, or identified design question needs it; do not treat its behavior or controls as Gemini facts.

## Read only the relevant references

- **All Gemini instruction design:** Read [Gemini prompt design](references/gemini-prompt-design.md).
- **Gem Instructions or Knowledge:** Also read [Gem design](references/gemini-gems-prompt-design.md).
- **Image/video generation or editing prompts:** Also read [media prompt design](references/gemini-media-generation-prompt-design.md). Text-only work does not need it. A Gem that designs media prompts may need both supplements.

Use official Google sources for model or product facts. External links document provenance, not an unconditional reading list. Verify current guidance when a migration, an explicit current-information request, or a model capability, product behavior, parameter, or limit affects the design. Reuse sufficient current evidence. A wording-only change does not require a new lookup. Do not put API settings into Gemini Apps or Gem prompts as if they configured those products.

## Keep design and execution distinct

For instruction text alone, deliver and review the prompt without generating samples, saving a Gem, or changing product settings. If execution is also requested, use the available workflow for the requested Gemini surface within the existing authorization. This skill provides no connector or generation tool; report missing access without substituting another provider. Distinguish a reviewed prompt from a saved Gem or verified generated output.
