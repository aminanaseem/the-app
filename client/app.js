const STATUS_META = {
  not_started: { label: 'Not started', color: '#64748b' },
  in_progress: { label: 'In progress', color: '#d97706' },
  completed: { label: 'Completed', color: '#16a34a' },
}
const STATUSES = Object.keys(STATUS_META)
const RETENTION_DAYS = 10

async function api(path, options) {
  const res = await fetch(path, options)
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body && body.error) message = body.error
    } catch {
      // keep fallback message
    }
    throw new Error(message)
  }
  if (res.status === 204) return null
  return res.json()
}

function showError(message) {
  const banner = document.getElementById('error-banner')
  banner.textContent = message
  banner.hidden = false
  clearTimeout(showError._timer)
  showError._timer = setTimeout(() => {
    banner.hidden = true
  }, 5000)
}

function formatDate(iso) {
  if (!iso) return ''
  const normalized = iso.length === 19 && iso.includes(' ') ? iso.replace(' ', 'T') + 'Z' : iso
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(d)
}

function createStatusSelect(todo, onChange) {
  const select = document.createElement('select')
  select.className = 'status-select'
  select.dataset.status = todo.status
  select.setAttribute('aria-label', 'Status')
  for (const status of STATUSES) {
    const opt = document.createElement('option')
    opt.value = status
    opt.textContent = STATUS_META[status].label
    opt.selected = status === todo.status
    select.appendChild(opt)
  }
  select.addEventListener('change', () => {
    select.dataset.status = select.value
    onChange(select.value)
  })
  return select
}

async function setStatus(id, status) {
  try {
    await api(`/api/todos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
  } catch (err) {
    showError(`Could not update status: ${err.message}`)
  }
  refresh()
}

async function refresh() {
  let todos
  try {
    todos = await api('/api/todos')
  } catch (err) {
    showError(`Could not load todos: ${err.message}`)
    return
  }

  const list = document.getElementById('todo-list')
  list.innerHTML = ''
  todos.forEach((todo) => {
    const li = document.createElement('li')
    li.className = 'todo-item'
    li.dataset.status = todo.status

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.className = 'todo-check'
    checkbox.checked = todo.completed
    checkbox.setAttribute('aria-label', 'Mark completed')
    checkbox.addEventListener('change', () => {
      setStatus(todo.id, checkbox.checked ? 'completed' : 'not_started')
    })

    const body = document.createElement('div')
    body.className = 'todo-body'
    const title = document.createElement('span')
    title.className = 'todo-title'
    title.textContent = todo.title
    body.appendChild(title)

    const meta = document.createElement('div')
    meta.className = 'todo-meta'
    const created = document.createElement('time')
    created.textContent = `Added ${formatDate(todo.createdAt)}`
    meta.appendChild(created)
    if (todo.status === 'completed') {
      const done = document.createElement('time')
      done.textContent = `Done ${formatDate(todo.completedAt)}`
      meta.appendChild(done)
    }
    body.appendChild(meta)

    const actions = document.createElement('div')
    actions.className = 'todo-actions'
    const select = createStatusSelect(todo, (status) => setStatus(todo.id, status))
    const del = document.createElement('button')
    del.textContent = '×'
    del.className = 'delete-btn'
    del.setAttribute('aria-label', 'Delete')
    del.addEventListener('click', () => remove(todo.id))
    actions.appendChild(select)
    actions.appendChild(del)

    li.appendChild(checkbox)
    li.appendChild(body)
    li.appendChild(actions)
    list.appendChild(li)
  })

  const open = todos.filter((t) => t.status === 'not_started').length
  const progress = todos.filter((t) => t.status === 'in_progress').length
  const done = todos.filter((t) => t.status === 'completed').length
  document.getElementById('count-open').textContent = open
  document.getElementById('count-progress').textContent = progress
  document.getElementById('count-done').textContent = done

  document.getElementById('empty-state').hidden = todos.length > 0
  document.getElementById('app-footer').hidden = todos.length === 0

  const retention = document.getElementById('retention-note')
  retention.textContent = done > 0 ? `Completed tasks are removed after ${RETENTION_DAYS} days.` : ''
}

async function addTodo() {
  const input = document.getElementById('new-todo')
  const title = input.value.trim()
  if (!title) return
  try {
    await api('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
  } catch (err) {
    showError(`Could not add todo: ${err.message}`)
  }
  input.value = ''
  refresh()
}

async function remove(id) {
  try {
    await api(`/api/todos/${id}`, { method: 'DELETE' })
  } catch (err) {
    showError(`Could not delete todo: ${err.message}`)
  }
  refresh()
}

async function clearCompleted() {
  try {
    await api('/api/todos?scope=completed', { method: 'DELETE' })
  } catch (err) {
    showError(`Could not clear completed: ${err.message}`)
  }
  refresh()
}

async function clearAll() {
  try {
    const todos = await api('/api/todos')
    for (const t of todos) await api(`/api/todos/${t.id}`, { method: 'DELETE' })
  } catch (err) {
    showError(`Could not clear all: ${err.message}`)
  }
  refresh()
}

document.getElementById('add-form').addEventListener('submit', (e) => {
  e.preventDefault()
  addTodo()
})
document.getElementById('clear-completed').addEventListener('click', clearCompleted)
document.getElementById('clear-all').addEventListener('click', clearAll)

refresh()