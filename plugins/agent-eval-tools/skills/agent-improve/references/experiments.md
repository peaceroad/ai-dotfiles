# Comparisons and evidence

Read this for evaluation design, execution, and comparison. For improvement search, also use [improvement](improvement.md). Runtime commands and actual adapter limits belong to [runtime](runtime.md).

## Measure the right outcome

Choose the evidence for the claim:

- Skill selection requires a natural request in a catalog containing relevant neighbors. Supplying a skill explicitly or injecting its text does not measure discovery.
- Task quality requires the resulting artifact or state, not a plausible description of the procedure.
- A skill that generates instructions needs downstream execution of those instructions when effectiveness is the question.
- Mid-run steering, waiting, interruption, and uncertain external effects need actual runtime events. A written simulation establishes only a design or simulated decision.

Reuse an existing task runner or trusted grader when it already meets the need. Read [measurement](measurement.md) when choosing that route, comparative grading, repetitions or quality/cost criteria. It derives evidence from the target's purpose and domain requirements, including cooperating plugin components, without prescribing one grading method for every target. Do not build a general framework before a small comparison works.

## Freeze what makes the comparison meaningful

Identify the target's full relevant bundle, editable files, generator method and support versions, cases and group splits, graders, acceptance rules, and known runtime settings. Record inherited or requested settings; include role-specific settings only when the harness actually supports and uses them. Record hashes of the delivered content and the evidence of actual loading. A requested model name does not establish an immutable backend model version.

Start each target trial in a fresh context. For text-only host trials, supply frozen text inline or through a hash-checked input packet. The packet read transports input; it is not permission to inspect other files or use tools for the task. A shared working directory remains an isolation limit. For adapters that execute task files, use a fresh working directory as well. Pair the same cases across versions; alternate their order. Keep repeated trials of one case distinct from independent cases. Record inherited configuration and isolation limits. Sibling directories and different processes do not protect secrets from agents with shared read permissions.

Keep target-facing requests close to their intended use. Keep comparison identities, expected answers and evaluator-only criteria out of task inputs, delivery messages and incidental workspace names. Preserve legitimate task requirements and skill content, including evaluation terminology when that is the task; do not sanitize the behavior being tested. Judge skill use from observable reads and resulting artifacts, not a request for the target to certify its own compliance. Record unavoidable evaluation cues or inherited context as limits on ordinary-use claims. Neutral wording alone does not establish natural discovery or protected isolation.

Use exploration cases for diagnosis, selection cases for choosing a candidate, and unused confirmation cases when sufficient independent material exists. Keep related variants in the same group. With little data, report an exploratory comparison rather than claiming held-out generalization. Once confirmation feedback informs a change, that material has become exploration evidence.

A change to the acceptance rules, protected evaluation, total budget, or authorized scope starts a new contract. Remeasure relevant versions under that contract. A permitted change to a working grader also requires rescoring comparable outputs and recording its new version.

## Calibrate grading

Prefer executable requirements and artifact checks for mechanically decidable properties. Check known valid outputs, valid alternatives, plausible wrong outputs, empty or no-op results, and attempts to influence the judge where relevant. If the grader cannot distinguish the relevant defect, repair it before searching for candidates.

For semantic judgments, state task-specific criteria and ground decisions in output evidence. Blind version labels and vary answer order. Compare repeated judgments when variance matters. A second model is not an independent correctness oracle. Preserve known labels or external requirements for auditing the working grader.

Do not reward additional failures found, stricter grading, or shorter instructions in isolation. An improved grader must reduce wrong decisions; useful generated cases must reveal meaningful defects without rejecting valid alternatives. Keep the evidence used to accept a grader outside the candidate's editable scope.

## Account for outcomes and costs

Report planned, attempted, completed, and graded trials, with reasons for omissions. Separate task failure, runtime failure, grading failure, unsupported capabilities, and interruption. Keep failed or rejected attempts; never replace them silently with a successful retry.

Budget for candidate generation, target runs, judges, retries, and evidence curation using observable work counts and elapsed time, adding measured usage when available. These bound the work; they do not establish a monetary or compute-cost limit. Nested improvement tasks share the outer allowance. Enforce the limits the runtime supports; post-run token usage is not a strict in-flight token cap. An unconfirmed child-process stop is not a clean budget stop.

Compare quality and preservation constraints first, then useful cost changes. Set tolerances before inspecting outcomes. Critical regressions cannot be canceled by an unrelated score gain. Keep the current version when the relevant difference is unresolved.

## Retain enough to reason later

The record should connect contract, target and improver versions, candidate parent, trial identity, result, grade evidence, measured usage, and application state. Preserve the data necessary for comparison and safe resumption; do not routinely retain private internal reasoning or entire session streams.

Choose storage by what the evidence helps maintain, under that project's or workflow's rules. Keep useful, publishable evaluation assets and reviewed behavioral evidence with the maintained source when its repository allows them. Using this plugin does not make its source repository the owner of every evaluation. Raw runtime records, selective maintenance notes and disposable work follow their respective storage contracts; local execution alone does not make behavioral evidence private. The runner's output and retention constraints are in [runtime](runtime.md#retained-evidence-and-temporary-work).

When existing logs remain accessible, reference the session URL, message or turn, and run ID. Preserve missing or volatile material only within authorized storage. If a reference disappears, mark the evidence unavailable; do not turn its summary into a verified cause. Inspectability and reproducibility are different properties.

An optional observation can say what disagreed with expectations, where the evidence is, what remains uncertain, and which comparison would resolve it. Omit empty observations. Such notes are not instructions and do not trigger self-improvement by themselves. Curate useful knowledge, then evaluate and version the configuration that uses it.

Before using a retained observation in a later experiment, open its cited evidence and verify the claimed version and result. For runner records, also check the run ID, contract hash, and referenced trial or decision. Missing or mismatched evidence is unavailable, not a verified cause. A compact maintenance note may outlive temporary run files, but its existence does not restore those files or establish reproducibility. Respect the owning store's distinction between short judgments and runtime artifacts.

Retain candidate lineage separately from deployment choice. Resolving a maintenance note does not authorize deleting experiment evidence. Record changes to conclusions, including later invalidation by a grader defect.
