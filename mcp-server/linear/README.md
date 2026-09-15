# the-app Linear MCP server

A stdio-transport MCP server exposing the Linear integration (`mcp-server/linear/`) to LLM agents
(Claude Code, Codex, etc.). It lets agents read and drive the THE APP Linear workspace without
hard-coding GraphQL queries in each agent script.

## What it does

All Linear operations go through Linear's GraphQL API (`https://api.linear.app/graphql`). The
server exposes eight tools:

| Tool | Description | Key args |
|------|-------------|----------|
| `list_issues` | List issues for the THE APP team | `state`, `label`, `limit` |
| `get_issue` | Fetch one issue by identifier (e.g. `THE-5`) or UUID | `id` |
| `create_issue` | Create an issue (state defaults to Backlog; labels created if missing) | `title`, `description`, `stateName`, `labels` |
| `update_issue` | Update title / description / state / labels of an existing issue | `id`, `title`, `description`, `stateName`, `labels` |
| `update_issue_status` | Move an issue through the workflow | `id`, `status` |
| `add_issue_comment` | Comment on an issue (used for PR review verdicts) | `id`, `body` |
| `list_projects` | List org projects | — |
| `get_project` | Get a project by UUID or name | `id` |

Workflow states are resolved by name: `Backlog`, `In Progress`, `In Review`, `Done` (plus any
other state on the team), and the tool arguments/team scope default to `THE` / `LINEAR_TEAM_KEY`.

## Auth

Authentication uses a Linear API key passed via the `LINEAR_API_KEY` environment variable —
never commit a real key. The server exits with a clear error if the key is missing.

```bash
# copy .env.example to .env, fill in your key, then export it
export LINEAR_API_KEY=lin_api_xxx
export LINEAR_TEAM_KEY=THE   # optional, defaults to THE
```

## Run

```bash
npm install   # inside mcp-server/linear/
node index.js # stdio transport; run from the repo root
```

Test (unit + MCP smoke, no network; integration tests auto-skip unless `LINEAR_API_KEY` is set):

```bash
npx vitest run          # unit + smoke
LINEAR_API_KEY=... npx vitest run   # also runs live integration tests (cleans up after itself)
```

## How agents use it

`agents/linear.mjs` is a thin stdio **MCP client**: it spawns this server and drives the same
commands it used to implement directly (list / create / state / get) over JSON-RPC.

```bash
node agents/linear.mjs list
node agents/linear.mjs list --state "In Review"
node agents/linear.mjs create "Fix the widget" --desc "..." --label chore --state Backlog
node agents/linear.mjs state THE-9 "In Progress"
node agents/linear.mjs get THE-9
```

## Register with Claude Code / Codex

A project-scoped entry is already committed in `.mcp.json` (run from the repo root):

```json
{
  "mcpServers": {
    "the-app": { "command": "node", "args": ["mcp-server/index.js"] },
    "the-app-linear": { "command": "node", "args": ["mcp-server/linear/index.js"] }
  }
}
```

Export `LINEAR_API_KEY` before starting your agent shell so the child process inherits it. If your
client does not inherit the environment, add it per-server instead (never commit the value):

```json
"the-app-linear": {
  "command": "node",
  "args": ["mcp-server/linear/index.js"],
  "env": { "LINEAR_API_KEY": "lin_api_xxx" }
}
```

Codex `config.toml`:

```toml
[mcp_servers.the-app-linear]
command = "node"
args = ["mcp-server/linear/index.js"]
```

## Example tool calls

List in-review tickets:

```json
{ "name": "list_issues", "arguments": { "state": "In Review" } }
```

Move a ticket through the workflow (Backlog → In Progress → In Review → Done):

```json
{ "name": "update_issue_status", "arguments": { "id": "THE-9", "status": "In Review" } }
```

Post a review verdict:

```json
{ "name": "add_issue_comment", "arguments": { "id": "THE-9", "body": "LGTM - VERDICT: APPROVE" } }
```

Internal structure: `linear-client.js` is the reusable Linear GraphQL client (also unit-tested);
`index.js` wires it to MCP tools.