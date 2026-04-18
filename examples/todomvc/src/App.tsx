import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useId,
  memo,
} from "tachys"
import type { VNode } from "tachys"

// --- Types ---

interface Todo {
  id: number
  title: string
  completed: boolean
}

type Filter = "all" | "active" | "completed"

// --- Context ---

interface TodoActions {
  toggle: (id: number) => void
  destroy: (id: number) => void
  edit: (id: number, title: string) => void
}

const ActionsCtx = createContext<TodoActions>({
  toggle: () => {},
  destroy: () => {},
  edit: () => {},
})

// --- Components ---

const TodoItem = memo(function TodoItem(props: {
  todo: Todo
  children?: VNode
}) {
  const { todo } = props
  const actions = useContext(ActionsCtx)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(todo.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [editing])

  const handleToggle = useCallback(() => actions.toggle(todo.id), [todo.id])
  const handleDestroy = useCallback(() => actions.destroy(todo.id), [todo.id])

  const handleDoubleClick = useCallback(() => {
    setEditing(true)
    setEditText(todo.title)
  }, [todo.title])

  const handleSubmit = useCallback(() => {
    const trimmed = editText.trim()
    if (trimmed) {
      actions.edit(todo.id, trimmed)
      setEditing(false)
    } else {
      actions.destroy(todo.id)
    }
  }, [editText, todo.id])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEditText(todo.title)
        setEditing(false)
      } else if (e.key === "Enter") {
        handleSubmit()
      }
    },
    [todo.title, handleSubmit],
  )

  const handleChange = useCallback((e: Event) => {
    setEditText((e.target as HTMLInputElement).value)
  }, [])

  const className = [
    todo.completed ? "completed" : "",
    editing ? "editing" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <li className={className || undefined}>
      <div className="view">
        <input
          className="toggle"
          type="checkbox"
          checked={todo.completed}
          onChange={handleToggle}
        />
        <label onDblClick={handleDoubleClick}>{todo.title}</label>
        <button className="destroy" onClick={handleDestroy} />
      </div>
      {editing && (
        <input
          ref={inputRef}
          className="edit"
          value={editText}
          onBlur={handleSubmit}
          onKeyDown={handleKeyDown}
          onInput={handleChange}
        />
      )}
    </li>
  )
})

function Header(props: { onAdd: (title: string) => void }) {
  const [text, setText] = useState("")
  const inputId = useId()

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        const trimmed = text.trim()
        if (trimmed) {
          props.onAdd(trimmed)
          setText("")
        }
      }
    },
    [text, props.onAdd],
  )

  const handleInput = useCallback((e: Event) => {
    setText((e.target as HTMLInputElement).value)
  }, [])

  return (
    <header className="header">
      <h1>todos</h1>
      <input
        id={inputId}
        className="new-todo"
        placeholder="What needs to be done?"
        value={text}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        autoFocus={true}
      />
    </header>
  )
}

function Footer(props: {
  count: number
  completedCount: number
  filter: Filter
  onFilter: (f: Filter) => void
  onClearCompleted: () => void
}) {
  const { count, completedCount, filter, onFilter, onClearCompleted } = props
  const itemWord = count === 1 ? "item" : "items"

  return (
    <footer className="footer">
      <span className="todo-count">
        <strong>{count}</strong> {itemWord} left
      </span>
      <ul className="filters">
        <li>
          <a
            className={filter === "all" ? "selected" : undefined}
            href="#/"
            onClick={(e: Event) => {
              e.preventDefault()
              onFilter("all")
            }}
          >
            All
          </a>
        </li>
        <li>
          <a
            className={filter === "active" ? "selected" : undefined}
            href="#/active"
            onClick={(e: Event) => {
              e.preventDefault()
              onFilter("active")
            }}
          >
            Active
          </a>
        </li>
        <li>
          <a
            className={filter === "completed" ? "selected" : undefined}
            href="#/completed"
            onClick={(e: Event) => {
              e.preventDefault()
              onFilter("completed")
            }}
          >
            Completed
          </a>
        </li>
      </ul>
      {completedCount > 0 && (
        <button className="clear-completed" onClick={onClearCompleted}>
          Clear completed
        </button>
      )}
    </footer>
  )
}

// --- App ---

let nextId = 1

export function App() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [filter, setFilter] = useState<Filter>("all")

  const addTodo = useCallback((title: string) => {
    setTodos((prev: Todo[]) => [...prev, { id: nextId++, title, completed: false }])
  }, [])

  const actions: TodoActions = useMemo(
    () => ({
      toggle: (id: number) =>
        setTodos((prev: Todo[]) =>
          prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
        ),
      destroy: (id: number) =>
        setTodos((prev: Todo[]) => prev.filter((t) => t.id !== id)),
      edit: (id: number, title: string) =>
        setTodos((prev: Todo[]) =>
          prev.map((t) => (t.id === id ? { ...t, title } : t)),
        ),
    }),
    [],
  )

  const activeCount = useMemo(
    () => todos.filter((t) => !t.completed).length,
    [todos],
  )
  const completedCount = todos.length - activeCount

  const filteredTodos = useMemo(() => {
    switch (filter) {
      case "active":
        return todos.filter((t) => !t.completed)
      case "completed":
        return todos.filter((t) => t.completed)
      default:
        return todos
    }
  }, [todos, filter])

  const toggleAll = useCallback(() => {
    const allCompleted = todos.every((t) => t.completed)
    setTodos((prev: Todo[]) => prev.map((t) => ({ ...t, completed: !allCompleted })))
  }, [todos])

  const clearCompleted = useCallback(() => {
    setTodos((prev: Todo[]) => prev.filter((t) => !t.completed))
  }, [])

  return (
    <ActionsCtx.Provider value={actions}>
      <Header onAdd={addTodo} />
      {todos.length > 0 && (
        <section className="main">
          <input
            id="toggle-all"
            className="toggle-all"
            type="checkbox"
            checked={activeCount === 0}
            onChange={toggleAll}
          />
          <label htmlFor="toggle-all">Mark all as complete</label>
          <ul className="todo-list">
            {filteredTodos.map((todo) => (
              <TodoItem key={todo.id} todo={todo} />
            ))}
          </ul>
        </section>
      )}
      {todos.length > 0 && (
        <Footer
          count={activeCount}
          completedCount={completedCount}
          filter={filter}
          onFilter={setFilter}
          onClearCompleted={clearCompleted}
        />
      )}
    </ActionsCtx.Provider>
  )
}
