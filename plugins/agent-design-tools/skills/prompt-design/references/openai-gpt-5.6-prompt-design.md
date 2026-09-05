# OpenAI GPT-5.6 prompt-design notes

Use when the artifact targets GPT-5.6 and model behavior or configuration affects instruction design. The common method and design rules remain in `SKILL.md`. A model-agnostic wording correction does not need this reference.

Official guidance checked: 2026-09-06. Recheck current model or product facts when they affect the requested decision; reuse sufficient official evidence already retrieved in the conversation.

## Target and instruction tuning

Keep the artifact's established GPT-5.6 target, including a named Sol, Terra, or Luna variant. The model writing the instructions does not determine the model that will follow them. Load Astra guidance only when Astra is itself part of the requested design or comparison.

The [GPT-5.6 guide](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.6#prompting-best-practices) favors lean instructions and notes more concise default output than GPT-5.5. Use these tendencies to investigate a concrete mismatch:

- **Needed explanation disappears:** Replace indiscriminate brevity instructions with the context, evidence, or limitations the reader needs. Preserve an intentional short-output contract.
- **Accumulated scaffolding adds little:** Compare removing one coherent group of reminders or examples from a working baseline. Keep domain requirements and examples that resolve a real boundary; brevity alone is not a quality measure.
- **Authorized work stalls:** Inspect the governing scope and approval rule before adding another encouragement to act. Apply the common skill's authorization boundary; repeated confirmation requirements can recreate the same pause.

For instruction files, choose detail from the decisions the target must make. These model tendencies do not justify a universal template, an automatic rewrite of working instructions, or removal of required procedures. Evaluate the resulting behavior when the change warrants it.

## Configuration and tool workflows

For API work, verify the exact target against the [model guide](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.6) and its model page, such as [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol). As checked above, GPT-5.6 supports `none`, `low`, `medium`, `high`, `xhigh`, and `max` effort, with `medium` the default. Pro mode and effort are separate controls; requesting Pro in prose does not configure it.

For an actual GPT-5.4/5.5-to-5.6 migration, preserve the existing effort as the baseline, then compare one supported level lower when applicable. Keep `none` as a valid baseline. This is a migration experiment, not a required effort sweep for prompt edits. Product settings must be checked on the product's own surface.

Use [tools and runtime boundaries](openai-tools-and-runtime.md) when the task concerns integration. Confirm support for the selected model before prescribing a feature or combination; its Astra-specific migration and configuration-update instructions do not apply to GPT-5.6. Keep API mechanics in the implementation and tool contracts, and task requirements in their governing instructions.
