These are shared instructions for everyday work. Build, update, and reproduction procedures belong in `dot-setup.md`; installation sources and selected skills belong in `dot-setup-private.md`. Document names refer to content supplied for the current task or documents in the same configuration folder.

If `AGENTS-private.md` is supplied for the current task or exists in the same configuration folder, read it completely before work that depends on it, and apply only the additional instructions relevant to the current task. If it is absent, proceed with these shared instructions. If an existing document cannot be read, do not treat it as absent: pause only the work that needs its instructions and report what is missing.

## Scope and permissions

- Reconcile the current request with relevant instructions, following higher-priority instructions and safety constraints. Within the same scope and instruction level, follow the user's later explicit instruction. Do not turn task-specific or one-time conditions into standing policy.

- Follow the app's currently effective permissions and approval procedures. Do not copy custom rules into this document.

## Response quality

- Lead with the answer, result, or necessary next action. Avoid excessive praise or affirmation.

- Provide the context, supporting explanation, and caveats needed for the user to understand the answer. Do not repeat already-clear points solely to add a separate conclusion or recap, unless the user requests one or a long or complex response or artifact benefits from a final synthesis.

- When it could affect the answer, distinguish what the available evidence directly establishes from inference and unresolved uncertainty. Point out assumptions that conflict with that evidence or applicable constraints when the conflict could change the answer.

- In chat responses, use tables only when they clearly improve understanding or the user explicitly requests one. Prefer prose or lists over simple two-column tables.

## Complete skill and reference loading

At task start and when the task type or relevant requirements change, select applicable skills from their descriptions, including skills explicitly requested by the user. Use descriptions already available in the runtime catalog. For managed skills, use INDEX.md at the verified managed-skills location to locate candidates, then read their SKILL.md descriptions when not already available. If INDEX is unavailable, inspect only skill-entry metadata at that location. Reuse loaded descriptions while the task and available guidance remain unchanged; refresh them after relevant skill changes. Read the selected skills and required references according to the rules below before dependent work, rather than loading every skill body.

- Read each selected `SKILL.md` and each reference required for the current task completely before doing work that depends on it.

- Return each instruction file's content in a separate, bounded tool result. Do not combine those contents or other large outputs in a shared wrapper response. Metadata may be collected together.

- Account for both the reading tool's output limit and any outer wrapper's output limit. Check file size when needed, and use bounded chunks when a whole-file result may approach either limit.

- For chunked or truncated output, verify continuous coverage from the start through EOF and retrieve any missing ranges before relying on the file. A complete, untruncated whole-file result needs no separate range tracking.

- Follow related links only as needed for the current task. If material needed for a decision cannot be retrieved completely, report what is missing and pause only work that depends on it. Saving a file does not establish automatic loading or permission to perform actions or execute code.

## Cloud workspace layout

This layout applies to dot's own cloud environment, not the user's computer or another development environment. Verify the actual locations and access scope of `shared` and the currently assigned working directory.

- `shared/projects/<project-name>/`: The working home for ongoing projects. Keep drafts, assets, deliverables, and source material together within the project, whether or not it uses Git. Place repositories directly under `projects/`, without an intermediate `projects/git/` directory.

- `shared/downloads/`: Retrieved material and pinned snapshots retained for reuse or comparison, separate from actively edited project files.

- `shared/tools/`: User-managed tools, runtimes, and their supporting libraries. Separate by tool and version when useful.

- `shared/skills/`: Managed copies of skills used in everyday work.

- `shared/outputs/<project-name>/`: Verified final deliverables retained from temporary work. Deliverables from an ongoing project may remain within that project.

Work on an ongoing project's working copy under `projects/`; make copies only when needed, such as for validation.

For temporary work, create `YYYYMMDD_task-name/` inside the currently assigned working directory only when needed. Use a short, specific task name, with lowercase letters and hyphens for English words. If the name already exists, append `_02`, `_03`, and so on. Do not rename or move the assigned directory itself or add your own category directories directly under `scratch`.

Verify that files worth retaining have been saved before cleaning up individual tasks within the authorized scope. Do not periodically delete all of `scratch` in bulk.

## Canonical copy and updates

Designate one canonical `AGENTS.md` and verify its location and loading method during setup. Make any necessary copies from that canonical version; do not edit copies independently or automatically write their changes back. Keep skill source material separate from managed copies, and handle updates, differences, and conflicts according to `dot-setup.md`.

Keep environment-specific observations and history out of general procedures. Use `INDEX.md` for skill purposes and loading locations, and `skills-manifest.json` for adopted versions and information needed to compare their contents. Keep private information and project-specific conditions out of public shared instructions.
