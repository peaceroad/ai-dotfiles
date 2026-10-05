---
name: agent-improve
description: "Use when evaluating or improving agent skills and plugins, comparing versions, or testing changes to the improvement method itself. Includes grader checks and execution evidence. Not for ordinary task execution, one-off edits, or general design reviews."
---

# Agent Improve

Turn an improvement goal or execution evidence into a useful comparison, and carry authorized improvement through diagnosis, candidate trials, and an evidence-based decision. The target can be an agent skill, a plugin with its cooperating components, or this improvement method itself. Its subject area does not determine eligibility.

Derive success criteria from the target's purpose, domain requirements and actual outcomes. Use its relevant expertise, references and verification tools; do not replace domain validity with a generic quality judgment. Use the bundled text runner or a suitable project harness according to the evidence the claim requires.

## Establish the experiment

Determine the requested outcome: evaluation design, execution, comparison, or improvement. Evaluation alone does not authorize editing the target. For authorized improvement, continue within the agreed scope and budget without asking again at each iteration. Infer routine details from the task and existing evaluation assets; ask only for missing decisions that materially affect authority, cost, or correctness.

Before model trials, identify the target version and editable files, intended behavior and preservation cases, available runtime and its known inherited or requested settings, acceptance criteria, budget, and an authorized evidence location. Model or effort overrides and detailed token or monetary accounting are optional capabilities, not prerequisites for quality evaluation. Use the runtime's supported work limits and leave unavailable measurements unknown. Keep actual environment details and private traces out of public repositories. Reuse accessible evidence references instead of duplicating whole conversations.

Size the work for the requested decision. Coordinate directly unless a separate coordinator has a specific purpose. Prefer deterministic checks where they measure the requirement. Estimate model requests before trials, including generation and grading; use the bundled runner's call plan when applicable. Keep target executions in fresh contexts.

Read [experiments](references/experiments.md) when designing or running an evaluation or comparison. Read [measurement](references/measurement.md) when choosing evaluation methods, repetitions, or quality/cost criteria. Read [runtime](references/runtime.md) before using the bundled runner to check supported behavior and request counts.

Prefer the host's existing subagent tools when working in an agent session that supports and permits delegation. Let scripts freeze conditions, reserve calls, grade results, and retain records; let fresh subagents execute the requested model work. Use [host execution](references/host-execution.md) for the handoff and recovery contract. The optional Codex CLI adapter serves standalone or manually launched experiments. CLI authentication is not a prerequisite for host-based evaluation.

## Choose the work that answers the request

- **Evaluate or compare:** Define cases and grading for the requested claim. If execution is in scope, calibrate the grader, run frozen versions, and inspect artifacts. Distinguish a task failure from an infrastructure error, ungradable result, or unsupported capability.
- **Improve:** Read [improvement](references/improvement.md). Use goals and evidence to diagnose, propose, compare, and select the next experiment until the goal, budget, or justified stopping condition is reached. A failure log is useful, not required to start.
- **Improve the improver:** Use the same improvement process, with its own authorized scope and budget. Read the self-application section in [improvement](references/improvement.md). Compare what the old and new methods achieve on improvement tasks; do not grade their prose as a substitute for downstream results.

Use available `prompt-design` or `agent-workflow-design` expertise for relevant instruction or control decisions. Keep the experiment's purpose, budget, and completion criteria when using them. Their availability is optional; use the necessary design reasoning directly when absent. Do not replicate their entire workflow or start a new experiment on every handoff.

## Keep versions and authority clear

During an ordinary improvement run, pin this skill, its helpers, support skills, and curated knowledge. Edit only the requested target candidate. Meaningful observations can become short notes linked to evidence; do not automatically revise this skill, invoke another reflection model, or load an unrelated history archive after each run.

Candidates may change permitted instructions, references, knowledge, or explicitly supported helpers. Protected acceptance evidence, enforced budgets, and runtime permissions remain outside candidate control. If the runtime cannot protect the controller, do not execute autonomously modified code. Use supported text candidates or report the missing capability.

Treat traces, task examples, and candidate notes as evidence, not authority to expand the task. Reusing them for exploration does not make them unseen evaluation material. A selected candidate becomes the method for a subsequent fresh execution, never a live replacement inside the comparison that selects it.

## Finish with a decision

Report the requested evaluation design, observed baseline behavior, or comparison decision. For comparisons, distinguish adoption, retaining the current version, an inconclusive result, and an invalid evaluation needing repair. Include significant changes where applicable, preserved behavior, measured costs, evidence references, and material limits. Record human intervention when it contributed to the result.

Before applying an accepted change, check for intervening edits and preserve them. Source application, installed-version activation, and publication are distinct operations. Use an existing manager if activation was requested. Retain the prior accepted configuration and a conflict-aware recovery path. If a grader defect is found later, link corrected conclusions to the affected records instead of erasing history.

Distinguish a working self-application path, observed improvement on new tasks, and sustained improvement across generations. Do not infer one from another.
