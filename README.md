# THE APP

A minimal **todo list** (add, complete, delete, persist) built and operated end-to-end by an **agentic delivery loop**: Linear <-> GitHub <-> CI <-> AI Agents <-> MCP.

The todo app is intentionally trivial. The real engineering effort is the delivery pipeline that surrounds it: agents that plan, code, review, and ship changes with minimal human intervention.

## How the loop runs end to end

The loop is driven by six roles, each backed by an AI agent invocation:

1. **Planner agent** -- Reads a spec (or is prompted directly), breaks it into discrete work items, and creates Linear tickets in the **Backlog** state.

2. **Coder agent** -- Picks a ticket from Backlog, moves it to **In Progress** via the Linear MCP server, creates a branch named `<ticket-key>-<slug>`, implements the change with tests, runs `npm test` locally, commits, pushes, and opens a PR titled with the ticket key. Moves the ticket to **In Review**.

3. **CI (GitHub Actions)** -- On every PR and push to `main`, `.github/workflows/ci.yml` runs `npm ci`, `npm test`, and `npm run build` on Ubuntu with Node 24.

4. **Reviewer agent** -- A separate agent invocation fetches the PR diff, reviews the code, and posts a comment on the PR ending with exactly `VERDICT: APPROVE` or `VERDICT: REQUEST_CHANGES`. **This is the coder/reviewer split -- two independent agent invocations that cannot see each other's context.**

5. **Merge agent** -- Squash-merges the PR only when CI is green AND the reviewer posted APPROVE. Moves the ticket to **Done**.

6. **Explorer agent** -- Scans the repo for architectural observations, test gaps, and improvement ideas. Files findings as Linear tickets labeled `insight` (does not fix them).

The entire loop is orchestrated through the Linear MCP server and the two context files (`CLAUDE.md`, `AGENTS.md`) that load delivery rules into every agent session.

## Agents and MCP servers

### Agents used

| Agent | Role | How it works |
|-------|------|--------------|
| Planner | Creates Linear tickets | Prompted with spec, uses `create_issue` tool via MCP |
| Coder | Implements tickets, opens PRs | Reads tickets via `list_issues`/`get_issue`, writes code, pushes, opens PR |
| Reviewer | Reviews PRs, posts verdicts | Independent invocation, reads PR diff, posts comment via `add_issue_comment` |
| Merge | Squash-merges when approved | Checks CI status + verdict, merges, moves ticket to Done |
| Explorer | Files insight tickets | Scans repo, creates tickets via `create_issue` with `insight` label |

All agent interactions with Linear go through the MCP servers below -- no agent hard-codes GraphQL queries.

### MCP servers

**1. App MCP server** (`mcp-server/index.js`)

Exposes the application's runtime state and codebase to agents over stdio JSON-RPC:

| Tool | Description |
|------|-------------|
| `get_todos()` | Reads the SQLite database directly and lists all todos |
| `explain_code(query)` | Regex search over `server/`, `client/`, `tests/`, `mcp-server/` -- returns file + line + snippet |
| `where_is_state_stored()` | Reports the SQLite file path, table schema, and row count |

**2. Linear MCP server** (`mcp-server/linear/`)

Exposes the Linear workspace (issues, projects, comments, workflow transitions) over stdio JSON-RPC. Built with `@modelcontextprotocol/sdk` and `zod` for input validation.

| Tool | Description |
|------|-------------|
| `list_issues` | List issues, optionally filtered by state, label, or limit |
| `get_issue` | Fetch a single issue by identifier (e.g. `THE-5`) or UUID |
| `create_issue` | Create an issue with title, description, team, state, and labels |
| `update_issue` | Update title, description, state, or labels |
| `update_issue_status` | Move an issue through the workflow (Backlog -> In Progress -> In Review -> Done) |
| `add_issue_comment` | Add a comment to an issue (used for review verdicts) |
| `list_projects` | List org-level Linear projects |
| `get_project` | Get a project by UUID or name |

The Linear server authenticates via the `LINEAR_API_KEY` environment variable (see `.env.example`). The reusable `LinearClient` class in `linear-client.js` is independently unit-tested with mocked fetch.

**3. Agent CLI client** (`agents/linear.mjs`)

A thin stdio MCP client that spawns the Linear MCP server as a child process and drives it over JSON-RPC. Provides `list`, `create`, `state`, `get` commands -- useful for quick agent-to-linear interactions without a full LLM session.

## Connecting MCP servers to Claude Code and Codex

### Claude Code

The project-scoped `.mcp.json` at the repo root is auto-loaded by Claude Code when you open the project:

```json
{
  "mcpServers": {
    "the-app": { "command": "node", "args": ["mcp-server/index.js"] },
    "the-app-linear": { "command": "node", "args": ["mcp-server/linear/index.js"] }
  }
}
```

Or register manually:

```bash
claude mcp add the-app --scope project -- node mcp-server/index.js
claude mcp add the-app-linear --scope project -- node mcp-server/linear/index.js
```

Before starting a Claude Code session, export the Linear API key so the child process inherits it:

```bash
export LINEAR_API_KEY=lin_api_xxx
export LINEAR_TEAM_KEY=THE   # optional, defaults to THE
```

If your client does not inherit environment variables, add them per-server in `.mcp.json`:

```json
"the-app-linear": {
  "command": "node",
  "args": ["mcp-server/linear/index.js"],
  "env": { "LINEAR_API_KEY": "lin_api_xxx" }
}
```

### Codex

Add to Codex's `config.toml`:

```toml
[mcp_servers.the-app]
command = "node"
args = ["mcp-server/index.js"]

[mcp_servers.the-app-linear]
command = "node"
args = ["mcp-server/linear/index.js"]
```

Same `LINEAR_API_KEY` requirement applies -- export before launching Codex.

## Quick start

```bash
npm install
npm test
npm start        # http://localhost:3000
```

## API

| Method | Route            | Description                    |
|--------|------------------|--------------------------------|
| GET    | `/api/todos`     | List all todos                 |
| POST   | `/api/todos`     | Add a todo `{ title }`         |
| PATCH  | `/api/todos/:id` | Set `{ completed }` (boolean)  |
| DELETE | `/api/todos/:id` | Delete a todo                  |

## Stack

- **Backend**: Node.js >= 18 + Express 4.x + SQLite (`node:sqlite` built-in), single `todos` table with WAL journaling
- **Frontend**: One static HTML/JS page served by Express
- **Tests**: Vitest 2.x + Supertest 7.x (API operations + persistence)
- **MCP**: `@modelcontextprotocol/sdk` 1.12.x + Zod 3.24.x (stdio transport)
- **Linear integration**: Custom GraphQL client (`linear-client.js`), unit-tested with mocked fetch
- **CI**: GitHub Actions (Ubuntu, Node 24) -- `npm ci` / `npm test` / `npm run build`

## Deviation notes

### `node:sqlite` instead of `better-sqlite3`

The original plan used `better-sqlite3` as the SQLite driver. The implementation switched to **`node:sqlite`**, the built-in Node.js SQLite module (available since Node 22, experimental in 18+). Reasons:

- **Zero external dependencies** -- `node:sqlite` is built into Node.js, eliminating the `better-sqlite3` native compile step and its `node-gyp` / prebuild chain.
- **Simpler CI** -- No native build toolchain needed on the runner (no `python`, `make`, or C++ compiler issues).
- **Synchronous API** -- `node:sqlite`'s `DatabaseSync` class provides the same synchronous, blocking API that `better-sqlite3` is known for, so the code reads identically.
- **Tradeoff** -- Requires Node >= 18 (CI runs Node 24). The `node:sqlite` module is marked experimental but has been stable for the patterns used here (CRUD on a single table).

### Agent scripts as thin MCP clients

Rather than building a full agent orchestration framework, agent scripts (`agents/linear.mjs`) are thin MCP clients that spawn the Linear MCP server and drive it over JSON-RPC. This keeps the agent layer decoupled -- you can swap in a different LLM or orchestration tool without changing the MCP servers.

### Minimal test scope

Tests cover API operations (add/complete/delete/bulk-delete/validation) and database persistence (WAL journaling, file-backed reopen) but do not test the frontend. The frontend is intentionally untested to keep the scope small and focused on the delivery loop.

## Stretch goals status

### Done

- **Reviewer/coder split as the "second specialized agent"** -- The coder and reviewer are separate agent invocations with no shared context. The coder implements changes; the reviewer independently evaluates the PR diff and posts a verdict. This satisfies the stretch goal of having a second specialized agent in the loop.

### Not done

- **Permission gating (human approval before merge/delete)** -- The merge agent currently merges automatically when CI is green + APPROVE verdict. There is no human-in-the-loop checkpoint (e.g. a Linear comment or GitHub PR approval gate) that blocks merging until a human explicitly approves. Similarly, bulk-delete of completed todos has no confirmation step.

- **Cross-session memory** -- `CLAUDE.md` and `AGENTS.md` give agents static project context that persists across sessions, but there is no mechanism where agents record decisions, rationale, or learnings from one session into a file that the next session picks up. A concrete improvement would be appending a `MEMORY.md` line per PR (e.g. "THE-7: chose node:sqlite over better-sqlite3 to avoid native deps") so future agent sessions have decision history.

## Repo layout

```
the-app/
  .env.example             # LINEAR_API_KEY / LINEAR_TEAM_KEY template
  .github/workflows/ci.yml # GitHub Actions CI
  .gitignore               # node_modules/, data/, .env, etc.
  .mcp.json                # MCP server registration (Claude Code auto-loads)
  AGENTS.md                # Agent context (mirrors CLAUDE.md)
  CLAUDE.md                # Claude Code project memory
  package.json             # Root package
  README.md                # This file
  vitest.config.js         # Vitest config (externalizes node:sqlite)
  agents/
    linear.mjs             # CLI MCP client for Linear
  client/
    app.js                 # Frontend JS (fetch API, renders todo list)
    index.html             # Single HTML page
    style.css              # Minimal CSS
  data/
    todos.db               # SQLite database (runtime, gitignored)
  mcp-server/
    index.js               # App MCP server (get_todos, explain_code, where_is_state_stored)
    README.md              # App MCP server docs
    package.json           # MCP app server package
    linear/
      index.js             # Linear MCP server (8 tools, stdio)
      linear-client.js     # Reusable Linear GraphQL client
      README.md            # Linear MCP server docs
      package.json         # Linear MCP server package
      tests/
        linear-client.test.js  # Unit tests for LinearClient
        smoke.test.js          # MCP protocol smoke tests
        integration.test.js    # Live integration tests (auto-skip without API key)
  server/
    app.js                 # Express app factory (CRUD routes)
    db.js                  # SQLite setup via node:sqlite (WAL, DDL)
    index.js               # Server entrypoint (creates db, app, listens on :3000)
  tests/
    api.test.js            # API tests
    persist.test.js        # Persistence tests
```
