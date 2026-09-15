import express from 'express'

const VALID_STATUSES = ['not_started', 'in_progress', 'completed']
const COMPLETED_RETENTION_DAYS = 10

export function createApp(db) {
  const app = express()
  app.use(express.json())
  app.use(express.static('client'))

  app.get('/api/todos', (req, res) => {
    expireCompleted(db)
    const rows = db
      .prepare('SELECT * FROM todos ORDER BY created_at DESC, id DESC')
      .all()
    res.json(rows.map(toTodo))
  })

  app.post('/api/todos', (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
    if (!title) {
      return res.status(400).json({ error: 'title is required' })
    }
    if (title.length > 200) {
      return res.status(400).json({ error: 'title must be at most 200 characters' })
    }
    let status = req.body?.status
    if (status === undefined) status = 'not_started'
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'status must be not_started, in_progress, or completed' })
    }
    const completedAt = status === 'completed' ? now() : null
    const info = db
      .prepare('INSERT INTO todos (title, status, completed_at) VALUES (?, ?, ?)')
      .run(title, status, completedAt)
    const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(info.lastInsertRowid)
    res.status(201).json(toTodo(row))
  })

  app.patch('/api/todos/:id', (req, res) => {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'invalid id' })
    }
    const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(id)
    if (!row) {
      return res.status(404).json({ error: 'todo not found' })
    }
    const body = req.body || {}
    const hasCompleted = 'completed' in body
    const hasStatus = 'status' in body

    let status = row.status
    let completedAt = row.completed_at

    if (hasStatus) {
      if (!VALID_STATUSES.includes(body.status)) {
        return res.status(400).json({ error: 'status must be not_started, in_progress, or completed' })
      }
      status = body.status
      completedAt = status === 'completed' ? (row.completed_at || now()) : null
    }

    if (hasCompleted) {
      if (typeof body.completed !== 'boolean') {
        return res.status(400).json({ error: 'completed must be a boolean' })
      }
      status = body.completed ? 'completed' : 'not_started'
      completedAt = body.completed ? (row.completed_at || now()) : null
    }

    if (!hasStatus && !hasCompleted) {
      status = row.status === 'completed' ? 'not_started' : 'completed'
      completedAt = status === 'completed' ? now() : null
    }

    db.prepare('UPDATE todos SET status = ?, completed_at = ? WHERE id = ?').run(status, completedAt, id)
    const updated = db.prepare('SELECT * FROM todos WHERE id = ?').get(id)
    res.json(toTodo(updated))
  })

  app.delete('/api/todos', (req, res) => {
    if (req.query.scope !== 'completed') {
      return res.status(400).json({ error: 'unsupported scope; use ?scope=completed' })
    }
    db.prepare("DELETE FROM todos WHERE status = 'completed'").run()
    res.status(204).end()
  })

  app.delete('/api/todos/:id', (req, res) => {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'invalid id' })
    }
    const info = db.prepare('DELETE FROM todos WHERE id = ?').run(id)
    if (info.changes === 0) {
      return res.status(404).json({ error: 'todo not found' })
    }
    res.status(204).end()
  })

  return app
}

function expireCompleted(db) {
  db.prepare(
    `DELETE FROM todos WHERE status = 'completed' AND completed_at IS NOT NULL AND completed_at <= datetime('now', ?)`
  ).run(`-${COMPLETED_RETENTION_DAYS} days`)
}

function now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function parseId(raw) {
  if (typeof raw !== 'string' || !/^[0-9]+$/.test(raw)) {
    return null
  }
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function toTodo(row) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    completed: row.status === 'completed',
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
  }
}