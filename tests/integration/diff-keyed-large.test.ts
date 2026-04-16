/**
 * Large keyed list tests that exercise the LIS-based algorithm in diff.ts.
 *
 * The patchKeyedChildren function uses a small-list fast path when
 * (newMiddleLen < 4 || (oldMiddleLen | newMiddleLen) < 32).
 * To force the LIS code path, the middle section (after matching common
 * prefix/suffix) must have both oldMiddleLen and newMiddleLen >= 32, so
 * we use lists of 50 items with no common prefix or suffix keys.
 *
 * Items are rendered as direct keyed children of the container, not wrapped
 * in a second element, so querying container.children gives the item nodes.
 */

import { describe, expect, it } from "vitest"
import { h, mount, patch } from "../../src/index"
import type { VNode } from "../../src/vnode"

function setup(): HTMLDivElement {
  return document.createElement("div")
}

// Build a keyed div child; text = key string so textContent identifies the node.
function item(key: string | number): VNode {
  return h("div", { key: String(key) }, String(key))
}

// Get the text content of each direct child of the parent element.
function getTexts(parent: Element): string[] {
  return Array.from(parent.children).map((el) => el.textContent!)
}

// Get direct child Elements of a parent.
function getChildren(parent: Element): Element[] {
  return Array.from(parent.children)
}

/**
 * Deterministic shuffle (seeded Fisher-Yates using a simple LCG).
 * Produces the same permutation for a given seed, making tests reproducible.
 */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = arr.slice()
  let s = seed
  for (let i = result.length - 1; i > 0; i--) {
    s = (1664525 * s + 1013904223) & 0x7fffffff
    const j = s % (i + 1)
    const tmp = result[i]!
    result[i] = result[j]!
    result[j] = tmp
  }
  return result
}

describe("diff / large keyed list (LIS algorithm path)", () => {
  /**
   * Mount 50 keyed items directly under a wrapper ul, then patch.
   * The keyed diffing in patchKeyedChildren works on the children array
   * of the ul element -- no prefix/suffix matches so the full middle
   * section (50 items) hits the LIS code path (>= 32 items).
   */

  it("should correctly reverse a large list (50 items)", () => {
    const container = setup()
    const keys = Array.from({ length: 50 }, (_, i) => i)

    const oldUl = h("ul", null, ...keys.map(item))
    mount(oldUl, container)

    const ul = container.firstElementChild!
    // Capture original DOM nodes by their text content
    const nodeMap = new Map<string, Element>()
    for (const el of getChildren(ul)) {
      nodeMap.set(el.textContent!, el)
    }

    const reversed = [...keys].reverse()
    const newUl = h("ul", null, ...reversed.map(item))
    patch(oldUl, newUl, container)

    const texts = getTexts(ul)
    expect(texts).toEqual(reversed.map(String))

    // Verify DOM nodes were moved rather than recreated
    const newChildren = getChildren(ul)
    for (const el of newChildren) {
      expect(el).toBe(nodeMap.get(el.textContent!))
    }
  })

  it("should correctly handle a large deterministically shuffled list", () => {
    const container = setup()
    const keys = Array.from({ length: 50 }, (_, i) => i)

    const oldUl = h("ul", null, ...keys.map(item))
    mount(oldUl, container)

    const ul = container.firstElementChild!
    const nodeMap = new Map<string, Element>()
    for (const el of getChildren(ul)) {
      nodeMap.set(el.textContent!, el)
    }

    const shuffled = seededShuffle(keys, 42)
    const newUl = h("ul", null, ...shuffled.map(item))
    patch(oldUl, newUl, container)

    const texts = getTexts(ul)
    expect(texts).toEqual(shuffled.map(String))

    // All DOM nodes should be reused
    for (const el of getChildren(ul)) {
      expect(el).toBe(nodeMap.get(el.textContent!))
    }
  })

  it("should move the last item to first position in a large list", () => {
    const container = setup()
    const keys = Array.from({ length: 50 }, (_, i) => i)

    const oldUl = h("ul", null, ...keys.map(item))
    mount(oldUl, container)

    const ul = container.firstElementChild!
    const lastNode = getChildren(ul)[49]!

    // Move key 49 to the front
    const reordered = [49, ...keys.slice(0, 49)]
    const newUl = h("ul", null, ...reordered.map(item))
    patch(oldUl, newUl, container)

    const texts = getTexts(ul)
    expect(texts[0]).toBe("49")
    expect(texts[1]).toBe("0")
    expect(texts[49]).toBe("48")

    // The DOM node for key 49 should be moved, not recreated
    expect(getChildren(ul)[0]).toBe(lastNode)
  })

  it("should remove every other item from a large list", () => {
    const container = setup()
    const keys = Array.from({ length: 50 }, (_, i) => i)

    const oldUl = h("ul", null, ...keys.map(item))
    mount(oldUl, container)

    const ul = container.firstElementChild!

    // Keep only even-indexed keys
    const evens = keys.filter((k) => k % 2 === 0)
    const newUl = h("ul", null, ...evens.map(item))
    patch(oldUl, newUl, container)

    const texts = getTexts(ul)
    expect(texts).toEqual(evens.map(String))
    expect(ul.children.length).toBe(25)
  })

  it("should insert new items in the middle of a large list", () => {
    const container = setup()
    const keys = Array.from({ length: 50 }, (_, i) => i)

    const oldUl = h("ul", null, ...keys.map(item))
    mount(oldUl, container)

    const ul = container.firstElementChild!

    // Insert keys 100..109 after position 24 (in the middle)
    const newKeys = [
      ...keys.slice(0, 25),
      ...Array.from({ length: 10 }, (_, i) => 100 + i),
      ...keys.slice(25),
    ]
    const newUl = h("ul", null, ...newKeys.map(item))
    patch(oldUl, newUl, container)

    const texts = getTexts(ul)
    expect(texts.length).toBe(60)
    expect(texts[24]).toBe("24")
    expect(texts[25]).toBe("100")
    expect(texts[34]).toBe("109")
    expect(texts[35]).toBe("25")
    expect(texts[59]).toBe("49")
  })

  it("should handle patch from an empty keyed list to a large non-empty list", () => {
    const container = setup()
    const oldUl = h("ul", null)
    mount(oldUl, container)

    const ul = container.firstElementChild!
    expect(ul.children.length).toBe(0)

    const keys = Array.from({ length: 50 }, (_, i) => i)
    const newUl = h("ul", null, ...keys.map(item))
    patch(oldUl, newUl, container)

    expect(ul.children.length).toBe(50)
    const texts = getTexts(ul)
    expect(texts).toEqual(keys.map(String))
  })

  it("should handle patch from a large non-empty keyed list to empty", () => {
    const container = setup()
    const keys = Array.from({ length: 50 }, (_, i) => i)

    const oldUl = h("ul", null, ...keys.map(item))
    mount(oldUl, container)

    const ul = container.firstElementChild!
    expect(ul.children.length).toBe(50)

    const newUl = h("ul", null)
    patch(oldUl, newUl, container)
    expect(ul.children.length).toBe(0)
  })

  it("should handle a single-item keyed list where key changes ([a] -> [b])", () => {
    const container = setup()

    const oldUl = h("ul", null, h("li", { key: "a" }, "item-a"))
    mount(oldUl, container)

    const ul = container.firstElementChild!
    const oldLi = ul.children[0]!
    expect(oldLi.textContent).toBe("item-a")

    const newUl = h("ul", null, h("li", { key: "b" }, "item-b"))
    patch(oldUl, newUl, container)

    expect(ul.children.length).toBe(1)
    const newLi = ul.children[0]!
    expect(newLi.textContent).toBe("item-b")
  })

  it("should handle a single-item keyed list where key stays the same but content changes", () => {
    const container = setup()

    const oldUl = h("ul", null, h("li", { key: "a" }, "original"))
    mount(oldUl, container)

    const ul = container.firstElementChild!
    const originalLi = ul.children[0]!

    const newUl = h("ul", null, h("li", { key: "a" }, "updated"))
    patch(oldUl, newUl, container)

    const li = ul.children[0]!
    expect(li.textContent).toBe("updated")
    // Same key means the DOM node is patched in place (same element reference)
    expect(li).toBe(originalLi)
  })

  it("should correctly reconcile a large list with a mix of moves, inserts, and removals", () => {
    const container = setup()
    const keys = Array.from({ length: 50 }, (_, i) => i)

    const oldUl = h("ul", null, ...keys.map(item))
    mount(oldUl, container)

    const ul = container.firstElementChild!
    const nodeMap = new Map<string, Element>()
    for (const el of getChildren(ul)) {
      nodeMap.set(el.textContent!, el)
    }

    // New list: first 5 evens, then all odds reversed, then key 999, then remaining evens
    const evens = keys.filter((k) => k % 2 === 0) // [0, 2, 4, ..., 48]
    const odds = keys.filter((k) => k % 2 !== 0).reverse() // [49, 47, ..., 1]
    const newKeys = [...evens.slice(0, 5), ...odds, 999, ...evens.slice(5)]

    const newUl = h("ul", null, ...newKeys.map(item))
    patch(oldUl, newUl, container)

    const texts = getTexts(ul)
    expect(texts).toEqual(newKeys.map(String))
    expect(texts).toContain("999")

    // Original key nodes (other than the new key 999) should be reused
    for (const el of getChildren(ul)) {
      const text = el.textContent!
      if (text === "999") continue // newly mounted, no prior node
      expect(el).toBe(nodeMap.get(text))
    }
  })
})
