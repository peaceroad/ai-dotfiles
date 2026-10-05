# Agent Eval Tools

An experimental Agent Plugins v1 package for evaluating and improving agent skills and plugins across their subject areas. Its single entry point, [`agent-improve`](skills/agent-improve/SKILL.md), covers evaluation, comparisons, bounded improvement search, and applying that process to the improvement method itself.

## When to use it

- Diagnose a recurring skill failure and compare a repair with preservation cases.
- Test whether simplifying instructions preserves quality.
- Explore a capability goal even when no failure log exists.
- Remeasure a skill after a model change.
- Use retained evidence to compare a new improvement method with the current one.

Ordinary edits and design reviews can continue with existing design skills. This package adds experiment execution and evidence; it does not require a separate design plugin. Useful observations are retained selectively, and self-improvement is a separately scoped run rather than mandatory overhead after every task.

The subject area of the target skill or plugin is unrestricted. The target supplies its purpose and domain requirements; this method organizes the experiment and checks whether the evidence supports an improvement. Domain references, expertise and verification tools remain necessary where the claim requires them. The [measurement guide](skills/agent-improve/references/measurement.md) gives illustrative evidence choices and explains how to reuse a suitable harness, including for cooperating plugin components. Intended breadth is distinct from the bundled text runner's supported execution capabilities.

## Included implementation

The skill owns its references and a Node.js runner. The runner snapshots declared bundles, calibrates graders, records all attempted calls, compares candidates, supports bounded text proposals and improvement-task comparisons, and provides conflict-aware source application and restoration. It never installs or publishes a skill as part of an experiment.

Validation estimates runner request counts for ordinary experiments before execution; host workers may make more than one internal model call. Individual semantic grading remains the default; optional `judgeBatchSize` uses a common protocol for calibration and result grading, validates every item ID and preserves fresh target executions. Choose batching only after checking relevant errors and cross-item effects; fewer calls alone do not establish equal quality or lower total cost.

Optional comparative grading distinguishes quality among adequate outputs, checks both presentation orders and preserves ties and uncertainty. Repeated semantic grading can test the same frozen output for disagreement. Deterministic requirements need neither feature. Comparative adoption policies and their statistical limits are explicit; graders still need task-specific validation.

For in-session work, the parent agent uses the host's existing subagent tools while the runner manages frozen requests, response binding, grading, and records. Fresh trial contexts avoid carrying the parent conversation into the task. A separate CLI login is not required. An optional Codex CLI adapter remains available for standalone and manually launched experiments.

Both adapters are limited to explicit text bundles. Natural discovery, live workflow events, protected held-out isolation, generated executable helpers, and backend model-version verification are not supported. Host execution uses inherited settings; it needs neither effort overrides nor detailed usage to compare quality. Work limits bound worker requests and elapsed time, not a guaranteed token or monetary cost. Host deadlines require parent coordination, and unreported token usage stays unknown. Source and synthetic tests must not be mistaken for evidence of improved skill quality.

See the [runtime contract](skills/agent-improve/references/runtime.md) for commands, configuration, budget semantics, record handling and limitations, and [host execution](skills/agent-improve/references/host-execution.md) for the subagent path. Node.js 24 or newer is required; an authenticated Codex CLI is needed only for CLI trials. The normal automated test suite uses synthetic model responses and incurs no model usage.

```text
node skills/agent-improve/scripts/agent-eval.mjs --help
node --test skills/agent-improve/scripts/agent-eval.test.mjs skills/agent-improve/scripts/comparison.test.mjs
```

## Package structure

There is one public skill, `agent-improve`. Evaluation, ordinary skill improvement and self-application are uses of that same entry point. The `agent-eval.mjs` command is its runner, not a second skill.

```text
agent-eval-tools/
  plugin.json
  README.md
  skills/agent-improve/
    SKILL.md                         # Entry point and reference routing
    agents/openai.yaml               # Codex UI metadata
    references/
      experiments.md                 # Comparison and evidence contract
      measurement.md                 # Evidence choice, grading and uncertainty
      improvement.md                 # Search and self-application
      runtime.md                     # Configuration and supported behavior
      host-execution.md              # Native subagent handoff
    scripts/
      agent-eval.mjs                 # Commands and orchestration
      experiment.mjs                 # Calibration, search and comparisons
      comparison.mjs                 # Optional pair judgments and decision gate
      records.mjs                    # Snapshots, budgets and recovery
      host-adapter.mjs                # Reserved requests and bound responses
      codex-adapter.mjs               # Optional standalone CLI execution
      agent-eval.test.mjs             # Synthetic controller tests
      comparison.test.mjs             # Synthetic grading and adoption tests
```

In an ordinary improvement experiment, a frozen method proposes and compares changes to a target skill. In self-application, the target is a copy of the improvement method; the executing version stays frozen while its successor is compared on downstream improvement tasks. Target workers, generators and judges are runtime roles, not separately installed skills.

The current automated method comparison measures text proposals and stopping decisions under a fixed controller. Case generation, judge configuration and trial allocation are not candidate-controlled runtime actions in this implementation. Extending those abilities requires an explicit interface and an outer evaluation, not just a rewritten method file. Consult the runtime contract for supported execution, and the repository plan for future scope.

This README owns the current package map and setup guidance. The skill and its references own execution instructions. Repository notes explain the design and use cases; the plan owns future work and completion criteria. Those documents link to the implementation contracts instead of maintaining parallel command or configuration specifications.

## Setup

Keep the whole plugin directory together, or install the complete `skills/agent-improve/` directory as a standalone skill where the client supports it. Use an existing source/Marketplace manager when one owns the installation. Editing this source does not refresh installed copies or a running conversation. Source validation and client activation are separate checks.

The runner is self-contained and does not require the `agent` CLI, another plugin cache, an MCP server, or an external Node.js dependency. Keep raw runtime records private by default. Maintain useful, publishable evaluation definitions, reviewed behavioral evidence and rationale with the source they help maintain, following its repository's rules. In this repository, those locations are `evals/` and `docs/`; other projects keep their own evidence. These materials are optional background, not runtime dependencies. Local execution alone does not make a task response confidential, and a public task does not make its entire runtime record suitable for publication.

Choose an explicit evidence location outside a Git working tree for each experiment. The runner creates the specified directory and any missing parents; it does not choose a default home-directory location. Keep later-use evidence separate from disposable transfer files and selective maintenance notes. The [retention contract](skills/agent-improve/references/runtime.md#retained-evidence-and-temporary-work) explains receipt checks, verified archival copies and reading old results without rerunning them.

## Design sources

This package is independently implemented. The following sources informed the design; their skill text, code and templates are not incorporated:

- [Anthropic: Automating eval design and hillclimbing](https://claude.dev/blog/automating-eval-design-and-hillclimbing/) — executable evaluation, diagnosis and iterative comparisons.
- [OpenAI: Iterating development workflows with Codex](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex) — evidence from work, selective retention and fresh-context checks.
- [OpenAI: Build an Agent Improvement Loop with Traces, Evals, and Codex](https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop) — connecting observed behavior and domain feedback to reusable evaluations and harness changes.
- [OpenAI: Testing Agent Skills Systematically with Evals](https://developers.openai.com/blog/eval-skills) — observing selection, execution and artifacts, with checks matched to the claim.
- [OpenAI: Rethinking skills and prompts for GPT-6 Astra](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) — task-scoped instructions and testing whether scaffolding remains useful.
- [STOP](https://arxiv.org/abs/2310.02304v3) and [Hyperagents](https://arxiv.org/abs/2603.19461v1) — self-application, mutable improvement methods, and evaluating downstream improvement.
- [Inspect scorers](https://inspect.aisi.org.uk/scorers.html), [metrics](https://inspect.aisi.org.uk/metrics.html) and [scoring workflow](https://inspect.aisi.org.uk/scoring-workflow.html) — task-appropriate evidence, grouped observations and reusing outputs for grader work.
- [Judging the Judges](https://arxiv.org/abs/2406.07791v9) — task-dependent position bias and the distinction between repetition stability and order consistency.
- [GEPA](https://arxiv.org/abs/2507.19457v2) — learning from execution feedback and retaining alternative candidate lineages.
- [Google Research: Scaling agent systems](https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/) and [ReasoningBank](https://research.google/blog/reasoningbank-enabling-agents-to-learn-from-experience/) — task-dependent coordination and testing the value and total cost of retained knowledge.
- [Anthropic: What a task costs](https://claude.dev/blog/what-a-task-costs-on-opus-5-5/) and [Spending your effort](https://claude.dev/blog/spending-your-effort/) — comparing completion cost and effort policies without assuming fewer calls or a fixed setting is always better.
- [pstack: Eval playbook](https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/playbooks/eval.md) — task-facing context, blinded comparisons and observable evidence of skill use.

The [research note](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/notes/agent-rsi-research.md) discusses attribution and limitations; the [measurement review](https://github.com/peaceroad/ai-dotfiles/blob/main/docs/agent-eval-tools/measurement-review.md) records later source comparisons and their scope. These sources do not establish that this implementation achieves RSI.
