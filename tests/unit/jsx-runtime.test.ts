import { describe, expect, it } from "vitest"
import { ChildFlags, VNodeFlags, h, mount } from "../../src/index"
import { Fragment, jsx, jsxs } from "../../src/jsx-runtime"
import type { VNode } from "../../src/vnode"

describe("Fragment sentinel", () => {
  it("should equal null", () => {
    expect(Fragment).toBeNull()
  })
})

describe("jsx()", () => {
  describe("children handling", () => {
    it("should produce NoChildren when rawChildren is undefined", () => {
      const vnode = jsx("div", {})

      expect(vnode.flags).toBe(VNodeFlags.Element)
      expect(vnode.type).toBe("div")
      expect(vnode.children).toBeNull()
      expect(vnode.childFlags).toBe(ChildFlags.NoChildren)
    })

    it("should produce NoChildren when rawChildren is null", () => {
      const vnode = jsx("div", { children: null })

      expect(vnode.children).toBeNull()
      expect(vnode.childFlags).toBe(ChildFlags.NoChildren)
    })

    it("should produce HasTextChildren for a string child", () => {
      const vnode = jsx("p", { children: "hello" })

      expect(vnode.children).toBe("hello")
      expect(vnode.childFlags).toBe(ChildFlags.HasTextChildren)
    })

    it("should convert a number child to string and use HasTextChildren", () => {
      const vnode = jsx("span", { children: 42 })

      expect(vnode.children).toBe("42")
      expect(vnode.childFlags).toBe(ChildFlags.HasTextChildren)
    })

    it("should use HasSingleChild for a VNode child", () => {
      const child = h("span", null)
      const vnode = jsx("div", { children: child })

      expect(vnode.childFlags).toBe(ChildFlags.HasSingleChild)
      expect(vnode.children).toBe(child)
    })
  })

  describe("type handling", () => {
    it("should produce Component flag for function type", () => {
      const MyComponent = (_props: Record<string, unknown>) => h("div", null)
      const vnode = jsx(MyComponent, {})

      expect(vnode.flags).toBe(VNodeFlags.Component)
      expect(vnode.type).toBe(MyComponent)
    })

    it("should produce Fragment flag for null type (Fragment sentinel)", () => {
      const vnode = jsx(null, {})

      expect(vnode.flags).toBe(VNodeFlags.Fragment)
      expect(vnode.type).toBeNull()
    })

    it("should produce Element flag for string type", () => {
      const vnode = jsx("section", {})

      expect(vnode.flags).toBe(VNodeFlags.Element)
      expect(vnode.type).toBe("section")
    })

    it("should produce Element | Svg flag for svg type", () => {
      const vnode = jsx("svg", {})

      expect(vnode.flags).toBe((VNodeFlags.Element | VNodeFlags.Svg) as number)
    })
  })

  describe("key parameter", () => {
    it("should extract key when provided as third argument", () => {
      const vnode = jsx("li", {}, "item-1")

      expect(vnode.key).toBe("item-1")
    })

    it("should set key to null when not provided", () => {
      const vnode = jsx("li", {})

      expect(vnode.key).toBeNull()
    })
  })

  describe("className extraction", () => {
    it("should extract className from props into top-level field", () => {
      const vnode = jsx("div", { className: "container" })

      expect(vnode.className).toBe("container")
    })

    it("should not include className in cleanProps", () => {
      const vnode = jsx("div", { className: "row", id: "main" })

      expect(vnode.className).toBe("row")
      expect(vnode.props).not.toBeNull()
      expect((vnode.props as Record<string, unknown>)["className"]).toBeUndefined()
      expect((vnode.props as Record<string, unknown>)["id"]).toBe("main")
    })

    it("should set className to null when not present", () => {
      const vnode = jsx("div", {})

      expect(vnode.className).toBeNull()
    })
  })

  describe("props cleaning", () => {
    it("should exclude children and className from cleanProps", () => {
      const vnode = jsx("div", { children: "text", className: "box", id: "wrapper" })

      expect(vnode.props).not.toBeNull()
      const p = vnode.props as Record<string, unknown>
      expect(p["children"]).toBeUndefined()
      expect(p["className"]).toBeUndefined()
      expect(p["id"]).toBe("wrapper")
    })

    it("should set cleanProps to null when no extra props exist", () => {
      const vnode = jsx("div", { children: "hello", className: "x" })

      expect(vnode.props).toBeNull()
    })
  })

  describe("DOM mounting", () => {
    it("should produce a VNode that mounts correctly", () => {
      const vnode = jsx("div", { className: "test", children: "mounted" })
      const container = document.createElement("div")
      mount(vnode, container)

      expect(container.innerHTML).toBe('<div class="test">mounted</div>')
    })
  })
})

describe("jsxs()", () => {
  describe("empty / missing children", () => {
    it("should produce NoChildren for an empty array", () => {
      const vnode = jsxs("div", { children: [] })

      expect(vnode.children).toBeNull()
      expect(vnode.childFlags).toBe(ChildFlags.NoChildren)
    })

    it("should produce NoChildren when children prop is missing", () => {
      const vnode = jsxs("div", {})

      expect(vnode.children).toBeNull()
      expect(vnode.childFlags).toBe(ChildFlags.NoChildren)
    })
  })

  describe("single-element array", () => {
    it("should use HasNonKeyedChildren for a single string element", () => {
      const vnode = jsxs("p", { children: ["hello"] })

      expect(vnode.childFlags).toBe(ChildFlags.HasNonKeyedChildren)
      const children = vnode.children as VNode[]
      expect(children).toHaveLength(1)
      expect(children[0]!.children).toBe("hello")
    })

    it("should use HasNonKeyedChildren for a single number element", () => {
      const vnode = jsxs("p", { children: [99] })

      expect(vnode.childFlags).toBe(ChildFlags.HasNonKeyedChildren)
      const children = vnode.children as VNode[]
      expect(children).toHaveLength(1)
      expect(children[0]!.children).toBe("99")
    })

    it("should use HasNonKeyedChildren for a single VNode element", () => {
      const child = h("span", null)
      const vnode = jsxs("div", { children: [child] })

      expect(vnode.childFlags).toBe(ChildFlags.HasNonKeyedChildren)
      const children = vnode.children as VNode[]
      expect(children).toHaveLength(1)
      expect(children[0]).toBe(child)
    })
  })

  describe("multiple children", () => {
    it("should use HasNonKeyedChildren for mixed primitive and VNode children", () => {
      const span = h("span", null)
      const vnode = jsxs("div", { children: ["text", span] })

      expect(vnode.childFlags).toBe(ChildFlags.HasNonKeyedChildren)
      const children = vnode.children as VNode[]
      expect(Array.isArray(children)).toBe(true)
      expect(children).toHaveLength(2)
      // primitive was converted to a text VNode
      expect(children[0]!.flags).toBe(VNodeFlags.Text)
      expect(children[0]!.children).toBe("text")
      expect(children[1]).toBe(span)
    })

    it("should use HasNonKeyedChildren for multiple un-keyed VNode children", () => {
      const a = h("li", null)
      const b = h("li", null)
      const vnode = jsxs("ul", { children: [a, b] })

      expect(vnode.childFlags).toBe(ChildFlags.HasNonKeyedChildren)
    })

    it("should use HasKeyedChildren when all children have keys", () => {
      const a = h("li", { key: "a" })
      const b = h("li", { key: "b" })
      const vnode = jsxs("ul", { children: [a, b] })

      expect(vnode.childFlags).toBe(ChildFlags.HasKeyedChildren)
    })

    it("should use HasNonKeyedChildren when only some children have keys", () => {
      const a = h("li", { key: "a" })
      const b = h("li", null)
      const vnode = jsxs("ul", { children: [a, b] })

      expect(vnode.childFlags).toBe(ChildFlags.HasNonKeyedChildren)
    })

    it("should convert number primitives in children to text VNodes", () => {
      const vnode = jsxs("div", { children: [1, 2, 3] })

      const children = vnode.children as VNode[]
      expect(children).toHaveLength(3)
      for (const child of children) {
        expect(child.flags).toBe(VNodeFlags.Text)
      }
      expect(children[0]!.children).toBe("1")
      expect(children[1]!.children).toBe("2")
      expect(children[2]!.children).toBe("3")
    })
  })

  describe("key parameter", () => {
    it("should extract the key from the third argument", () => {
      const vnode = jsxs("li", { children: ["text"] }, "my-key")

      expect(vnode.key).toBe("my-key")
    })

    it("should set key to null when not provided", () => {
      const vnode = jsxs("li", { children: ["text"] })

      expect(vnode.key).toBeNull()
    })
  })

  describe("className extraction", () => {
    it("should extract className into top-level field", () => {
      const vnode = jsxs("div", { className: "wrapper", children: [h("span", null)] })

      expect(vnode.className).toBe("wrapper")
    })
  })

  describe("DOM mounting", () => {
    it("should produce a VNode that mounts correctly with multiple children", () => {
      const vnode = jsxs("ul", {
        children: [h("li", null, "first"), h("li", null, "second")],
      })
      const container = document.createElement("div")
      mount(vnode, container)

      expect(container.innerHTML).toBe("<ul><li>first</li><li>second</li></ul>")
    })
  })
})
