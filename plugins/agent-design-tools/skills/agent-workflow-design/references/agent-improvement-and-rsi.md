# Agent and harness improvement

Use this reference to improve reusable agent machinery from execution evidence.

## Identify what is being improved

- **Task repair:** Change the current artifact to satisfy the user's request.
- **Harness improvement:** Change instructions, references, tools, routing, state, evaluation, or runtime control reused across tasks.
- **AI self-improvement or RSI:** Improve AI research, model development, training, or a recursively changing improvement mechanism. Use this distinction only when the requested work reaches that domain.

Ordinary prompt maintenance is not evidence of reliable recursive improvement. For work involving AI-development capability, verify relevant guidance and keep protected evaluation, permissions, and activation under an appropriate independent authority.

## Diagnose from evidence

Start with authorized sessions, artifacts, corrections, failures, validation, and effective harness versions. Use existing evidence and references instead of collecting a new telemetry corpus by default. A focused temporary bundle may contain the request, necessary context, actual result, expected behavior, active instructions, and remaining uncertainty.

Locate the responsible layer before changing prose. Distinguish a faulty rule, missing context, inaccessible reference, ambiguous tool contract, runtime behavior, weak evaluation, domain policy, and a one-off execution miss. A repeated symptom is not proof of its cause.

When similar guidance already exists, check whether the relevant version was active and whether its trigger, loading path, specificity, and applicable check could actually govern the failed case. If that functional path was adequate, a duplicate rule is unlikely to help. If it was not, repair the route or contract rather than merely emphasizing the same words. Do not call a failure a one-off miss when the decisive part of this path remains unknown.

Classify a finding as a supported reusable change, behavior adequately covered already, an unresolved candidate, or a rejected proposal. One case can establish a clear correctness or contract defect; recurrence is not a prerequisite. Conversely, many similar complaints do not by themselves establish a general rule. For candidates that need later comparison, apply [Maintenance records](maintenance-records.md) only when persistence is useful and in scope.

## Develop and compare a candidate

State the intended behavior change and preserve a recoverable baseline. Choose the revision scale from the request and evidence: a local defect may need a small patch, while conflicting responsibilities or a user-requested redesign may justify broader restructuring. Preserve working requirements, not every historical implementation choice.

Change one coherent component group when attribution matters. On a model upgrade, reassess scaffolding that compensated for the previous model: forced decomposition, repeated reviews, context resets, routing, and approval wording. Keep or remove it according to its contribution and the requirements it serves.

Compare baseline and candidate under the same acceptance criteria, using affected failure cases, successful behavior to preserve, and fresh cases where feasible. For a workflow-generating skill, assess the generated design and how an executor follows it under relevant events or interruptions.

Keep model, effective effort, tools, permissions, relevant context, and budgets comparable when attributing an improvement to instructions. Record unavoidable differences. A previous-model run can help separate model and harness effects, but is not required when unavailable. Do not tune against protected held-out answers or rewrite historical manifests to describe a later revision.

Evaluate the outcome and material costs together: success, evidence, preserved requirements, unnecessary questions, waiting and recovery decisions, repeated effects, validation, human intervention, tokens, latency, or cost as relevant. Smaller output or more passing checks alone does not establish a better workflow. For reviewer independence, use the [evidence and evaluation criteria](state-evidence-and-recovery.md#evidence-and-evaluation).

Diagnose a failed candidate before another revision; avoid accumulating universal rules from individual examples.

## Protect acceptance and activation

Define editable surfaces and who accepts the result. Separate authorized local maintenance from any configured gate for activation.

Keep the following outside the candidate's authority to approve itself:

- The acceptance rule and evaluator used to decide that candidate's success.
- Protected held-out cases, source evidence, prior outputs, and evaluation records.
- Permissions, sandbox boundaries, and required approval or activation controls.
- Comparison settings whose alteration would invalidate attribution.

A task may legitimately improve an evaluator or a budget policy. In that case, use a separately authorized acceptance process for that change; the candidate cannot validate itself merely by weakening its own criterion. Preserve a rollback or recovery path where activation has lasting effects.

Accept, revise, reject, or leave the candidate unresolved under that contract. A metric gain does not justify violating the underlying task. Use additional checks or staged activation when the consequences warrant them.

## Retention and reporting

Keep reusable evaluation definitions under their project's review and versioning rules. Retain cases when their future detection value justifies maintenance. Choose manual, change-triggered, scheduled, release, or incident-time evaluation from feedback needs and cost; CI is an option, not a requirement.

Keep generated outputs and traces temporary unless comparison, audit, or recovery warrants retention in an authorized project or runtime location. Distinguish being able to inspect a past evaluation from being able to rerun it. When future reruns are in scope, preserve or reference the inputs and execution setup they require. Follow [state and persistence](state-evidence-and-recovery.md#persistence-decision).

Alongside the revision report, identify the diagnosed layer, adoption decision, and activation status. Preserve the evaluated version and limits of the comparison.

## Source notes

Reviewed 2026-09-06; apply the model and runtime distinctions in `SKILL.md`.

- [OpenAI Cookbook: Agent Improvement Loop with Traces, Evals, and Codex](https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop): connects execution evidence, evaluation, and a reviewed configuration change.
- [OpenAI Cookbook: Iterating Development Workflows with Codex](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex): artifact ownership, observed progress, and evidence-backed retrospective decisions.
- [Anthropic: How Warp builds self-improving agents](https://claude.com/blog/how-warp-builds-self-improving-agents-on-claude): specific user feedback leading to small, reviewable skill changes.
- [Anthropic: Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps): tests removal of model-compensating scaffolding and where an evaluator still adds value.
