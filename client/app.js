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
  }, 4000)
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
    if (todo.completed) li.className = 'completed'

    const label = document.createElement('label')
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = todo.completed
    checkbox.addEventListener('change', () => toggle(todo.id, checkbox.checked))

    const span = document.createElement('span')
    span.textContent = todo.title

    label.appendChild(checkbox)
    label.appendChild(span)

    const del = document.createElement('button')
    del.textContent = '×'
    del.className = 'delete'
    del.addEventListener('click', () => remove(todo.id))

    li.appendChild(label)
    li.appendChild(del)
    list.appendChild(li)
  })

  const clearWrap = document.getElementById('clear-wrap')
  const hasCompleted = todos.some((t) => t.completed)
  clearWrap.hidden = !hasCompleted
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

async function toggle(id, completed) {
  try {
    await api(`/api/todos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    })
  } catch (err) {
    showError(`Could not update todo: ${err.message}`)
  }
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

document.getElementById('add-form').addEventListener('submit', (e) => {
  e.preventDefault()
  addTodo()
})
document.getElementById('clear-completed').addEventListener('click', clearCompleted)

refresh()