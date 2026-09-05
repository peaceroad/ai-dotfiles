# Loop patterns and control

Use this reference to choose a trigger and define progress, waiting, steering, stopping, and coordination. Adapt the control to the task and the runtime already available.

## Choose the smallest useful shape

A loop is useful when another action can obtain new evidence, change an artifact, repair a known failure, or respond to a meaningful external change. Complexity alone does not justify repetition. A linear transformation with an adequate check can stay linear; a monitor can spend most of its lifetime waiting.

| Trigger | Design question |
| --- | --- |
| User turn | What completes this request, and what input would materially change it? |
| Persistent goal | What evidence keeps the goal active or establishes completion, and what runtime owns continuation? |
| Schedule | What recurs, how often can meaningful change occur, and when does the routine end? |
| Event | What event starts which bounded task, and what prevents duplicates or obsolete work? |

Compose triggers only when each serves a distinct purpose. For schedules, specify timezone, overlap, and missed-run handling where they affect correctness and are not already settled by the scheduler. For events, verify delivery, ordering, replay, and burst behavior where they can repeat effects or invalidate decisions. A recurring routine and the individual jobs it starts have different lifetimes.

## Progress, waiting, and completion

Define what the next decision actually needs. Use partial results when their dependencies and versions permit useful work; wait for the whole set only for a comparison, synthesis, version lock, or other real dependency.

| Current evidence | Control decision |
| --- | --- |
| A useful authorized action is ready | Proceed and inspect its result before dependent work |
| Some work is pending and independent work is ready | Advance the independent work |
| Only a future time, answer, event, or pending result can advance the task | Use the supported wait, suspension, or continuation mechanism |
| An assumption is invalidated or an approach repeatedly fails without progress | Replan or report the remaining block |
| Acceptance evidence is sufficient | Finish the requested work |
| A configured limit, cancellation, denial, or unresolved authority boundary is reached | Stop or hand off under that contract, accounting for in-flight work |

These are semantic distinctions, not mandatory status names. Map them to the runtime's states. Dispatch, a worker's completion, and a response ending do not by themselves establish task completion.

An unchanged pending status is normally a reason to wait; infer a stall from relevant evidence such as a runtime timeout, a lost job, or a violated progress expectation. Use supported waits and events rather than tight polling, repeated analysis, or narration of unchanged status.

If monitoring is authorized, preserve the user's notification intent: notify on the changes or decisions they asked about, and keep non-actionable checks quiet unless periodic reports were requested. On wake, reconcile current state before acting. Stop the monitor when its purpose ends. Without a supported continuation mechanism, report that limit rather than promise future work.

## Steering and cancellation

Interpret new input as clarification, a constraint, a side question, a scope change, replacement, or cancellation. Answer side questions while preserving the active objective and useful completed work. Reassess earlier evidence and pending branches against changed requirements; an old result may no longer support the current decision.

Judge completion against the latest accepted scope. Retiring a no-longer-needed branch can complete a narrowed request; keep any uncancelled external operation's state separate from whether the current request is done.

Receipt of an update, application of that update, and cancellation of an operation are separate events. Updated instructions do not undo completed effects or prove that a tool stopped. Define handling of obsolete work using the actual [cancellation and recovery contract](state-evidence-and-recovery.md#uncertain-outcomes-and-recovery). For routine information gaps, use context and reasonable assumptions; pause dependent work when the missing answer matters.

## Retry, replan, and stop

Retry when the approach is still valid, another attempt can help, and the tool's replay contract makes it safe. Replan when evidence changes the assumptions or the same approach no longer reduces the remaining delta. Escalate when the next step requires missing authority, a protected verdict, or material knowledge that cannot be obtained within scope.

Track the remaining outcome, failed criterion, or unresolved decision. Preserve supplied limits and their strength, including approximate targets. Use existing runtime settings or an explicit progress condition unless choosing new settings is part of the request. In that case, propose justified, configurable values only for those settings and identify them as proposals.

A block should explain the evidence, what remains, and what would allow progress. Apply runtime-owned stop policies as given, including their conditions for marking a task blocked.

Stopping model work is separate from stopping scheduled jobs, tools, and child agents. At completion, cancellation, or a limit, account for outstanding work and release or retain resources according to their runtime contracts. Do not label an incomplete outcome successful merely because a budget ended.

## Parallel work and resource control

Use delegation only under the current policy. When allowed, choose bounded work that benefits from independent execution or context and leaves useful coordination or work for the owner. Simple independent tool calls may need no agent. Keep dependent decisions and conflicting writes ordered.

Give each worker the necessary input, artifact version, scope, result contract, and limits. Assign ownership of shared resources, integration, overall verification, and failed or stale branches. Worktree or context isolation can reduce conflicts; access enforcement belongs to the runtime's security controls.

For nested delegation, use the runtime's inheritance, depth, fan-out, lifecycle, and cancellation controls. Delegated authority remains within the parent's granted scope and the child's actual permissions. Collect results through supported completion signals.

Where limits must be enforced, identify the controlled quantity and enforcement point. Concurrent work may need atomic reservation of shared capacity or budget before dispatch, followed by settlement of actual usage. Include in-flight work and retries in the accounting. Distinguish a spending alert, a per-call limit, and a hard run-level budget; state costs or operations outside the guarantee.

Consider end-to-end completion time, synthesis, verification, queue growth, and human review when those downstream costs are material. Use backpressure, reduced concurrency, or prioritization when the next stage becomes the bottleneck. Small bounded work does not need a capacity analysis.

## Hooks and evaluators in a loop

Separate recall of a relevant rule, validation that it applies to the current evidence, and enforcement that changes control flow. A reliable hook trigger does not make a semantic verdict correct. Recurrence may justify review, but does not alone justify a stronger gate.

Place feedback near the action when it can improve the current result. Choose evaluator independence using the [evidence and evaluation criteria](state-evidence-and-recovery.md#evidence-and-evaluation), and bound repair or stop-hook re-entry with the runtime limits and progress rules.

If a check is unavailable, choose the response from its role. A quality aid may be omitted with a reported limitation; a required permission or consequential-action gate cannot be silently skipped.

## Source notes

Reviewed 2026-09-06; apply the model and runtime distinctions in `SKILL.md`.

- [OpenAI: Async tool calling](https://developers.openai.com/api/docs/guides/async-tool-calling) and [Mid-turn steering](https://developers.openai.com/api/docs/guides/steering): pending results, application-owned job execution, and the distinction between updated instructions and cancellation.
- [OpenAI: Codex as a platform](https://developers.openai.com/blog/codex-as-a-platform): reuse a harness and decide what the surrounding application owns.
- [OpenAI Cookbook: Per-run spending controller](https://developers.openai.com/cookbook/articles/per_run_spending_controller_responses_api): reservation and settlement, with explicit limits on the example's cost coverage and execution modes.
