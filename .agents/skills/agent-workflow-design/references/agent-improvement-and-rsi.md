# Agent improvement and RSI boundaries

Use this reference when execution evidence is used to revise an agent workflow or harness, including prompts, skills, tool descriptions, routing, state handling, subagent configuration, permissions, validation, or evaluation logic. Also use it when a design explicitly invokes AI self-improvement or recursive self-improvement (RSI).

## Contents

- Distinguish three improvement levels
- Practical agent and harness improvement loop
- Editable and protected surfaces
- Evaluation and acceptance
- AI self-improvement and RSI boundary
- Practical adoption boundary

## Distinguish three improvement levels

### Task-level repair

The loop changes the current artifact or task result. Examples include repairing code after tests fail or revising a document after source review.

### Agent or harness improvement

The loop changes machinery reused across tasks: instructions, skills, tool contracts, routing, memory, state, validators, evaluators, or runtime control. This is the practical improvement layer described in OpenAI's agent-improvement Cookbook.

### AI self-improvement or RSI

The loop improves AI research, model development, training systems, another model, or the mechanism that proposes and evaluates further improvements. OpenAI uses `RSI capability` and `RSI Index` for evaluations that measure progress toward recursive self-improvement. Treat this as a distinct capability and safety domain, not as a synonym for any repeated edit or prompt-maintenance cycle.

Do not call task repair RSI. Do not call ordinary harness maintenance RSI unless the requested design actually improves AI-development capability or recursively changes the improvement mechanism.

## Practical agent and harness improvement loop

Use a trace-to-eval-to-change loop:

1. Collect representative traces, validation results, failures, and human or model feedback.
2. Turn recurring expectations and failures into reusable evaluation cases and explicit acceptance criteria.
3. Diagnose the smallest harness component that plausibly caused each material failure.
4. Propose a bounded change and state the intended gain, likely regressions, and affected surface.
5. Have a coding agent or human implement the change without altering protected evidence or acceptance rules.
6. Run the same evaluation gate, plus preservation or held-out cases where feasible, against the changed harness.
7. Record the result, remaining delta, rejected candidates, and decision. Require the configured human or protected-system approval before merge, deployment, or other consequential activation.
8. Collect new traces from representative use and begin another maintenance cycle only when new evidence warrants it.

The harness includes more than the prompt. It may include instructions, tools, routing, output requirements, state transitions, validators, and runtime checks. Map a failure to the layer that can actually correct it instead of expanding prompt prose by default.

Change one coherent component group at a time when attribution matters. A broad rewrite can hide which change helped, introduce regressions, and make comparison unreliable.

## Editable and protected surfaces

List what the improvement loop may change. Examples include one skill reference, one prompt section, a tool description, a routing rule, a validator implementation, or a state-transform function.

Keep these outside the editable surface unless a separately protected process authorizes the change:

- The evaluator or acceptance rule used to approve the candidate.
- Held-out and regression cases.
- Permission, sandbox, and approval boundaries.
- Model, reasoning, token, time, cost, and concurrency budgets used for comparison.
- Production merge, deployment, publication, and destructive-action gates.
- Audit records, prior results, and source evidence.

Without separation, the loop can appear to improve by weakening the check, changing the target, increasing its budget, exploiting the grading harness, or removing a constraint.

## Evaluation and acceptance

Evaluate the outcome that matters, not the amount of activity. Depending on the workflow, compare task success, required evidence, artifact validity, regression rate, tool failures, tokens, latency, cost, or human-review burden.

Keep successful cases as preservation constraints. Use fresh or held-out cases where possible. Do not accept a candidate automatically when it fixes a visible case but degrades unrelated behavior, directly uses held-out evaluation data, spoofs a benchmark, or bypasses the intended runtime path.

When evaluation is slow, subjective, sparse, or easy to game, use the loop to produce a diagnosis and bounded proposal rather than to activate its own changes. Human judgment is part of the evaluator where no reliable automated verdict exists.

## AI self-improvement and RSI boundary

OpenAI's GPT-5.6 materials use AI self-improvement for realistic, end-to-end AI-research tasks such as research debugging, kernel optimization, language-model training-loop optimization, post-training strategy, and machine-learning experimentation. The release article aggregates several such evaluations into an RSI Index. The GPT-5.6 system card treats AI Self-Improvement as a Preparedness Framework capability category and rates the GPT-5.6 family below its High threshold.

These materials support several design constraints for improvement systems:

- Preserve independent correctness and performance checks.
- Prevent benchmark spoofing, invalid shortcuts, and direct use of held-out evaluation data.
- Treat evaluation awareness, concealed strategies, and attempts to game a check as reasons for stronger monitoring and lower autonomy.
- Keep permissions, evaluators, and activation gates outside the surface that the improving agent may rewrite.
- Do not infer deployment safety or reliable recursive improvement from a benchmark gain alone.

Use the RSI label only when it clarifies this higher-level capability or safety boundary. For ordinary production maintenance, prefer `agent improvement`, `harness improvement`, or `workflow improvement`.

## Practical adoption boundary

Start with a reviewed improvement loop:

1. The agent diagnoses recurring failure patterns and proposes a narrow change.
2. A human or separately controlled worker implements or reviews the candidate.
3. Deterministic checks and representative evaluations run.
4. A human or protected gate accepts, rejects, or requests another bounded pass.
5. The active workflow changes only after that verdict, with a rollback or recovery path.

Increase automation only after the evaluation gate, audit trail, rollback, and permission boundaries are reliable for the affected domain. Do not let an improvement loop silently rewrite its active instructions, evaluators, permissions, or production workflow by default.

## Sources

- [Build an Agent Improvement Loop with Traces, Evals, and Codex - OpenAI Cookbook](https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop)
- [Build iterative repair loops with Codex - OpenAI Cookbook](https://developers.openai.com/cookbook/examples/codex/build_iterative_repair_loops_with_codex)
- [GPT-5.6: Frontier intelligence that scales with your ambition - OpenAI](https://openai.com/index/gpt-5-6/)
- [GPT-5.6 System Card - OpenAI](https://deploymentsafety.openai.com/gpt-5-6)
