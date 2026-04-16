import { describe, expect, it } from "vitest"
import { h, render } from "../../src/index"

describe("render() convenience API", () => {
  let container: HTMLDivElement

  function setup(): HTMLDivElement {
    return document.createElement("div")
  }

  it("should mount on first call", () => {
    container = setup()
    render(h("div", null, "hello"), container)
    expect(container.innerHTML).toBe("<div>hello</div>")
  })

  it("should patch on subsequent calls", () => {
    container = setup()
    render(h("div", null, "first"), container)
    expect(container.innerHTML).toBe("<div>first</div>")

    render(h("div", null, "second"), container)
    expect(container.innerHTML).toBe("<div>second</div>")
  })

  it("should unmount when passing null", () => {
    container = setup()
    render(h("div", null, "content"), container)
    expect(container.innerHTML).toBe("<div>content</div>")

    render(null, container)
    expect(container.innerHTML).toBe("")
  })

  it("should mount again after unmount", () => {
    container = setup()
    render(h("span", null, "one"), container)
    render(null, container)
    render(h("span", null, "two"), container)
    expect(container.innerHTML).toBe("<span>two</span>")
  })

  it("should handle type changes across renders", () => {
    container = setup()
    render(h("div", null, "div"), container)
    expect(container.innerHTML).toBe("<div>div</div>")

    render(h("span", null, "span"), container)
    expect(container.innerHTML).toBe("<span>span</span>")
  })

  it("should work with complex trees", () => {
    container = setup()
    render(
      h("ul", null, h("li", { key: 1 }, "a"), h("li", { key: 2 }, "b"), h("li", { key: 3 }, "c")),
      container,
    )
    expect(container.innerHTML).toBe("<ul><li>a</li><li>b</li><li>c</li></ul>")

    // Reorder
    render(
      h("ul", null, h("li", { key: 3 }, "c"), h("li", { key: 1 }, "a"), h("li", { key: 2 }, "b")),
      container,
    )
    expect(container.innerHTML).toBe("<ul><li>c</li><li>a</li><li>b</li></ul>")
  })

  it("should do nothing when unmounting an empty container", () => {
    container = setup()
    render(null, container)
    expect(container.innerHTML).toBe("")
  })

  it("should support independent containers", () => {
    const c1 = setup()
    const c2 = setup()

    render(h("div", null, "c1"), c1)
    render(h("span", null, "c2"), c2)

    expect(c1.innerHTML).toBe("<div>c1</div>")
    expect(c2.innerHTML).toBe("<span>c2</span>")

    render(h("div", null, "c1-updated"), c1)
    expect(c1.innerHTML).toBe("<div>c1-updated</div>")
    expect(c2.innerHTML).toBe("<span>c2</span>")
  })
})
