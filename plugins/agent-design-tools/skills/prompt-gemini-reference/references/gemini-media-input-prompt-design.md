# Gemini media input prompt design

Use when designing instructions to extract, compare, summarize, or interpret supplied images, video, audio, or documents. Read [Gemini prompt design](gemini-prompt-design.md) first. This is input understanding, not image/video generation or editing.

## Specify the evidence to use

Define the relevant question and output, rather than asking for an exhaustive description of every attachment. For extraction, name the fields and how to represent unreadable or missing information. For interpretation, distinguish observed content from inference. Require image labels, page references, or timestamps when the result needs to be traced back to the input.

For video or audio, identify the relevant interval and whether the task needs visible action, on-screen text, speech, other sounds, or their relationship. A still frame cannot establish motion or speech, and a transcript cannot establish visual events. If only excerpts or sampled frames are available, limit completeness claims accordingly.

## Arrange inputs for the task

- Give multiple inputs stable labels and connect each question to the intended source. Keep text and media together when their interleaving carries meaning.
- For a single image, placing it before the question is a useful candidate to test, not a mandatory order. For long documents or clips, keep governing instructions distinct and place the specific question after the reference context.
- Refer to the relevant region, page, or interval when needed. A textual label or local filename does not supply a file to Gemini; the target surface must actually receive it.

## Diagnose perception before adding prompt machinery

When an answer misses the evidence or is too generic, ask for the relevant visible or audible observations before the conclusion, or explicitly anchor the answer to the supplied media. Use this to distinguish a reading failure from a reasoning or formatting failure. Request useful observations, not a hidden reasoning trace; a complete media description is not needed on every request.

If the source is unreadable or the relevant moment is absent, say what is missing rather than inventing details. A clearer crop or excerpt may help when available, but preserve its relation to the original. In API workflows, input resolution and video sampling can affect available evidence; prompt wording alone does not change those settings. Verify supported controls only when they affect the task, using the model-specific rules in the foundation rather than generic temperature advice.

## Official sources

Relevant guidance checked: 2026-09-11. Apply the foundation's model-specific source rules when using these mixed-generation guides.

- [File prompting strategies](https://ai.google.dev/gemini-api/docs/files#prompt-guide), for input arrangement and troubleshooting; use only guidance applicable to Gemini 3 and later
- [Image understanding](https://ai.google.dev/gemini-api/docs/image-understanding), for the selected model's supported visual tasks and input controls
- [Video understanding](https://ai.google.dev/gemini-api/docs/video-understanding), for temporal evidence, input coverage, and sampling
