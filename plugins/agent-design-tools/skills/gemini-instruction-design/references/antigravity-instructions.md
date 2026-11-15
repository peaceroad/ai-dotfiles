# Antigravity instructions

Use when Antigravity is the target of an instruction, Rule, or Skill. Its App, CLI, and IDE surfaces need not expose identical controls. This reference covers decisions that change instruction design, not installation, SDK integration, or a custom agent-loop implementation.

## Put constraints and procedures in the right place

Use Rules for scoped constraints and invariants; use Skills for reusable task procedures and knowledge selected when relevant. Inspect the target's active instructions before adding competing versions. A crucial constraint should not depend on a rarely selected skill.

The checked Rules contract treats `AGENTS.md` and `GEMINI.md` as continuously active plain Markdown. Modular `.agents/rules/*.md` files require valid `trigger` frontmatter: `always_on`, `model_decision`, `glob`, or `manual`. `model_decision` needs a description; `glob` needs its file patterns. Invalid trigger spelling or missing frontmatter can silently discard a rule. Manual rule mentions are not supported in the CLI. Check current discovery documentation for placement or include behavior rather than transplanting Gemini CLI syntax.

Skills expose names and descriptions each turn and load full instructions when relevant. For portable authored skills, put YAML `name` and `description` before Markdown instructions in `SKILL.md`; use a lowercase hyphenated name, task resources, and conditional reading instructions. Verify the intended client's discovery scope; do not infer global paths from another Google client.

Workspace discovery includes the workspace and its ancestors up to the repository root, not arbitrary descendant folders. Skills normally sit one folder below a recognized skills directory; deeper placement needs a discovery manifest. Large rule sets can be truncated or demoted to pointers by context budgets, so keep essential constraints compact and inspect actual loading when it matters.

## Respect model and continuation controls

Antigravity's checked Orchestrator options pair Carbon or Argon for planning and review with Hydrogen for implementation in one conversation. This is separate from parallel subagents. Orchestrator configurations have fixed effort; custom effort requires a supported standalone selection. Do not claim a prose role assignment switches models or creates workers.

For `/goal` work, define scope, deliverables, and observable completion evidence. The runtime supplies continuation and a completion audit; the command does not grant additional permissions. Avoid restating that mechanism as an invented polling loop or “never stop” instruction. If a dependency prevents progress, define what remains missing and what event or user input enables continuation, proportionate to the task.

For example, a repository repair instruction can identify the affected behavior, required regression check, and evidence expected in the report. It need not prescribe a fixed number of thinking steps, allocate Carbon/Hydrogen turns, or invoke `/goal` inside the prompt.

Use `agent-workflow-design` through the entry point when the requested work actually designs control ownership, waiting, delegation, or recovery. Ordinary Rules/Skills authoring needs only the relevant runtime contract and shared prompt-design method.

## Deliver and check the actual artifact

Return the requested Rule, Skill package, or task instruction with placement and runtime configuration notes separate. Confirm frontmatter and references for the selected surface. If execution is authorized, observe discovery, activation, available tools, and completion behavior before reporting them as working. Source validity alone does not establish runtime loading or model orchestration.

## Sources and refresh conditions

Recheck for actual placement, trigger schema, model controls, or continuation behavior; do not infer these from the Gemini API.

- [Rules](https://antigravity.google/docs/rules) and [Skills](https://antigravity.google/docs/skills): different roles and activation contracts.
- [Customization discovery](https://antigravity.google/docs/customization-discovery/): client-specific paths and loading.
- [Models](https://antigravity.google/docs/models): Orchestrator and standalone controls.
- [Goal command](https://antigravity.google/docs/commands/goal/): continuation and completion.
