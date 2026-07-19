# Skill description review notes

Use this reference when reviewing or improving the `description` field of a Codex skill or a similar skill/tool trigger description. Use `skill-creator` first for full skill creation or structural changes; use this note only for description wording, trigger boundaries, and overlap with nearby skills.

## Core rules

- Help the agent decide when to load the skill by stating what the skill does and the specific triggers or contexts where it should be used.
- Focus on user intent and deliverables, not internal implementation details.
- Use direct trigger phrasing such as "Use when..." rather than only describing what the skill contains.
- Include important negative triggers when the skill is easy to confuse with nearby skills.
- Keep detailed workflow, checklists, examples, and output policy in `SKILL.md` or reference files, not in the description.
- Remember that `description` is loaded with the skill `name` before the skill body is loaded, and it carries the main burden of triggering. Optimize it for fast, reliable model understanding: remove redundancy, keep the trigger boundary clear, and avoid wording that is only useful after the skill has already triggered.

## Review checklist

- Does it avoid relying on body text for critical trigger conditions?
- Is it specific enough to prevent false positives, but broad enough to trigger on realistic user wording, including cases where the user does not name the domain exactly?
- Are neighboring skills or fallback skills named only when that boundary matters?
- Does it avoid long lists of internal checklist items that do not affect triggering?
- Does it avoid broad topic words that would trigger the skill for ordinary articles, summaries, coding tasks, or general advice?
- If the skill has a primary target and secondary adaptations, is the primary target clear without excluding valid secondary cases?
- Is the description under the Agent Skills specification limit of 1024 characters, without treating that limit as a target?
- Is the description concise enough to avoid bloating always-loaded metadata, while still preventing wrong triggers? A few sentences or a short paragraph is usually enough.

## Naming and metadata

- Keep the skill `name` identical to the folder name.
- Use lowercase hyphen-case for the skill `name`; use spaces only in human-facing UI metadata such as `agents/openai.yaml` `display_name`.
- Treat `description` as model-facing trigger metadata, not as human-facing marketing copy.
- Keep `agents/openai.yaml` aligned with the skill after description changes, but do not copy the full trigger description into `short_description`.
- The Agent Skills specification requires `description` to be non-empty and at most 1024 characters. This is a hard ceiling, not a goal. Prefer a compact description, usually 1 to 3 sentences. For Japanese descriptions, aim to keep it around a few hundred characters when possible; a longer description is acceptable only when it materially improves triggering or prevents confusion with nearby skills.

## Good description shape

Prefer a compact structure:

1. Use when the user asks for the specific deliverable or task.
2. Name the important artifact types, tools, domains, or contexts.
3. Say what not to use it for when overlap is likely.
4. Mention required companion skills only when ordering matters.

Do not optimize only for shortest length. A slightly longer description is acceptable when it prevents wrong triggering or missed triggering.

For important skills, sanity-check the description with realistic should-trigger and should-not-trigger prompts. Include near misses, casual wording, typos, and prompts where the relevant task is embedded in a larger request. If a description is tuned against examples, keep some fresh examples aside to avoid overfitting.
