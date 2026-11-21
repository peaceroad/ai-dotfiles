# GPT-6.2 prompt design

Use these notes for GPT-6.2 Astra and GPT-6.2 Sol. OpenAI gives examples for both models and attributes the writing and completion tendencies below specifically to Astra. For Sol, use representative Sol output to decide whether either adjustment helps.

## Writing and completion

GPT-6.2 Astra tends to write more concisely and directly than earlier models. On migration, revisit inherited brevity instructions if the answer loses evidence, qualifications, or context the reader needs. For delegated or sustained work, judge the final deliverable on its own: a reader should understand it without seeing progress messages or knowing the workers' shorthand. When editing supplied text, preserve the author's claims, degree of certainty, and wording outside the requested changes.

When intent is unclear, Astra may offer a next step and wait. If the user delegated execution, specify the observable outcome, decisions the agent can make on reversible assumptions, and decisions reserved to the user. If a clarification tool allows work to continue, identify what can proceed independently. For a review-only request, the findings themselves can be the completed deliverable.

## Coding and visual work

Give the agent project conventions it cannot infer and behavior that existing callers rely on. Define how it can check the affected outcome. Add a regression test when it protects behavior the existing suite misses or the project requires it. Repository-wide instructions should capture recurring constraints; keep a particular change's acceptance criteria with the task.

For a visual target, provide a reference or specify the imagery, typography, and interface copy that matter to the user. Have the agent inspect the rendered result against that target where the runtime supports it.

## Codex and migration

For independent work that would benefit from delegation, make the permission and expected integrated result clear when the host supports it. Choose reasoning effort through the host's supported control when the investigation or final checks warrant it. The Codex and API surfaces have their own settings and tool contracts.

For a migration review, distinguish requirements you can check in the text from behavior that needs a destination-model trial. When testing is available and in scope, run the existing instructions and the revision on that target with comparable effort, tools, and inputs. For a shared prompt, include each materially different target in the checks that support a cross-model claim.

## Official sources

- [GPT-6.2 prompting best practices](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6.2-astra#prompting-best-practices)
- [Prompting GPT-6.2 in Codex](https://learn.chatgpt.com/guides/prompting-gpt-6-2-astra)
- [GPT-6.2 Astra](https://developers.openai.com/api/docs/models/gpt-6.2-astra) and [GPT-6.2 Sol](https://developers.openai.com/api/docs/models/gpt-6.2-sol)
