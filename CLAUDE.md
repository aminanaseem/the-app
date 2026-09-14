# CLAUDE.md

## Project
"THE APP" — a minimal todo list (add, complete, delete, persist) built and operated end-to-end via an agentic delivery loop.

## Stack
- Backend: Node.js + Express + SQLite (built-in `node:sqlite`), single `todos` table
- Frontend: plain HTML/JS served statically by Express
- Tests: Vitest + Supertest (unit tests for add/complete/delete/persist)
- CI: GitHub Actions (.github/workflows/ci.yml) — runs tests + build on every PR

## Repo Layout
- `/server` — Express API + SQLite
- `/client` — static frontend
- `/tests` — Vitest tests
- `/mcp-server` — MCP server (stdio) exposing get_todos / explain_code / where_is_state_stored
- `/agents` — scripts/prompts that drive the agentic loop
- `.github/workflows/ci.yml`

## Linear
- Team: THE APP (key: `THE`)
- Workflow statuses: Backlog, In Progress, In Review, Done
- Ticket state transitions:
  - On start: Backlog/Todo → In Progress
  - On PR opened: → In Review
  - On merge: → Done

## Delivery Loop Rules
1. Never push directly to main except for the initial scaffold commit.
2. Every change goes through: branch `<ticket-key>-<slug>` → implement with tests → run tests locally → commit → push → open PR titled with ticket key → move ticket to In Review.
3. Never merge your own PR. A second, independent agent invocation reviews the PR diff and posts a comment ending with exactly:
   - `VERDICT: APPROVE` or
   - `VERDICT: REQUEST_CHANGES`
4. Merge (squash) only when CI is green AND verdict is APPROVE, then move ticket to Done.
5. Exploration pass findings are filed as Linear tickets labeled `insight` — do not fix them.
6. Keep the app intentionally small: no auth, no extra frameworks unless a ticket requires it.

## Commands
- `npm install` — install dependencies
- `npm test` — run Vitest tests
- `npm run build` — build check
- `npm start` — run the server (port 3000)