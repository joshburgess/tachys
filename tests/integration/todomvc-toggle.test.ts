import { describe, expect, it } from "vitest"
import {
  createContext,
  flushUpdates,
  h,
  memo,
  mount,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "../../src/index"
import { jsxDEV } from "../../src/jsx-dev-runtime"
import type { VNode } from "../../src/vnode"

describe("TodoMVC toggle repro - exact app structure", () => {
  interface Todo {
    id: number
    title: string
    completed: boolean
  }

  interface TodoActions {
    toggle: (id: number) => void
    destroy: (id: number) => void
    edit: (id: number, title: string) => void
  }

  it("should keep both todos visible after toggling one (exact TodoMVC structure)", () => {
    const ActionsCtx = createContext<TodoActions>({
      toggle: () => {},
      destroy: () => {},
      edit: () => {},
    })

    let triggerAdd: (title: string) => void
    let triggerToggle: (id: number) => void

    // Exact TodoItem from the real app
    const TodoItem = memo(function TodoItem(props: { todo: Todo; children?: VNode }) {
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

      const className = [todo.completed ? "completed" : "", editing ? "editing" : ""]
        .filter(Boolean)
        .join(" ")

      // Exact same JSX transform output as Vite produces
      return jsxDEV(
        "li",
        {
          className: className || undefined,
          children: [
            jsxDEV(
              "div",
              {
                className: "view",
                children: [
                  jsxDEV(
                    "input",
                    {
                      className: "toggle",
                      type: "checkbox",
                      checked: todo.completed,
                      onChange: handleToggle,
                    },
                    undefined,
                    false,
                  ),
                  jsxDEV(
                    "label",
                    {
                      onDblClick: handleDoubleClick,
                      children: todo.title,
                    },
                    undefined,
                    false,
                  ),
                  jsxDEV(
                    "button",
                    {
                      className: "destroy",
                      onClick: handleDestroy,
                    },
                    undefined,
                    false,
                  ),
                ],
              },
              undefined,
              true,
            ),
            editing &&
              jsxDEV(
                "input",
                {
                  ref: inputRef,
                  className: "edit",
                  value: editText,
                  onBlur: handleSubmit,
                  onKeyDown: handleKeyDown,
                  onInput: handleChange,
                },
                undefined,
                false,
              ),
          ],
        },
        undefined,
        true,
      )
    })

    // Exact Header
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

      return jsxDEV(
        "header",
        {
          className: "header",
          children: [
            jsxDEV("h1", { children: "todos" }, undefined, false),
            jsxDEV(
              "input",
              {
                id: inputId,
                className: "new-todo",
                placeholder: "What needs to be done?",
                value: text,
                onKeyDown: handleKeyDown,
                onInput: handleInput,
                autoFocus: true,
              },
              undefined,
              false,
            ),
          ],
        },
        undefined,
        true,
      )
    }

    // Exact Footer
    function Footer(props: {
      count: number
      completedCount: number
      filter: string
      onClearCompleted: () => void
    }) {
      const { count, completedCount, filter, onClearCompleted } = props
      const itemWord = count === 1 ? "item" : "items"

      return jsxDEV(
        "footer",
        {
          className: "footer",
          children: [
            jsxDEV(
              "span",
              {
                className: "todo-count",
                children: [
                  jsxDEV("strong", { children: count }, undefined, false),
                  ` ${itemWord} left`,
                ],
              },
              undefined,
              true,
            ),
            jsxDEV(
              "ul",
              {
                className: "filters",
                children: [
                  jsxDEV(
                    "li",
                    {
                      children: jsxDEV(
                        "a",
                        {
                          className: filter === "all" ? "selected" : undefined,
                          href: "#/",
                          children: "All",
                        },
                        undefined,
                        false,
                      ),
                    },
                    undefined,
                    false,
                  ),
                  jsxDEV(
                    "li",
                    {
                      children: jsxDEV(
                        "a",
                        {
                          className: filter === "active" ? "selected" : undefined,
                          href: "#/active",
                          children: "Active",
                        },
                        undefined,
                        false,
                      ),
                    },
                    undefined,
                    false,
                  ),
                  jsxDEV(
                    "li",
                    {
                      children: jsxDEV(
                        "a",
                        {
                          className: filter === "completed" ? "selected" : undefined,
                          href: "#/completed",
                          children: "Completed",
                        },
                        undefined,
                        false,
                      ),
                    },
                    undefined,
                    false,
                  ),
                ],
              },
              undefined,
              true,
            ),
            completedCount > 0 &&
              jsxDEV(
                "button",
                {
                  className: "clear-completed",
                  onClick: onClearCompleted,
                  children: "Clear completed",
                },
                undefined,
                false,
              ),
          ],
        },
        undefined,
        true,
      )
    }

    let nextId = 1

    function App() {
      const [todos, setTodos] = useState<Todo[]>([])
      const [filter, setFilter] = useState<string>("all")

      triggerAdd = useCallback((title: string) => {
        setTodos((prev: Todo[]) => [...prev, { id: nextId++, title, completed: false }])
      }, [])

      const actions: TodoActions = useMemo(
        () => ({
          toggle: (id: number) =>
            setTodos((prev: Todo[]) =>
              prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
            ),
          destroy: (id: number) => setTodos((prev: Todo[]) => prev.filter((t) => t.id !== id)),
          edit: (id: number, title: string) =>
            setTodos((prev: Todo[]) => prev.map((t) => (t.id === id ? { ...t, title } : t))),
        }),
        [],
      )

      triggerToggle = useCallback((id: number) => actions.toggle(id), [actions])

      const activeCount = useMemo(() => todos.filter((t) => !t.completed).length, [todos])
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

      // Exact same JSX transform output as Vite produces
      return jsxDEV(
        ActionsCtx.Provider,
        {
          value: actions,
          children: [
            jsxDEV(Header, { onAdd: triggerAdd }, undefined, false),
            todos.length > 0 &&
              jsxDEV(
                "section",
                {
                  className: "main",
                  children: [
                    jsxDEV(
                      "input",
                      {
                        id: "toggle-all",
                        className: "toggle-all",
                        type: "checkbox",
                        checked: activeCount === 0,
                        onChange: toggleAll,
                      },
                      undefined,
                      false,
                    ),
                    jsxDEV(
                      "label",
                      {
                        htmlFor: "toggle-all",
                        children: "Mark all as complete",
                      },
                      undefined,
                      false,
                    ),
                    jsxDEV(
                      "ul",
                      {
                        className: "todo-list",
                        children: filteredTodos.map((todo) =>
                          jsxDEV(TodoItem, { todo }, todo.id, false),
                        ),
                      },
                      undefined,
                      false,
                    ),
                  ],
                },
                undefined,
                true,
              ),
            todos.length > 0 &&
              jsxDEV(
                Footer,
                {
                  count: activeCount,
                  completedCount,
                  filter,
                  onClearCompleted: clearCompleted,
                },
                undefined,
                false,
              ),
          ],
        },
        undefined,
        true,
      )
    }

    const root = document.createElement("div")
    mount(jsxDEV(App, {}, undefined, false), root)
    expect(root.querySelector("header.header")).not.toBeNull()

    // Add first todo
    triggerAdd!("Buy groceries")
    flushUpdates()
    expect(root.querySelectorAll(".todo-list li").length).toBe(1)

    // Add second todo
    triggerAdd!("Walk the dog")
    flushUpdates()
    expect(root.querySelectorAll(".todo-list li").length).toBe(2)

    // Toggle first todo
    triggerToggle!(1)
    flushUpdates()

    // CRITICAL: Both todos should still be visible (we're on "all" filter)
    const listItems = root.querySelectorAll(".todo-list li")
    expect(listItems.length).toBe(2)
    expect(listItems[0]!.querySelector("label")!.textContent).toBe("Buy groceries")
    expect(listItems[0]!.className).toContain("completed")
    expect(listItems[1]!.querySelector("label")!.textContent).toBe("Walk the dog")
  })
})
