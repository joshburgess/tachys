/**
 * Benchmarks measuring the overhead of concurrent infrastructure
 * (effect collection, restorer snapshots, pool release guards) on
 * the Sync/Default hot path.
 *
 * The concurrent infrastructure is guarded by `isCollecting()` checks
 * that return false during Sync/Default lane processing. These
 * benchmarks verify that the guards add negligible overhead compared
 * to the baseline VDOM operations.
 */
import { bench, describe } from "vitest"
import {
  h,
  render,
  mount,
  patch,
  unmount,
  flushUpdates,
  useState,
  useCallback,
  useMemo,
} from "../../src/index"
import type { VNode } from "../../src/vnode"

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome"]
const nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie"]
const colours = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "gray"]

interface RowData {
  id: number
  label: string
}

function buildRowData(count: number): RowData[] {
  const data: RowData[] = []
  for (let i = 0; i < count; i++) {
    data.push({
      id: i,
      label: `${adjectives[i % adjectives.length]} ${colours[i % colours.length]} ${nouns[i % nouns.length]}`,
    })
  }
  return data
}

// ---------------------------------------------------------------------------
// Component-based benchmarks (exercises patchComponent + restorer guard)
// ---------------------------------------------------------------------------

let setter: ((v: unknown) => void) | null = null
let multiSetters: Array<(v: unknown) => void> | null = null

describe("Concurrent overhead: Sync/Default hot path", () => {
  let container: HTMLElement

  // This benchmark exercises the patchComponent code path which includes
  // the isCollecting() guard for transition restorer snapshots. On the
  // Default lane (flushUpdates), isCollecting() returns false so the
  // snapshot code is skipped entirely.
  bench(
    "patchComponent: 1,000 setState+flush (Default lane)",
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

  // Component with multiple hooks -- exercises the hook snapshot loop guard
  bench(
    "patchComponent: 5 hooks, 1,000 update cycles (Default lane)",
    () => {
      for (let i = 0; i < 1000; i++) {
        multiSetters![0]!(i)
        flushUpdates()
      }
    },
    {
      setup: () => {
        container = document.createElement("div")
        document.body.appendChild(container)
        multiSetters = null
        function App() {
          const [a, sa] = useState(0)
          const [b, sb] = useState(0)
          const [c, sc] = useState(0)
          const _m = useMemo(() => a + b, [a, b])
          const _cb = useCallback(() => {}, [c])
          multiSetters = [sa, sb, sc]
          return h("div", null, `${a}:${b}:${c}`)
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

  // Exercises replaceVNode -> mountInternal -> releaseVNode pool guard
  bench(
    "patch 1,000 rows: keyed diff + pool release guard",
    () => {
      const newData = buildRowData(1000).map((r) => ({ ...r, id: r.id + 1000 }))
      const newTree = h(
        "table",
        null,
        h("tbody", null, ...newData.map((r) =>
          h("tr", { key: r.id },
            h("td", null, String(r.id)),
            h("td", null, r.label),
          ),
        )),
      )
      patch(currentTree!, newTree, container as Element)
      currentTree = newTree
    },
    {
      setup: () => {
        container = document.createElement("div")
        const data = buildRowData(1000)
        currentTree = h(
          "table",
          null,
          h("tbody", null, ...data.map((r) =>
            h("tr", { key: r.id },
              h("td", null, String(r.id)),
              h("td", null, r.label),
            ),
          )),
        )
        mount(currentTree, container as Element)
      },
      teardown: () => {
        unmount(currentTree!, container as Element)
      },
    },
  )

  // Exercises className and prop patching through the isCollecting() thunk guard
  bench(
    "update every 10th row className (1,000 rows)",
    () => {
      const newData = currentData!.map((r, i) => ({
        ...r,
        selected: i % 10 === 0,
      }))
      const newTree = h(
        "table",
        null,
        h("tbody", null, ...newData.map((r) =>
          h("tr", { key: r.id, className: (r as { selected?: boolean }).selected ? "danger" : "" },
            h("td", null, String(r.id)),
            h("td", null, r.label),
          ),
        )),
      )
      patch(currentTree!, newTree, container as Element)
      currentTree = newTree
    },
    {
      setup: () => {
        container = document.createElement("div")
        currentData = buildRowData(1000)
        currentTree = h(
          "table",
          null,
          h("tbody", null, ...currentData.map((r) =>
            h("tr", { key: r.id, className: "" },
              h("td", null, String(r.id)),
              h("td", null, r.label),
            ),
          )),
        )
        mount(currentTree, container as Element)
      },
      teardown: () => {
        unmount(currentTree!, container as Element)
      },
    },
  )

  // Deep component tree -- exercises nested patchComponent restorer guards
  bench(
    "deep component tree: 50 nested components, 1,000 updates",
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

        function Leaf({ value }: { value: number }) {
          return h("span", null, String(value))
        }

        // Build a chain of wrapper components
        function makeWrapper(depth: number): (props: { value: number }) => VNode {
          if (depth === 0) return Leaf
          const Inner = makeWrapper(depth - 1)
          return function Wrapper({ value }: { value: number }) {
            return h(Inner, { value })
          }
        }

        const DeepTree = makeWrapper(50)

        function App() {
          const [val, setVal] = useState(0)
          setter = setVal
          return h(DeepTree, { value: val })
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

let currentTree: VNode | null = null
let currentData: RowData[] | null = null
