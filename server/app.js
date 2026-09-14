import express from 'express'

export function createApp(db) {
  const app = express()
  app.use(express.json())
  app.use(express.static('client'))

  app.get('/api/todos', (req, res) => {
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
    const info = db.prepare('INSERT INTO todos (title) VALUES (?)').run(title)
    const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(info.lastInsertRowid)
    res.status(201).json(toTodo(row))
  })

  app.patch('/api/todos/:id', (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'invalid id' })
    }
    const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(id)
    if (!row) {
      return res.status(404).json({ error: 'todo not found' })
    }
    const hasCompleted = req.body && 'completed' in req.body
    let completed
    if (!hasCompleted) {
      completed = !Boolean(row.completed)
    } else if (typeof req.body.completed === 'boolean') {
      completed = req.body.completed
    } else {
      return res.status(400).json({ error: 'completed must be a boolean' })
    }
    db.prepare('UPDATE todos SET completed = ? WHERE id = ?').run(completed ? 1 : 0, id)
    const updated = db.prepare('SELECT * FROM todos WHERE id = ?').get(id)
    res.json(toTodo(updated))
  })

  app.delete('/api/todos/:id', (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) {
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

function toTodo(row) {
  return {
    id: row.id,
    title: row.title,
    completed: Boolean(row.completed),
    createdAt: row.created_at,
  }
}