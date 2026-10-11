"""Optional SDK adapter; stdout is reserved for MCP stdio protocol messages."""
from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
from compare import compare

server = FastMCP('skill-diff-sample')


@server.tool(annotations=ToolAnnotations(readOnlyHint=True, destructiveHint=False,
                                       idempotentHint=True, openWorldHint=False))
def compare_skill(local: str, upstream: str, base: str | None = None) -> dict:
    """Compare one local skill with an independently acquired upstream snapshot.

    Paths must be inside administrator-configured SKILL_DIFF_ROOTS. Returns relative
    added/deleted/changed paths and bounded UTF-8 diffs, directed local to upstream.
    With base, attributes byte changes relative to it, not authorship or merge safety.
    Does not acquire snapshots, verify revisions, write inputs, or execute their code.
    """
    return compare(local, upstream, base)


if __name__ == '__main__':
    server.run(transport='stdio')
