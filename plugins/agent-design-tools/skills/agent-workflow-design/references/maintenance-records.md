# Maintenance records

Use when an unresolved improvement candidate or selective decision rationale needs to survive the current review for a later maintenance decision.

## Decide whether a record helps

Use current sessions and authoritative artifacts first. Retain an unresolved candidate when later independent observations or a named revisit condition can change a useful decision, and rediscovery from existing evidence would be insufficient or needlessly costly. Retain a resolved decision's rationale only when its alternatives, tradeoff, boundary, or reconsideration condition is likely to matter later.

A candidate is not an accepted rule or permission to activate a change. Recheck its supporting sources before formalization. Store references to inspectable observations, not bare recurrence counts or full copied sessions.

Use the authorized purpose, location, and scope, including in-scope directory creation. If a new store or retention purpose exceeds that scope, make the proposed record and store contract below reviewable before resolving the missing authority.

## Ownership and lifecycle

Define shared record rules once for the owner or store. Keep candidate-specific data only where it helps distinguish the judgment, recover evidence, and decide when to revisit. Add identifiers, statuses, schemas, concurrency controls, or search metadata when they solve an actual coordination or retrieval problem.

Read relevant records when the user identifies them, a known revisit condition is met, or the authorized maintenance workflow defines another trigger. Before writing a new candidate into an existing authorized store, inspect the same owner's relevant candidate set and merge materially equivalent unresolved findings. Do not scan all notes or unrelated owners during ordinary execution.

A note's existence or another occurrence does not by itself justify a stronger rule. When a candidate is formalized, covered by an existing rule, rejected, no longer supported, or outside the active scope, remove it under the store's cleanup policy. Preserve evidence required by a separate audit contract.

The authoritative behavior remains in the skill, code, configuration, policy, or evaluation definition. Update that artifact through the authorized maintenance change. Retain a separate decision record only when it explains something future maintenance needs, and revise or supersede it if the implemented decision materially changes. Do not accumulate every resolved candidate as a history.

## Location precedence

1. Use an authoritative store owned by the workflow, project, plugin, runtime, or external system when it covers the record.
2. For project-scoped records, use the project's defined location, or establish an in-scope location as part of the authorized design.
3. For user-scoped judgments compared across projects or sessions with no more specific owner location, the optional local convention below is available if its adoption is authorized.

Runtime checkpoints, logs, locks, caches, and generated evaluation outputs belong to their runtime or project state contract, not the local notes convention or a packaged skill directory. Evaluation evidence and public documentation may have distinct project-owned locations. If an assigned location is unavailable, report the missing persistence rather than silently switching scope.

## Optional local notes convention

In this Codex environment, an authorized design may select:

```text
~/.agents/notes/<owner-id>/candidates/<candidate-set-id>/
~/.agents/notes/<owner-id>/decisions/
```

The owner is the component responsible for writes, schema, retrieval, conflicts, and cleanup: a plugin ID, skill name, or stable controller ID as appropriate. Do not assign ownership to this design skill merely because it helped design the records. Resolve the actual path before the first write and follow the environment's rules for reporting local paths.

This is a local convention, not an Agent Skills specification requirement. Use the [optional template](../assets/maintenance-notes/README.md) only when its adoption and setup are authorized. Inspect and preserve an existing `~/.agents/notes/README.md`; adoption covers only the agreed owners and record scope.
