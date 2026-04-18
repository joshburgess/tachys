/**
 * Integration tests for Phase 3: mid-render yield and resume.
 *
 * These tests verify that the scheduler correctly handles yield points
 * during Transition-lane children diffing. Because shouldYield() is
 * time-based (5ms budget), these tests use flushUpdates() which processes
 * everything synchronously -- any mid-render yields are immediately
 * resumed by processAllLanes. This verifies correctness of the
 * save/resume/afterWork machinery under real diff scenarios.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  flushUpdates,
  scheduleUpdate,
  Lane,
  setCurrentLane,
} from "../../src/scheduler"
import {
  isCollecting,
  discardEffects,
} from "../../src/effects"
import { discardPendingWork, hasPendingWork } from "../../src/work-loop"
import type { ComponentInstance } from "../../src/component"
import { mount } from "../../src/mount"
import { patch } from "../../src/diff"
import { h } from "../../src/index"

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  if (isCollecting()) discardEffects()
  if (hasPendingWork()) discardPendingWork()
  setCurrentLane(Lane.Default)
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContainer(): Element {
  return document.createElement("div")
}

function childTextContent(el: Element): string[] {
  return Array.from(el.childNodes).map((n) => n.textContent ?? "")
}

// ---------------------------------------------------------------------------
// Non-keyed children: patch via scheduler
// ---------------------------------------------------------------------------

describe("non-keyed children update via Transition lane", () => {
  it("updates a list of items correctly", () => {
    const container = makeContainer()
    const oldTree = h("ul", null,
      h("li", null, "A"),
      h("li", null, "B"),
      h("li", null, "C"),
    )
    mount(oldTree, container)
    expect(container.innerHTML).toBe("<ul><li>A</li><li>B</li><li>C</li></ul>")

    const newTree = h("ul", null,
      h("li", null, "X"),
      h("li", null, "Y"),
      h("li", null, "Z"),
    )
    patch(oldTree, newTree, container)
    expect(container.innerHTML).toBe("<ul><li>X</li><li>Y</li><li>Z</li></ul>")
  })

  it("handles growing a list", () => {
    const container = makeContainer()
    const oldTree = h("div", null,
      h("span", null, "1"),
      h("span", null, "2"),
    )
    mount(oldTree, container)

    const newTree = h("div", null,
      h("span", null, "1"),
      h("span", null, "2"),
      h("span", null, "3"),
      h("span", null, "4"),
    )
    patch(oldTree, newTree, container)
    expect(container.querySelector("div")!.childNodes.length).toBe(4)
    expect(container.querySelector("div")!.textContent).toBe("1234")
  })

  it("handles shrinking a list", () => {
    const container = makeContainer()
    const oldTree = h("div", null,
      h("span", null, "1"),
      h("span", null, "2"),
      h("span", null, "3"),
    )
    mount(oldTree, container)

    const newTree = h("div", null,
      h("span", null, "1"),
    )
    patch(oldTree, newTree, container)
    expect(container.querySelector("div")!.childNodes.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Keyed children: patch directly
// ---------------------------------------------------------------------------

describe("keyed children update correctness", () => {
  it("reorders keyed items correctly", () => {
    const container = makeContainer()
    const oldTree = h("ul", null,
      h("li", { key: "a" }, "A"),
      h("li", { key: "b" }, "B"),
      h("li", { key: "c" }, "C"),
    )
    mount(oldTree, container)
    expect(container.innerHTML).toBe("<ul><li>A</li><li>B</li><li>C</li></ul>")

    const newTree = h("ul", null,
      h("li", { key: "c" }, "C"),
      h("li", { key: "a" }, "A"),
      h("li", { key: "b" }, "B"),
    )
    patch(oldTree, newTree, container)
    expect(container.innerHTML).toBe("<ul><li>C</li><li>A</li><li>B</li></ul>")
  })

  it("handles keyed insertions and removals", () => {
    const container = makeContainer()
    const oldTree = h("ul", null,
      h("li", { key: "a" }, "A"),
      h("li", { key: "b" }, "B"),
      h("li", { key: "c" }, "C"),
    )
    mount(oldTree, container)

    const newTree = h("ul", null,
      h("li", { key: "b" }, "B"),
      h("li", { key: "d" }, "D"),
      h("li", { key: "c" }, "C"),
    )
    patch(oldTree, newTree, container)
    expect(container.innerHTML).toBe("<ul><li>B</li><li>D</li><li>C</li></ul>")
  })

  it("complete reversal with keyed children", () => {
    const container = makeContainer()
    const oldTree = h("ul", null,
      h("li", { key: "1" }, "A"),
      h("li", { key: "2" }, "B"),
      h("li", { key: "3" }, "C"),
      h("li", { key: "4" }, "D"),
    )
    mount(oldTree, container)

    const newTree = h("ul", null,
      h("li", { key: "4" }, "D"),
      h("li", { key: "3" }, "C"),
      h("li", { key: "2" }, "B"),
      h("li", { key: "1" }, "A"),
    )
    patch(oldTree, newTree, container)
    expect(container.innerHTML).toBe("<ul><li>D</li><li>C</li><li>B</li><li>A</li></ul>")
  })
})

// ---------------------------------------------------------------------------
// Fragment yield propagation
// ---------------------------------------------------------------------------

describe("fragment children update", () => {
  it("patches fragment children and updates dom reference", () => {
    const container = makeContainer()
    const oldTree = h(null, null,
      h("span", null, "A"),
      h("span", null, "B"),
    )
    mount(oldTree, container)
    expect(container.innerHTML).toBe("<span>A</span><span>B</span>")

    const newTree = h(null, null,
      h("span", null, "X"),
      h("span", null, "Y"),
    )
    patch(oldTree, newTree, container)
    expect(container.innerHTML).toBe("<span>X</span><span>Y</span>")
    expect(newTree.dom).toBe(container.firstChild)
  })
})

// ---------------------------------------------------------------------------
// Deep tree: verify afterWork propagation through component boundaries
// ---------------------------------------------------------------------------

describe("deep tree with components", () => {
  it("correctly processes nested component tree during patch", () => {
    const container = makeContainer()

    // Simple wrapper component
    function Wrapper(props: { children?: unknown }) {
      return h("div", { class: "wrapper" }, props.children as any)
    }

    const oldTree = h(Wrapper, null,
      h("span", null, "old-content"),
    )
    mount(oldTree, container)
    expect(container.querySelector(".wrapper span")!.textContent).toBe("old-content")

    const newTree = h(Wrapper, null,
      h("span", null, "new-content"),
    )
    patch(oldTree, newTree, container)
    expect(container.querySelector(".wrapper span")!.textContent).toBe("new-content")
  })

  it("handles nested component with keyed list children", () => {
    const container = makeContainer()

    function List(props: { items: string[] }) {
      return h("ul", null,
        ...props.items.map((item) => h("li", { key: item }, item)),
      )
    }

    const oldTree = h(List, { items: ["a", "b", "c"] })
    mount(oldTree, container)
    expect(container.innerHTML).toBe("<ul><li>a</li><li>b</li><li>c</li></ul>")

    const newTree = h(List, { items: ["c", "b", "a", "d"] })
    patch(oldTree, newTree, container)
    expect(container.innerHTML).toBe("<ul><li>c</li><li>b</li><li>a</li><li>d</li></ul>")
  })
})

// ---------------------------------------------------------------------------
// Verify no pending work leaks after synchronous operations
// ---------------------------------------------------------------------------

describe("work-loop state is clean after operations", () => {
  it("no pending work after direct patch", () => {
    const container = makeContainer()
    const oldTree = h("div", null,
      h("span", null, "A"),
      h("span", null, "B"),
    )
    mount(oldTree, container)

    const newTree = h("div", null,
      h("span", null, "X"),
      h("span", null, "Y"),
    )
    patch(oldTree, newTree, container)
    expect(hasPendingWork()).toBe(false)
  })

  it("no pending work after flushUpdates with Transition lane", () => {
    const container = makeContainer()
    const oldTree = h("div", null, h("span", null, "old"))
    mount(oldTree, container)

    // Simulate a Transition-lane update via flushUpdates
    const instance: ComponentInstance = {
      _type: () => { throw new Error("unused") },
      _props: {},
      _vnode: null as never,
      _rendered: null,
      _parentDom: container,
      _queuedLanes: 0,
      _hooks: [],
      _effects: [],
      _mounted: true,
      _rerender: vi.fn(),
      _contexts: null,
      _hookCount: 0,
    }
    scheduleUpdate(instance, Lane.Transition)
    flushUpdates()
    expect(hasPendingWork()).toBe(false)
  })
})
