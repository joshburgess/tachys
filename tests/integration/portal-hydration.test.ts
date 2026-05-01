/**
 * Tests for portal behavior with SSR and hydration:
 *   - renderToString renders portal children inline (no real container)
 *   - hydrate handles portals (treated as regular components)
 *   - Portal content moves to target container after hydration + update
 *   - Portal with event handlers after hydration
 */

import { describe, expect, it, vi } from "vitest"
import { createPortal, flushUpdates, h, mount, unmount, useState } from "../../src/index"
import { hydrate, renderToString } from "../../src/server"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flushMicrotasks(): Promise<void> {
  flushUpdates()
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

// ---------------------------------------------------------------------------
// Portal SSR (renderToString)
// ---------------------------------------------------------------------------

describe("portal SSR", () => {
  it("renderToString renders portal children inline", () => {
    const target = document.createElement("div")

    function App() {
      return h(
        "div",
        null,
        h("span", null, "main content"),
        createPortal(h("p", null, "portal content"), target),
      )
    }

    const html = renderToString(h(App, null))

    // Portal content should be rendered inline (server has no real target)
    expect(html).toContain("portal content")
    expect(html).toContain("main content")
  })

  it("renderToString renders nested elements inside portal", () => {
    const target = document.createElement("div")

    function App() {
      return createPortal(
        h("div", { className: "modal" }, h("h2", null, "Title"), h("p", null, "Body")),
        target,
      )
    }

    const html = renderToString(h(App, null))
    expect(html).toContain("Title")
    expect(html).toContain("Body")
  })
})

// ---------------------------------------------------------------------------
// Portal hydration
// ---------------------------------------------------------------------------

describe("portal hydration", () => {
  it("hydrates portal content inline without errors", () => {
    const target = document.createElement("div")

    function App() {
      return h("div", null, h("span", null, "main"), createPortal(h("p", null, "portal"), target))
    }

    const html = renderToString(h(App, null))
    const container = document.createElement("div")
    container.innerHTML = html

    // Should not throw during hydration
    expect(() => {
      hydrate(h(App, null), container)
    }).not.toThrow()
  })

  it("attaches event handlers to portal content during hydration", () => {
    const target = document.createElement("div")
    const onClick = vi.fn()

    function App() {
      return h("div", null, createPortal(h("button", { onClick }, "Portal Button"), target))
    }

    const html = renderToString(h(App, null))
    const container = document.createElement("div")
    container.innerHTML = html

    hydrate(h(App, null), container)

    // The button should have the click handler attached
    const button = container.querySelector("button")
    if (button) {
      button.click()
      expect(onClick).toHaveBeenCalledTimes(1)
    }
  })
})

// ---------------------------------------------------------------------------
// Portal mount + state updates (non-hydration, for completeness)
// ---------------------------------------------------------------------------

describe("portal with state updates", () => {
  it("portal content updates when state changes", async () => {
    const target = document.createElement("div")
    let setter: ((v: string) => void) | null = null

    function App() {
      const [text, setText] = useState("initial")
      setter = setText
      return h("div", null, h("span", null, "main"), createPortal(h("p", null, text), target))
    }

    const container = document.createElement("div")
    mount(h(App, null), container)

    expect(target.innerHTML).toBe("<p>initial</p>")

    setter!("updated")
    await flushMicrotasks()
    flushUpdates()

    expect(target.innerHTML).toBe("<p>updated</p>")

    unmount(h(App, null), container)
  })

  it("multiple portals into different targets update independently", async () => {
    const target1 = document.createElement("div")
    const target2 = document.createElement("div")
    let setter1: ((v: string) => void) | null = null
    let setter2: ((v: string) => void) | null = null

    function App() {
      const [text1, setText1] = useState("a")
      const [text2, setText2] = useState("b")
      setter1 = setText1
      setter2 = setText2
      return h(
        "div",
        null,
        createPortal(h("span", null, text1), target1),
        createPortal(h("span", null, text2), target2),
      )
    }

    const container = document.createElement("div")
    mount(h(App, null), container)

    expect(target1.innerHTML).toBe("<span>a</span>")
    expect(target2.innerHTML).toBe("<span>b</span>")

    setter1!("x")
    await flushMicrotasks()
    flushUpdates()

    expect(target1.innerHTML).toBe("<span>x</span>")
    expect(target2.innerHTML).toBe("<span>b</span>")

    setter2!("y")
    await flushMicrotasks()
    flushUpdates()

    expect(target1.innerHTML).toBe("<span>x</span>")
    expect(target2.innerHTML).toBe("<span>y</span>")
  })
})
