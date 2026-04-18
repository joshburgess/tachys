import { describe, expect, it } from "vitest"
import {
  createContext,
  createRef,
  createRoot,
  flushUpdates,
  h,
  mount,
  patch,
  render,
  useContext,
} from "../../src/index"

describe("React 19 parity", () => {
  describe("ref as a prop (function components)", () => {
    it("passes ref through to a function component as a regular prop", () => {
      const captured: Array<unknown> = []

      function MyInput(props: { ref?: unknown; placeholder?: string }) {
        captured.push(props.ref)
        return h("input", { placeholder: props.placeholder })
      }

      const ref = createRef<HTMLInputElement>()
      const container = document.createElement("div")
      mount(h(MyInput, { ref, placeholder: "x" }), container)

      // ref was delivered to the component
      expect(captured).toHaveLength(1)
      expect(captured[0]).toBe(ref)
    })

    it("does not attach ref to the component's root DOM node automatically", () => {
      // React 19 intentionally: unless the component forwards the ref to an
      // element, it's just a prop -- no magic.
      const ref = createRef<HTMLInputElement>()

      function MyInput(_props: { ref?: unknown }) {
        return h("input", null)
      }

      const container = document.createElement("div")
      mount(h(MyInput, { ref }), container)

      expect(ref.current).toBeNull()
    })
  })

  describe("callback ref cleanup", () => {
    it("invokes the returned cleanup on unmount instead of calling ref(null)", () => {
      const log: string[] = []

      const ref = (node: Element | Text | null) => {
        if (node !== null) {
          log.push("set")
          return () => {
            log.push("cleanup")
          }
        }
        log.push("null")
      }

      const container = document.createElement("div")
      render(h("div", { ref }), container)
      expect(log).toEqual(["set"])

      render(null, container)
      expect(log).toEqual(["set", "cleanup"])
    })

    it("runs cleanup when the ref is replaced and attaches the new ref", () => {
      const log: string[] = []

      const refA = (node: Element | Text | null) => {
        if (node !== null) {
          log.push("A-set")
          return () => {
            log.push("A-cleanup")
          }
        }
        log.push("A-null")
      }
      const refB = (node: Element | Text | null) => {
        if (node !== null) log.push("B-set")
        else log.push("B-null")
      }

      const container = document.createElement("div")
      const root = createRoot(container)

      root.render(h("div", { ref: refA }))
      flushUpdates()
      expect(log).toEqual(["A-set"])

      root.render(h("div", { ref: refB }))
      flushUpdates()
      expect(log).toContain("A-cleanup")
      expect(log).toContain("B-set")
      // The cleanup replaces the `ref(null)` call
      expect(log).not.toContain("A-null")
    })

    it("falls back to ref(null) when the callback returned no cleanup", () => {
      const log: string[] = []

      const ref = (node: Element | Text | null) => {
        log.push(node === null ? "null" : "set")
      }

      const container = document.createElement("div")
      render(h("div", { ref }), container)
      expect(log).toEqual(["set"])

      render(null, container)
      expect(log).toEqual(["set", "null"])
    })
  })

  describe("context as provider", () => {
    it("accepts <MyContext value={v}> (React 19 style)", () => {
      const ThemeCtx = createContext("light")

      function Consumer() {
        return h("span", null, useContext(ThemeCtx))
      }

      const container = document.createElement("div")
      mount(h(ThemeCtx, { value: "dark" }, h(Consumer, null)), container)
      expect(container.innerHTML).toBe("<span>dark</span>")
    })

    it("still accepts <MyContext.Provider value={v}> (React 18 style)", () => {
      const ThemeCtx = createContext("light")

      function Consumer() {
        return h("span", null, useContext(ThemeCtx))
      }

      const container = document.createElement("div")
      mount(h(ThemeCtx.Provider, { value: "dark" }, h(Consumer, null)), container)
      expect(container.innerHTML).toBe("<span>dark</span>")
    })

    it("treats MyContext and MyContext.Provider as the same function", () => {
      const Ctx = createContext(0)
      expect(Ctx).toBe(Ctx.Provider)
    })

    it("updates consumers when the value changes via direct context usage", () => {
      const Ctx = createContext("a")
      function Leaf() {
        return h("span", null, useContext(Ctx))
      }

      const container = document.createElement("div")
      render(h(Ctx, { value: "first" }, h(Leaf, null)), container)
      expect(container.innerHTML).toBe("<span>first</span>")

      render(h(Ctx, { value: "second" }, h(Leaf, null)), container)
      expect(container.innerHTML).toBe("<span>second</span>")
    })
  })
})
