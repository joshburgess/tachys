import { describe, expect, it } from "vitest"
import { h, mount, patch } from "../../src/index"

describe("keyed fragments", () => {
  let container: HTMLDivElement

  function setup(): HTMLDivElement {
    return document.createElement("div")
  }

  it("should mount keyed fragments", () => {
    container = setup()
    const tree = h(
      "div",
      null,
      h(null, { key: "a" }, h("span", null, "A1"), h("span", null, "A2")),
      h(null, { key: "b" }, h("span", null, "B1"), h("span", null, "B2")),
    )
    mount(tree, container)
    expect(container.innerHTML).toBe(
      "<div><span>A1</span><span>A2</span><span>B1</span><span>B2</span></div>",
    )
  })

  it("should reorder keyed fragments", () => {
    container = setup()

    const old = h(
      "div",
      null,
      h(null, { key: "a" }, h("span", null, "A1"), h("span", null, "A2")),
      h(null, { key: "b" }, h("span", null, "B1"), h("span", null, "B2")),
    )
    mount(old, container)

    // Swap order: b before a
    const next = h(
      "div",
      null,
      h(null, { key: "b" }, h("span", null, "B1"), h("span", null, "B2")),
      h(null, { key: "a" }, h("span", null, "A1"), h("span", null, "A2")),
    )
    patch(old, next, container)

    expect(container.innerHTML).toBe(
      "<div><span>B1</span><span>B2</span><span>A1</span><span>A2</span></div>",
    )
  })

  it("should add a new keyed fragment", () => {
    container = setup()

    const old = h("div", null, h(null, { key: "a" }, h("span", null, "A")))
    mount(old, container)

    const next = h(
      "div",
      null,
      h(null, { key: "a" }, h("span", null, "A")),
      h(null, { key: "b" }, h("span", null, "B")),
    )
    patch(old, next, container)

    expect(container.innerHTML).toBe("<div><span>A</span><span>B</span></div>")
  })

  it("should remove a keyed fragment", () => {
    container = setup()

    const old = h(
      "div",
      null,
      h(null, { key: "a" }, h("span", null, "A")),
      h(null, { key: "b" }, h("span", null, "B")),
    )
    mount(old, container)

    const next = h("div", null, h(null, { key: "b" }, h("span", null, "B")))
    patch(old, next, container)

    expect(container.innerHTML).toBe("<div><span>B</span></div>")
  })

  it("should update content within keyed fragments", () => {
    container = setup()

    const old = h(
      "div",
      null,
      h(null, { key: "a" }, h("span", null, "old-A")),
      h(null, { key: "b" }, h("span", null, "old-B")),
    )
    mount(old, container)

    const next = h(
      "div",
      null,
      h(null, { key: "a" }, h("span", null, "new-A")),
      h(null, { key: "b" }, h("span", null, "new-B")),
    )
    patch(old, next, container)

    expect(container.innerHTML).toBe("<div><span>new-A</span><span>new-B</span></div>")
  })

  it("should handle keyed fragments as direct children of root", () => {
    container = setup()

    const old = h(
      null,
      null,
      h(null, { key: "1" }, h("p", null, "first")),
      h(null, { key: "2" }, h("p", null, "second")),
    )
    mount(old, container)
    expect(container.innerHTML).toBe("<p>first</p><p>second</p>")
  })
})
