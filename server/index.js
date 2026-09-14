import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { openDb } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
fs.mkdirSync(dataDir, { recursive: true })

const db = openDb(path.join(dataDir, 'todos.db'))

const app = createApp(db)
const port = process.env.PORT || 3000

app.listen(port, () => {
  console.log(`the-app server listening on http://localhost:${port}`)
})