# Skill diff: optional Agent Plugins v1 sample

A small offline comparison example for dot-toolkit workflows. It contains one guiding skill, one standard-library comparator/CLI, and one optional MCP stdio tool wrapping that same function. It is separate from dot-toolkit and is not installed or registered by it. It tests an integration boundary; it does not demonstrate that MCP is more efficient than a script or expose a native dot tool automatically.

## Inputs and trust

Compare exactly one skill directory against a separately acquired upstream snapshot. Each directory must contain `SKILL.md`. Dot or another authorized acquisition workflow obtains snapshots through existing connectors, resolves an immutable revision, and verifies the acquisition separately. Report source repository, skill path, revision and acquisition point outside this tool. The tool deliberately has no “verified revision” input: a caller-supplied SHA does not prove snapshot identity. Optional version labels do not establish freshness.

An optional base is the independently established common starting snapshot. Without it, the result cannot attribute local edits versus upstream changes. With it, attribution describes byte differences from that base, not who authored them or whether a merge is safe. Files equal between local and upstream are omitted, including convergent changes. `added` and `deleted` are directed from local to upstream.

The sample never downloads, authenticates, updates, monitors, hosts an HTTP service or executes compared content. MCP uses the official Python SDK rather than a custom protocol implementation. Snapshot roots are administrator-controlled process environment, not tool arguments. Do not configure home directories or other broad roots. The host should supply private, stable, read-only snapshots, without concurrent writers; this is not an OS sandbox or an atomic snapshot system.

## CLI (no third-party dependencies)

Requires Python 3.12 on POSIX with descriptor-relative opens, `O_NOFOLLOW`, and `O_DIRECTORY` (tested on Linux; Windows is not supported). From the sample root, using synthetic example paths:

```sh
export SKILL_DIFF_ROOTS='["/tmp/skill-review"]'
python3 -B skills/compare-skill-snapshots/scripts/compare.py \
  /tmp/skill-review/local /tmp/skill-review/upstream \
  --base /tmp/skill-review/base
```

The allowlist must already exist and is fail-closed when missing or invalid. Each selected directory must be inside one of its roots. All ancestors and traversed entries reject symlinks. Hard-linked files and special files are rejected too. Errors produce JSON on stderr with exit status 2; success emits one JSON report on stdout. Inputs remain untouched; JSON is returned to the caller, never saved in a snapshot.

## Optional MCP setup

`mcp.json` exposes `compare_skill(local, upstream, base=None)` through an Agent Plugins 1.0.0 stdio configuration. It resolves `python3` from the host's PATH. Prepare an isolated Python 3.12 environment separately, with authorization for dependency installation, then make that environment's `python3` available to the client. For example:

```sh
python3 -m venv /tmp/skill-diff-venv
/tmp/skill-diff-venv/bin/python -m pip install -r requirements.txt
export PATH="/tmp/skill-diff-venv/bin:$PATH"
```

Only the SDK version is pinned, in sample-only requirements.txt. pip resolves its transitive dependencies; this is not a complete reproducibility or hash-verified lock. Dependency installation may use the package registry; runtime comparisons and tests require no network. No dependency is installed by startup or tests.

The bundled configuration sets `SKILL_DIFF_ROOTS` to `["${PLUGIN_DATA}/snapshots"]`, independently of the shell's allowlist. The client expands `PLUGIN_DATA` to this plugin instance's private data directory; this is a different location from the CLI example's `/tmp/skill-review`.

Before comparing, identify the data directory through the client's supported setup and prepare a `snapshots/` child containing the independently acquired `local/`, `upstream/`, and optional `base/` skill folders. Pass their absolute paths to the tool. The sample does not create or populate these directories; missing or invalid roots remain errors.

Client registration, permissions and launching the MCP process are separate, authorized host operations, not performed merely by placing this package. Ordinary CLI use does not require an MCP launch.

## Limits and interpretation

Per snapshot: 512 directory entries, depth 32, 64 KiB per readable file and 2 MiB aggregate bytes. Paths are bounded. Limits are intentionally conservative for one skill, and exceeding traversal/aggregate limits fails the comparison rather than returning a misleading partial success. Oversized files are listed as `uncompared` where equality is unknown (or added/deleted if presence is known). Binary/non-UTF-8 differences are identified without a text diff. Text with over 4,000 combined lines (including CR and Unicode line separators) is not diffed. Text diffs normalize displayed line separators; `final_newline` preserves the final-newline distinction even when an excerpt is empty. Diff excerpts share a 32,768-character budget; `diff_truncated` marks incomplete excerpts. File membership is still reported after that budget is exhausted. “No changes” is justified only when the report has no changes and no error.

## Verification

```sh
python3 -B -m unittest discover -s tests -v
node /path/to/plugin-creator-agent-plugins/scripts/validate-agent-plugin.mjs .
```

The standard-library tests work without MCP; the protocol test explicitly skips when the SDK is unavailable. With the SDK installed, both run. Fixtures are private temporary directories; CLI and MCP checks run from a separately copied plugin outside the repository to check distribution isolation.

The MCP test expands the copied package's `mcp.json`, uses the prepared Python interpreter, and checks that its declared allowlist overrides a conflicting ambient value. It starts and closes a private stdio subprocess, initializes an SDK client, lists the one tool, and calls it. Other tests cover local/upstream attribution, meaningful diffs, input preservation, invalid roots, escapes, links, special files and bounded traversal/content. Structural validation and a stdio round trip do not establish real-client registration, discovery, or product-specific support.

Sources: [Agent Plugins 1.0.0 specification](https://agent-plugins.org/specification), [official Python MCP SDK](https://github.com/modelcontextprotocol/python-sdk).
