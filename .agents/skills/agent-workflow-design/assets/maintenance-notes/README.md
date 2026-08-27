# Agent maintenance notes

`~/.agents/notes/` is an optional user-scoped entry point for human-reviewed maintenance records that must be compared across projects or sessions when no more specific project, plugin, runtime, controller, or external-system location already covers them. This convention is not part of the Agent Skills specification and is not required to use `agent-workflow-design` or any Agent Skill.

## Adoption and record ownership

This file can be installed from the optional maintenance-notes template bundled with `agent-workflow-design`. Place or adapt it at `~/.agents/notes/README.md` only when a user explicitly adopts the convention or an authorized persistence design selects this location and includes its setup in scope. Creating the root and this README means that the convention was adopted; it is not a prerequisite for using the skill.

If the file already exists, inspect it and preserve applicable local rules instead of overwriting it. The skill may guide setup, but it does not own every record below this root. Each `<owner-id>` is responsible for its record schema, writes, conflict handling, read and revisit triggers, and cleanup. Installing the convention does not authorize creating an owner namespace or any candidate or decision record without a concrete record and write scope.

## Layout

After a concrete record and write scope are authorized, use an owner-first layout:

```text
~/.agents/notes/
└── <owner-id>/
    ├── candidates/
    │   └── <candidate-set-id>/
    └── decisions/
```

- `candidates/` contains unresolved judgments that are worth revisiting with later evidence. A candidate is not an accepted rule or evidence by itself.
- `decisions/` contains only material rationale, alternatives, consequences, or reconsideration conditions that future maintenance is likely to need after a decision is resolved.
- The authoritative behavior remains in the applicable skill, code, configuration, policy, or evaluation definition. A note explains or supports maintenance; it does not activate behavior.
- Read only the relevant owner's records when the user identifies them or that owner's maintenance workflow reaches a defined read or revisit trigger. A finding that would otherwise be written as a new unresolved candidate in an existing authorized store is such a trigger for the same owner's relevant candidate set; if the same or a materially similar candidate exists, reassess it with the current evidence instead of creating a duplicate. Do not scan other owners, all decision records, or this tree during ordinary task execution.
- Remove a candidate after formalization, coverage by an existing rule, rejection, loss of evidence, or end of scope. Do not keep every resolved candidate as history.
- Keep raw session logs, copied artifacts, generated evaluation results, checkpoints, locks, retry counters, caches, and other runtime state out of this directory.

Runtime state belongs in the location defined by its runtime, controller, plugin, external system, or project state contract. Without an owned location, the state contract is incomplete; do not invent a fallback store.

Public explanatory documents and usage notes belong in the location defined by the owning project or package, such as its `docs/notes/`. They are documentation, not lifecycle-managed candidate or decision records.
