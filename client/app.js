async function refresh() {
  const res = await fetch('/api/todos')
  const todos = await res.json()
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
}

async function addTodo() {
  const input = document.getElementById('new-todo')
  const title = input.value.trim()
  if (!title) return
  await fetch('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  input.value = ''
  refresh()
}

async function toggle(id, completed) {
  await fetch(`/api/todos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed }),
  })
  refresh()
}

async function remove(id) {
  await fetch(`/api/todos/${id}`, { method: 'DELETE' })
  refresh()
}

document.getElementById('add-form').addEventListener('submit', (e) => {
  e.preventDefault()
  addTodo()
})

refresh()