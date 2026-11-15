---
name: gemini-instruction-design
description: "Design, review, or rewrite Gemini prompts, Apps Skills, CLI or Antigravity instructions, and Nano Banana or Omni media prompts. Use for instruction authoring, not general Gemini questions, ordinary task execution, or media generation itself."
---

# Gemini Instruction Design

Create or revise usable instructions for the established Gemini surface, or review them at the requested scope. General-purpose guidance targets **Gemini 4 Carbon, Argon, and Hydrogen**. Image/video families have separate versions; use the model identities in their references.

## Load the design method

Read [prompt-design](../prompt-design/SKILL.md) once for the shared method and applicable references. Preserve Gemini as the target; the authoring host being Codex does not call for OpenAI-specific guidance.

When designing execution control—delegation, waiting, retries, cancellation, or recovery—also read `agent-workflow-design/SKILL.md` and its relevant references. Resolve it from the sibling skill directory or the available skill catalog. Antigravity use or a completion condition alone does not require it. Users need only invoke this Gemini skill; select the companions yourself.

For standalone use, resolve a missing sibling from the installed skill catalog. If a required companion is unavailable, report that gap and complete independent work without claiming to have used it. These dependencies belong to the authoring process; do not copy them into generated Gemini instructions.

## Load task-specific knowledge

Infer the artifact and surface from context. Read the applicable references completely; combine routes for mixed work. Ordinary text prompts need no additional reference unless a surface-specific capability affects the result.

- **Apps Skills:** [apps-skills.md](references/apps-skills.md)—selection, instructions, resources, and importable artifacts.
- **Gemini CLI:** [cli-instructions.md](references/cli-instructions.md)—project context and on-demand skills.
- **Antigravity:** [antigravity-instructions.md](references/antigravity-instructions.md)—Rules, Skills, and existing runtime controls.
- **API instructions or migration:** [api-instructions.md](references/api-instructions.md)—system instructions, tools, schemas, settings, and state.
- **Media extraction or interpretation:** [multimodal-inputs.md](references/multimodal-inputs.md)—images, documents, audio, and video as evidence.
- **Image prompts:** [image-prompts.md](references/image-prompts.md)—creation, editing, and reference roles.
- **Video prompts:** [video-prompts.md](references/video-prompts.md)—creation, editing, interpolation, and extension.

An Apps Skill that writes image prompts needs Apps and image guidance. A generation reference image alone does not require input-analysis guidance. Capabilities of a model do not guarantee availability in the selected surface.

## Produce the artifact

Return the requested prompt or files, with necessary asset roles and setup notes separate. Make generated skill dependencies resolvable in their destination. Model settings, file paths, and tool names in prose do not configure a runtime or supply inputs.

Use bundled guidance for ordinary design. Verify official sources for migrations, explicit latest-guidance requests, or consequential uncertain capabilities, settings, and limits; reuse sufficient current evidence. Finish independent work when verification is unavailable and identify the unresolved condition.

This skill supplies no connector. Instruction authoring does not save a Skill, generate media, or change a deployment. When execution is also requested, use available tools for the selected surface without substituting another provider. Report prepared artifacts and observed execution results distinctly.
