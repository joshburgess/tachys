import { describe, it, expect } from "vitest"
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  mount,
  flushUpdates,
} from "../../src/index"
import { jsxDEV } from "../../src/jsx-dev-runtime"
import type { VNode } from "../../src/vnode"

interface Todo { id: number; title: string; completed: boolean }
interface TodoActions { toggle: (id: number) => void; destroy: (id: number) => void; edit: (id: number, title: string) => void }

describe("Regression: TodoMVC toggle with useEffect and Context", () => {
  it("preserves all list items when toggling todo with Provider context", () => {
    const ActionsCtx = createContext<TodoActions>({ toggle: () => {}, destroy: () => {}, edit: () => {} })

    let triggerAdd: (title: string) => void
    let triggerToggle: (id: number) => void
    let nextId = 1

    function TodoItemInner(props: { todo: Todo; children?: VNode }) {
      const { todo } = props
      const actions = useContext(ActionsCtx)
      useEffect(() => {}, [])
      const handleToggle = useCallback(() => actions.toggle(todo.id), [todo.id])

      return jsxDEV("li", {
        className: todo.completed ? "completed" : undefined,
        children: jsxDEV("label", { children: todo.title }, undefined, false),
      }, undefined, false)
    }

    function App() {
      const [todos, setTodos] = useState<Todo[]>([])
      triggerAdd = useCallback((title: string) => {
        setTodos((prev: Todo[]) => [...prev, { id: nextId++, title, completed: false }])
      }, [])
      const actions: TodoActions = useMemo(() => ({
        toggle: (id: number) => setTodos((prev: Todo[]) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))),
        destroy: (id: number) => setTodos((prev: Todo[]) => prev.filter((t) => t.id !== id)),
        edit: (id: number, title: string) => setTodos((prev: Todo[]) => prev.map((t) => (t.id === id ? { ...t, title } : t))),
      }), [])
      triggerToggle = useCallback((id: number) => actions.toggle(id), [actions])
      const activeCount = todos.filter((t) => !t.completed).length

      return jsxDEV(ActionsCtx.Provider, {
        value: actions,
        children: [
          jsxDEV("header", { children: "Header" }, undefined, false),
          todos.length > 0 && jsxDEV("section", {
            className: "main",
            children: jsxDEV("ul", {
              className: "todo-list",
              children: todos.map((todo) => jsxDEV(TodoItemInner, { todo }, todo.id, false)),
            }, undefined, false),
          }, undefined, false),
          todos.length > 0 && jsxDEV("footer", { children: `${activeCount} left` }, undefined, false),
        ],
      }, undefined, true)
    }

    const root = document.createElement("div")
    mount(jsxDEV(App, {}, undefined, false), root)
    expect(root.innerHTML).toBe("<header>Header</header>")

    // Add first todo
    triggerAdd!("A")
    flushUpdates()
    expect(root.innerHTML).toContain("<li><label>A</label></li>")
    expect(root.querySelectorAll(".todo-list li").length).toBe(1)

    // Add second todo
    triggerAdd!("B")
    flushUpdates()
    expect(root.querySelectorAll(".todo-list li").length).toBe(2)

    // Toggle first todo
    triggerToggle!(1)
    flushUpdates()

    expect(root.querySelectorAll(".todo-list li").length).toBe(2)
  })

  it("preserves all list items when toggling todo without Provider", () => {
    let triggerAdd: (title: string) => void
    let triggerToggle: (id: number) => void
    let nextId = 1

    function TodoItemInner(props: { todo: { id: number; title: string; completed: boolean }; children?: VNode }) {
      const { todo } = props
      useEffect(() => {}, [])
      return jsxDEV("li", {
        className: todo.completed ? "completed" : undefined,
        children: jsxDEV("label", { children: todo.title }, undefined, false),
      }, undefined, false)
    }

    function App() {
      const [todos, setTodos] = useState<{ id: number; title: string; completed: boolean }[]>([])
      triggerAdd = useCallback((title: string) => {
        setTodos((prev: any[]) => [...prev, { id: nextId++, title, completed: false }])
      }, [])
      triggerToggle = useCallback((id: number) => {
        setTodos((prev: any[]) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)))
      }, [])

      return jsxDEV("div", {
        children: [
          jsxDEV("header", { children: "Header" }, undefined, false),
          todos.length > 0 && jsxDEV("ul", {
            children: todos.map((todo) => jsxDEV(TodoItemInner, { todo }, todo.id, false)),
          }, undefined, false),
          todos.length > 0 && jsxDEV("footer", { children: "Footer" }, undefined, false),
        ],
      }, undefined, true)
    }

    const root = document.createElement("div")
    mount(jsxDEV(App, {}, undefined, false), root)
    triggerAdd!("A")
    flushUpdates()
    triggerAdd!("B")
    flushUpdates()
    expect(root.querySelectorAll("li").length).toBe(2)

    triggerToggle!(1)
    flushUpdates()
    expect(root.querySelectorAll("li").length).toBe(2)
  })
})
