import { describe, expect, it, vi } from "vitest"
import {
  createRef,
  flushUpdates,
  forwardRef,
  h,
  memo,
  mount,
  patch,
  useRef,
  useState,
} from "../../src/index"
import type { MemoComponentFn } from "../../src/index"
import type { Ref } from "../../src/ref"
import type { VNode } from "../../src/vnode"

// ---------------------------------------------------------------------------
// memo()
// ---------------------------------------------------------------------------

describe("memo()", () => {
  describe("basic rendering", () => {
    it("renders normally on initial mount", () => {
      const container = document.createElement("div")

      function Inner(props: Record<string, unknown>) {
        return h("span", null, `value: ${props["value"]}`)
      }

      const MemoComp = memo(Inner)
      mount(h(MemoComp, { value: "hello" }), container)
      expect(container.innerHTML).toBe("<span>value: hello</span>")
    })

    it("skips re-render when props are identical (same primitive values)", () => {
      const container = document.createElement("div")
      let renderCount = 0

      function Inner(props: Record<string, unknown>) {
        renderCount++
        return h("span", null, `${props["text"]}`)
      }

      const MemoComp = memo(Inner)
      const old = h(MemoComp, { text: "hello" })
      mount(old, container)
      expect(renderCount).toBe(1)

      const next = h(MemoComp, { text: "hello" })
      patch(old, next, container)
      // Props are shallowly equal — render should be skipped
      expect(renderCount).toBe(1)
      expect(container.innerHTML).toBe("<span>hello</span>")
    })

    it("re-renders when props change", () => {
      const container = document.createElement("div")
      let renderCount = 0

      function Inner(props: Record<string, unknown>) {
        renderCount++
        return h("span", null, `${props["text"]}`)
      }

      const MemoComp = memo(Inner)
      const old = h(MemoComp, { text: "hello" })
      mount(old, container)
      expect(renderCount).toBe(1)

      const next = h(MemoComp, { text: "world" })
      patch(old, next, container)
      expect(renderCount).toBe(2)
      expect(container.innerHTML).toBe("<span>world</span>")
    })
  })

  describe("custom compare function", () => {
    it("skips re-render when custom compare returns true", () => {
      const container = document.createElement("div")
      let renderCount = 0

      function Inner(props: Record<string, unknown>) {
        renderCount++
        return h("span", null, `${props["count"]}`)
      }

      // Custom compare always returns true (always equal — never re-render)
      const compare = vi.fn(
        (_prev: Record<string, unknown>, _next: Record<string, unknown>) => true,
      )
      const MemoComp = memo(Inner, compare)

      const old = h(MemoComp, { count: 1 })
      mount(old, container)
      expect(renderCount).toBe(1)

      const next = h(MemoComp, { count: 99 })
      patch(old, next, container)

      expect(compare).toHaveBeenCalledOnce()
      // Compare returned true (equal) so render is skipped
      expect(renderCount).toBe(1)
      expect(container.innerHTML).toBe("<span>1</span>")
    })

    it("re-renders when custom compare returns false", () => {
      const container = document.createElement("div")
      let renderCount = 0

      function Inner(props: Record<string, unknown>) {
        renderCount++
        return h("span", null, `${props["count"]}`)
      }

      // Custom compare always returns false (never equal — always re-render)
      const compare = vi.fn(
        (_prev: Record<string, unknown>, _next: Record<string, unknown>) => false,
      )
      const MemoComp = memo(Inner, compare)

      const old = h(MemoComp, { count: 5 })
      mount(old, container)
      expect(renderCount).toBe(1)

      // Patch with same props value — normally would be skipped, but compare says false
      const next = h(MemoComp, { count: 5 })
      patch(old, next, container)

      expect(compare).toHaveBeenCalledOnce()
      // Compare returned false (not equal) so re-render happens
      expect(renderCount).toBe(2)
      expect(container.innerHTML).toBe("<span>5</span>")
    })

    it("custom compare can selectively ignore certain props", () => {
      const container = document.createElement("div")
      let renderCount = 0

      function Inner(props: Record<string, unknown>) {
        renderCount++
        return h("span", null, `${props["important"]}`)
      }

      // Only compare the "important" prop; ignore "ignored" prop changes
      const compare = (prev: Record<string, unknown>, next: Record<string, unknown>) =>
        prev["important"] === next["important"]

      const MemoComp = memo(Inner, compare)

      const old = h(MemoComp, { important: "A", ignored: "x" })
      mount(old, container)
      expect(renderCount).toBe(1)

      // "ignored" changes but "important" stays the same — should skip re-render
      const next1 = h(MemoComp, { important: "A", ignored: "y" })
      patch(old, next1, container)
      expect(renderCount).toBe(1)
      expect(container.innerHTML).toBe("<span>A</span>")

      // "important" changes — should re-render
      const next2 = h(MemoComp, { important: "B", ignored: "y" })
      patch(next1, next2, container)
      expect(renderCount).toBe(2)
      expect(container.innerHTML).toBe("<span>B</span>")
    })
  })

  describe("state changes still trigger re-render", () => {
    it("re-renders on internal useState update even when outer props are unchanged", () => {
      const container = document.createElement("div")
      let externalSetter: (v: number) => void

      function Inner(_props: Record<string, unknown>) {
        const [count, setCount] = useState(0)
        externalSetter = setCount
        return h("span", null, `count: ${count}`)
      }

      const MemoComp = memo(Inner)
      mount(h(MemoComp, { stable: true }), container)
      expect(container.innerHTML).toBe("<span>count: 0</span>")

      // State update should still trigger re-render despite props not changing
      externalSetter!(5)
      flushUpdates()
      expect(container.innerHTML).toBe("<span>count: 5</span>")
    })
  })

  describe("structural properties", () => {
    it("preserves _inner and _compare properties on the wrapped function", () => {
      function Inner(props: Record<string, unknown>): VNode {
        return h("div", null, `${props["x"]}`)
      }

      const compare = (_p: Record<string, unknown>, _n: Record<string, unknown>) => true
      const MemoComp = memo(Inner, compare) as unknown as MemoComponentFn

      expect(MemoComp._inner).toBe(Inner)
      expect(MemoComp._compare).toBe(compare)
    })

    it("sets _compare to null when no compare function is provided", () => {
      function Inner(_props: Record<string, unknown>): VNode {
        return h("div", null, "test")
      }

      const MemoComp = memo(Inner) as unknown as MemoComponentFn

      expect(MemoComp._inner).toBe(Inner)
      expect(MemoComp._compare).toBeNull()
    })

    it("_inner is the original unwrapped component function", () => {
      const calls: string[] = []

      function Inner(props: Record<string, unknown>): VNode {
        calls.push(`render:${props["x"]}`)
        return h("span", null, `${props["x"]}`)
      }

      const MemoComp = memo(Inner) as unknown as MemoComponentFn

      // Calling _inner directly bypasses the memo wrapper
      const container = document.createElement("div")
      mount(h(MemoComp._inner, { x: "direct" }), container)
      expect(calls).toContain("render:direct")
    })
  })
})

// ---------------------------------------------------------------------------
// forwardRef()
// ---------------------------------------------------------------------------

describe("forwardRef()", () => {
  describe("ref passing", () => {
    it("passes a RefObject to the inner render function", () => {
      const container = document.createElement("div")
      let receivedRef: Ref | undefined = undefined

      const Comp = forwardRef((props: Record<string, unknown>, ref: Ref | undefined) => {
        receivedRef = ref
        return h("div", null, `${props["label"]}`)
      })

      const myRef = createRef<Element>()
      mount(h(Comp, { label: "test", ref: myRef }), container)

      expect(receivedRef).toBe(myRef)
    })

    it("passes a callback ref to the inner render function", () => {
      const container = document.createElement("div")
      let receivedRef: Ref | undefined = undefined

      const Comp = forwardRef((props: Record<string, unknown>, ref: Ref | undefined) => {
        receivedRef = ref
        return h("div", null, `${props["label"]}`)
      })

      const callbackRef = vi.fn((_el: Element | null) => {})
      mount(h(Comp, { label: "cb", ref: callbackRef }), container)

      expect(receivedRef).toBe(callbackRef)
    })

    it("passes undefined as ref when no ref is provided", () => {
      const container = document.createElement("div")
      let receivedRef: Ref | undefined = "sentinel" as unknown as Ref

      const Comp = forwardRef((_props: Record<string, unknown>, ref: Ref | undefined) => {
        receivedRef = ref
        return h("div", null, "no ref")
      })

      mount(h(Comp, { label: "no-ref" }), container)

      expect(receivedRef).toBeUndefined()
    })

    it("strips ref from props before passing to the render function", () => {
      const container = document.createElement("div")
      let receivedProps: Record<string, unknown> | null = null

      const Comp = forwardRef((props: Record<string, unknown>, _ref: Ref | undefined) => {
        receivedProps = props
        return h("div", null, "stripped")
      })

      const myRef = createRef()
      mount(h(Comp, { name: "alice", ref: myRef, age: 30 }), container)

      expect(receivedProps).not.toBeNull()
      // ref must not appear in props
      expect("ref" in receivedProps!).toBe(false)
      // other props must be preserved
      expect(receivedProps!["name"]).toBe("alice")
      expect(receivedProps!["age"]).toBe(30)
    })
  })

  describe("rendering", () => {
    it("mounts and renders correctly without a ref", () => {
      const container = document.createElement("div")

      const Button = forwardRef((props: Record<string, unknown>, _ref: Ref | undefined) => {
        return h("button", null, `${props["label"]}`)
      })

      mount(h(Button, { label: "Click me" }), container)
      expect(container.innerHTML).toBe("<button>Click me</button>")
    })

    it("mounts and renders correctly with a ref", () => {
      const container = document.createElement("div")

      const Input = forwardRef((_props: Record<string, unknown>, _ref: Ref | undefined) => {
        return h("input", null)
      })

      const myRef = createRef()
      mount(h(Input, { ref: myRef }), container)
      expect(container.innerHTML).toBe("<input>")
    })

    it("preserves other props when ref is stripped", () => {
      const container = document.createElement("div")

      const Label = forwardRef((props: Record<string, unknown>, _ref: Ref | undefined) => {
        return h("label", null, `${props["text"]} (${props["size"]})`)
      })

      const myRef = createRef()
      mount(h(Label, { text: "Hello", size: "lg", ref: myRef }), container)
      expect(container.innerHTML).toBe("<label>Hello (lg)</label>")
    })
  })

  describe("ref attachment to DOM", () => {
    it("attaches a RefObject to the DOM element when ref is applied to an element inside render", () => {
      const container = document.createElement("div")
      const myRef = createRef<Element | null>()

      const Comp = forwardRef((_props: Record<string, unknown>, ref: Ref | undefined) => {
        // Forward the ref onto the underlying DOM element
        return h("div", { ref }, "with ref")
      })

      mount(h(Comp, { ref: myRef }), container)

      // After mount the ref.current should point to the rendered div
      expect(myRef.current).not.toBeNull()
      expect((myRef.current as Element).tagName).toBe("DIV")
    })

    it("calls a callback ref with the DOM element after mount", () => {
      const container = document.createElement("div")
      const refCallback = vi.fn((_el: Element | Text | null) => {})

      const Comp = forwardRef((_props: Record<string, unknown>, ref: Ref | undefined) => {
        return h("section", { ref }, "callback ref")
      })

      mount(h(Comp, { ref: refCallback }), container)

      expect(refCallback).toHaveBeenCalledOnce()
      const receivedEl = refCallback.mock.calls[0]![0]
      expect(receivedEl).not.toBeNull()
      expect((receivedEl as Element).tagName).toBe("SECTION")
    })

    it("createRef() ref.current points to the DOM element after mount", () => {
      const container = document.createElement("div")
      const inputRef = createRef<HTMLInputElement | null>()

      const FancyInput = forwardRef((_props: Record<string, unknown>, ref: Ref | undefined) => {
        return h("input", { ref, type: "text" })
      })

      mount(h(FancyInput, { ref: inputRef }), container)

      expect(inputRef.current).not.toBeNull()
      expect((inputRef.current as Element).tagName).toBe("INPUT")
      expect((inputRef.current as HTMLInputElement).type).toBe("text")
    })
  })

  describe("structural properties", () => {
    it("sets _forwardRef to true on the wrapped function", () => {
      const render = (_props: Record<string, unknown>, _ref: Ref | undefined): VNode =>
        h("div", null, "test")

      const Comp = forwardRef(render) as unknown as {
        _forwardRef: boolean
        _render: typeof render
      }

      expect(Comp._forwardRef).toBe(true)
    })

    it("sets _render to the original render function", () => {
      const render = (_props: Record<string, unknown>, _ref: Ref | undefined): VNode =>
        h("div", null, "test")

      const Comp = forwardRef(render) as unknown as {
        _forwardRef: boolean
        _render: typeof render
      }

      expect(Comp._render).toBe(render)
    })
  })
})
