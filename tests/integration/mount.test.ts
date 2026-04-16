import { describe, expect, it, vi } from "vitest"
import { ChildFlags, VNodeFlags, h, mount } from "../../src/index"
import type { VNode } from "../../src/vnode"

describe("mount", () => {
  let container: HTMLDivElement

  function setup(): HTMLDivElement {
    return document.createElement("div")
  }

  describe("element mounting", () => {
    it("should mount a simple div", () => {
      container = setup()
      mount(h("div", null), container)
      expect(container.innerHTML).toBe("<div></div>")
    })

    it("should mount nested elements", () => {
      container = setup()
      mount(h("div", null, h("span", null, "hello")), container)
      expect(container.innerHTML).toBe("<div><span>hello</span></div>")
    })

    it("should mount with className prop", () => {
      container = setup()
      mount(h("div", { className: "test" }), container)
      expect(container.innerHTML).toBe('<div class="test"></div>')
    })

    it("should mount with id prop", () => {
      container = setup()
      mount(h("div", { id: "my-id" }), container)
      expect(container.innerHTML).toBe('<div id="my-id"></div>')
    })

    it("should mount with style object", () => {
      container = setup()
      mount(h("div", { style: { color: "red", fontSize: "14px" } }), container)
      const div = container.firstChild as HTMLDivElement
      expect(div.style.color).toBe("red")
      expect(div.style.fontSize).toBe("14px")
    })

    it("should mount with boolean attributes", () => {
      container = setup()
      mount(h("input", { disabled: true, type: "text" }), container)
      const input = container.firstChild as HTMLInputElement
      expect(input.getAttribute("disabled")).toBe("")
      expect(input.getAttribute("type")).toBe("text")
    })

    it("should not set attributes with false/null/undefined values", () => {
      container = setup()
      mount(h("div", { hidden: false, "data-x": null, "data-y": undefined }), container)
      const div = container.firstChild as HTMLDivElement
      expect(div.hasAttribute("hidden")).toBe(false)
      expect(div.hasAttribute("data-x")).toBe(false)
    })

    it("should mount with event handlers", () => {
      container = setup()
      const handler = vi.fn()
      mount(h("button", { onClick: handler }, "click me"), container)
      const button = container.firstChild as HTMLButtonElement
      button.click()
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it("should mount deeply nested trees", () => {
      container = setup()
      mount(
        h(
          "div",
          { className: "root" },
          h(
            "ul",
            null,
            h("li", { key: "1" }, "item 1"),
            h("li", { key: "2" }, "item 2"),
            h("li", { key: "3" }, "item 3"),
          ),
        ),
        container,
      )
      expect(container.innerHTML).toBe(
        '<div class="root"><ul><li>item 1</li><li>item 2</li><li>item 3</li></ul></div>',
      )
    })

    it("should store dom reference on vnodes", () => {
      container = setup()
      const vnode = h("div", { className: "test" }, h("span", null, "child"))
      mount(vnode, container)

      expect(vnode.dom).toBe(container.firstChild)
      expect(vnode.dom).toBeInstanceOf(HTMLDivElement)

      const childVNode = vnode.children as VNode
      expect(childVNode.dom).toBe((container.firstChild as HTMLElement).firstChild)
    })
  })

  describe("text mounting", () => {
    it("should mount a text child", () => {
      container = setup()
      mount(h("p", null, "hello world"), container)
      expect(container.innerHTML).toBe("<p>hello world</p>")
    })

    it("should mount number children as text", () => {
      container = setup()
      mount(h("span", null, 42), container)
      expect(container.innerHTML).toBe("<span>42</span>")
    })

    it("should mount mixed text and element children", () => {
      container = setup()
      mount(h("div", null, "before ", h("strong", null, "bold"), " after"), container)
      expect(container.innerHTML).toBe("<div>before <strong>bold</strong> after</div>")
    })
  })

  describe("component mounting", () => {
    it("should mount a simple functional component", () => {
      container = setup()
      const MyComponent = () => h("p", null, "works")
      mount(h(MyComponent, null), container)
      expect(container.innerHTML).toBe("<p>works</p>")
    })

    it("should pass props to component", () => {
      container = setup()
      const Greeting = (props: Record<string, unknown>) => h("span", null, `hello ${props["name"]}`)
      mount(h(Greeting, { name: "world" }), container)
      expect(container.innerHTML).toBe("<span>hello world</span>")
    })

    it("should mount nested components", () => {
      container = setup()
      const Inner = () => h("em", null, "inner")
      const Outer = () => h("div", null, h(Inner, null))
      mount(h(Outer, null), container)
      expect(container.innerHTML).toBe("<div><em>inner</em></div>")
    })

    it("should set dom reference on component vnode", () => {
      container = setup()
      const MyComponent = () => h("div", { className: "comp" })
      const vnode = h(MyComponent, null)
      mount(vnode, container)

      expect(vnode.dom).toBeInstanceOf(HTMLDivElement)
      expect((vnode.dom as HTMLDivElement).className).toBe("comp")
    })
  })

  describe("children variations", () => {
    it("should handle no children", () => {
      container = setup()
      mount(h("div", null), container)
      expect(container.firstChild!.childNodes.length).toBe(0)
    })

    it("should handle single element child", () => {
      container = setup()
      mount(h("div", null, h("span", null)), container)
      expect(container.innerHTML).toBe("<div><span></span></div>")
    })

    it("should handle keyed children", () => {
      container = setup()
      mount(
        h(
          "ul",
          null,
          h("li", { key: "a" }, "A"),
          h("li", { key: "b" }, "B"),
          h("li", { key: "c" }, "C"),
        ),
        container,
      )
      const lis = container.querySelectorAll("li")
      expect(lis.length).toBe(3)
      expect(lis[0]!.textContent).toBe("A")
      expect(lis[1]!.textContent).toBe("B")
      expect(lis[2]!.textContent).toBe("C")
    })

    it("should handle non-keyed children", () => {
      container = setup()
      mount(h("div", null, h("span", null, "a"), h("span", null, "b")), container)
      expect(container.innerHTML).toBe("<div><span>a</span><span>b</span></div>")
    })

    it("should filter null children during h() and mount correctly", () => {
      container = setup()
      mount(h("div", null, null, h("span", null, "visible"), null), container)
      expect(container.innerHTML).toBe("<div><span>visible</span></div>")
    })
  })

  describe("SVG mounting", () => {
    it("should create SVG elements with correct namespace", () => {
      container = setup()
      mount(h("svg", null, h("circle", { cx: "50", cy: "50", r: "40" })), container)

      const svg = container.firstChild as SVGElement
      expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg")

      const circle = svg.firstChild as SVGCircleElement
      expect(circle.namespaceURI).toBe("http://www.w3.org/2000/svg")
      expect(circle.getAttribute("cx")).toBe("50")
    })

    it("should set className via attribute for SVG elements", () => {
      container = setup()
      mount(h("svg", { className: "icon" }), container)

      const svg = container.firstChild as SVGElement
      expect(svg.getAttribute("class")).toBe("icon")
    })
  })

  describe("acceptance criteria", () => {
    it("should produce correct DOM for h('div', { className: 'test' }, h('span', null, 'hello'))", () => {
      container = setup()
      mount(h("div", { className: "test" }, h("span", null, "hello")), container)
      expect(container.innerHTML).toBe('<div class="test"><span>hello</span></div>')
    })

    it("should mount component () => h('p', null, 'works')", () => {
      container = setup()
      mount(
        h(() => h("p", null, "works"), null),
        container,
      )
      expect(container.innerHTML).toBe("<p>works</p>")
    })
  })
})
