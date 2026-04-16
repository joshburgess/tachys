/**
 * Benchmarks for hooks and scheduler hot paths.
 *
 * Measures the overhead of useState, useReducer, setState,
 * and the scheduler flush cycle with component re-renders.
 */
import { bench, describe } from "vitest"
import { h, render, flushUpdates, useState, useReducer, useCallback } from "../../src/index"

describe("Hooks hot path", () => {
  let container: HTMLElement

  // --- useState: render + setState + flush cycle ---

  bench(
    "useState: 1,000 setState + flush cycles",
    () => {
      for (let i = 0; i < 1000; i++) {
        setter!(i)
        flushUpdates()
      }
    },
    {
      setup: () => {
        container = document.createElement("div")
        document.body.appendChild(container)
        setter = null
        function App() {
          const [val, setVal] = useState(0)
          setter = setVal
          return h("div", null, String(val))
        }
        render(h(App, null), container)
        flushUpdates()
      },
      teardown: () => {
        render(null, container)
        document.body.removeChild(container)
      },
    },
  )

  // --- useState: batched setStates ---

  bench(
    "useState: 100 batched setStates + single flush",
    () => {
      for (let i = 0; i < 100; i++) {
        setter!(i)
      }
      flushUpdates()
    },
    {
      setup: () => {
        container = document.createElement("div")
        document.body.appendChild(container)
        setter = null
        function App() {
          const [val, setVal] = useState(0)
          setter = setVal
          return h("div", null, String(val))
        }
        render(h(App, null), container)
        flushUpdates()
      },
      teardown: () => {
        render(null, container)
        document.body.removeChild(container)
      },
    },
  )

  // --- useReducer: dispatch + flush ---

  bench(
    "useReducer: 1,000 dispatch + flush cycles",
    () => {
      for (let i = 0; i < 1000; i++) {
        dispatch!("increment")
        flushUpdates()
      }
    },
    {
      setup: () => {
        container = document.createElement("div")
        document.body.appendChild(container)
        dispatch = null
        function App() {
          const [val, d] = useReducer(
            (s: number, a: string) => (a === "increment" ? s + 1 : s),
            0,
          )
          dispatch = d
          return h("div", null, String(val))
        }
        render(h(App, null), container)
        flushUpdates()
      },
      teardown: () => {
        render(null, container)
        document.body.removeChild(container)
      },
    },
  )

  // --- useState: functional updater ---

  bench(
    "useState: 1,000 functional updates + flush cycles",
    () => {
      for (let i = 0; i < 1000; i++) {
        setter!((prev: number) => prev + 1)
        flushUpdates()
      }
    },
    {
      setup: () => {
        container = document.createElement("div")
        document.body.appendChild(container)
        setter = null
        function App() {
          const [val, setVal] = useState(0)
          setter = setVal
          return h("div", null, String(val))
        }
        render(h(App, null), container)
        flushUpdates()
      },
      teardown: () => {
        render(null, container)
        document.body.removeChild(container)
      },
    },
  )

  // --- useState: same-value bail-out ---

  bench(
    "useState: 1,000 same-value bailouts (no re-render)",
    () => {
      for (let i = 0; i < 1000; i++) {
        setter!(42) // same value every time
      }
    },
    {
      setup: () => {
        container = document.createElement("div")
        document.body.appendChild(container)
        setter = null
        function App() {
          const [val, setVal] = useState(42)
          setter = setVal
          return h("div", null, String(val))
        }
        render(h(App, null), container)
        flushUpdates()
      },
      teardown: () => {
        render(null, container)
        document.body.removeChild(container)
      },
    },
  )

  // --- Multiple hooks per component ---

  bench(
    "5 useStates + 2 useCallbacks: 1,000 update cycles",
    () => {
      for (let i = 0; i < 1000; i++) {
        setters![0]!(i)
        flushUpdates()
      }
    },
    {
      setup: () => {
        container = document.createElement("div")
        document.body.appendChild(container)
        setters = null
        function App() {
          const [a, sa] = useState(0)
          const [b, sb] = useState(0)
          const [c, sc] = useState(0)
          const [d, sd] = useState(0)
          const [e, se] = useState(0)
          const _cb1 = useCallback(() => {}, [a])
          const _cb2 = useCallback(() => {}, [b])
          setters = [sa, sb, sc, sd, se]
          return h("div", null, `${a}${b}${c}${d}${e}`)
        }
        render(h(App, null), container)
        flushUpdates()
      },
      teardown: () => {
        render(null, container)
        document.body.removeChild(container)
      },
    },
  )
})

// Module-level holders for benchmark closures
let setter: ((v: any) => void) | null = null
let dispatch: ((a: any) => void) | null = null
let setters: Array<(v: any) => void> | null = null
