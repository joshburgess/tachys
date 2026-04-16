import { describe, it, expect } from "vitest"
import { createContext, useState, useCallback, h, mount, flushUpdates } from "../../src/index"
import { jsxDEV } from "../../src/jsx-dev-runtime"

describe("Provider with conditional children", () => {
  it("h() - should handle children changing from 1 to 3", () => {
    const Ctx = createContext({ action: () => {} })

    let triggerAdd: () => void

    function App() {
      const [items, setItems] = useState<string[]>([])
      triggerAdd = useCallback(() => {
        setItems((prev: string[]) => [...prev, "item"])
      }, [])

      return h(Ctx.Provider, { value: { action: () => {} } },
        h("header", null, "Header"),
        items.length > 0 ? h("section", null, "List") : null,
        items.length > 0 ? h("footer", null, "Footer") : null,
      )
    }

    const root = document.createElement("div")
    mount(h(App, null), root)
    expect(root.innerHTML).toBe("<header>Header</header>")

    triggerAdd!()
    flushUpdates()
    expect(root.innerHTML).toBe("<header>Header</header><section>List</section><footer>Footer</footer>")
  })

  it("jsxDEV - should handle children changing from 1 to 3", () => {
    const Ctx = createContext({ action: () => {} })

    let triggerAdd: () => void

    function App() {
      const [items, setItems] = useState<string[]>([])
      triggerAdd = useCallback(() => {
        setItems((prev: string[]) => [...prev, "item"])
      }, [])

      return jsxDEV(Ctx.Provider, {
        value: { action: () => {} },
        children: [
          jsxDEV("header", { children: "Header" }),
          items.length > 0 && jsxDEV("section", { children: "List" }),
          items.length > 0 && jsxDEV("footer", { children: "Footer" }),
        ],
      }, undefined, true)
    }

    const root = document.createElement("div")
    mount(jsxDEV(App, {}), root)
    expect(root.innerHTML).toBe("<header>Header</header>")

    triggerAdd!()
    flushUpdates()
    expect(root.innerHTML).toBe("<header>Header</header><section>List</section><footer>Footer</footer>")
  })
})
