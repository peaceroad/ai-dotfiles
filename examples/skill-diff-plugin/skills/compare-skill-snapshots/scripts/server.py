"""Optional SDK adapter; stdout is reserved for MCP stdio protocol messages."""
from typing import Any
from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from compare import ComparisonError, compare

server = MCPServer('skill-diff-sample')


@server.tool(annotations=ToolAnnotations(read_only_hint=True, destructive_hint=False,
                                       idempotent_hint=True, open_world_hint=False))
def compare_skill(local: str, upstream: str, base: str | None = None) -> dict[str, Any]:
    """Compare one local skill with an independently acquired upstream snapshot.

    Paths must be inside administrator-configured snapshot roots. Returns relative
    added/deleted/changed paths and bounded UTF-8 diffs, directed local to upstream.
    With base, attributes byte changes relative to it, not authorship or merge safety.
    Does not acquire snapshots, verify revisions, write inputs, or execute their code.
    """
    try:
        return compare(local, upstream, base)
    except ComparisonError as exc:
        raise ToolError(str(exc)) from None


if __name__ == '__main__':
    server.run(transport='stdio')
