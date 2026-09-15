import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const builtinSpec = 'node:sqlite'
const { DatabaseSync } = require(builtinSpec)

export function openDb(dbPath) {
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_started',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    )
  `)
  migrate(db)
  return db
}

function migrate(db) {
  const cols = db.prepare('PRAGMA table_info(todos)').all().map((c) => c.name)
  const hadLegacyCompleted = cols.includes('completed')
  if (!cols.includes('status')) {
    db.exec("ALTER TABLE todos ADD COLUMN status TEXT NOT NULL DEFAULT 'not_started'")
  }
  if (!cols.includes('completed_at')) {
    db.exec('ALTER TABLE todos ADD COLUMN completed_at TEXT')
  }
  if (hadLegacyCompleted) {
    db.exec("UPDATE todos SET status = 'not_started' WHERE completed = 0 AND status = 'completed'")
    db.exec("UPDATE todos SET status = 'completed' WHERE completed = 1 AND status != 'completed'")
    db.exec("UPDATE todos SET completed_at = created_at WHERE status = 'completed' AND completed_at IS NULL")
  }
}