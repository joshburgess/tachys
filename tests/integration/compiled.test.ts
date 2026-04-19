import { describe, expect, it } from "vitest"
import {
  _mountAlt,
  _mountCond,
  _mountList,
  _patchAlt,
  _patchCond,
  _patchList,
  _template,
  h,
  markCompiled,
  mount,
  patch,
  unmount,
} from "../../src/index"
import type { VNode } from "../../src/vnode"

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe("compiled components", () => {
  function setup(): HTMLDivElement {
    return document.createElement("div")
  }

  it("mounts a compiled component by cloning a template", () => {
    const tpl = _template('<span class="greeting">hello</span>')
    const Greeting = markCompiled(
      (props: Record<string, unknown>) => {
        const dom = tpl.cloneNode(true) as Element
        const text = dom.firstChild as Text
        text.data = props["name"] as string
        return { dom, state: { text, name: props["name"] } }
      },
      (state: Record<string, unknown>, props: Record<string, unknown>) => {
        if (state["name"] !== props["name"]) {
          ;(state["text"] as Text).data = props["name"] as string
          state["name"] = props["name"]
        }
      },
    )

    const container = setup()
    mount(h(Greeting, { name: "world" }), container)
    expect(container.innerHTML).toBe('<span class="greeting">world</span>')
  })

  it("dispatches patch when props change", async () => {
    const tpl = _template("<p> </p>")
    const Label = markCompiled(
      (props: Record<string, unknown>) => {
        const dom = tpl.cloneNode(true) as Element
        const text = dom.firstChild as Text
        text.data = props["value"] as string
        return { dom, state: { text, value: props["value"] } }
      },
      (state: Record<string, unknown>, props: Record<string, unknown>) => {
        if (state["value"] !== props["value"]) {
          ;(state["text"] as Text).data = props["value"] as string
          state["value"] = props["value"]
        }
      },
    )

    const container = setup()
    const v1 = h(Label, { value: "one" }) as VNode
    mount(v1, container)
    expect(container.textContent).toBe("one")

    const v2 = h(Label, { value: "two" }) as VNode
    patch(v1, v2, container)
    expect(container.textContent).toBe("two")

    // Same props should not touch the DOM (memo-free path still bails
    // via shallowEqual in patchComponent).
    const v3 = h(Label, { value: "two" }) as VNode
    patch(v2, v3, container)
    expect(container.textContent).toBe("two")
  })

  it("respects the compare function on memo-like bail", () => {
    const tpl = _template("<div> </div>")
    let patchCalls = 0
    const Memoed = markCompiled(
      (props: Record<string, unknown>) => {
        const dom = tpl.cloneNode(true) as Element
        const text = dom.firstChild as Text
        text.data = props["label"] as string
        return { dom, state: { text, label: props["label"] } }
      },
      (state: Record<string, unknown>, props: Record<string, unknown>) => {
        patchCalls++
        if (state["label"] !== props["label"]) {
          ;(state["text"] as Text).data = props["label"] as string
          state["label"] = props["label"]
        }
      },
      (prev, next) => prev["label"] === next["label"],
    )

    const container = setup()
    const v1 = h(Memoed, { label: "x", unused: 1 }) as VNode
    mount(v1, container)
    expect(patchCalls).toBe(0)

    // `unused` changed but compare only checks `label` — should bail.
    const v2 = h(Memoed, { label: "x", unused: 2 }) as VNode
    patch(v1, v2, container)
    expect(patchCalls).toBe(0)
    expect(container.textContent).toBe("x")

    // `label` changed — should dispatch patch.
    const v3 = h(Memoed, { label: "y", unused: 2 }) as VNode
    patch(v2, v3, container)
    expect(patchCalls).toBe(1)
    expect(container.textContent).toBe("y")
  })

  it("unmounts a compiled component cleanly", () => {
    const tpl = _template('<span id="gone">x</span>')
    const Leaf = markCompiled(
      () => ({ dom: tpl.cloneNode(true) as Element, state: {} }),
      () => {},
    )

    const container = setup()
    const v = h(Leaf, {}) as VNode
    mount(v, container)
    expect(container.querySelector("#gone")).not.toBeNull()

    unmount(v, container)
    expect(container.querySelector("#gone")).toBeNull()
  })

  it("supports keyed reordering of compiled children", () => {
    const tpl = _template("<li> </li>")
    const Item = markCompiled(
      (props: Record<string, unknown>) => {
        const dom = tpl.cloneNode(true) as Element
        const text = dom.firstChild as Text
        text.data = String(props["label"])
        return { dom, state: { text, label: props["label"] } }
      },
      (state: Record<string, unknown>, props: Record<string, unknown>) => {
        if (state["label"] !== props["label"]) {
          ;(state["text"] as Text).data = String(props["label"])
          state["label"] = props["label"]
        }
      },
    )

    const container = setup()
    const makeList = (labels: Array<{ key: number; label: string }>) =>
      h(
        "ul",
        null,
        ...labels.map((l) => {
          const child = h(Item, { label: l.label }) as VNode
          child.key = l.key
          return child
        }),
      ) as VNode

    const v1 = makeList([
      { key: 1, label: "a" },
      { key: 2, label: "b" },
      { key: 3, label: "c" },
    ])
    mount(v1, container)
    const ul = container.firstChild as HTMLUListElement
    const lis1 = Array.from(ul.children) as HTMLLIElement[]
    expect(lis1.map((li) => li.textContent)).toEqual(["a", "b", "c"])

    // Swap first and last while changing middle label.
    const v2 = makeList([
      { key: 3, label: "c" },
      { key: 2, label: "B" },
      { key: 1, label: "a" },
    ])
    patch(v1, v2, container)
    const lis2 = Array.from(ul.children) as HTMLLIElement[]
    expect(lis2.map((li) => li.textContent)).toEqual(["c", "B", "a"])
    // Node identity should be preserved through the reorder (key-matched).
    expect(lis2[0]).toBe(lis1[2])
    expect(lis2[1]).toBe(lis1[1])
    expect(lis2[2]).toBe(lis1[0])
  })
})

describe("_mountList / _patchList (LIS reconcile)", () => {
  const tpl = _template("<li> </li>")
  const Item = markCompiled(
    (props: Record<string, unknown>) => {
      const dom = tpl.cloneNode(true) as Element
      const text = dom.firstChild as Text
      text.data = String(props["label"])
      return { dom, state: { text, id: props["id"], label: props["label"] } }
    },
    (state: Record<string, unknown>, props: Record<string, unknown>) => {
      if (state["label"] !== props["label"]) {
        ;(state["text"] as Text).data = String(props["label"])
        state["label"] = props["label"]
      }
    },
    (prev, next) => prev["id"] === next["id"] && prev["label"] === next["label"],
  )

  interface Row {
    id: number
    label: string
  }
  const makeProps = (r: Row): Record<string, unknown> => ({ id: r.id, label: r.label })
  const keyOf = (r: Row): unknown => r.id

  function setupList(rows: Row[]): {
    parent: HTMLUListElement
    anchor: Comment
    list: ReturnType<typeof _mountList>
  } {
    const parent = document.createElement("ul")
    const anchor = document.createComment("list")
    parent.appendChild(anchor)
    const list = _mountList(rows, Item, makeProps, keyOf, anchor)
    return { parent, anchor, list }
  }

  function labelsOf(parent: Element): string[] {
    return Array.from(parent.children).map((el) => el.textContent ?? "")
  }

  function nodesOf(parent: Element): Element[] {
    return Array.from(parent.children)
  }

  it("mounts empty list and anchor stays in place", () => {
    const { parent, anchor, list } = setupList([])
    expect(parent.firstChild).toBe(anchor)
    expect(list.instances).toHaveLength(0)
  })

  it("handles pure insertion at tail", () => {
    const rows: Row[] = [
      { id: 1, label: "a" },
      { id: 2, label: "b" },
    ]
    const { parent, list } = setupList(rows)
    const before = nodesOf(parent)

    _patchList(
      list,
      [...rows, { id: 3, label: "c" }, { id: 4, label: "d" }],
      Item,
      makeProps,
      keyOf,
    )

    expect(labelsOf(parent)).toEqual(["a", "b", "c", "d"])
    expect(parent.children[0]).toBe(before[0])
    expect(parent.children[1]).toBe(before[1])
  })

  it("handles pure insertion at head", () => {
    const rows: Row[] = [
      { id: 3, label: "c" },
      { id: 4, label: "d" },
    ]
    const { parent, list } = setupList(rows)
    const before = nodesOf(parent)

    _patchList(
      list,
      [{ id: 1, label: "a" }, { id: 2, label: "b" }, ...rows],
      Item,
      makeProps,
      keyOf,
    )

    expect(labelsOf(parent)).toEqual(["a", "b", "c", "d"])
    expect(parent.children[2]).toBe(before[0])
    expect(parent.children[3]).toBe(before[1])
  })

  it("handles pure removal from middle", () => {
    const rows: Row[] = [
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
      { id: 4, label: "d" },
    ]
    const { parent, list } = setupList(rows)
    const before = nodesOf(parent)

    _patchList(list, [rows[0], rows[3]], Item, makeProps, keyOf)

    expect(labelsOf(parent)).toEqual(["a", "d"])
    expect(parent.children[0]).toBe(before[0])
    expect(parent.children[1]).toBe(before[3])
  })

  it("single-item removal fast path: removes from head without calling keyOf/makeProps", () => {
    const rows: Row[] = [
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
      { id: 4, label: "d" },
    ]
    const { parent, list } = setupList(rows)
    const before = nodesOf(parent)

    let keyCalls = 0
    let propCalls = 0
    const keySpy = (r: Row): unknown => {
      keyCalls++
      return r.id
    }
    const makePropsSpy = (r: Row): Record<string, unknown> => {
      propCalls++
      return { id: r.id, label: r.label }
    }

    // Remove head via splice semantics (identity preserved for rest).
    const next = rows.slice()
    next.splice(0, 1)
    _patchList(list, next, Item, makePropsSpy, keySpy)

    expect(labelsOf(parent)).toEqual(["b", "c", "d"])
    expect(parent.children[0]).toBe(before[1])
    expect(parent.children[1]).toBe(before[2])
    expect(parent.children[2]).toBe(before[3])
    // Fast path must not invoke keyOf or makeProps for the 3 preserved rows.
    expect(keyCalls).toBe(0)
    expect(propCalls).toBe(0)
  })

  it("single-item removal fast path: removes from middle", () => {
    const rows: Row[] = [
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
      { id: 4, label: "d" },
    ]
    const { parent, list } = setupList(rows)
    const before = nodesOf(parent)

    const next = rows.slice()
    next.splice(2, 1) // remove { id: 3 }
    _patchList(list, next, Item, makeProps, keyOf)

    expect(labelsOf(parent)).toEqual(["a", "b", "d"])
    expect(parent.children[0]).toBe(before[0])
    expect(parent.children[1]).toBe(before[1])
    expect(parent.children[2]).toBe(before[3])
  })

  it("single-item removal fast path: removes from tail", () => {
    const rows: Row[] = [
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
      { id: 4, label: "d" },
    ]
    const { parent, list } = setupList(rows)
    const before = nodesOf(parent)

    const next = rows.slice()
    next.pop() // remove { id: 4 }
    _patchList(list, next, Item, makeProps, keyOf)

    expect(labelsOf(parent)).toEqual(["a", "b", "c"])
    expect(parent.children[0]).toBe(before[0])
    expect(parent.children[2]).toBe(before[2])
  })

  it("single-item fast path falls through when identity is not preserved", () => {
    const rows: Row[] = [
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
    ]
    const { parent, list } = setupList(rows)

    // New array has one fewer item and fresh object identities.
    _patchList(
      list,
      [
        { id: 1, label: "a" },
        { id: 3, label: "C!" },
      ],
      Item,
      makeProps,
      keyOf,
    )

    expect(labelsOf(parent)).toEqual(["a", "C!"])
  })

  it("handles reverse order (LIS length 1, every middle element moves)", () => {
    const rows: Row[] = [
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
      { id: 4, label: "d" },
      { id: 5, label: "e" },
    ]
    const { parent, list } = setupList(rows)
    const before = nodesOf(parent)

    _patchList(list, [...rows].reverse(), Item, makeProps, keyOf)

    expect(labelsOf(parent)).toEqual(["e", "d", "c", "b", "a"])
    expect(parent.children[0]).toBe(before[4])
    expect(parent.children[4]).toBe(before[0])
  })

  it("performs a 2-element swap with minimal DOM moves", () => {
    const rows: Row[] = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      label: `item-${i}`,
    }))
    const { parent, list } = setupList(rows)
    const before = nodesOf(parent)

    const insertCounts = new Map<Node, number>()
    const origInsertBefore = parent.insertBefore.bind(parent)
    parent.insertBefore = function (newNode: Node, refNode: Node | null): Node {
      insertCounts.set(newNode, (insertCounts.get(newNode) ?? 0) + 1)
      return origInsertBefore(newNode, refNode)
    } as typeof parent.insertBefore

    const swapped = [...rows]
    const tmp = swapped[1]!
    swapped[1] = swapped[8]!
    swapped[8] = tmp
    _patchList(list, swapped, Item, makeProps, keyOf)

    expect(labelsOf(parent)).toEqual([
      "item-0",
      "item-8",
      "item-2",
      "item-3",
      "item-4",
      "item-5",
      "item-6",
      "item-7",
      "item-1",
      "item-9",
    ])
    // Only the two swapped nodes should need to move. LIS picks the stable
    // middle and leaves it alone.
    expect(insertCounts.get(before[1]!) ?? 0).toBeGreaterThan(0)
    expect(insertCounts.get(before[8]!) ?? 0).toBeGreaterThan(0)
    let totalMoves = 0
    for (const [, n] of insertCounts) totalMoves += n
    expect(totalMoves).toBeLessThanOrEqual(2)
  })

  it("handles mixed insert, remove, and reorder", () => {
    const rows: Row[] = [
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
      { id: 4, label: "d" },
      { id: 5, label: "e" },
    ]
    const { parent, list } = setupList(rows)
    const before = nodesOf(parent)

    // Remove id=3, move id=5 to front, insert id=99 in the middle.
    _patchList(
      list,
      [
        { id: 5, label: "e" },
        { id: 1, label: "a" },
        { id: 99, label: "new" },
        { id: 2, label: "b" },
        { id: 4, label: "d" },
      ],
      Item,
      makeProps,
      keyOf,
    )

    expect(labelsOf(parent)).toEqual(["e", "a", "new", "b", "d"])
    expect(parent.children[0]).toBe(before[4])
    expect(parent.children[1]).toBe(before[0])
    expect(parent.children[3]).toBe(before[1])
    expect(parent.children[4]).toBe(before[3])
  })

  it("handles transition from non-empty to empty", () => {
    const { parent, list, anchor } = setupList([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
    ])
    _patchList(list, [], Item, makeProps, keyOf)
    expect(parent.childNodes.length).toBe(1)
    expect(parent.firstChild).toBe(anchor)
  })

  it("handles transition from empty to non-empty", () => {
    const { parent, list, anchor } = setupList([])
    _patchList(
      list,
      [
        { id: 1, label: "a" },
        { id: 2, label: "b" },
      ],
      Item,
      makeProps,
      keyOf,
    )
    expect(labelsOf(parent)).toEqual(["a", "b"])
    expect(parent.lastChild).toBe(anchor)
  })

  it("patches in place when keys match but props change", () => {
    const { parent, list } = setupList([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
    ])
    const before = nodesOf(parent)

    _patchList(
      list,
      [
        { id: 1, label: "A!" },
        { id: 2, label: "B!" },
      ],
      Item,
      makeProps,
      keyOf,
    )

    expect(labelsOf(parent)).toEqual(["A!", "B!"])
    expect(parent.children[0]).toBe(before[0])
    expect(parent.children[1]).toBe(before[1])
  })

  it("preserves node identity across two consecutive patches (swap then swap back)", () => {
    const rows: Row[] = Array.from({ length: 6 }, (_, i) => ({
      id: i,
      label: `i${i}`,
    }))
    const { parent, list } = setupList(rows)
    const original = nodesOf(parent)

    const swapped = [...rows]
    const tmp = swapped[1]!
    swapped[1] = swapped[4]!
    swapped[4] = tmp
    _patchList(list, swapped, Item, makeProps, keyOf)

    _patchList(list, rows, Item, makeProps, keyOf)

    expect(labelsOf(parent)).toEqual(["i0", "i1", "i2", "i3", "i4", "i5"])
    for (let i = 0; i < rows.length; i++) {
      expect(parent.children[i]).toBe(original[i])
    }
  })
})

describe("_mountCond / _patchCond", () => {
  const tpl = _template("<span> </span>")
  let patchCalls = 0
  const Badge = markCompiled(
    (props: Record<string, unknown>) => {
      const dom = tpl.cloneNode(true) as Element
      const text = dom.firstChild as Text
      text.data = String(props["label"])
      return { dom, state: { text, label: props["label"] } }
    },
    (state: Record<string, unknown>, props: Record<string, unknown>) => {
      patchCalls++
      if (state["label"] !== props["label"]) {
        ;(state["text"] as Text).data = String(props["label"])
        state["label"] = props["label"]
      }
    },
    (prev, next) => prev["label"] === next["label"],
  )

  function setupCond(
    cond: unknown,
    makeProps: () => Record<string, unknown>,
  ): { parent: HTMLDivElement; anchor: Comment; state: ReturnType<typeof _mountCond> } {
    patchCalls = 0
    const parent = document.createElement("div")
    const anchor = document.createComment("cond")
    parent.appendChild(anchor)
    const state = _mountCond(cond, Badge, makeProps, anchor)
    return { parent, anchor, state }
  }

  it("mounts child when cond is truthy", () => {
    const { parent, anchor, state } = setupCond(true, () => ({ label: "hi" }))
    expect(state.inst).not.toBeNull()
    expect(parent.childNodes.length).toBe(2)
    expect(parent.firstChild?.textContent).toBe("hi")
    expect(parent.lastChild).toBe(anchor)
  })

  it("does not mount child when cond is falsy", () => {
    const { parent, anchor, state } = setupCond(false, () => ({ label: "hi" }))
    expect(state.inst).toBeNull()
    expect(parent.childNodes.length).toBe(1)
    expect(parent.firstChild).toBe(anchor)
  })

  it("mounts on false -> true transition", () => {
    const makeProps = (): Record<string, unknown> => ({ label: "now-shown" })
    const { parent, anchor, state } = setupCond(false, makeProps)
    _patchCond(state, true, Badge, makeProps)
    expect(state.inst).not.toBeNull()
    expect(parent.firstChild?.textContent).toBe("now-shown")
    expect(parent.lastChild).toBe(anchor)
  })

  it("unmounts on true -> false transition", () => {
    const makeProps = (): Record<string, unknown> => ({ label: "bye" })
    const { parent, anchor, state } = setupCond(true, makeProps)
    _patchCond(state, false, Badge, makeProps)
    expect(state.inst).toBeNull()
    expect(parent.childNodes.length).toBe(1)
    expect(parent.firstChild).toBe(anchor)
  })

  it("patches child props when cond stays truthy", () => {
    let label = "first"
    const makeProps = (): Record<string, unknown> => ({ label })
    const { parent, state } = setupCond(true, makeProps)
    label = "second"
    _patchCond(state, true, Badge, makeProps)
    expect(patchCalls).toBe(1)
    expect(parent.firstChild?.textContent).toBe("second")
  })

  it("honors compare and skips patch when props unchanged", () => {
    const makeProps = (): Record<string, unknown> => ({ label: "same" })
    const { state } = setupCond(true, makeProps)
    _patchCond(state, true, Badge, makeProps)
    expect(patchCalls).toBe(0)
  })

  it("does nothing when cond stays falsy", () => {
    const makeProps = (): Record<string, unknown> => ({ label: "unused" })
    const { parent, state } = setupCond(false, makeProps)
    _patchCond(state, false, Badge, makeProps)
    expect(state.inst).toBeNull()
    expect(parent.childNodes.length).toBe(1)
    expect(patchCalls).toBe(0)
  })

  it("mounts fresh instance on re-toggle (no stale state)", () => {
    let label = "a"
    const makeProps = (): Record<string, unknown> => ({ label })
    const { parent, state } = setupCond(true, makeProps)
    const firstDom = state.inst?.dom
    _patchCond(state, false, Badge, makeProps)
    label = "b"
    _patchCond(state, true, Badge, makeProps)
    expect(state.inst).not.toBeNull()
    expect(state.inst?.dom).not.toBe(firstDom)
    expect(parent.firstChild?.textContent).toBe("b")
  })

  it("inserts between sibling anchors correctly", () => {
    const parent = document.createElement("div")
    parent.appendChild(document.createTextNode("before"))
    const anchor = document.createComment("cond")
    parent.appendChild(anchor)
    parent.appendChild(document.createTextNode("after"))

    const makeProps = (): Record<string, unknown> => ({ label: "middle" })
    const state = _mountCond(true, Badge, makeProps, anchor)
    expect(state.inst).not.toBeNull()
    // Walk text nodes around the inserted element.
    const nodes = Array.from(parent.childNodes)
    const childEl = state.inst!.dom
    const idx = nodes.indexOf(childEl as ChildNode)
    expect(idx).toBeGreaterThan(0)
    expect(nodes[idx - 1]?.textContent).toBe("before")
    expect(nodes[idx + 1]).toBe(anchor)
    expect(nodes[idx + 2]?.textContent).toBe("after")
  })
})

describe("_mountAlt / _patchAlt (ternary)", () => {
  const tpl = _template("<span> </span>")
  let patchACalls = 0
  let patchBCalls = 0
  const makeBranch = (
    tag: "A" | "B",
    countFn: () => void,
  ): ReturnType<typeof markCompiled> =>
    markCompiled(
      (props: Record<string, unknown>) => {
        const dom = tpl.cloneNode(true) as Element
        dom.setAttribute("data-branch", tag)
        const text = dom.firstChild as Text
        text.data = String(props["label"])
        return { dom, state: { text, label: props["label"] } }
      },
      (state: Record<string, unknown>, props: Record<string, unknown>) => {
        countFn()
        if (state["label"] !== props["label"]) {
          ;(state["text"] as Text).data = String(props["label"])
          state["label"] = props["label"]
        }
      },
      (prev, next) => prev["label"] === next["label"],
    )

  const A = makeBranch("A", () => {
    patchACalls++
  })
  const B = makeBranch("B", () => {
    patchBCalls++
  })

  function setupAlt(
    cond: unknown,
    makeA: () => Record<string, unknown>,
    makeB: () => Record<string, unknown>,
  ): { parent: HTMLDivElement; anchor: Comment; state: ReturnType<typeof _mountAlt> } {
    patchACalls = 0
    patchBCalls = 0
    const parent = document.createElement("div")
    const anchor = document.createComment("alt")
    parent.appendChild(anchor)
    const state = _mountAlt(cond, A, makeA, B, makeB, anchor)
    return { parent, anchor, state }
  }

  it("mounts branch A when cond is truthy", () => {
    const { parent, state } = setupAlt(
      true,
      () => ({ label: "a-text" }),
      () => ({ label: "b-text" }),
    )
    expect(state.branch).toBe(0)
    expect(parent.firstChild?.textContent).toBe("a-text")
    expect((parent.firstChild as Element).getAttribute("data-branch")).toBe("A")
  })

  it("mounts branch B when cond is falsy", () => {
    const { parent, state } = setupAlt(
      false,
      () => ({ label: "a-text" }),
      () => ({ label: "b-text" }),
    )
    expect(state.branch).toBe(1)
    expect(parent.firstChild?.textContent).toBe("b-text")
    expect((parent.firstChild as Element).getAttribute("data-branch")).toBe("B")
  })

  it("swaps branches when cond flips and unmounts the previous", () => {
    const makeA = (): Record<string, unknown> => ({ label: "a-text" })
    const makeB = (): Record<string, unknown> => ({ label: "b-text" })
    const { parent, state } = setupAlt(true, makeA, makeB)
    const domBefore = state.inst.dom

    _patchAlt(state, false, A, makeA, B, makeB)
    expect(state.branch).toBe(1)
    expect(parent.firstChild?.textContent).toBe("b-text")
    expect((parent.firstChild as Element).getAttribute("data-branch")).toBe("B")
    expect(parent.firstChild).not.toBe(domBefore)
  })

  it("patches in place when cond stays truthy", () => {
    let label = "first"
    const makeA = (): Record<string, unknown> => ({ label })
    const makeB = (): Record<string, unknown> => ({ label: "b" })
    const { parent, state } = setupAlt(true, makeA, makeB)
    const domBefore = state.inst.dom

    label = "second"
    _patchAlt(state, true, A, makeA, B, makeB)
    expect(patchACalls).toBe(1)
    expect(patchBCalls).toBe(0)
    expect(parent.firstChild).toBe(domBefore)
    expect(parent.firstChild?.textContent).toBe("second")
  })

  it("honors compare on same-branch patch when props unchanged", () => {
    const makeA = (): Record<string, unknown> => ({ label: "same" })
    const makeB = (): Record<string, unknown> => ({ label: "b" })
    const { state } = setupAlt(true, makeA, makeB)
    _patchAlt(state, true, A, makeA, B, makeB)
    expect(patchACalls).toBe(0)
  })

  it("mounts fresh child on each swap (no stale state leak)", () => {
    let labelA = "a-1"
    let labelB = "b-1"
    const makeA = (): Record<string, unknown> => ({ label: labelA })
    const makeB = (): Record<string, unknown> => ({ label: labelB })
    const { parent, state } = setupAlt(true, makeA, makeB)

    labelA = "a-2"
    labelB = "b-2"
    _patchAlt(state, false, A, makeA, B, makeB)
    expect(parent.firstChild?.textContent).toBe("b-2")

    _patchAlt(state, true, A, makeA, B, makeB)
    expect(parent.firstChild?.textContent).toBe("a-2")
  })

  it("keeps anchor as last child through every transition", () => {
    const makeA = (): Record<string, unknown> => ({ label: "a" })
    const makeB = (): Record<string, unknown> => ({ label: "b" })
    const { parent, anchor, state } = setupAlt(true, makeA, makeB)
    expect(parent.lastChild).toBe(anchor)
    _patchAlt(state, false, A, makeA, B, makeB)
    expect(parent.lastChild).toBe(anchor)
    _patchAlt(state, true, A, makeA, B, makeB)
    expect(parent.lastChild).toBe(anchor)
  })
})
