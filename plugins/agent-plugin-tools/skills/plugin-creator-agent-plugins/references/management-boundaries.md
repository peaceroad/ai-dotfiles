# Respect the existing management workflow

Use before changing an existing developer installation, source link, or shared Marketplace. Establish its manager from repository instructions and the selected configuration, not merely from an available command or a missing marker.

A manager may own declarations as well as generated files. Prefer its established entrypoint; do not invoke bundled helpers to bypass ownership, repository checks, version policy, locks, or overwrite refusals. A standalone setup with a verified source-based definition can use this plugin's bundled tools without another plugin or repository checkout.

## Recognize ai-dotfiles-managed targets

A shared `.agents/marketplace-development/config.json` marked `managedBy: "ai-dotfiles/agent-dev"` is a source-path-free reference owned by ai-dotfiles, not a standalone assembler source definition. The marker identifies a workflow, not authentication or who wrote the file. The assembler's standalone `init` does not add it. Its absence does not by itself prove that a target is unmanaged.

When relevant, ai-dotfiles defaults to `~/.agents/ai-dotfiles/development.json` for local targets and `skill-links.json` in that directory for link declarations; respect configured overrides. Inspect only the selected target's relevant configuration.

If the `ai-dotfiles-cli` skill is available, use it for requested manager operations, not for generic authoring. Otherwise inspect the known manager's help and repository guidance directly. Another program named `agent` is not interchangeable. This plugin neither bundles nor requires that CLI or skill.

If the manager is unavailable, use an existing standalone entrypoint only if it preserves the same management contract. Do not remove the marker, invent an external `--config`, or overwrite a generated reference to turn the target into a standalone setup. Leave unavailable or unclear managed operations unchanged, report the missing capability, and continue independent source work or validation.
