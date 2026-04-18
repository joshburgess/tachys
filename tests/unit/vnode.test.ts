import { describe, expect, it } from "vitest"
import { ChildFlags, VNodeFlags, createTextVNode, h } from "../../src/index"
import { VNode } from "../../src/vnode"

describe("VNode", () => {
  it("should initialize all properties in fixed order", () => {
    const vnode = new VNode(
      VNodeFlags.Element,
      "div",
      null,
      null,
      null,
      ChildFlags.NoChildren,
      null,
    )

    expect(vnode.flags).toBe(VNodeFlags.Element)
    expect(vnode.type).toBe("div")
    expect(vnode.key).toBeNull()
    expect(vnode.props).toBeNull()
    expect(vnode.children).toBeNull()
    expect(vnode.dom).toBeNull()
    expect(vnode.childFlags).toBe(ChildFlags.NoChildren)
    expect(vnode.parentDom).toBeNull()
    expect(vnode.className).toBeNull()
  })

  it("should have exactly 10 own properties", () => {
    const vnode = new VNode(VNodeFlags.Text, null, null, null, "hello", ChildFlags.NoChildren, null)
    expect(Object.keys(vnode)).toHaveLength(10)
  })
})

describe("h() JSX factory", () => {
  it("should create an element VNode", () => {
    const vnode = h("div", null)

    expect(vnode.flags).toBe(VNodeFlags.Element)
    expect(vnode.type).toBe("div")
    expect(vnode.children).toBeNull()
    expect(vnode.childFlags).toBe(ChildFlags.NoChildren)
  })

  it("should create a text child", () => {
    const vnode = h("div", null, "hello")

    expect(vnode.flags).toBe(VNodeFlags.Element)
    expect(vnode.children).toBe("hello")
    expect(vnode.childFlags).toBe(ChildFlags.HasTextChildren)
  })

  it("should create a single child VNode", () => {
    const vnode = h("div", null, h("span", null))

    expect(vnode.childFlags).toBe(ChildFlags.HasSingleChild)
    expect(vnode.children).toBeInstanceOf(VNode)
  })

  it("should create multiple children", () => {
    const vnode = h("div", null, h("span", null), h("p", null))

    expect(vnode.childFlags).toBe(ChildFlags.HasNonKeyedChildren)
    expect(Array.isArray(vnode.children)).toBe(true)
    expect((vnode.children as VNode[]).length).toBe(2)
  })

  it("should detect keyed children", () => {
    const vnode = h("ul", null, h("li", { key: "a" }), h("li", { key: "b" }))

    expect(vnode.childFlags).toBe(ChildFlags.HasKeyedChildren)
  })

  it("should filter null and undefined children", () => {
    const vnode = h("div", null, null, "hello", undefined)

    expect(vnode.children).toBe("hello")
    expect(vnode.childFlags).toBe(ChildFlags.HasTextChildren)
  })

  it("should convert number children to text VNodes", () => {
    const vnode = h("div", null, "count: ", 42)

    expect(vnode.childFlags).toBe(ChildFlags.HasNonKeyedChildren)
    const children = vnode.children as VNode[]
    expect(children.length).toBe(2)
    expect(children[0]!.flags).toBe(VNodeFlags.Text)
    expect(children[0]!.children).toBe("count: ")
    expect(children[1]!.flags).toBe(VNodeFlags.Text)
    expect(children[1]!.children).toBe("42")
  })

  it("should extract key from props", () => {
    const vnode = h("li", { key: "item-1", className: "row" })

    expect(vnode.key).toBe("item-1")
    expect(vnode.className).toBe("row")
    expect(vnode.props).toBeNull()
  })

  it("should set Component flag for function types", () => {
    const MyComponent = () => h("div", null)
    const vnode = h(MyComponent, null)

    expect(vnode.flags).toBe(VNodeFlags.Component)
    expect(vnode.type).toBe(MyComponent)
  })

  it("should set Svg flag for svg elements", () => {
    const vnode = h("svg", null)

    expect(vnode.flags).toBe(VNodeFlags.Element | VNodeFlags.Svg)
  })
})

describe("createTextVNode", () => {
  it("should create a text VNode", () => {
    const vnode = createTextVNode("hello world")

    expect(vnode.flags).toBe(VNodeFlags.Text)
    expect(vnode.type).toBeNull()
    expect(vnode.children).toBe("hello world")
    expect(vnode.childFlags).toBe(ChildFlags.NoChildren)
  })
})

describe("VNodeFlags", () => {
  it("should all be SMI-safe (< 2^30)", () => {
    const smiMax = 2 ** 30 - 1
    for (const value of Object.values(VNodeFlags)) {
      expect(value).toBeLessThanOrEqual(smiMax)
      expect(value).toBeGreaterThan(0)
    }
  })

  it("should have distinct bit positions", () => {
    const values = Object.values(VNodeFlags)
    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) {
        expect(values[i]! & values[j]!).toBe(0)
      }
    }
  })
})
