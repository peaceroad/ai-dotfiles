# Multimodal input instructions

Use when the deliverable instructs Gemini to extract, compare, summarize, or interpret supplied images, PDFs, audio, or video. Input understanding is separate from media generation: accepting an image or video does not imply producing one. Add API guidance only when the integration or model controls affect the design.

## Define the evidence and the answer

Name the question and relevant evidence rather than requiring exhaustive description of every attachment. For extraction, define fields and how to represent unreadable, absent, and not-applicable values. For interpretation, separate observations from inference. Require source labels, page locations, or timestamps when the result must be traceable.

For audio/video, identify whether the question depends on speech, other sounds, visible action, on-screen text, or their relationship. A transcript cannot prove a visual event; a still image cannot establish motion or speech. If only excerpts or sampled frames are supplied, limit completeness claims accordingly.

## Preserve input relationships

Assign stable labels to multiple sources and connect questions to the intended inputs. Keep related text and media together when their interleaving matters. Distinguish governing instructions from source evidence; choose input order for the task rather than imposing one universal layout.

A local path or label does not supply the asset to Gemini. Establish how the selected surface receives it. For comparisons, identify whether images show different objects, stages of one process, or alternative versions; otherwise an apparent change may be misattributed.

For example, a scanned invoice extraction instruction can request the amount and page location, with an unreadable marker for an obscured digit. It should not infer a plausible digit merely to complete a numeric schema. For video-to-storyboard work, mark observed events separately from the new creative transitions requested for generation.

## Diagnose perception and coverage

When outputs miss source evidence, inspect whether the source was available and legible before adding elaborate reasoning instructions. Ask for relevant observations before a conclusion when that helps isolate a perception failure; do not require a complete narration or hidden reasoning trace.

A clearer crop, page, or excerpt may help if available, but preserve its relationship to the original. Resolution, sampling, clipping, and frame-inspection tools belong to the target runtime. Verify supported controls when they determine coverage; prompt wording cannot create missing frames or improve the actual input resolution. Do not compensate for missing evidence by lowering sampling temperature.

Check whether the final instruction preserves uncertainty, source boundaries, and the user's intended degree of interpretation. Actual extraction accuracy requires testing against supplied media; reviewing the prompt alone cannot establish it.

## Sources and refresh conditions

Use these official entry points when input support or coverage controls affect the task. Recheck the selected Gemini 4 model and surface rather than adopting mixed-generation workarounds from generic examples.

- [Image understanding](https://aistudio.google.com/docs/image-understanding)
- [Video understanding](https://aistudio.google.com/docs/video-understanding)
- [Audio understanding](https://aistudio.google.com/docs/audio)
- [Document understanding](https://aistudio.google.com/docs/document-processing)

The input/output distinction was checked against the [Hydrogen model specification](https://aistudio.google.com/docs/models/gemini-4-hydrogen) on 2026-11-15. Exact file limits and sampling settings are intentionally not frozen here.
