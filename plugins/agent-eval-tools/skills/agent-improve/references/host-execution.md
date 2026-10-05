# Execute trials with the host's subagents

Use this when the active agent session provides subagent tools and delegation is authorized. No separate CLI login is needed. The parent coordinates existing runtime tools; the script does not launch agents or add a daemon. Comparisons, candidate search, grading, budgets, and lineage use the same controller as the optional CLI adapter.

## Deliver one reserved request

Set `runtime` to `{ "adapter": "host", "model": "host-inherited" }`. The host adapter inherits the active host model and settings; it does not select a different model or verify the backend version. Do not pass model or effort overrides for these trials even if the host tool exposes them: the adapter cannot represent them in its frozen contract. Keep the same host session and settings throughout a comparison; record the session reference privately. A changed or unidentifiable execution context requires a new comparison rather than an assumed equivalent resume. Quality comparison does not require changing those settings. Use a suitable harness or the optional CLI path only when explicit control is part of the requested comparison.

Leave execution capacity for a fresh trial worker when coordinating other agents. Do not fill every available slot with coordinators that must themselves launch workers.

The active parent normally coordinates directly; an extra coordinator is not a standard cost. Each reserved packet needs one fresh worker, including a packet containing multiple judge items when batching is explicitly configured. Never combine target requests or reuse a worker to achieve the same apparent call reduction. Inspect the `validate` call plan before starting, including calibration and proposal costs.

1. Run the normal experiment command from [runtime](runtime.md). `needs-host-response` means a model call has been reserved, not completed. The result includes `pending.inputFile`, `inputHash`, request ID, and deadline. The input packet contains only the prompt and output schema; execution metadata stays in the separate request record. Avoid loading and retyping long packets in the parent.
2. If `pending.executionId` exists, inspect or wait for that execution. If a previous dispatch may have happened before its ID was saved, reconcile the runtime's task history first. Never create a replacement merely because a response file is missing. After an explicit temporary capacity refusal, verify that no execution was created; a supported wait and retry within the original deadline is allowed. Retain the refusal as an observation, and do not extend the deadline or reuse another trial's execution.
3. For a new request, spawn one fresh subagent without forking conversation history (`fork_turns: "none"` where supported). Prefer passing the input file and expected hash with this narrow delivery instruction: read the packet using `node <absolute-skill-path>/scripts/agent-eval.mjs input <input-file> --hash <input-hash>`, then execute its prompt with its output schema and return the final result. These verified reads are input transport; do not use other files, task tools, or further agents. For long packets, add `--offset 0 --limit 12000`, then advance from each returned `end` until `totalChars`; inspect every chunk in a separate bounded result and verify full coverage before acting. `pending.inputChars` helps choose the delivery size. A small prompt may instead be passed inline exactly, with its schema. Do not supply expected answers, candidate labels, graders, other outputs, or parent history. System and host instructions may still be inherited; this is controlled input delivery, not protected isolation.
4. Attach the returned actual subagent ID immediately:

   ```text
   node scripts/agent-eval.mjs attach /private/experiment --request <request-id> --execution <subagent-id>
   ```

5. Use the runtime's supported wait mechanism. Continue independent work where useful. At the request deadline, interrupt the execution and verify its state before further calls. If stopping cannot be confirmed, return `cleanup_unconfirmed`; do not report a clean timeout while work may continue.
6. Save a response JSON in private storage and use the combined command below to receive it, grade it, and obtain the next request or final decision. Copy the agent's final output exactly; do not repair it to pass the grader.

   ```json
   {
     "requestId": "<request-id>",
     "executionId": "<subagent-id>",
     "status": "completed",
     "output": "<unaltered final answer>"
   }
   ```

   ```text
   node scripts/agent-eval.mjs run /private/configuration.json --out /private/experiment --response /private/response.json
   ```

   The separate `receive` command remains available when receipt and resumption must happen separately. If a combined call's outcome is lost, inspect whether the response was received, then resume without resending an existing receipt.

For failures, use `runtime_error`, `timeout`, `interrupted`, `unsupported`, or `cleanup_unconfirmed` with a concise `reason`. Use `unsupported` for observed task-tool activity beyond the input-transport read. Provide `usage` with `input_tokens` and `output_tokens` only when the runtime measures them; otherwise omit it. The controller checks IDs and refuses replacement receipts. File hashes check payload integrity, not whether the model followed the instructions. Results have host-reported provenance, not cryptographic proof of the runtime transcript.

If the request expired or cannot be dispatched before its deadline, first reconcile the tool history to confirm that no execution exists. Close that reservation with `cancel-request <experiment-directory> --request <request-id>`, then resume the experiment. It remains `not_dispatched` with `attempted: false`; never invent an execution ID. Cancellation is refused for an attached execution. Each request must use a different actual subagent ID.

## Budgets and evidence limits

Queued requests count against the call allowance before dispatch. Attempted calls are recorded when an execution ID is attached. Here `maxCalls` bounds reserved worker requests, not every internal model turn, transport read or parent action. Candidate generation and judges use the same handoff and shared ledger. Resuming must not duplicate trial calls, candidate records, or adoption decisions.

The script can refuse new requests, but cannot enforce a hard deadline on an agent owned by the host. The parent is responsible for waiting and interruption. A completed response received after the reserved deadline is recorded as a timeout and cannot support adoption. Elapsed budgets include handoff time; choose a realistic allowance before starting.

When measured usage is unavailable, omit optional `maxTokens` at setup and budget with `maxCalls`, `maxMs` and `callTimeoutMs`. Quality evaluation can proceed with usage unknown. If a token allowance was configured, unknown usage prevents additional calls; do not remove an agreed limit mid-run to bypass that stop. A required hard token or monetary cap needs a different runtime capability. Do not infer token usage from answer length, call counts or a worker's estimate. Parent coordination and evidence curation costs may also be unobserved; do not call the subagent ledger a complete token-cost measurement.

These limitations still allow exploratory text-response comparisons and self-application mechanics. They do not establish natural skill discovery, tool workflow quality, protected held-out evaluation, or executable candidate isolation. Do not escalate permissions or move credentials to make a nested CLI work when the existing host tools already serve the experiment.
