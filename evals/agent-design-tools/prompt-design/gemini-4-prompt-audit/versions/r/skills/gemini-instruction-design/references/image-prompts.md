# Nano Banana image prompts

Use for new-image and image-editing instructions. Inspect supplied images when available before describing them; otherwise use the user's descriptions or explicit asset placeholders. An attachment used as a visual reference does not by itself require the input-analysis reference.

## Select the operation and reference roles

Distinguish a new composition using references from an edit of a base image. Identify each input as the base, subject/product reference, style reference, composition/pose reference, or element to insert. Say which properties transfer: a layout reference need not transfer its text, identity, or colors.

Describe purpose, subject, setting, composition, lighting, materials, and style only where they affect the intended result. Organize detailed briefs; use compatible creative detail for open briefs. Preserve fixed names, identities, copy, and scene requirements. Do not force every prompt into a fixed template.

Use stable names for recurring characters or objects. Distinguish separate image variants from a contact sheet. For diagrams or factual illustrations, supply the relationships, labels, and grounded data; an attractive rendering does not establish correct facts or quantitative proportions.

## Choose a model only when needed

For an unspecified new API image workflow, Nano Banana 2.1 (`gemini-nano-banana-2.1`) is the current general recommendation for efficient generation and conversational editing. Preserve an explicitly selected model or surface unless changing it is requested.

Nano Banana 2 (`gemini-3.1-flash-image`) remains relevant to an existing target, while new projects are directed to 2.1. Nano Banana 2 Lite (`gemini-3.1-flash-lite-image`) prioritizes throughput and is not optimized for multiple references or sequential editing. Nano Banana Pro (`gemini-3-pro-image`) is the premium option for complex visual tasks. These image IDs are not grounds for restoring Gemini 3 general-purpose guidance.

The API model list does not prove availability in Apps or an agent's image tool. Establish the surface's actual options before promising a model selection, reference capacity, or generation control.

## Text, edits, and iteration

For lettering, supply exact wording and language; specify capitalization, line breaks, location, hierarchy, and typography when significant. Distinguish final copy from copy the user wants developed. Localization changes the specified language and regional details while preserving the requested design; the language of the prompt need not match the lettering language.

For edits, state the change and the preservation conditions that matter. Leave requested changes possible: relighting must be able to alter shadows, and restyling must be able to alter texture. An inserted element should match perspective, scale, lighting, and contact shadows when blending is intended. Use “keep everything else” only when that reflects the actual scope.

For example, “Replace the package label with the supplied Japanese copy; preserve package geometry and camera angle; adjust lettering layout to fit” permits the needed text-layout change. Requiring every pixel to remain identical would contradict the edit.

Track which version is being edited and carry forward relevant constraints. If repeated edits drift, return to an acceptable version or original references rather than accumulating contradictory corrections. Group related edits when they must work together.

Treat exact pixels, aspect ratio, alpha transparency, format, and count as output requirements to implement with supported controls or an authorized processing step. Writing “4K” or drawing a checkerboard is not proof of file properties. Do not invent a universal negative-prompt field or copy another provider's image controls.

## Deliver and review

Return the prompt and attachment-role mapping, with setup requirements separate. For prompt-only work, check intent, compatible constraints, and consequential capability assumptions. When generation is also authorized and accessible, inspect the actual result for identity, geometry, lettering, composition, factual content, count, and requested file properties. Distinguish reviewed wording from verified image quality.

## Sources and refresh conditions

Model selection checked 2026-11-15. Recheck for a model change, reference limits, repeated editing, output controls, or target-surface availability.

- [Nano Banana generation and editing](https://aistudio.google.com/docs/image-generation): current model choices and native prompting.
- [DeepMind image prompt guide](https://deepmind.google/models/gemini-image/prompt-guide/): visual relationships, identity, typography, and iterative briefs; supplementary design vocabulary, not proof of API availability.
- [Apps image generation and editing](https://support.google.com/gemini/answer/14286560): verify Apps-specific capabilities when that is the target.
