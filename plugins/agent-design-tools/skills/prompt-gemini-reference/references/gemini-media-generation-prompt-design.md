# Gemini image and video prompt design

Use for the instruction-design part of Gemini image/video generation and editing tasks. Read [Gemini prompt design](gemini-prompt-design.md) as the foundation. If execution is also requested, continue with the target surface's generation workflow within the existing authorization. Writing a prompt alone does not require generating a sample.

Official guidance checked: 2026-09-06. Match the actual surface and supported generation mode. Gemini native image generation, Imagen, Omni, and Veo do not share all capabilities. Check relevant input roles, repeated-edit support, audio, duration, format, and output controls before promising them. Prefer current native Gemini image guidance for Gemini Apps; use Imagen's visual vocabulary as supplementary advice, not proof of current Gemini API availability.

## Establish intent and input roles

Distinguish a new image using references from an edit that must preserve an existing image. For each attachment, identify whether it is the base to edit, a subject or product reference, a style reference, a composition/pose reference, or an element to insert. For video, also distinguish a first frame, last frame, reference clip, and clip to edit or extend.

Inspect supplied media when available before describing its contents. If only writing a prompt without access to the assets, use the user's descriptions or explicit placeholders and identify any consequential uncertainty.

Name what should transfer from each reference. For example, a composition reference need not transfer its lettering, subject identity, or color scheme. Give recurring characters or objects distinct, stable names across a sequence. A filename or media tag is not a substitute for supplying the actual asset through the target surface.

## Make the brief specific without changing the idea

Describe purpose, subject, setting, style, composition, lighting, action, and exact text only to the extent they matter. For detailed requests, clarify and organize the supplied requirements. For open-ended requests, add compatible creative detail within the requested freedom. Keep fixed names, copy, identities, and scene requirements intact; do not introduce extras that change the user's concept.

Use camera, material, texture, and spatial language to resolve a visible decision. Reserve space for captions or UI when needed; preserve a specified layout, or choose a suitable placement when composition is part of the requested design. Resolve competing directions before adding more adjectives. Optional labelled lines can help a complex brief; no fixed template is required.

For diagrams and infographics, provide the intended relationships, labels, and data. If the image depends on current facts, use available grounding or supplied sources and define how the verified facts map into the visual. Keep invented illustration separate from evidence. An attractive rendering does not establish factual accuracy or correct quantitative proportions.

## Images: generation, text, and editing

For a new image, establish the subject, context, and style, then add the relationships and details needed for the composition. Use reference images to anchor identity or product form when supported.

For text inside an image:

- Supply exact wording, language, capitalization, and line breaks when significant. Identify placement, hierarchy, and typography as needed.
- If requested copy is still being developed, draft it as part of the design before final rendering. Preserve supplied final copy.
- For localization, distinguish the prompt language from the image's target language. Specify which wording and regional details change and which design elements remain; supply exact target-language text when wording matters.
- Keep text concise when possible without dropping required content. Do not import an old Imagen character-count recommendation as a Gemini limit.

For an edit, describe the change and only the preservation conditions that matter, such as identity, product geometry, crop, or lettering. Leave attributes affected by the request free to change: a relighting or restyling request must be able to alter lighting or texture. For an inserted element that should blend into the base, match lighting, shadows, perspective, and scale. Use "keep everything else" when that is the intended scope.

During iteration, identify the image version being edited and carry forward the still-relevant preservation rules. Make a focused correction, or group changes that must work together. If edits drift, return to the last acceptable image or original references instead of expanding an increasingly contradictory prompt.

For variants or a visual sequence, distinguish separate images from a single sheet and specify what stays consistent between them. Treat the requested count as an output requirement to check, not a guaranteed property of the surface.

Express an exclusion as a desired scene state when that helps, while retaining explicit absence requirements. An Imagen or Veo negative-prompt field is not a universal Gemini control, and OpenAI image-tool controls do not configure Gemini. Treat real alpha transparency, exact pixels, and file format as output requirements: use supported controls or an appropriate processing step when execution is in scope. A checkerboard appearance or "4K" in prose does not satisfy those requirements.

## Video: choose the temporal task

Describe the subject's action and progression, then add camera motion, shot order, timing, lighting, and audio only where needed. Distinguish camera movement from subject movement. Fit the requested events to the available duration rather than compressing an entire narrative into an unreadable clip.

| Task | Prompt emphasis |
| --- | --- |
| New clip | Subject, action, setting, shot structure, and sound |
| Image to video | What animates and what stays stable in the supplied first frame |
| First and last frames | Which image serves each role and how action reaches the final state |
| Edit a clip | Focused change, its temporal scope when relevant, and what persists |
| Extend a clip | Continuation at the end, motion and audio across the join, and any intended new shot |

Omni can introduce multiple shots by default. For an unbroken take, explicitly require continuity and no cuts; for multiple shots, describe their order. Keep edit requests focused: fully redescribing an existing clip can introduce unwanted changes.

When using Omni extension, timing starts at the new segment, and transition frames at the original clip's end may change. Do not promise an untouched original clip from that generation step. Check extension support for uploaded versus previously generated clips, especially when adding dialogue. Use only media-role tags supported by the chosen surface, bound to the actual inputs.

## Audio, dialogue, and review

Separate speech, music, effects, and ambience. Identify speakers and exact words where required; distinguish a caption from spoken dialogue. State silence, no dialogue, or no added music when those are requirements. Audio generation, audio reference input, and editing an existing voice are separate capabilities.

Review at the stage the task reaches. For prompt text alone, check intent, input roles, compatible constraints, and supported capabilities. When generated output is available, inspect the artifact against the requested result: relevant identity and preservation conditions, lettering and numbers, composition, factual content, image count, and file properties. For video, include relevant motion, cuts, continuity, timing, and audio. Correct observed defects and stop when the requested result and relevant checks are satisfied. Distinguish prompt review from verified output quality.

## Official sources

- [Gemini Apps image generation and editing](https://support.google.com/gemini/answer/14286560)
- [Native Gemini image prompt guide](https://ai.google.dev/gemini-api/docs/image-generation#prompting-guide-and-strategies)
- [DeepMind Gemini Image / Nano Banana prompt guide](https://deepmind.google/models/gemini-image/prompt-guide/)
- [Google Cloud Nano Banana prompting guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana)
- [Gemini Omni prompt guide](https://ai.google.dev/gemini-api/docs/omni#gemini-omni-flash-prompt-guide)
- [Veo prompt guide](https://ai.google.dev/gemini-api/docs/veo#veo-prompt-guide)
- [Imagen prompt vocabulary](https://ai.google.dev/gemini-api/docs/imagen#imagen-prompt-guide)
- [Imagen editing on Vertex AI](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/image/edit-images-overview)
- [Model deprecations](https://ai.google.dev/gemini-api/docs/deprecations)
