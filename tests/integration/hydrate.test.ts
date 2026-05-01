import { describe, expect, it, vi } from "vitest"
import { createContext, h, useContext, useState } from "../../src/index"
import { hydrate, renderToString } from "../../src/server"
import type { VNode } from "../../src/vnode"

/**
 * Helper: render a VNode to string, inject into a container, then hydrate.
 * Returns the container for assertions.
 */
function ssrAndHydrate(vnode: VNode, hydrateVNode?: VNode): HTMLDivElement {
  const html = renderToString(vnode)
  const container = document.createElement("div")
  container.innerHTML = html
  hydrate(hydrateVNode ?? vnode, container)
  return container
}

// ---------------------------------------------------------------------------
// Basic hydration
// ---------------------------------------------------------------------------

describe("hydrate", () => {
  describe("basic elements", () => {
    it("preserves server-rendered DOM for a simple element", () => {
      const vnode = h("div", null, h("span", null, "hello"))
      const container = ssrAndHydrate(vnode)
      expect(container.innerHTML).toBe("<div><span>hello</span></div>")
    })

    it("preserves server-rendered DOM with className", () => {
      const vnode = h("div", { className: "box" }, "content")
      const container = ssrAndHydrate(vnode)
      expect(container.innerHTML).toBe('<div class="box">content</div>')
    })

    it("preserves nested element structure", () => {
      const vnode = h(
        "ul",
        null,
        h("li", null, "one"),
        h("li", null, "two"),
        h("li", null, "three"),
      )
      const container = ssrAndHydrate(vnode)
      expect(container.innerHTML).toBe("<ul><li>one</li><li>two</li><li>three</li></ul>")
    })
  })

  // ---------------------------------------------------------------------------
  // Event handler attachment
  // ---------------------------------------------------------------------------

  describe("event handlers", () => {
    it("attaches click handler to hydrated element", () => {
      const onClick = vi.fn()
      const vnode = h("button", { onClick }, "Click me")
      const container = ssrAndHydrate(vnode)

      const button = container.querySelector("button")!
      button.click()
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it("attaches handlers to nested elements", () => {
      const onInner = vi.fn()
      const vnode = h("div", null, h("button", { onClick: onInner }, "inner"))
      const container = ssrAndHydrate(vnode)

      container.querySelector("button")!.click()
      expect(onInner).toHaveBeenCalledTimes(1)
    })

    it("attaches multiple event types", () => {
      const onClick = vi.fn()
      const onMouseOver = vi.fn()
      const vnode = h("div", { onClick, onMouseOver }, "test")
      const container = ssrAndHydrate(vnode)

      const div = container.firstElementChild!
      div.click()
      div.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
      expect(onClick).toHaveBeenCalledTimes(1)
      expect(onMouseOver).toHaveBeenCalledTimes(1)
    })
  })

  // ---------------------------------------------------------------------------
  // Text nodes
  // ---------------------------------------------------------------------------

  describe("text nodes", () => {
    it("hydrates text content", () => {
      const vnode = h("p", null, "hello world")
      const container = ssrAndHydrate(vnode)
      expect(container.innerHTML).toBe("<p>hello world</p>")
    })
  })

  // ---------------------------------------------------------------------------
  // Components
  // ---------------------------------------------------------------------------

  describe("components", () => {
    it("hydrates a simple component", () => {
      function Greeting() {
        return h("span", null, "Hello!")
      }

      const html = renderToString(h(Greeting, null))
      const container = document.createElement("div")
      container.innerHTML = html

      hydrate(h(Greeting, null), container)
      // Component should be mounted, DOM should reflect the component output
      expect(container.querySelector("span")!.textContent).toBe("Hello!")
    })

    it("hydrates a component with props", () => {
      function Greeting(props: Record<string, unknown>) {
        return h("span", null, `Hi ${props["name"]}`)
      }

      const vnode = h(Greeting, { name: "Alice" })
      const html = renderToString(vnode)
      const container = document.createElement("div")
      container.innerHTML = html

      hydrate(h(Greeting, { name: "Alice" }), container)
      expect(container.querySelector("span")!.textContent).toBe("Hi Alice")
    })

    it("hydrates a component with useState", () => {
      const onClick = vi.fn()
      function Counter() {
        const [count] = useState(0)
        return h("button", { onClick }, `Count: ${count}`)
      }

      const html = renderToString(h(Counter, null))
      const container = document.createElement("div")
      container.innerHTML = html

      hydrate(h(Counter, null), container)

      // After hydration, the component is mounted and its DOM is live.
      const button = container.querySelector("button")
      expect(button).not.toBeNull()
      expect(button!.textContent).toBe("Count: 0")
    })

    it("reuses existing DOM nodes instead of creating new ones", () => {
      function Greeting() {
        return h("span", null, "Hello!")
      }

      const html = renderToString(h(Greeting, null))
      const container = document.createElement("div")
      container.innerHTML = html

      // Capture the original DOM node before hydration
      const originalSpan = container.querySelector("span")!

      hydrate(h(Greeting, null), container)

      // The same DOM node should be reused, not replaced
      const hydratedSpan = container.querySelector("span")!
      expect(hydratedSpan).toBe(originalSpan)
    })

    it("reuses DOM for nested components", () => {
      function Inner() {
        return h("b", null, "inner text")
      }
      function Outer() {
        return h("div", { className: "outer" }, h(Inner, null))
      }

      const html = renderToString(h(Outer, null))
      const container = document.createElement("div")
      container.innerHTML = html

      const originalDiv = container.querySelector(".outer")!
      const originalB = container.querySelector("b")!

      hydrate(h(Outer, null), container)

      expect(container.querySelector(".outer")).toBe(originalDiv)
      expect(container.querySelector("b")).toBe(originalB)
    })

    it("attaches event handlers to component-rendered elements", () => {
      const onClick = vi.fn()
      function Button() {
        return h("button", { onClick }, "Click")
      }

      const html = renderToString(h(Button, null))
      const container = document.createElement("div")
      container.innerHTML = html

      hydrate(h(Button, null), container)
      container.querySelector("button")!.click()
      expect(onClick).toHaveBeenCalledTimes(1)
    })
  })

  // ---------------------------------------------------------------------------
  // Ref attachment
  // ---------------------------------------------------------------------------

  describe("refs", () => {
    it("attaches ref to hydrated element", () => {
      const ref: { current: Element | null } = { current: null }
      const vnode = h("div", { ref }, "content")

      const html = renderToString(h("div", null, "content"))
      const container = document.createElement("div")
      container.innerHTML = html

      hydrate(vnode, container)
      expect(ref.current).toBe(container.firstElementChild)
    })

    it("attaches callback ref to hydrated element", () => {
      let refNode: Element | null = null
      const refCallback = (node: Element | null) => {
        refNode = node
      }
      const vnode = h("div", { ref: refCallback }, "content")

      const html = renderToString(h("div", null, "content"))
      const container = document.createElement("div")
      container.innerHTML = html

      hydrate(vnode, container)
      expect(refNode).toBe(container.firstElementChild)
    })
  })

  // ---------------------------------------------------------------------------
  // Mismatch fallback
  // ---------------------------------------------------------------------------

  describe("mismatch handling", () => {
    it("falls back to mount when DOM nodeType does not match (text vs element)", () => {
      const container = document.createElement("div")
      // Container has a text node, but we hydrate expecting an element
      container.textContent = "just text"

      const vnode = h("p", null, "paragraph")
      hydrate(vnode, container)

      // mountFallback should create the element and insert it
      expect(container.querySelector("p")).not.toBeNull()
      expect(container.querySelector("p")!.textContent).toBe("paragraph")
    })

    it("does not crash on empty container", () => {
      const container = document.createElement("div")
      const vnode = h("span", null, "content")
      hydrate(vnode, container)

      // domNode is null, so mountFallback kicks in
      expect(container.querySelector("span")).not.toBeNull()
    })
  })
})
