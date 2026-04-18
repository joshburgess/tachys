import { describe, expect, it } from "vitest"
import { _template, h, markCompiled, mount, patch, unmount } from "../../src/index"
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
