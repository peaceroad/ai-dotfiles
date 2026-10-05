# Choose evidence for the decision

Read this when choosing an evaluation method, when apparent gains may be grading noise, or when quality and cost trade off. The comparison contract is in [experiments](experiments.md); bundled configuration is in [runtime](runtime.md). These principles apply with an existing project harness as well as the bundled text runner.

## Start with the observable claim

Separate the behavior to improve, requirements that must remain true, and the evidence that could change the adoption decision. Choose the smallest adequate test of that claim. Evaluation design does not require a model judge or a search loop.

The improvement target is the agent skill or plugin, whatever subject it serves. Identify its task contract, assumptions, authoritative domain references and available verification methods. Reuse appropriate domain expertise; do not make this skill a catalog of every discipline or assume fluent explanations establish correctness. When the requested claim has no adequate available verifier, identify the observable part and retain the unresolved part explicitly.

For a plugin containing multiple skills, references or tools, freeze the relevant cooperating components and assess the requested integrated behavior as well as affected components. Selection, handoffs and shared dependencies can matter even when each component passes alone. Choose the execution route that can observe those interactions; explicit text injection does not establish plugin discovery or tool integration.

The following are illustrations of choosing evidence, not a list of supported domains or required evaluation modes:

- **Programming:** For working code, use the project's tests, executable checks, relevant invariants and resulting files. Include a defect-triggering input and preservation cases. A passing explanation, plausible patch or claimed test result is not execution evidence. Runtime or memory claims need measured workloads and comparable environments.
- **Rules and instructions:** Exercise ordinary, boundary, exception and conflicting-condition cases against the governing requirement. Use exact or structured checks when the decision is determined. A stricter rule can be worse if it rejects legitimate cases. The acceptance requirement stays outside the candidate rule.
- **Design:** Identify the kind of design and its promised outcome. Architecture may need a runnable scenario; interaction design may need observable task completion, accessibility checks and rendered states; a visual design judgment needs the actual visual artifact. Text comparisons can evaluate a design rationale, but not prove those downstream outcomes. Keep preferences separate from mandatory constraints.
- **Writing and other open-ended artifacts:** Check facts and required content independently of clarity, usefulness or comparative preference. The same distinction applies to plans, explanations and code reviews. Do not use a single preferred wording as the only correct answer.
- **Workflows and improvement methods:** Observe the relevant state transitions or the downstream improvement task. Scoring the workflow description is sufficient only when the requested deliverable is that description.

Cases should cover the intended use and plausible regressions, not only recently observed failures. Label related variants as one group. A baseline at the score ceiling may need a more informative metric, a relevant new task or a cost comparison; making the baseline worse or adding arbitrary difficulty does not create useful evidence.

When deriving cases from traces or feedback, separate observed facts from proposed causes and verify the expected behavior against the task contract. Preserve the outcome requirement rather than an incidental sequence of commands; allow valid alternative paths unless the process itself is required. Regrading a stored output tests the grader on that output. A claim about a changed skill or plugin requires evidence from its execution.

## Choose the execution route

Use the bundled runner for explicit text responses within its supported checks and judgments. Reuse an existing project harness for actual code execution, rendered artifacts, stateful tools, continuous scores, latency or other requirements it already measures. Do not force these into a binary text rubric merely to use the bundled script.

For a project harness, verify one small run before a search. Record the frozen skill and candidate versions, case/group identities, initial state, command or entry point, runtime settings, grader version, artifact locations, terminal outcome and measured cost. Start each paired execution from comparable state and use the same cases and acceptance rule. Verify that the skill being compared actually reaches the worker. Keep infrastructure errors distinct from task failures, retain rejected attempts, and include generation and grading in the total allowance. The harness may own its native records; link them instead of converting them into invented bundled-runner receipts.

Use the same adoption and preservation contract on these records. The bundled `apply` command consumes only its own accepted records; an external comparison uses an authorized, conflict-checked source edit with its own evidence and predecessor reference. If the necessary execution is unavailable, finish the evaluation design and state the unmeasured claim. Do not label a simulation as a successful live evaluation.

## Separate adequacy from preference

Executable checks usually need no model grading. A binary semantic rubric is useful for a specific required property. Add comparative judgment only when both responses can meet the requirements yet differ on the requested quality. State what makes one more useful for this task; do not use generic polish, length or agreement with the judge as the objective.

For comparative judgments, conceal version identity, keep the task and rubric fixed, and check both response orders. Preserve ties, both-unsuitable and uncertain outcomes. A disagreement after swapping order is unresolved evidence, not half a win. Calibrate with independently justified preference, valid-alternative tie and unsuitable examples, including relevant attacks or attractive but wrong artifacts. Inspect the concrete reasons as well as the verdicts. Calibration labels generated by the same unverified judge are not independent validation.

Same-model target and judge calls can share blind spots. A different judge can provide another observation when available, but does not replace independent requirements, executable checks or expert labels. The bundled adapters currently use one runtime configuration for all roles. Use a suitable external harness for role-specific model settings; do not claim they were varied through an unsupported setting.

## Locate uncertainty before adding calls

Repeated target executions, repeated judgments on the same artifact, and repeated generation of an intermediate instruction measure different variation. Match repetitions to the uncertainty that could change the decision. When testing a generated instruction or plan, fix that artifact while measuring its downstream behavior; independently regenerate it only when testing the producer's variability.

Inspect a small calibrated pilot for grader disagreement and relevant outcome variation. Then freeze the comparison and an adequate budget. Re-score fixed outputs when investigating the grader instead of regenerating the target unnecessarily. Preserve the earlier scores and label the new grader version. The bundled `judgeRepeats` option rejudges the same output within one contract; it is not a general cross-run rescoring command.

For inference, analyze paired differences at the independent case/group level. Repeating one case or placing items in one judge batch does not produce new independent tasks. Do not use a small noisy mean, overlapping marginal intervals, or an unadjusted best-of-many result to establish improvement. A fixed candidate comparison and adaptive search have different selection risks. Use fresh confirmation for the latter, and keep claims exploratory when the runtime cannot protect unused material.

The bundled optional `sign-test` policy is a narrow gate on group preference directions, with a declared minimum observed effect and a multiple-look allowance. It is not a confidence interval for effect size, a correction for arbitrary adaptive reuse, or evidence that one method is universally superior. Small samples can correctly remain inconclusive. Use `review` for a compact exploratory comparison and preserve candidate evidence for a separately recorded review; it never automatically accepts a preferred candidate. Changing policy after seeing results starts a new contract, not a retry of the old one.

## Spend effort where it can change the decision

Use only the accounting needed for the requested decision. Ordinary quality comparisons can run under inherited settings with work-count and elapsed-time limits, leaving tokens or money unknown. Optional effort control and detailed usage are not prerequisites. Report a reduction in requests as such; do not relabel it as token or monetary savings. If cost reduction is the adoption claim, obtain evidence for that specific metric or leave that claim unresolved. Do not add billing integration or inspect unrelated private logs merely to fill missing fields.

Estimate target, generator and judge calls before dispatch. Deterministic checks require no judge calls. In the bundled runner, comparative calibration costs two calls per labeled pair and each compared output pair costs two further calls. Repeated grading multiplies only semantic grading; target repetitions multiply target work too. A larger allowance is not a reason to spend it.

Stop an invalid grader before target search. Skip optional preference grading when a candidate already fails required conditions. Do not add a permanent coordinator, critic, judge panel or self-improvement phase to every task. Use a further independent observation when its expected effect on the decision justifies the cost; do not keep sampling until a favorable result appears.

For a cost-saving proposal, define the cost being reduced, a quality noninferiority tolerance and critical preservation conditions before running it. Hold the required outcome, scope and available human assistance comparable. Include failed attempts, retries, verification, coordination and evidence curation in the relevant budget; fewer calls or action steps need not mean lower total cost. Report completion quality alongside cost, and distinguish total experiment cost from subsequent per-task cost. Unknown tokens, missing parent overhead or unmeasured latency cannot be treated as zero. If estimating money from usage, use the provider's accounting categories and dated rates; an API price estimate does not establish subscription charges or quota consumption.

Model, effort, coordination and escalation policies can be comparison targets within the authorized scope and the harness's supported controls. Freeze each policy before comparison. The same effort label across models does not establish equal compute, and more effort cannot substitute for missing requirements or a suitable verifier. Test whether coordination helps this task; independent evaluation trials are not a team collaborating on one answer. Tied grades alone do not establish equal quality. Use an appropriate paired analysis and fresh workloads when necessary. The bundled runner records cost but does not automatically adopt a candidate solely for cost savings.

## Keep the claim traceable

Before reporting readiness, connect each important claim to an observable artifact and its test: contract enforcement, grader validity, skill quality, cost, and transfer are separate claims. A unit test of the controller proves its decision mechanics on supplied responses. A live trial tests that particular model and task. A self-application test proves a path only to the extent exercised. Do not use success at one level to fill missing evidence at another.
