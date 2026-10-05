# Running a bounded experiment

Read this before invoking [the runner](../scripts/agent-eval.mjs). It uses Node.js standard modules. Node.js 24 or newer is the repository baseline. Prefer the active host's subagent tools for in-session work; the Codex CLI adapter is optional for standalone or manual execution. Only that adapter needs an installed, authenticated Codex CLI. Installation, login, and publication are separate from an experiment.

## Choose the execution path

With `runtime.adapter: "host"`, the controller exports one reserved request, accepts the bound subagent response, and resumes the same comparison. The parent agent executes it with the host's existing tools. Read [host execution](host-execution.md) for delivery, ID binding, waits, interruptions, and response receipt. Use `model: "host-inherited"`; actual model version and unreported usage remain unknown. This path does not invoke `codex exec` or read CLI credentials.

With `runtime.adapter: "codex-cli"`, the script starts separate Codex processes. Omitting `adapter` retains the original CLI behavior for existing configurations. This path is useful when running an experiment directly from an authenticated terminal. Authentication available to the parent app need not be available to a separate child CLI, especially across OS-user or sandbox boundaries. A failure of that connection is an adapter limitation, not a reason that skills cannot be evaluated.

Both paths use the same snapshots, graders, search, acceptance decisions, and source application. Both are limited to explicit text bundles. Neither measures natural discovery, interactive tool workflows, protected held-out isolation, or generated executable helpers.

## CLI adapter boundary

The initial adapter supplies a frozen text bundle in the prompt and starts a fresh `codex exec --json --ephemeral` invocation for each model call. It requests a read-only sandbox with approval policy `never` and disables the supported tool-producing features. It does not use bypass flags or ignore execution-policy rules. User configuration is retained unless the experiment explicitly sets `ignoreUserConfig: true`; managed restrictions still apply. Host instructions and backend configuration are not fully observable.

This is a text behavior adapter. It can compare responses, generate replacements for declared `.md`, `.txt`, and `.json` files, and evaluate improvement methods through nested target-improvement tasks. It does not execute candidate code, exercise tool workflows, measure natural skill discovery, inject mid-turn events, or establish protected held-out evaluation. Tool activity observed in a target response is unsupported. A schema request is not proof that the returned content is valid; the runner checks required result types as well.

The adapter reports process/version identity, requested model, terminal events, final answer, usage when available, and isolation limits. Actual backend model version remains unknown. It discards reasoning items and full tool transcripts. A missing or failed turn is a runtime error, not a task failure. Parent and nested calls consume the same outer budget; per-task allowances can only reduce it.

Elapsed-time and call limits are checked before each call. A watchdog attempts to stop the process group on POSIX or the process tree with `taskkill` on Windows. If cleanup is unconfirmed, the record stops subsequent calls and requires inspection. These mechanics do not prove that an arbitrary child which escapes the process group has stopped. Generated executable helpers remain unsupported. Token limits use reported usage after completed calls; unknown usage prevents further calls when a token allowance is configured, and the in-flight call may exceed the allowance.

## Commands

Resolve the script from this skill directory; commands below assume that directory is the current working directory.

```text
node scripts/agent-eval.mjs capabilities
node scripts/agent-eval.mjs validate /path/to/experiment.json
node scripts/agent-eval.mjs run /path/to/experiment.json --out /private/experiments/example
node scripts/agent-eval.mjs status /private/experiments/example
```

Use an authorized local directory outside a Git working tree for `--out`. The runner rejects repository-contained output, even if ignored. Raw records can contain private source snapshots, prompts, runtime metadata and result references, so do not publish them by default. This output restriction does not classify every task response as confidential; reviewed publishable excerpts can be maintained separately under the destination project's rules. `validate` checks configuration and reads the declared source bundles; it makes no model calls. For ordinary cases it returns a `callPlan`: calibration, baseline, per-candidate generation and paired evaluation, possible confirmation, and a fresh full-search upper bound. `baselineAndStop` describes the baseline plus an immediate stopping proposal for improvement (baseline-only for comparison without candidates); it is not a guaranteed path. The plan does not predict elapsed time or tokens. It reports whether `maxCalls` covers the upper bound without rejecting deliberately smaller search budgets. Nested searches require separate inner/outer budgeting and currently return no total estimate.

`run` never edits source. Reusing the output directory resumes the same frozen contract and completed trials without repeating them. Changed source, settings, or controller code require a new output directory. Interrupted trials are preserved and block automatic repetition; inspect their state and use a new explicitly justified experiment for a retry. A remaining `run.lock` is not automatically removed: verify that its recorded process and children have stopped first.

For a bound host response, `run <configuration> --out <directory> --response <response.json>` receives the result and resumes in one invocation. It checks the unchanged contract before accepting the response. If delivery of the command result is uncertain, inspect the record and resume without `--response` when the receipt already exists; never overwrite a receipt to retry.

To apply an accepted candidate to an authorized source, or restore it after a regression:

```text
node scripts/agent-eval.mjs apply /private/experiments/example --root /path/to/source-skill
node scripts/agent-eval.mjs rollback /private/experiments/example --root /path/to/source-skill
```

The source must match the recorded predecessor. Intervening edits cause refusal before replacement. Unrelated files are preserved. Filesystem updates are not a cross-process transaction: if application is interrupted, inspect the recorded intent and source before retrying. These commands do not install, refresh a cache, or prove the active version changed. Start a new experiment with the selected method as its explicit bundle to verify a subsequent execution; use an existing manager only when installation is in scope.

Use `note <record-directory> --text <observation-with-evidence-reference>` only for meaningful findings. This appends an observation inside that run's record; it is not a durable maintenance-note store. Notes do not change active instructions or automatically start self-improvement. Keep a short later-use judgment and its evidence references in an authorized maintenance location when needed. Do not copy runtime records into a notes directory whose owner forbids generated results. If only temporary storage is available, report that persistence limit.

### Retained evidence and temporary work

Choose the evidence location before dispatch. Reuse a location owned by the project or workflow when it meets its privacy and retention rules and this runner's outside-worktree requirement. `--out` is explicit; there is no mandatory home-directory layout, global store or automatic history scan. Evaluation definitions and deliberately maintained synthetic fixtures can live with project source; generated private records follow the evidence contract above.

For a repository-maintained evaluation record, review the selected task inputs, responses and judgments for publication suitability and maintenance value. Record source versions and relevant limits, identify omissions or transformations, and keep the original evidence privately when needed. A retained-current or rejected-candidate example can be useful; do not select only successful changes or copy whole runtime records merely because the task itself is public. This is a separate editorial decision, not an automatic export or a change to `--out`.

Keep records needed for comparison, resumption or later maintenance in a retained location from the start. `record.json` contains the frozen bundles, requests, accepted responses and decisions. A response file is not disposable while it is the only copy of a result or its receipt is uncertain. After receipt, check that the matching request, execution ID and exact result text were saved before treating a redundant transfer file as temporary. Keep any additional artifacts needed to substantiate the result.

Use an identifiable owner/run directory for disposable work and record its location when it must be found later. Being generated does not make a file disposable. Do not automatically delete active work or the evidence behind a maintenance note; cleanup and closing a maintenance question are separate decisions. Do not create empty storage hierarchies merely to conform to a naming convention.

If completed evidence must be retained elsewhere, first establish that no writer or outstanding execution can change it. Copy the required records and cited artifacts without overwriting existing evidence, compare file hashes and run/contract identities, and read the retained result back. Update maintenance references only after verification; preserve failed and inconclusive attempts needed to interpret the conclusion. Keep historical paths intact and provide a reference mapping where necessary. A verified archival copy is not automatically a resumable relocation: stored host paths, source locations and controller versions may still refer to the original execution. Start new work as a new experiment when those conditions differ.

`status` checks the saved contract against its hash and can read a retained record without reloading the original source or executing trials. This detects a contract mismatch, not authenticity or arbitrary edits to trial results; use the copy manifest to check retained file bytes. A failed evidence write is not a completed receipt or permission to redispatch. Inspect the durable record and reconcile any outstanding work first; a recorded interruption blocks further automatic calls.

## Experiment configuration

Use JSON with these fields:

- `schema`: `1`.
- `mode`: `compare` (including baseline-only evaluation) or `improve`.
- `goal`: the requested improvement or comparison.
- `target`: `root` relative to the configuration file, and an explicit `files` array. Include relevant references and curated knowledge, not just the entry point. Symlinks and traversing file paths are refused.
- `method`: the same bundle shape, required for `improve`. This is the pinned improvement method, separate from the target even for self-application.
- `proposalMethodFiles`: optional nonempty selection of files from `method`, delivered to the candidate-generation role. Omit it to deliver the whole method. The complete method stays frozen; each proposal records the selected files and delivered-content hash. Choose by role, preserving every instruction needed to propose and assess a candidate. For this skill's text proposals, `SKILL.md`, `references/experiments.md`, and `references/improvement.md` provide that view; the parent reads `runtime.md` and `host-execution.md` for execution. In nested tasks, the inner experiment's selection applies to each compared method and must exist in the outer target bundle. The selection is fixed experiment configuration, not a candidate-controlled filter.
- `editable`: exact existing target file paths that proposals may replace.
- `candidates`: optional supplied bundles for `compare`. Such candidates are identified as externally generated.
- `runtime`: `adapter: "host"` with `model: "host-inherited"`, or `adapter: "codex-cli"` with an explicit model and optional `reasoningEffort`, native Codex `binary` absolute path, and `ignoreUserConfig`. The same configuration is used for generator, target, and judge; host mode does not accept CLI settings.
- `budget`: positive integer `maxCalls`, `maxMs`, `callTimeoutMs`, and optional post-call `maxTokens`. Include graders and candidate generation when sizing it. In host mode, `maxCalls` counts reserved worker requests, not all internal model turns. Omit `maxTokens` when measured usage is unavailable; the remaining work limits do not guarantee a token or monetary ceiling. Unknown usage stops further calls if `maxTokens` was configured.
- `maxCandidates`: positive bound on candidate proposals, default `1`; `repeats`: positive trials per case, default `1`.
- `judgeBatchSize`: optional positive maximum items per semantic judge call, default `1` (individual grading). Values above one opt into the shared batch protocol for both calibration and result grading. Set it on ordinary experiments, including each inner experiment; an outer `tasks` comparison cannot set it.
- `judgeRepeats`: optional positive number of judgments on each identical output, default `1`. Applies to semantic calibration and grading, not deterministic checks. Disagreement makes the result inconclusive. Currently cannot be combined with `judgeBatchSize > 1`; set it on inner experiments rather than the outer `tasks` comparison.
- `comparison`: optional comparative-quality configuration, described below. Omit it when absolute case results answer the question. It applies to ordinary experiments, including inner improvement tasks.
- `cases` or `tasks`: exactly one of the definitions below.
- `evidence`: optional scoped text with references for later diagnosis. Include necessary excerpts if this text-only adapter cannot retrieve the references.
- `requires`: optional capability names. A nonempty list is currently reported as unsupported before model calls.

Every case has a unique lowercase `id`, `group`, `split` (`explore`, `select`, or `confirm`), and `input`. Related groups cannot cross splits. Use `checks` for deterministic checks or a task-specific `rubric` for model judgment, never both. Every grader requires `calibration` samples containing `output` text and a known `pass` boolean, including at least one valid and one invalid output. Valid alternatives and adversarial outputs should be added when relevant.

Supported checks are `json-equals` with a JSON `pointer` and `value`, `includes` or `excludes` with a text `value`, and `max-chars` with a positive integer `value`. Exact-format checks are appropriate only when that format is a requirement. Use semantic grading when wording is not the outcome. Model judges return a boolean verdict and concrete evidence; their calibration calls count against the budget.

An empty JSON pointer selects the whole document; other pointers traverse object members or array indices, with `~0` and `~1` escapes. Missing values, scalar traversal and array properties such as `length` fail the check. `max-chars` counts Unicode code points, not bytes or user-perceived graphemes.

### Optional semantic judge batching

Use batching only for a bounded set that fits the judge context and whose cross-item effects have been checked. The default individual path is retained. With `judgeBatchSize > 1`, the same packet builder, instructions, verdict schema and validator serve calibration and actual grading. Deterministic calibration still runs in code. Semantic calibration outputs from all cases are assigned opaque IDs, sorted by those IDs and divided into fixed-size chunks. The judge sees each ID, task, rubric and output; it receives no expected labels, case names, candidate identities or experiment history. Each returned ID must occur exactly once with a boolean verdict and textual evidence; output order need not match input order.

Each development baseline, candidate pair, and confirmation pair has a separate grading phase. Targets still execute separately in alternating version order for pairs. Their completed semantic outputs are collected and graded in chunks after that phase's target calls; deterministic checks remain local. Calibration and actual grading use separate fresh contexts. A comparison batch may contain both versions, and a final chunk may be smaller than the configured maximum. Identical format does not guarantee equivalent judgment at different batch sizes or compositions: include valid alternatives, important errors, mixed verdicts and relevant cross-item instruction attacks in calibration, then compare with independently labeled examples and individual judgments before using a batch setting broadly. Individual judges are a reference, not ground truth.

Malformed, missing, duplicate or foreign verdicts invalidate every item in that packet. Failed or incomplete packets make the experiment inconclusive; wrong calibration labels make it evaluation-invalid. Neither permits adoption. Do not silently retry as individual judgments or reinterpret a partial packet as a pass. Completed calibration decisions retain the per-item case/sample mapping, expected label, verdict and trial reference. Actual result rows retain the judge trial and item ID. One batch is one model call, not several independent measurements. Resume reuses its unchanged packet and result; changing the size, cases, source or controller starts a new contract. Cross-experiment calibration caching and automatic cost-only adoption are not implemented.

Without `comparison`, the automatic adoption rule requires all paired development results to be graded, with no regression and a strict improvement on at least one selection result (or development result if there is no separate selection set). Missing exploration results make the comparison inconclusive even when selection succeeds. Exhausting the proposal allowance with only invalid responses is also inconclusive; it is not a valid no-change decision. Invalid attempts and their validation errors remain recorded and are returned to the next proposal attempt, which may recover within the original allowance. Ties retain the current version. Confirmation runs only for the selected candidate and can veto adoption. This rule is a local requirement comparison, not a statistical claim about quality on new tasks. Automatic cost-only adoption is not implemented.

Each target case receives a binary pass based on all its checks. Repeats remain separate rows. Candidate comparisons run both versions and alternate their order by case and repeat. Improvement also measures the starting version before proposing a candidate; these calls count against the budget. Resuming the same comparison reuses completed trials. No aggregate score can cancel a case regression. The report retains detailed per-case decisions and incomplete trials rather than silently excluding them.

A previously passing deterministic check becoming false or missing vetoes adoption even if both case totals are failures. Check order is frozen in the contract. Semantic rubrics still yield one binary requirement judgment; use independently measured requirements when a single rubric could conceal a regression. Confirmation also compares case results with the baseline: tied failures do not establish correctness or successful generalization.

### Optional comparative quality

Read [measurement](measurement.md) before choosing this path. A comparison requires a concrete `rubric`, explicit `policy` (`review` or `sign-test`), `minEffect` in `(0, 1]`, optional `alpha` in `(0, 1)` (default `0.05`), and `calibration`. Each calibration pair contains `input`, `a`, `b`, `winner` and a nonempty `labelSource` describing the independent origin of its expected judgment. Include a known preference (`A` or `B`), a valid `tie`, and `both_bad`. `uncertain` is also a supported judgment.

Both calibration and actual pairs use two calls with the same outputs in opposite orders. The judge sees task, rubric, A and B, without version identities. Verdicts must contain exactly `winner` and nonempty `evidence`. After reversing the second label, disagreement is unstable; malformed responses, uncertainty and incomplete pairs cannot establish a gain. Judgment reasons, presentation order and trial references remain recorded. Swapping order detects some bias, but agreement does not establish correctness or independence of judges.

Absolute checks or rubrics remain mandatory. Any candidate failure or new requirement regression vetoes adoption, and preference judging is skipped when an absolute candidate failure already settles the decision. A comparative loss on any observed development case/repetition also vetoes adoption, including exploration cases. Both-unsuitable judgments cannot become successful ties. Comparative gains can distinguish two versions whose required conditions both pass.

`review` preserves evidence without automatically accepting a preference winner. Positive differences end inconclusive for a separately recorded review; ties retain the current version. No approval or review overrides an invalid grader or a missing required result. The CLI `apply` command accepts only automatically accepted records; do not rewrite an inconclusive record to apply it.

`sign-test` first averages repetitions within each case, then cases within each declared related group, and weights groups equally. Its `effect` is the observed mean of those group preference differences (`B = 1`, `A = -1`, tie `= 0`), not percent better task quality. It reports an exact one-sided sign-test tail on positive/negative group directions, ignoring tied groups for that tail. Acceptance requires no observed regression, observed effect at least `minEffect`, and tail probability at most `alpha / plannedLooks`. Planned looks are the declared candidate attempts plus one if confirmation is present; unused attempts do not relax the threshold. The report preserves group effects and the threshold.

The test assumes independent groups and exchangeable directions under the null. It supplies no confidence interval for effect magnitude. Grouping and a multiple-look allowance do not repair arbitrary adaptive reuse or a biased judge. For `improve` or multiple supplied candidates with this policy, unused confirmation groups are required. Development evidence guides selection; the selected version must also meet the comparative threshold against the starting version on confirmation. Confirmation disagreement, inadequate quality or a tie prevents adoption. A single fixed supplied comparison may omit confirmation, with claims restricted to its declared comparison. The shared host still cannot establish protected held-out generalization.

Comparison calibration and both orderings count in `callPlan` and the same enforced budget as targets and proposals. Comparison judgments are not batched. Resume reuses identical completed judgments; it cannot change policy, examples or thresholds mid-contract. Only exploration preference reasons are sent to later proposals. Selection artifacts and confirmation judgments are not supplied as diagnostic examples. Final summaries expose the comparison evidence even when the starting version is retained.

## Comparing improvement methods

For `tasks`, each entry has `id`, `group`, `split`, and `experiment`, which is an ordinary `improve` configuration with target cases. The outer target bundle is used as the method in each inner experiment. Supply an outer `method` as well when asking H0 to generate H1. Only one nested level is supported; all calls use the same outer ledger and each inner allowance is capped by it. Nested runtime settings must match the outer settings; the adapter does not switch models inside a comparison.

For each task the outer result measures the increase in successful target cases from the same starting target. An inner task with `comparison` instead returns its accepted comparative effect, or zero for a complete no-change outcome. An inconclusive inner comparison stays incomplete rather than becoming zero. Do not mix these different measures as though they had the same units. This is not a score for the method's wording; it requires completed inner results and does not infer improvement from a truncated search. Candidate generation, rejected proposals, targets and judges all remain attributable to their roles and method versions.

After selecting a method, use it in a new output directory on a subsequent improvement task. The runner is the fixed controller; only the declared method text is the candidate. This exercises self-application without running unprotected generated controller code. A successful synthetic test of this path establishes mechanics only, not RSI or quality transfer.

## Check the runtime before costly work

For a new or materially changed execution path, use a tiny bounded baseline/candidate experiment to check real model access, delivered bundle behavior, terminal states, available usage, and stopping. Reuse relevant checks under unchanged conditions; a separate smoke run is not required for every experiment. A valid package or CLI help output does not establish these capabilities. Do not build an experiment around unavailable guarantees.

Budget the requested outcome, including calibration, baseline, generation, paired checks and confirmation where applicable. Host handoff and complete input reading consume elapsed time as well. Do not treat a successful baseline as a completed improvement run when its final decision is still pending. If a correction starts a new contract, retain the previous attempts and account for them explicitly; decide a feasible remaining scope before dispatch instead of relying on an artificially short final call. The frozen limits still apply once a run starts.

The optional CLI adapter uses the documented [Codex non-interactive interface](https://developers.openai.com/codex/noninteractive). If authentication or TLS validation fails, identify which process and environment cannot authenticate before requesting another login. Use the host path where it already provides the required execution, or launch the CLI experiment from the user's authenticated terminal. For CLI-specific setup, keep certificate verification enabled; an existing trusted CA bundle can be supplied through the documented [custom CA setting](https://learn.chatgpt.com/docs/auth#custom-ca-bundles). Do not copy credentials into experiment files or change authentication as a side effect of evaluation.
