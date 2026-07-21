# Loop patterns and control

Use this reference to decide whether a workflow needs a loop and to define its trigger, control flow, stopping behavior, retries, replanning, and parallel work.

## Contents

- When to use a loop
- Deterministic workflow or model-directed agent
- Trigger patterns
- Loop contract
- Stop and convergence
- Retry, replan, and escalation
- Parallel work
- Common failure modes

## When to use a loop

A loop is justified when a pass can produce a changed artifact, new measurement, tool result, reviewer finding, external-state update, or other evidence that should affect the next pass. Typical examples include repairing an artifact from validation feedback, monitoring an external system, responding to incoming work, or improving a workflow from repeated failure patterns.

Keep the task linear when one action followed by one feasible validation is enough. Do not create a loop for a one-shot answer, a deterministic transformation, an ordinary local edit, or a task whose next pass has no new signal.

## Deterministic workflow or model-directed agent

Choose who controls the next transition:

- Use deterministic workflow control when steps, branches, retries, and completion checks can be specified reliably in code or configuration.
- Use model-directed control when the required subtasks or next action depend on semantic interpretation, cannot be predicted in advance, and benefit from flexible tool use or replanning.
- Use a hybrid when code owns triggers, budgets, permissions, persistence, and state transitions while the model owns bounded judgments inside a state.

Do not equate a multi-step workflow with an autonomous agent. Add model-directed control only when representative tasks show that a fixed path is insufficient and the expected gain justifies the additional cost, failure surface, and review burden.

## Trigger patterns

Choose the simplest trigger pattern that fits the work.

### Turn-based

A user request starts the work. The agent gathers context, acts, checks the result, and returns when it is complete or needs material input. Use this for irregular or bounded tasks.

### Goal-based

A request starts the work and an evaluator checks explicit completion criteria. The workflow returns to work until the criteria pass or another stop condition is reached. Use this when completion can be observed reliably.

### Time-based

A schedule or interval starts each run. Use this when the task recurs or observes an external system. Match the interval to the rate of meaningful change and avoid polling without a reason.

### Event-driven or proactive

An external event starts a run without a user present in real time. Each run needs a bounded goal, safe permissions, durable state, and a clear escalation path. The recurring routine and each task instance have separate stop conditions.

These patterns may be composed, but every added trigger must have a distinct role. Do not add a scheduler, evaluator loop, or multi-agent branch merely because the platform supports it.

## Loop contract

Select only the fields that affect the workflow:

- **Trigger:** What starts a run or iteration?
- **Goal:** What user-visible outcome should exist?
- **Scope:** What may change, and what is protected?
- **State:** What must survive the next iteration or interruption?
- **Action:** What may the agent or worker do?
- **Observation:** What artifact, result, or external state is read after action?
- **Evidence:** What supports the next decision?
- **Evaluator:** Who or what judges the evidence?
- **Delta:** What remains unresolved?
- **Retry/Replan:** When should the workflow repeat the action or change its approach?
- **Budget:** Which configured attempts, time, tokens, cost, or concurrency limits apply?
- **Stop:** Which conditions end the loop?
- **Escalation:** Which conditions require human or protected-system judgment?
- **Recovery:** How can an interrupted run resume safely?
- **Audit:** What record explains progress and decisions?

The contract may be prose, a state diagram, a table, pseudocode, or a schema. Use the smallest representation that makes transitions and ownership clear.

## Stop and convergence

A bounded workflow normally stops for one or more of these reasons:

1. Acceptance criteria pass.
2. A configured attempt, time, token, cost, or other budget is exhausted.
3. The unresolved delta stops changing or the same failure repeats without new evidence.
4. A required dependency, permission, or source remains unavailable after meaningful fallback attempts.
5. The next decision needs human judgment, approval, or domain knowledge.
6. Continuing would exceed the authorized scope or risk boundary.

Success is not the only legitimate stop. A focused handoff with evidence and a stable remaining delta is better than an unbounded attempt to appear complete.

Track convergence through the remaining delta, not the number of edits or the agent's confidence. A loop that changes many files while the same validation failure remains is not converging.

## Retry, replan, and escalation

- **Retry** when the approach is still valid and the failure is transient or input-specific.
- **Replan** when evidence invalidates an assumption, the same approach stalls, or the task needs a different decomposition.
- **Escalate** when resolution requires a protected decision, new authority, missing domain judgment, or material scope expansion.

Do not convert every failure into another retry. Record the reason for retry or replan so the next pass does not repeat completed work or the same unsupported assumption.

## Parallel work

Parallelize only workstreams that are sufficiently independent and whose results can be compared or synthesized. Define:

- The isolated scope of each worker.
- Shared resources that must remain read-only or serialized.
- Where outputs and status are stored.
- How failed or stale branches are cancelled.
- Who synthesizes results and resolves conflicts.
- Whether the gain is expected in quality, coverage, or wall-clock time.

Keep dependent decisions sequential. More agents increase orchestration, review, and token costs; parallelism is not a quality guarantee.

## Common failure modes

- Stopping because the model says it is done without artifact-level evidence.
- Repeating the same prompt without carrying the unresolved delta.
- Rebuilding state from the full transcript on every pass.
- Retrying deterministic failures instead of replanning or stopping.
- Inventing fixed limits unrelated to the runtime or risk.
- Running time-based checks more frequently than the external state changes.
- Repeating completed side effects after interruption.
- Expanding scope to improve a metric rather than the requested outcome.
- Using parallel agents where each result changes the next decision.
- Leaving the final synthesis or validation unspecified.

## Sources

- [Loop engineering: Getting started with loops - Claude by Anthropic](https://claude.com/blog/getting-started-with-loops)
- [Building effective agents - Anthropic](https://www.anthropic.com/engineering/building-effective-agents)
- [Build iterative repair loops with Codex - OpenAI Cookbook](https://developers.openai.com/cookbook/examples/codex/build_iterative_repair_loops_with_codex)
- [Model guidance: Using GPT-5.6 - OpenAI Developers](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.6)
