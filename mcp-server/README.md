# the-app MCP server

A stdio-transport MCP server exposing the todo app and its codebase to LLM agents
(Claude Code, Codex, etc.).

## Tools

| Tool | Description |
|------|-------------|
| `get_todos()` | Query the SQLite DB directly and list all todos |
| `explain_code(query)` | Grep-based retrieval over `server/`, `client/`, `tests/`, `mcp-server/` — returns file + line + snippet |
| `where_is_state_stored()` | Reports where state lives (SQLite file path + table schema) |

The DB is read directly with `node:sqlite` — no HTTP round-trip needed.

## Run

```bash
npm install   # inside mcp-server/
node index.js # stdio transport; run from the repo root
```

Override the DB path with the `TODO_DB_PATH` env var (defaults to `data/todos.db` next to the repo root).

## Register with Claude Code

Project-scoped (auto-loaded): create `.claude/mcp.json` at the repo root:

```json
{
  "mcpServers": {
    "the-app": {
      "command": "node",
      "args": ["mcp-server/index.js"]
    }
  }
}
```

Or user-scoped:

```bash
claude mcp add the-app -- node mcp-server/index.js
```

## Register with Codex

Add to Codex's `config.toml` (run from the repo root):

```toml
[mcp_servers.the-app]
command = "node"
args = ["mcp-server/index.js"]
```

## Demo queries

- "what does the win check do?" / "where is `parseId` used?" → `explain_code`
- "where is state stored?" → `where_is_state_stored`
- "what todos exist right now?" → `get_todos`