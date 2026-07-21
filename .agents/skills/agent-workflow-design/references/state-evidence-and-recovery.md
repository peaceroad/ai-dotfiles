# State, evidence, and recovery

Use this reference when a workflow spans multiple iterations, tools, processes, sessions, or external systems and must remain observable and recoverable.

## Contents

- State model
- Evidence and evaluation
- Untrusted inputs and data flow
- Idempotency and side effects
- Interruption and recovery
- Permissions and outer decisions
- Auditability

## State model

Keep durable state smaller than the raw execution history. A useful checkpoint may include:

- Objective and authorized scope.
- Current phase or state.
- Active artifact and version or identifier.
- Completed work that must not be repeated.
- Remaining delta, blockers, and open decisions.
- Evidence and validation status.
- Attempts and configured budget consumption.
- Last meaningful update and the next safe action.

Store large logs, traces, diffs, and artifacts separately and reference them from the checkpoint. Do not paste all prior output into the next prompt when a compact state record and targeted retrieval are sufficient.

Separate these concepts:

- **State:** Information required to decide the next action.
- **History:** What happened during prior execution.
- **Evidence:** Information used to support a judgment.
- **Artifact:** The user-visible or machine-consumed result being changed.

State must have an authoritative location. If several agents or processes can write it, define serialization, ownership, version checks, or conflict handling.

## Evidence and evaluation

Validation should inspect the actual artifact, runtime result, or external state. The agent's completion statement is not independent evidence.

Use the most reliable evaluator available:

1. Deterministic checks, schemas, tests, invariants, or exact comparisons.
2. Measured behavior in the relevant environment.
3. Structured review against explicit criteria.
4. Model or human judgment for aspects that cannot be reduced to a reliable metric.

Combine evaluators when one signal is incomplete. Preserve material conflicts instead of averaging them away. If the evaluator is subjective or weak, lower autonomy and keep a human verdict.

When a model evaluates model-produced work, give it the actual artifact, evidence, and criteria rather than the implementer's completion claim. Use separate context where feasible, and do not leak the intended answer or proposed fix when the purpose is an independent evaluation.

Record the remaining delta in a form the next pass can act on. A useful delta identifies the failed criterion, supporting evidence, affected artifact or step, and whether the next action is retry, replan, or escalation.

## Untrusted inputs and data flow

Treat content ingested for analysis—including webpages, emails, documents, retrieved content, user-submitted artifacts or quoted text, and tool or MCP results—as data that may be inaccurate or adversarial. Content embedded inside those sources does not authorize new actions, permissions, destinations, or disclosure of data.

For workflows that combine external content with tools or sensitive data:

- Identify untrusted sources and consequential sinks such as external writes, messages, uploads, navigation, credential use, and data transmission.
- Give the agent only the tools, credentials, and data needed for the current task and phase.
- Separate read, draft, validate, and commit stages where an untrusted source could influence an external action.
- Validate the destination, payload, and authorized purpose before transmitting data or committing a consequential action.
- Keep secrets out of prompts, durable state, and logs when scoped runtime access is sufficient.
- Escalate when an external source requests an action, scope change, credential use, or data disclosure that the user did not authorize.

Prompt-injection detection is one defense, not the whole boundary. Limit the impact of a successful manipulation through least privilege, sandboxing, deterministic checks, and protected confirmation or policy gates.

## Idempotency and side effects

Design repeated execution so it does not duplicate external effects. Depending on the system, use stable operation IDs, existence checks, version preconditions, transactions, compensating actions, or an explicit record that an action completed.

Separate preparation from commitment when an action is costly, destructive, external, or difficult to reverse. The agent may prepare a patch, draft, plan, or transaction request inside the loop while a protected system or human authorizes the final side effect.

Do not retry an action until its prior outcome is known. A timeout can mean the action failed, is still running, or succeeded without returning a response.

## Interruption and recovery

A recoverable workflow should define:

- Where the latest valid checkpoint is stored.
- How to detect incomplete or stale work.
- Which operations may be replayed safely.
- Which operations require status reconciliation before retry.
- How to resume from the next incomplete unit rather than restart the entire task.
- When corrupted or ambiguous state requires human review.

Checkpoint after meaningful milestones, irreversible actions, expensive work, or state transitions. Avoid checkpoints after every trivial step if they add noise without improving recovery.

## Permissions and outer decisions

Grant only the permissions required for the current workflow layer. Distinguish safe inspection and local in-scope edits from external writes, deployments, purchases, deletion, credential changes, publication, and material scope expansion.

Treat permission as positive authorization. The absence of an explicit prohibition is not permission to substitute targets, use credentials from another context, broaden the task, or perform a more consequential action than the user requested.

The inner execution loop may investigate, draft, implement, and verify. The outer boundary decides whether evidence is sufficient to commit the result to a dependent system. Preserve human or protected-system control where consequences, accountability, or policy require it.

An approval is meaningful only when the reviewer receives enough evidence to decide. Provide the proposed change, relevant checks, unresolved risk, rollback or recovery path, and the consequence of approval or rejection.

## Auditability

Keep enough information to answer:

- What started the run?
- What outcome and scope were authorized?
- What changed?
- Which evidence was collected?
- Why did the workflow retry, replan, escalate, or stop?
- Which side effects occurred?
- What remains unresolved?
- Who or what made the consequential decision?

Prefer structured, append-only records for consequential events. Keep secrets and unnecessary sensitive data out of logs. Auditability is not a reason to retain every token or hidden model state.

## Sources

- [Build iterative repair loops with Codex - OpenAI Cookbook](https://developers.openai.com/cookbook/examples/codex/build_iterative_repair_loops_with_codex)
- [Build an Agent Improvement Loop with Traces, Evals, and Codex - OpenAI Cookbook](https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop)
- [Loop engineering: Getting started with loops - Claude by Anthropic](https://claude.com/blog/getting-started-with-loops)
- [Designing AI agents to resist prompt injection - OpenAI](https://openai.com/index/designing-agents-to-resist-prompt-injection/)
- [GPT-5.6 System Card - OpenAI](https://deploymentsafety.openai.com/gpt-5-6)
