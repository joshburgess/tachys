/**
 * Property-based tests using fast-check.
 *
 * These tests verify invariants that must hold for ALL inputs,
 * not just hand-picked examples.
 */

import fc from "fast-check"
import { beforeEach, describe, expect, it } from "vitest"
import { ChildFlags, VNodeFlags } from "../../src/flags"
import type { ChildFlag, VNodeFlag } from "../../src/flags"
import {
  flushUpdates,
  h,
  mount,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "../../src/index"
import { createTextVNode } from "../../src/jsx"
import { jsxDEV } from "../../src/jsx-dev-runtime"
import { jsx, jsxs } from "../../src/jsx-runtime"
import { acquireVNode, clearPool, getPoolSize, releaseVNode } from "../../src/pool"
import { VNode } from "../../src/vnode"

// --- Arbitraries ---

const arbTagName = fc.constantFrom(
  "div",
  "span",
  "p",
  "ul",
  "li",
  "a",
  "button",
  "input",
  "h1",
  "section",
)

const arbKey = fc.oneof(
  fc.string({ minLength: 1, maxLength: 10 }),
  fc.integer({ min: 0, max: 1000 }),
)

const arbClassName = fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 30 }))

const arbTextContent = fc.string({ minLength: 0, maxLength: 100 })

const arbProps = fc.dictionary(
  fc.constantFrom("id", "title", "role", "tabIndex", "data-x", "aria-label", "placeholder"),
  fc.oneof(fc.string({ maxLength: 20 }), fc.integer(), fc.boolean()),
  { minKeys: 0, maxKeys: 4 },
)

// --- VNode constructor tests ---

describe("Property: VNode constructor", () => {
  it("preserves all fields exactly", () => {
    fc.assert(
      fc.property(
        arbTagName,
        fc.option(arbKey, { nil: null }),
        arbClassName,
        (tag, key, className) => {
          const vnode = new VNode(
            VNodeFlags.Element,
            tag,
            key,
            null,
            null,
            ChildFlags.NoChildren,
            className,
          )
          expect(vnode.flags).toBe(VNodeFlags.Element)
          expect(vnode.type).toBe(tag)
          expect(vnode.key).toBe(key)
          expect(vnode.props).toBeNull()
          expect(vnode.children).toBeNull()
          expect(vnode.dom).toBeNull()
          expect(vnode.childFlags).toBe(ChildFlags.NoChildren)
          expect(vnode.parentDom).toBeNull()
          expect(vnode.className).toBe(className)
        },
      ),
      { numRuns: 200 },
    )
  })

  it("flags are always integer (| 0 coercion)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          VNodeFlags.Text,
          VNodeFlags.Element,
          VNodeFlags.Component,
          VNodeFlags.Fragment,
        ),
        fc.constantFrom(
          ChildFlags.NoChildren,
          ChildFlags.HasSingleChild,
          ChildFlags.HasKeyedChildren,
          ChildFlags.HasNonKeyedChildren,
          ChildFlags.HasTextChildren,
        ),
        (flag, childFlag) => {
          const vnode = new VNode(flag, null, null, null, null, childFlag, null)
          expect(vnode.flags).toBe(flag | 0)
          expect(vnode.childFlags).toBe(childFlag | 0)
          expect(Number.isInteger(vnode.flags)).toBe(true)
          expect(Number.isInteger(vnode.childFlags)).toBe(true)
        },
      ),
    )
  })
})

// --- Pool round-trip tests ---

describe("Property: VNode pool", () => {
  beforeEach(() => clearPool())

  it("acquire -> release -> acquire reuses the same object", () => {
    fc.assert(
      fc.property(arbTagName, arbClassName, (tag, className) => {
        clearPool()
        const v1 = acquireVNode(
          VNodeFlags.Element,
          tag,
          null,
          null,
          null,
          ChildFlags.NoChildren,
          className,
        )
        releaseVNode(v1)
        const v2 = acquireVNode(
          VNodeFlags.Text,
          null,
          null,
          null,
          "hello",
          ChildFlags.NoChildren,
          null,
        )
        expect(v2).toBe(v1) // same object reused
        expect(v2.flags).toBe(VNodeFlags.Text)
        expect(v2.type).toBeNull()
        expect(v2.children).toBe("hello")
      }),
      { numRuns: 100 },
    )
  })

  it("released VNodes have references nulled out", () => {
    fc.assert(
      fc.property(arbTagName, arbProps, (tag, props) => {
        clearPool()
        const v = acquireVNode(
          VNodeFlags.Element,
          tag,
          null,
          props,
          null,
          ChildFlags.NoChildren,
          null,
        )
        releaseVNode(v)
        expect(v.type).toBeNull()
        expect(v.props).toBeNull()
        expect(v.children).toBeNull()
        expect(v.dom).toBeNull()
        expect(v.parentDom).toBeNull()
      }),
      { numRuns: 100 },
    )
  })

  it("pool size never exceeds MAX_POOL_SIZE", () => {
    clearPool()
    const vnodes: VNode[] = []
    for (let i = 0; i < 10050; i++) {
      vnodes.push(acquireVNode(VNodeFlags.Text, null, null, null, "", ChildFlags.NoChildren, null))
    }
    for (const v of vnodes) {
      releaseVNode(v)
    }
    expect(getPoolSize()).toBeLessThanOrEqual(10000)
  })
})

// --- JSX runtime tests ---

describe("Property: jsx/jsxs runtime", () => {
  it("jsx creates element VNodes with correct flags", () => {
    fc.assert(
      fc.property(arbTagName, arbClassName, (tag, className) => {
        const props: Record<string, unknown> = {}
        if (className !== null) props["className"] = className
        const vnode = jsx(tag, props)
        expect(vnode.flags & VNodeFlags.Element).toBeTruthy()
        expect(vnode.type).toBe(tag)
        expect(vnode.className).toBe(className)
      }),
      { numRuns: 200 },
    )
  })

  it("jsx with function type creates component VNodes", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 10 }), (name) => {
        const Comp = Object.defineProperty(() => jsx("div", {}), "name", { value: name })
        const vnode = jsx(Comp as () => VNode, {})
        expect(vnode.flags & VNodeFlags.Component).toBeTruthy()
        expect(vnode.type).toBe(Comp)
      }),
      { numRuns: 50 },
    )
  })

  it("jsxs normalizes falsy children to empty text VNodes", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.constant(null), fc.constant(undefined), fc.constant(false)), {
          minLength: 1,
          maxLength: 5,
        }),
        (falsyChildren) => {
          const vnode = jsxs("div", { children: falsyChildren })
          if (vnode.childFlags === ChildFlags.HasNonKeyedChildren) {
            const children = vnode.children as VNode[]
            expect(children.length).toBe(falsyChildren.length)
            for (const child of children) {
              expect(child.flags & VNodeFlags.Text).toBeTruthy()
              expect(child.children).toBe("")
            }
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it("jsxs with string/number children creates text VNodes", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.string({ maxLength: 20 }), fc.integer({ min: -999, max: 999 })), {
          minLength: 1,
          maxLength: 5,
        }),
        (mixedChildren) => {
          const vnode = jsxs("div", { children: mixedChildren })
          const children = vnode.children as VNode[]
          expect(children.length).toBe(mixedChildren.length)
          for (let i = 0; i < children.length; i++) {
            expect(children[i]!.flags & VNodeFlags.Text).toBeTruthy()
            expect(children[i]!.children).toBe(String(mixedChildren[i]))
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it("jsxDEV delegates to jsx for single/no children and jsxs for arrays", () => {
    fc.assert(
      fc.property(arbTagName, (tag) => {
        // No children -> jsx
        const v1 = jsxDEV(tag, {})
        expect(v1.type).toBe(tag)
        expect(v1.childFlags).toBe(ChildFlags.NoChildren)

        // Single string child -> jsx
        const v2 = jsxDEV(tag, { children: "hello" })
        expect(v2.type).toBe(tag)
        expect(v2.children).toBe("hello")

        // Array children -> jsxs
        const child1 = jsx("span", {})
        const child2 = jsx("span", {})
        const v3 = jsxDEV(tag, { children: [child1, child2] })
        expect(v3.type).toBe(tag)
        expect(Array.isArray(v3.children)).toBe(true)
      }),
      { numRuns: 50 },
    )
  })

  it("keys assigned via jsx are preserved on the VNode", () => {
    fc.assert(
      fc.property(arbTagName, arbKey, (tag, key) => {
        const vnode = jsx(tag, {}, key)
        expect(vnode.key).toBe(key)
      }),
      { numRuns: 100 },
    )
  })
})

// --- Mount and patch invariants ---

describe("Property: mount and patch", () => {
  it("mounting text produces a single text node", () => {
    fc.assert(
      fc.property(arbTextContent, (text) => {
        const root = document.createElement("div")
        mount(createTextVNode(text), root)
        expect(root.childNodes.length).toBe(1)
        expect(root.textContent).toBe(text)
      }),
      { numRuns: 100 },
    )
  })

  it("mounting N children produces N DOM nodes", () => {
    fc.assert(
      fc.property(fc.array(arbTagName, { minLength: 0, maxLength: 10 }), (tags) => {
        const root = document.createElement("div")
        const children = tags.map((tag) => h(tag, null))
        mount(h("div", null, ...children), root)
        const inner = root.firstElementChild!
        expect(inner.childNodes.length).toBe(tags.length)
      }),
      { numRuns: 50 },
    )
  })

  it("className prop maps to DOM element className", () => {
    fc.assert(
      fc.property(
        arbTagName,
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes("\0")),
        (tag, cn) => {
          const root = document.createElement("div")
          mount(h(tag, { className: cn }), root)
          expect(root.firstElementChild!.className).toBe(cn)
        },
      ),
      { numRuns: 50 },
    )
  })

  it("keyed children maintain correct order after shuffle re-render", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 50 }), { minLength: 2, maxLength: 10 }),
        (keys) => {
          let items = keys.map((k) => ({ id: k, text: `item-${k}` }))
          let triggerUpdate: () => void

          function App() {
            const [list, setList] = useState(items)
            triggerUpdate = () => {
              // Reverse the list
              items = [...items].reverse()
              setList(items)
            }
            return h("ul", null, ...list.map((item) => h("li", { key: item.id }, item.text)))
          }

          const root = document.createElement("div")
          mount(h(App, null), root)

          const ul = root.querySelector("ul")!
          expect(ul.children.length).toBe(keys.length)

          // Verify initial order
          for (let i = 0; i < keys.length; i++) {
            expect(ul.children[i]!.textContent).toBe(`item-${keys[i]}`)
          }

          // Reverse and re-render
          triggerUpdate!()
          flushUpdates()

          // Verify reversed order
          const reversed = [...keys].reverse()
          expect(ul.children.length).toBe(reversed.length)
          for (let i = 0; i < reversed.length; i++) {
            expect(ul.children[i]!.textContent).toBe(`item-${reversed[i]}`)
          }
        },
      ),
      { numRuns: 30 },
    )
  })
})

// --- Hooks invariants ---

describe("Property: hooks", () => {
  it("useState preserves value across re-renders", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: -1000, max: 1000 }),
        (initial, next) => {
          let value: number
          let setter: (v: number) => void

          function Counter() {
            const [count, setCount] = useState(initial)
            value = count
            setter = setCount
            return h("span", null, String(count))
          }

          const root = document.createElement("div")
          mount(h(Counter, null), root)
          expect(value!).toBe(initial)
          expect(root.textContent).toBe(String(initial))

          setter!(next)
          flushUpdates()
          expect(value!).toBe(next)
          expect(root.textContent).toBe(String(next))
        },
      ),
      { numRuns: 50 },
    )
  })

  it("useMemo returns same reference when deps unchanged", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (dep) => {
        const results: object[] = []
        let trigger: () => void

        function App() {
          const [, setTick] = useState(0)
          trigger = () => setTick((t: number) => t + 1)
          const obj = useMemo(() => ({ value: dep }), [dep])
          results.push(obj)
          return h("div", null)
        }

        const root = document.createElement("div")
        mount(h(App, null), root)

        // Re-render without changing dep
        trigger!()
        flushUpdates()

        // Same dep -> same reference
        expect(results.length).toBe(2)
        expect(results[0]).toBe(results[1])
      }),
      { numRuns: 50 },
    )
  })

  it("useRef persists across re-renders", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 20 }), (initial) => {
        const refs: { current: string }[] = []
        let trigger: () => void

        function App() {
          const [, setTick] = useState(0)
          trigger = () => setTick((t: number) => t + 1)
          const ref = useRef(initial)
          refs.push(ref)
          return h("div", null)
        }

        const root = document.createElement("div")
        mount(h(App, null), root)

        trigger!()
        flushUpdates()

        expect(refs.length).toBe(2)
        expect(refs[0]).toBe(refs[1]) // same ref object
        expect(refs[0]!.current).toBe(initial)
      }),
      { numRuns: 50 },
    )
  })

  it("mixed hooks (useEffect + useCallback + useState) work without index corruption", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 }), (a, b) => {
        let effectRan = false
        let trigger: (v: number) => void
        let cbResult: number

        function App() {
          const [val, setVal] = useState(a)
          trigger = setVal

          useEffect(() => {
            effectRan = true
          }, [])

          const doubled = useCallback(() => val * 2, [val])
          cbResult = doubled()

          return h("span", null, String(val))
        }

        const root = document.createElement("div")
        mount(h(App, null), root)

        expect(root.textContent).toBe(String(a))
        expect(effectRan).toBe(true)
        expect(cbResult!).toBe(a * 2)

        trigger!(b)
        flushUpdates()

        expect(root.textContent).toBe(String(b))
        expect(cbResult!).toBe(b * 2)
      }),
      { numRuns: 50 },
    )
  })
})

// --- createTextVNode ---

describe("Property: createTextVNode", () => {
  it("always creates a Text VNode with the given content", () => {
    fc.assert(
      fc.property(arbTextContent, (text) => {
        const vnode = createTextVNode(text)
        expect(vnode.flags).toBe(VNodeFlags.Text)
        expect(vnode.type).toBeNull()
        expect(vnode.children).toBe(text)
        expect(vnode.childFlags).toBe(ChildFlags.NoChildren)
      }),
      { numRuns: 200 },
    )
  })
})
