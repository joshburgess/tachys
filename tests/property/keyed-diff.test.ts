/**
 * Property-based fuzz tests for the keyed children diff algorithm.
 *
 * Tests both the small-list path (bitmask, < 32 items) and the
 * full Map + LIS path (>= 32 items) by generating random keyed
 * list transitions and verifying DOM correctness.
 */

import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { flushUpdates, h, mount, patch, useState } from "../../src/index"
import type { VNode } from "../../src/vnode"

// --- Helpers ---

/** Build a keyed VNode list: <tag key={k}>{text}</tag> for each key. */
function keyedList(tag: string, keys: (string | number)[]): VNode {
  return h("div", null, ...keys.map((k) => h(tag, { key: k }, String(k))))
}

/** Extract text content of each child element in order. */
function childTexts(container: HTMLDivElement): string[] {
  const wrapper = container.firstElementChild!
  const result: string[] = []
  for (let i = 0; i < wrapper.children.length; i++) {
    result.push(wrapper.children[i]!.textContent!)
  }
  return result
}

/** Extract the actual DOM Element references for each child. */
function childDomNodes(container: HTMLDivElement): Element[] {
  const wrapper = container.firstElementChild!
  const result: Element[] = []
  for (let i = 0; i < wrapper.children.length; i++) {
    result.push(wrapper.children[i]!)
  }
  return result
}

// --- Arbitraries ---

/** Unique integer keys, constrained to trigger the small path (< 32 middle items). */
const arbSmallKeyList = fc.uniqueArray(fc.integer({ min: 1, max: 100 }), {
  minLength: 0,
  maxLength: 20,
})

/** Unique integer keys, large enough to exercise the Map + LIS path. */
const arbLargeKeyList = fc.uniqueArray(fc.integer({ min: 1, max: 500 }), {
  minLength: 33,
  maxLength: 60,
})

/** Unique string keys for mixed key type testing. */
const arbStringKeyList = fc.uniqueArray(
  fc.string({ minLength: 1, maxLength: 8 }).filter((s) => s.trim().length > 0),
  { minLength: 1, maxLength: 15 },
)

// --- Core invariant: after patching old -> new, DOM matches new key order ---

describe("Property: keyed diff correctness", () => {
  it("arbitrary permutation produces correct DOM order (small path)", () => {
    fc.assert(
      fc.property(
        arbSmallKeyList.filter((a) => a.length >= 2),
        fc.func(fc.double({ min: 0, max: 1, noNaN: true })),
        (keys, sortFn) => {
          const container = document.createElement("div")
          const oldVNode = keyedList("li", keys)
          mount(oldVNode, container)
          expect(childTexts(container)).toEqual(keys.map(String))

          // Shuffle using the generated sort function
          const shuffled = [...keys].sort((a, b) => sortFn(a) - sortFn(b))
          const newVNode = keyedList("li", shuffled)
          patch(oldVNode, newVNode, container)
          expect(childTexts(container)).toEqual(shuffled.map(String))
        },
      ),
      { numRuns: 200 },
    )
  })

  it("arbitrary permutation produces correct DOM order (large/LIS path)", () => {
    fc.assert(
      fc.property(
        arbLargeKeyList,
        fc.func(fc.double({ min: 0, max: 1, noNaN: true })),
        (keys, sortFn) => {
          const container = document.createElement("div")
          const oldVNode = keyedList("li", keys)
          mount(oldVNode, container)

          const shuffled = [...keys].sort((a, b) => sortFn(a) - sortFn(b))
          const newVNode = keyedList("li", shuffled)
          patch(oldVNode, newVNode, container)
          expect(childTexts(container)).toEqual(shuffled.map(String))
        },
      ),
      { numRuns: 50 },
    )
  })

  it("removing random subset of keys", () => {
    fc.assert(
      fc.property(
        arbSmallKeyList.filter((a) => a.length >= 3),
        fc.integer({ min: 1, max: 10 }),
        (keys, seed) => {
          const container = document.createElement("div")
          const oldVNode = keyedList("li", keys)
          mount(oldVNode, container)

          // Remove roughly half the keys using seed-based selection
          const remaining = keys.filter((_, i) => (i + seed) % 3 !== 0)
          if (remaining.length === 0) return // skip degenerate case

          const newVNode = keyedList("li", remaining)
          patch(oldVNode, newVNode, container)
          expect(childTexts(container)).toEqual(remaining.map(String))
        },
      ),
      { numRuns: 200 },
    )
  })

  it("inserting new keys at random positions", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 50 }), { minLength: 2, maxLength: 10 }),
        fc.uniqueArray(fc.integer({ min: 51, max: 100 }), { minLength: 1, maxLength: 5 }),
        (existingKeys, newKeys) => {
          const container = document.createElement("div")
          const oldVNode = keyedList("li", existingKeys)
          mount(oldVNode, container)

          // Interleave new keys at various positions
          const combined = [...existingKeys]
          for (let i = 0; i < newKeys.length; i++) {
            const pos = i % (combined.length + 1)
            combined.splice(pos, 0, newKeys[i]!)
          }

          const newVNode = keyedList("li", combined)
          patch(oldVNode, newVNode, container)
          expect(childTexts(container)).toEqual(combined.map(String))
        },
      ),
      { numRuns: 200 },
    )
  })

  it("mixed insert + remove + reorder", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 50 }), { minLength: 3, maxLength: 15 }),
        fc.uniqueArray(fc.integer({ min: 51, max: 100 }), { minLength: 0, maxLength: 5 }),
        fc.func(fc.double({ min: 0, max: 1, noNaN: true })),
        fc.integer({ min: 1, max: 10 }),
        (oldKeys, insertKeys, sortFn, removeSeed) => {
          const container = document.createElement("div")
          const oldVNode = keyedList("li", oldKeys)
          mount(oldVNode, container)

          // Remove some, add some, shuffle
          const surviving = oldKeys.filter((_, i) => (i + removeSeed) % 4 !== 0)
          const combined = [...surviving, ...insertKeys]
          const shuffled = combined.sort((a, b) => sortFn(a) - sortFn(b))

          if (shuffled.length === 0) return

          const newVNode = keyedList("li", shuffled)
          patch(oldVNode, newVNode, container)
          expect(childTexts(container)).toEqual(shuffled.map(String))
        },
      ),
      { numRuns: 200 },
    )
  })

  it("string keys work correctly", () => {
    fc.assert(
      fc.property(
        arbStringKeyList,
        fc.func(fc.double({ min: 0, max: 1, noNaN: true })),
        (keys, sortFn) => {
          const container = document.createElement("div")
          const oldVNode = keyedList("span", keys)
          mount(oldVNode, container)

          const shuffled = [...keys].sort((a, b) => sortFn(a) - sortFn(b))
          const newVNode = keyedList("span", shuffled)
          patch(oldVNode, newVNode, container)
          expect(childTexts(container)).toEqual(shuffled.map(String))
        },
      ),
      { numRuns: 100 },
    )
  })
})

describe("Property: keyed diff DOM node reuse", () => {
  it("preserves DOM nodes for keys that exist in both old and new lists", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 30 }), { minLength: 3, maxLength: 12 }),
        (keys) => {
          const container = document.createElement("div")
          const oldVNode = keyedList("li", keys)
          mount(oldVNode, container)

          // Capture DOM references keyed by text content
          const domMap = new Map<string, Element>()
          const wrapper = container.firstElementChild!
          for (let i = 0; i < wrapper.children.length; i++) {
            domMap.set(wrapper.children[i]!.textContent!, wrapper.children[i]!)
          }

          // Reverse the list
          const reversed = [...keys].reverse()
          const newVNode = keyedList("li", reversed)
          patch(oldVNode, newVNode, container)

          // Every DOM node should be the same object (reused, not recreated)
          const nodes = childDomNodes(container)
          for (let i = 0; i < reversed.length; i++) {
            const key = String(reversed[i])
            expect(nodes[i]).toBe(domMap.get(key))
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it("preserves DOM nodes through random permutations", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 50 }), { minLength: 5, maxLength: 20 }),
        fc.func(fc.double({ min: 0, max: 1, noNaN: true })),
        (keys, sortFn) => {
          const container = document.createElement("div")
          const oldVNode = keyedList("li", keys)
          mount(oldVNode, container)

          const domMap = new Map<string, Element>()
          const wrapper = container.firstElementChild!
          for (let i = 0; i < wrapper.children.length; i++) {
            domMap.set(wrapper.children[i]!.textContent!, wrapper.children[i]!)
          }

          const shuffled = [...keys].sort((a, b) => sortFn(a) - sortFn(b))
          const newVNode = keyedList("li", shuffled)
          patch(oldVNode, newVNode, container)

          const nodes = childDomNodes(container)
          for (let i = 0; i < shuffled.length; i++) {
            expect(nodes[i]).toBe(domMap.get(String(shuffled[i])))
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it("preserves DOM nodes for surviving keys after partial removal", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 30 }), { minLength: 4, maxLength: 15 }),
        fc.integer({ min: 0, max: 5 }),
        (keys, removeSeed) => {
          const container = document.createElement("div")
          const oldVNode = keyedList("li", keys)
          mount(oldVNode, container)

          const domMap = new Map<string, Element>()
          const wrapper = container.firstElementChild!
          for (let i = 0; i < wrapper.children.length; i++) {
            domMap.set(wrapper.children[i]!.textContent!, wrapper.children[i]!)
          }

          // Remove every 3rd element
          const remaining = keys.filter((_, i) => (i + removeSeed) % 3 !== 0)
          if (remaining.length === 0) return

          const newVNode = keyedList("li", remaining)
          patch(oldVNode, newVNode, container)

          const nodes = childDomNodes(container)
          for (let i = 0; i < remaining.length; i++) {
            expect(nodes[i]).toBe(domMap.get(String(remaining[i])))
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

describe("Property: keyed diff edge cases", () => {
  it("empty -> non-empty", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 20 }),
        (keys) => {
          const container = document.createElement("div")
          const oldVNode = keyedList("li", [])
          mount(oldVNode, container)
          expect(container.firstElementChild!.children.length).toBe(0)

          const newVNode = keyedList("li", keys)
          patch(oldVNode, newVNode, container)
          expect(childTexts(container)).toEqual(keys.map(String))
        },
      ),
      { numRuns: 100 },
    )
  })

  it("non-empty -> empty", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 20 }),
        (keys) => {
          const container = document.createElement("div")
          const oldVNode = keyedList("li", keys)
          mount(oldVNode, container)
          expect(container.firstElementChild!.children.length).toBe(keys.length)

          const newVNode = keyedList("li", [])
          patch(oldVNode, newVNode, container)
          expect(container.firstElementChild!.children.length).toBe(0)
        },
      ),
      { numRuns: 100 },
    )
  })

  it("single element list", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 101, max: 200 }),
        (oldKey, newKey) => {
          const container = document.createElement("div")
          const oldVNode = keyedList("li", [oldKey])
          mount(oldVNode, container)

          const newVNode = keyedList("li", [newKey])
          patch(oldVNode, newVNode, container)
          expect(childTexts(container)).toEqual([String(newKey)])
        },
      ),
      { numRuns: 100 },
    )
  })

  it("complete replacement (no shared keys)", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 50 }), { minLength: 2, maxLength: 10 }),
        fc.uniqueArray(fc.integer({ min: 51, max: 100 }), { minLength: 2, maxLength: 10 }),
        (oldKeys, newKeys) => {
          const container = document.createElement("div")
          const oldVNode = keyedList("li", oldKeys)
          mount(oldVNode, container)

          const newVNode = keyedList("li", newKeys)
          patch(oldVNode, newVNode, container)
          expect(childTexts(container)).toEqual(newKeys.map(String))
        },
      ),
      { numRuns: 100 },
    )
  })

  it("prepend items", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 50 }), { minLength: 2, maxLength: 10 }),
        fc.uniqueArray(fc.integer({ min: 51, max: 100 }), { minLength: 1, maxLength: 5 }),
        (existing, prepended) => {
          const container = document.createElement("div")
          const oldVNode = keyedList("li", existing)
          mount(oldVNode, container)

          const combined = [...prepended, ...existing]
          const newVNode = keyedList("li", combined)
          patch(oldVNode, newVNode, container)
          expect(childTexts(container)).toEqual(combined.map(String))
        },
      ),
      { numRuns: 100 },
    )
  })

  it("append items", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 50 }), { minLength: 2, maxLength: 10 }),
        fc.uniqueArray(fc.integer({ min: 51, max: 100 }), { minLength: 1, maxLength: 5 }),
        (existing, appended) => {
          const container = document.createElement("div")
          const oldVNode = keyedList("li", existing)
          mount(oldVNode, container)

          const combined = [...existing, ...appended]
          const newVNode = keyedList("li", combined)
          patch(oldVNode, newVNode, container)
          expect(childTexts(container)).toEqual(combined.map(String))
        },
      ),
      { numRuns: 100 },
    )
  })

  it("swap two elements (common UI pattern)", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 50 }), { minLength: 3, maxLength: 15 }),
        fc.nat(),
        fc.nat(),
        (keys, i, j) => {
          const a = i % keys.length
          const b = j % keys.length
          if (a === b) return

          const container = document.createElement("div")
          const oldVNode = keyedList("li", keys)
          mount(oldVNode, container)

          const swapped = [...keys]
          const tmp = swapped[a]!
          swapped[a] = swapped[b]!
          swapped[b] = tmp

          const newVNode = keyedList("li", swapped)
          patch(oldVNode, newVNode, container)
          expect(childTexts(container)).toEqual(swapped.map(String))
        },
      ),
      { numRuns: 200 },
    )
  })

  it("move single element to front", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 50 }), { minLength: 3, maxLength: 15 }),
        fc.nat(),
        (keys, idx) => {
          const pos = idx % keys.length
          const container = document.createElement("div")
          const oldVNode = keyedList("li", keys)
          mount(oldVNode, container)

          const moved = [...keys]
          const [item] = moved.splice(pos, 1)
          moved.unshift(item!)

          const newVNode = keyedList("li", moved)
          patch(oldVNode, newVNode, container)
          expect(childTexts(container)).toEqual(moved.map(String))
        },
      ),
      { numRuns: 200 },
    )
  })
})

describe("Property: keyed diff with components (via useState)", () => {
  it("stateful component list survives reorder", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 20 }), { minLength: 3, maxLength: 8 }),
        (keys) => {
          let triggerReverse: () => void

          function Item(props: Record<string, unknown>) {
            return h("li", null, String(props["id"]))
          }

          function App() {
            const [list, setList] = useState(keys)
            triggerReverse = () => setList((prev: number[]) => [...prev].reverse())
            return h("ul", null, ...list.map((k) => h(Item, { key: k, id: k })))
          }

          const container = document.createElement("div")
          mount(h(App, null), container)

          const ul = container.querySelector("ul")!
          expect(ul.children.length).toBe(keys.length)
          for (let i = 0; i < keys.length; i++) {
            expect(ul.children[i]!.textContent).toBe(String(keys[i]))
          }

          triggerReverse!()
          flushUpdates()

          const reversed = [...keys].reverse()
          expect(ul.children.length).toBe(reversed.length)
          for (let i = 0; i < reversed.length; i++) {
            expect(ul.children[i]!.textContent).toBe(String(reversed[i]))
          }
        },
      ),
      { numRuns: 50 },
    )
  })

  it("adding and removing items from stateful list", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 30 }), { minLength: 2, maxLength: 8 }),
        fc.uniqueArray(fc.integer({ min: 31, max: 60 }), { minLength: 1, maxLength: 4 }),
        fc.integer({ min: 0, max: 5 }),
        (initial, toAdd, removeSeed) => {
          let triggerUpdate: (newList: number[]) => void

          function App() {
            const [list, setList] = useState(initial)
            triggerUpdate = (nl: number[]) => setList(nl)
            return h("ul", null, ...list.map((k) => h("li", { key: k }, String(k))))
          }

          const container = document.createElement("div")
          mount(h(App, null), container)

          // Remove some, add some
          const surviving = initial.filter((_, i) => (i + removeSeed) % 3 !== 0)
          const newList = [...surviving, ...toAdd]

          triggerUpdate!(newList)
          flushUpdates()

          const ul = container.querySelector("ul")!
          expect(ul.children.length).toBe(newList.length)
          for (let i = 0; i < newList.length; i++) {
            expect(ul.children[i]!.textContent).toBe(String(newList[i]))
          }
        },
      ),
      { numRuns: 50 },
    )
  })
})

describe("Property: keyed diff sequential patches", () => {
  it("multiple sequential patches produce correct result", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 30 }), { minLength: 2, maxLength: 10 }),
        fc.array(fc.uniqueArray(fc.integer({ min: 1, max: 30 }), { minLength: 0, maxLength: 10 }), {
          minLength: 2,
          maxLength: 5,
        }),
        (initial, steps) => {
          const container = document.createElement("div")
          let currentVNode = keyedList("li", initial)
          mount(currentVNode, container)

          for (const step of steps) {
            if (step.length === 0) continue
            const nextVNode = keyedList("li", step)
            patch(currentVNode, nextVNode, container)
            expect(childTexts(container)).toEqual(step.map(String))
            currentVNode = nextVNode
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it("patch is idempotent (patching same list is no-op)", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 15 }),
        (keys) => {
          const container = document.createElement("div")
          const v1 = keyedList("li", keys)
          mount(v1, container)

          const domBefore = childDomNodes(container)

          const v2 = keyedList("li", keys)
          patch(v1, v2, container)

          const domAfter = childDomNodes(container)
          expect(childTexts(container)).toEqual(keys.map(String))
          // Same DOM nodes (no unnecessary recreation)
          for (let i = 0; i < keys.length; i++) {
            expect(domAfter[i]).toBe(domBefore[i])
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

describe("Property: keyed diff boundary between small and LIS paths", () => {
  it("lists of exactly 31 items (small path boundary)", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 200 }), { minLength: 31, maxLength: 31 }),
        fc.func(fc.double({ min: 0, max: 1, noNaN: true })),
        (keys, sortFn) => {
          const container = document.createElement("div")
          const oldVNode = keyedList("li", keys)
          mount(oldVNode, container)

          const shuffled = [...keys].sort((a, b) => sortFn(a) - sortFn(b))
          const newVNode = keyedList("li", shuffled)
          patch(oldVNode, newVNode, container)
          expect(childTexts(container)).toEqual(shuffled.map(String))
        },
      ),
      { numRuns: 50 },
    )
  })

  it("lists of exactly 32 items (LIS path boundary)", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 200 }), { minLength: 32, maxLength: 32 }),
        fc.func(fc.double({ min: 0, max: 1, noNaN: true })),
        (keys, sortFn) => {
          const container = document.createElement("div")
          const oldVNode = keyedList("li", keys)
          mount(oldVNode, container)

          const shuffled = [...keys].sort((a, b) => sortFn(a) - sortFn(b))
          const newVNode = keyedList("li", shuffled)
          patch(oldVNode, newVNode, container)
          expect(childTexts(container)).toEqual(shuffled.map(String))
        },
      ),
      { numRuns: 50 },
    )
  })

  it("transition from small to large list", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 200 }), { minLength: 5, maxLength: 15 }),
        fc.uniqueArray(fc.integer({ min: 1, max: 200 }), { minLength: 35, maxLength: 50 }),
        (smallKeys, largeKeys) => {
          const container = document.createElement("div")
          const oldVNode = keyedList("li", smallKeys)
          mount(oldVNode, container)

          const newVNode = keyedList("li", largeKeys)
          patch(oldVNode, newVNode, container)
          expect(childTexts(container)).toEqual(largeKeys.map(String))
        },
      ),
      { numRuns: 50 },
    )
  })

  it("transition from large to small list", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 200 }), { minLength: 35, maxLength: 50 }),
        fc.uniqueArray(fc.integer({ min: 1, max: 200 }), { minLength: 5, maxLength: 15 }),
        (largeKeys, smallKeys) => {
          const container = document.createElement("div")
          const oldVNode = keyedList("li", largeKeys)
          mount(oldVNode, container)

          const newVNode = keyedList("li", smallKeys)
          patch(oldVNode, newVNode, container)
          expect(childTexts(container)).toEqual(smallKeys.map(String))
        },
      ),
      { numRuns: 50 },
    )
  })
})
