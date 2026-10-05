# Improvement and self-application

Read this when improvement, rather than evaluation alone, is requested. Use the comparison contract in [experiments](experiments.md).

## Search from a goal or evidence

Measure the current version, including behavior that must be preserved. Diagnose the relevant gap: instructions, selection or reference loading, task data, tools, grader, or runtime. Avoid adding an instruction already present when the failure came from another layer.

Form a concrete hypothesis and create a candidate in the authorized scope. Reorganization, removing instructions, changing a reference, or retaining the current version can all be reasonable. An observed bug supports a focused fix; a capability goal can support a broader redesign. Do not intentionally weaken the initial method to make self-improvement easy to demonstrate.

Compare under fixed conditions and inspect where the hypothesis succeeded or failed. Choose the next parent and experiment from the evidence. A rejected candidate can remain an exploration parent when there is a new hypothesis and remaining budget; it does not become the deployed champion. Keep every attempt and explain retries.

Continue for the requested search scope, stopping at the goal, budget, lack of a useful hypothesis, or an execution problem. A single successful candidate does not necessarily exhaust an authorized search. Conversely, do not keep editing until a noisy score increases. If evaluation variance hides the proposed effect, improve the experiment before generating more candidates.

Confirm the selected version on the reserved evidence, if available. Do not repeatedly use that evidence to select among candidates. Apply only an accepted change, check intervening edits, and identify the actually active version in the next fresh execution. Preserve the prior accepted bundle for recovery.

## Self-application

Start a separately scoped self-improvement run when requested or when an already authorized trigger and budget apply. Useful triggers include a concrete hypothesis, a recurring cross-task problem, one consequential false judgment, or a model/runtime change. The volume or age of notes alone is not a reason to run.

Select related records and read the underlying evidence and versions. If evidence is missing or stale, reproduce a small case before treating the cause as established. Include useful successes and counterexamples. Current broken evaluation must be repaired now; deferring shared self-improvement is not permission to rely on an invalid comparison.

Use the current method H0 to generate a candidate H1 of its own permitted instructions, references, or supported helpers. Keep H0 fixed while it generates and tests H1. To compare the methods, give H0 and H1 the same starting target skills, task goals, accessible exploration evidence, and budgets. Evaluate the target improvements they produce with an outer criterion outside either candidate's control.

Before spending the comparison budget, check that the tasks can distinguish the proposed effect. If the current metric gives H0 full marks, consider a more informative metric, relevant new tasks, or an explicitly supported cost comparison. Repetition can reveal variability but cannot measure quality dimensions the grader omits. Do not weaken H0 to create a gain. A run ending with only invalid proposals is incomplete evidence, not a successful no-change judgment.

Separate the improvement-task split from each task's own target-case split. Replaying familiar tasks can confirm mechanics and regressions, but does not establish transfer. A source rewrite is not successful activation: the selected method must run a subsequent task in a fresh context with its version identified.

If H1 is not demonstrably better, retain H0 and keep the informative evidence. If H1 is accepted, it can generate the next candidate. No new meta-agent product is required. Later, compare self-updating runs with runs that keep H0 fixed, giving both equivalent evidence and total budgets. To attribute better successor creation to H1, hold the successor's starting version fixed while comparing H0 and H1 as generators.

Track both the investment in creating the new method and its per-use cost. Do not claim the investment pays off without an appropriate usage horizon. One improved target, a better improver on new tasks, and better successor generation are distinct findings.

## What remains mutable

Diagnosis, case selection, candidate proposals, reference routing, curated knowledge, and trial allocation can be improvement targets within scope and the chosen harness's capabilities. In the bundled method comparison, only declared method text changes; case generation, grader settings and trial allocation remain fixed. The controller's enforcement and the current acceptance evidence stay outside candidate control. Improving a helper does not authorize executing it with access to the controller or protected records.

When a model changes, establish a new baseline. Consider removing obsolete scaffolding as well as adding new guidance. Compare old and new methods on the same model before attributing a difference to the method. Preserve useful domain constraints and task requirements across model updates.
