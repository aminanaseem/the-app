import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const builtinSpec = 'node:sqlite'
const { DatabaseSync } = require(builtinSpec)

export function openDb(dbPath) {
  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  return db
}