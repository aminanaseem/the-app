import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../server/app.js'
import { openDb } from '../server/db.js'

describe('todo API', () => {
  let app
  let db

  beforeEach(() => {
    db = openDb(':memory:')
    app = createApp(db)
  })

  it('starts with an empty list', async () => {
    const res = await request(app).get('/api/todos')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('adds a todo', async () => {
    const res = await request(app).post('/api/todos').send({ title: 'buy milk' })
    expect(res.status).toBe(201)
    expect(res.body.title).toBe('buy milk')
    expect(res.body.completed).toBe(false)
    expect(res.body.id).toBeGreaterThan(0)
  })

  it('rejects a blank title', async () => {
    const res = await request(app).post('/api/todos').send({ title: '   ' })
    expect(res.status).toBe(400)
  })

  it('rejects a title longer than 200 characters', async () => {
    const res = await request(app)
      .post('/api/todos')
      .send({ title: 'x'.repeat(201) })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('200')
  })

  it('accepts a title of exactly 200 characters', async () => {
    const res = await request(app).post('/api/todos').send({ title: 'y'.repeat(200) })
    expect(res.status).toBe(201)
  })

  it('completes a todo', async () => {
    const added = await request(app).post('/api/todos').send({ title: 'task' })
    const res = await request(app)
      .patch(`/api/todos/${added.body.id}`)
      .send({ completed: true })
    expect(res.status).toBe(200)
    expect(res.body.completed).toBe(true)
  })

  it('un-completes a todo', async () => {
    const added = await request(app).post('/api/todos').send({ title: 'task' })
    await request(app).patch(`/api/todos/${added.body.id}`).send({ completed: true })
    const res = await request(app)
      .patch(`/api/todos/${added.body.id}`)
      .send({ completed: false })
    expect(res.status).toBe(200)
    expect(res.body.completed).toBe(false)
  })

  it('deletes a todo', async () => {
    const added = await request(app).post('/api/todos').send({ title: 'task' })
    const res = await request(app).delete(`/api/todos/${added.body.id}`)
    expect(res.status).toBe(204)
    const list = await request(app).get('/api/todos')
    expect(list.body).toEqual([])
  })

  it('returns 404 when completing a missing todo', async () => {
    const res = await request(app).patch('/api/todos/999').send({ completed: true })
    expect(res.status).toBe(404)
  })

  it('returns 404 when deleting a missing todo', async () => {
    const res = await request(app).delete('/api/todos/999')
    expect(res.status).toBe(404)
  })

  it('returns 400 for a non-numeric id', async () => {
    const res = await request(app).patch('/api/todos/abc').send({ completed: true })
    expect(res.status).toBe(400)
  })
})