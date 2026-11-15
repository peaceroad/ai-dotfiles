# Omni and selected Cloud video prompts

Use for video generation, editing, first/last-frame interpolation, or extension instructions. The baseline is Omni 1.2 Flash (`gemini-omni-1.2-flash`). Retain an explicitly selected surface or model; Cloud Veo uses a separate contract. Do not infer generation capabilities from video-understanding models.

## Specify the temporal task

Identify each supplied asset as a first frame, last frame, subject/style reference, reference clip, clip to edit, or clip to extend. Inspect available inputs before describing them; without access, use the user's description or explicit placeholders. Media-role labels must map to actual assets in the target surface.

- **New clip:** Describe subject, setting, action progression, shot structure, and needed sound.
- **Image to video:** Identify what animates and what remains stable in the starting image.
- **First and last frames:** Establish both roles and how the action reaches the final state.
- **Edit:** State the change and its temporal scope; preserve the relevant identity, action, and composition without fully redescribing an unchanged clip.
- **Extend:** Continue from the endpoint, with motion, camera, and sound across the join; specify a new shot only if intended.

Separate camera movement from subject movement. Fit the events to the duration. For an unbroken take, say that continuity and no cuts are required; otherwise describe meaningful shot order without prescribing unnecessary cinematography.

## Apply the selected mode's contract

The checked Omni 1.2 API supports new clips up to 15 seconds. First/last-frame interpolation and each extension use 3–10 seconds; extended clips can total up to 30 seconds. Do not apply the new-clip ceiling to every mode or assume an extension preserves every original frame. Its join can modify the source clip's final frames, and extension timing starts with the new segment.

When exact preservation is required, identify that conflict before promising a generation-only result. Verify supported uploaded/generated source combinations and dialogue behavior when those affect extension. Use only the selected surface's supported input bindings and parameters.

For Cloud Veo, inspect the specified Cloud model and operation rather than transferring Omni durations, tags, or audio behavior. The Gemini API lists Veo 3.1 preview retirement on 2026-10-22, while Cloud documents the GA `veo-3.1-generate-001`. Retirement on one API is not retirement everywhere. Verify lifecycle status when migrating or executing; do not silently switch providers or models.

## Sound and dialogue

Distinguish speech, music, effects, and ambience. Identify speakers and exact spoken words when required, and distinguish captions from dialogue. State silence or absence of music when it is a requirement.

Omni audio generation does not establish audio-reference support: the checked API rejects audio-file inputs/references and ignores audio from reference videos. Do not promise to clone or preserve a supplied soundtrack through that path. If exact source audio is essential, keep it as an explicit unresolved execution requirement or use an appropriate separately authorized workflow.

## Deliver and review

Provide the usable prompt, asset roles, and separate mode/settings notes. For example, an extension prompt describes the next action from the existing endpoint rather than asking for a fresh rendition of the entire original sequence.

For prompt-only work, check duration fit, temporal continuity, preservation requirements, and audio assumptions. When generated output is available, inspect motion, cuts, identity, timing, join frames, spoken words, and sound as applicable. A prompt review does not establish that the clip meets those requirements.

## Sources and refresh conditions

Checked 2026-11-15. Recheck for mode support, input binding, timing, audio, or lifecycle changes before relying on them in a migration or execution.

- [Omni guide](https://aistudio.google.com/docs/omni): current modes, durations, input/audio limits, and prompting.
- [Model deprecations](https://aistudio.google.com/docs/deprecations): Gemini API lifecycle; Omni 1.1 is scheduled to route to 1.2 on 2026-12-03.
- [Cloud Veo 3.1](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/veo/3-1-generate): separate Cloud model contract.
