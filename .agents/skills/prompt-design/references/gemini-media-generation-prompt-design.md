# Gemini image and video prompt design

Use this reference to design or review prompts that generate or edit images or videos through Gemini or a Gem. It covers the prompt text, not API code, request parameters, model selection, current feature availability, or the act of generating the media. Read `gemini-prompt-design.md` as the general foundation.

Named models, supported inputs and outputs, duration, resolution, aspect ratio, audio support, limits, and preview behavior can change. Verify current official Google documentation when any of them affects the deliverable rather than hard-coding them into a reusable prompt.

## Build a media brief

Describe the intended artifact rather than supplying a loose bag of keywords. Include only the dimensions that matter:

- purpose, audience, and where the result will be used;
- primary subject and its defining attributes;
- action, pose, expression, or change over time;
- setting, background, time, weather, and atmosphere;
- visual style, medium, genre, or reference aesthetic;
- composition, framing, camera position, camera movement, lens, focus, and lighting;
- color palette, texture, pacing, or emotional tone;
- exact text, dialogue, sound effects, or ambient audio when required;
- elements to preserve, change, exclude, or leave unspecified.

Resolve contradictions between these directions. A concise, coherent brief is preferable to a long prompt whose style, camera, and composition requirements compete.

## Image generation

For a new image, prioritize subject, context or background, and style. Add composition, camera and lens language, lighting, color, and surface detail when they affect the result. Describe relationships and positions explicitly when the image contains several subjects.

For text inside an image:

- provide the exact text in quotation marks;
- keep it short when possible;
- identify its location, hierarchy, typography, and relationship to the design;
- inspect spelling and layout, then iterate rather than assuming one pass will be exact.

When using reference images, assign each a role such as subject identity, product form, pose, composition, palette, or style. Do not say only “use these references” when the intended transfer is ambiguous.

## Image editing

State what should change and what should remain unchanged. Describe how the edit must integrate with the existing lighting, shadows, perspective, scale, texture, and style. A useful pattern is: “Change X to Y; keep everything else the same.” Use it only when broad preservation is actually intended.

Prefer iterative edits when identity, composition, text layout, or fine visual consistency matters. Review the output after each meaningful change instead of stacking many dependent changes into one opaque instruction.

Express exclusions as the desired positive state when possible—for example, “an empty, uncluttered background” rather than a long list of prohibited objects. Use explicit negative constraints when the absence itself is a hard requirement.

## Video generation

Describe the subject, action, setting, style, and progression over time. Add only the production directions needed for the shot:

- framing and camera position;
- camera movement and subject movement;
- shot structure, cuts, transitions, or an explicitly continuous unbroken take;
- pacing, timing, and important beats;
- lighting, lens, focus, color, and atmosphere;
- dialogue, narration, music, sound effects, and ambient sound.

If timing matters, connect events to an order or time range. If continuity matters, state which identity, wardrobe, object, location, lighting, or camera relationship must persist across the clip.

For image-to-video work, say what in the source image should remain stable and what should animate. Avoid describing a new still image when the important instruction is motion. For first-and-last-frame or extension workflows, describe the transition and continuity between the supplied visual states.

When editing video, use a focused change request and an explicit preservation rule. If the intended result is a single scene without cuts, say that directly; if multiple shots are wanted, describe their order and transitions.

## Audio and dialogue

Separate spoken words, narration, sound effects, music, and ambient sound when more than one is present. Identify the speaker and use exact dialogue where wording matters. Keep audio directions consistent with the scene, timing, and visible action.

## Iterate by observable defects

Evaluate the generated artifact itself. For images, inspect subject fidelity, composition, hands and small details, text, lighting, perspective, and unwanted elements. For video, also inspect temporal continuity, motion, cuts, pacing, lip synchronization, dialogue, and audio balance.

Revise the prompt against a specific defect—such as subject drift, an unintended cut, illegible text, or inconsistent lighting—rather than repeatedly adding generic quality adjectives. Preserve successful parts explicitly when a revision could disturb them.

## Official sources

- [Imagen prompt guide — Gemini API](https://ai.google.dev/gemini-api/docs/imagen#imagen-prompt-guide)
- [Native image generation prompt guide — Gemini API](https://ai.google.dev/gemini-api/docs/image-generation#prompt-guide)
- [Gemini Omni Flash — Gemini API](https://ai.google.dev/gemini-api/docs/omni)
- [Veo prompt guide — Gemini API](https://ai.google.dev/gemini-api/docs/veo#veo-prompt-guide)
