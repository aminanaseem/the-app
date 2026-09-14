# THE APP

A minimal **todo list** (add, complete, delete, persist) built and operated end-to-end by an **agentic delivery loop**: Linear ↔ GitHub ↔ CI ↔ AI Agents ↔ MCP.

## How the loop runs end to end

1. A **Planner agent** turns specs into Linear tickets.
2. A **Coder agent** picks a ticket from Backlog, moves it to **In Progress**, implements it on a branch `<ticket-key>-<slug>`, pushes, opens a PR (titled with the ticket key), and moves the ticket to **In Review**.
3. **CI** (GitHub Actions) runs tests + build on every PR.
4. A **Reviewer agent** fetches the PR diff, reviews it, and posts a comment ending in `VERDICT: APPROVE` or `VERDICT: REQUEST_CHANGES`.
5. A **Merge agent** (human-gated here) squash-merges only when CI is green and the verdict is APPROVE, then moves the ticket to **Done**.
6. An **Explorer agent** scans the repo and files discoveries back to Linear as `insight` tickets.

## Stack

- **Backend**: Node.js + Express + SQLite (`better-sqlite3`), single `todos` table
- **Frontend**: one static HTML/JS page
- **Tests**: Vitest + Supertest
- **CI**: `.github/workflows/ci.yml`

## Quick start

```bash
npm install
npm test
npm start        # http://localhost:3000
```

## API

| Method | Route           | Description                 |
|--------|-----------------|-----------------------------|
| GET    | `/api/todos`    | List all todos             |
| POST   | `/api/todos`    | Add a todo `{ title }`     |
| PATCH  | `/api/todos/:id`| Set `{ completed }`        |
| DELETE | `/api/todos/:id`| Delete a todo              |

## MCP server

See `mcp-server/README.md` for registering it with Claude Code and Codex.

## Agents

- `agents/` holds the prompts/scripts that drive the loop.
- Documents at the repo root (`CLAUDE.md`, `AGENTS.md`) load this context automatically in future sessions.