import { describe, expect, it } from "vitest"
import {
  ChildFlags,
  VNodeFlags,
  createTextVNode,
  h,
  hasArrayChildren,
  hasSingleChild,
  hasTextChildren,
  isComponentVNode,
  isElementVNode,
  isFragmentVNode,
  isTextVNode,
} from "../../src/index"
import { VNode } from "../../src/vnode"

// ---------------------------------------------------------------------------
// Helpers to build specific VNode shapes
// ---------------------------------------------------------------------------

function makeTextVNode(): VNode {
  return createTextVNode("hello")
}

function makeElementVNode(): VNode {
  return h("div", null)
}

function makeComponentVNode(): VNode {
  const Fn = (_props: Record<string, unknown>) => h("span", null)
  return h(Fn, null)
}

function makeFragmentVNode(): VNode {
  return h(null, null)
}

// ---------------------------------------------------------------------------
// isTextVNode
// ---------------------------------------------------------------------------

describe("isTextVNode", () => {
  it("returns true for a text VNode", () => {
    const vnode = makeTextVNode()
    expect(isTextVNode(vnode)).toBe(true)
  })

  it("returns false for an element VNode", () => {
    const vnode = makeElementVNode()
    expect(isTextVNode(vnode)).toBe(false)
  })

  it("returns false for a component VNode", () => {
    const vnode = makeComponentVNode()
    expect(isTextVNode(vnode)).toBe(false)
  })

  it("returns false for a fragment VNode", () => {
    const vnode = makeFragmentVNode()
    expect(isTextVNode(vnode)).toBe(false)
  })

  it("allows type-narrowing: children is string after guard", () => {
    const vnode = makeTextVNode()
    if (isTextVNode(vnode)) {
      // TypeScript narrows children to string here — at runtime we just check
      expect(typeof vnode.children).toBe("string")
    } else {
      throw new Error("expected isTextVNode to be true")
    }
  })
})

// ---------------------------------------------------------------------------
// isElementVNode
// ---------------------------------------------------------------------------

describe("isElementVNode", () => {
  it("returns true for an element VNode", () => {
    const vnode = makeElementVNode()
    expect(isElementVNode(vnode)).toBe(true)
  })

  it("returns true for an SVG element VNode", () => {
    const vnode = h("svg", null)
    expect(isElementVNode(vnode)).toBe(true)
  })

  it("returns false for a text VNode", () => {
    const vnode = makeTextVNode()
    expect(isElementVNode(vnode)).toBe(false)
  })

  it("returns false for a component VNode", () => {
    const vnode = makeComponentVNode()
    expect(isElementVNode(vnode)).toBe(false)
  })

  it("returns false for a fragment VNode", () => {
    const vnode = makeFragmentVNode()
    expect(isElementVNode(vnode)).toBe(false)
  })

  it("allows type-narrowing: type is string after guard", () => {
    const vnode = makeElementVNode()
    if (isElementVNode(vnode)) {
      expect(typeof vnode.type).toBe("string")
    } else {
      throw new Error("expected isElementVNode to be true")
    }
  })
})

// ---------------------------------------------------------------------------
// isComponentVNode
// ---------------------------------------------------------------------------

describe("isComponentVNode", () => {
  it("returns true for a component VNode", () => {
    const vnode = makeComponentVNode()
    expect(isComponentVNode(vnode)).toBe(true)
  })

  it("returns false for an element VNode", () => {
    const vnode = makeElementVNode()
    expect(isComponentVNode(vnode)).toBe(false)
  })

  it("returns false for a text VNode", () => {
    const vnode = makeTextVNode()
    expect(isComponentVNode(vnode)).toBe(false)
  })

  it("returns false for a fragment VNode", () => {
    const vnode = makeFragmentVNode()
    expect(isComponentVNode(vnode)).toBe(false)
  })

  it("allows type-narrowing: type is a function after guard", () => {
    const vnode = makeComponentVNode()
    if (isComponentVNode(vnode)) {
      expect(typeof vnode.type).toBe("function")
    } else {
      throw new Error("expected isComponentVNode to be true")
    }
  })
})

// ---------------------------------------------------------------------------
// isFragmentVNode
// ---------------------------------------------------------------------------

describe("isFragmentVNode", () => {
  it("returns true for a fragment VNode", () => {
    const vnode = makeFragmentVNode()
    expect(isFragmentVNode(vnode)).toBe(true)
  })

  it("returns false for an element VNode", () => {
    const vnode = makeElementVNode()
    expect(isFragmentVNode(vnode)).toBe(false)
  })

  it("returns false for a text VNode", () => {
    const vnode = makeTextVNode()
    expect(isFragmentVNode(vnode)).toBe(false)
  })

  it("returns false for a component VNode", () => {
    const vnode = makeComponentVNode()
    expect(isFragmentVNode(vnode)).toBe(false)
  })

  it("allows type-narrowing: type is null after guard", () => {
    const vnode = makeFragmentVNode()
    if (isFragmentVNode(vnode)) {
      expect(vnode.type).toBeNull()
    } else {
      throw new Error("expected isFragmentVNode to be true")
    }
  })
})

// ---------------------------------------------------------------------------
// hasSingleChild
// ---------------------------------------------------------------------------

describe("hasSingleChild", () => {
  it("returns true when childFlags is HasSingleChild", () => {
    const child = h("span", null)
    const vnode = h("div", null, child)

    expect(hasSingleChild(vnode)).toBe(true)
  })

  it("returns false for NoChildren", () => {
    const vnode = h("div", null)
    expect(hasSingleChild(vnode)).toBe(false)
  })

  it("returns false for HasTextChildren", () => {
    const vnode = h("div", null, "text")
    expect(hasSingleChild(vnode)).toBe(false)
  })

  it("returns false for HasNonKeyedChildren (multiple children)", () => {
    const vnode = h("div", null, h("span", null), h("p", null))
    expect(hasSingleChild(vnode)).toBe(false)
  })

  it("returns false for HasKeyedChildren", () => {
    const vnode = h("ul", null, h("li", { key: "a" }), h("li", { key: "b" }))
    expect(hasSingleChild(vnode)).toBe(false)
  })

  it("allows type-narrowing: children is VNode after guard", () => {
    const child = h("em", null)
    const vnode = h("div", null, child)

    if (hasSingleChild(vnode)) {
      expect(vnode.children).toBeInstanceOf(VNode)
    } else {
      throw new Error("expected hasSingleChild to be true")
    }
  })
})

// ---------------------------------------------------------------------------
// hasArrayChildren
// ---------------------------------------------------------------------------

describe("hasArrayChildren", () => {
  it("returns true for HasNonKeyedChildren", () => {
    const vnode = h("div", null, h("span", null), h("p", null))
    expect(hasArrayChildren(vnode)).toBe(true)
  })

  it("returns true for HasKeyedChildren", () => {
    const vnode = h("ul", null, h("li", { key: "a" }), h("li", { key: "b" }))
    expect(hasArrayChildren(vnode)).toBe(true)
  })

  it("returns false for NoChildren", () => {
    const vnode = h("div", null)
    expect(hasArrayChildren(vnode)).toBe(false)
  })

  it("returns false for HasTextChildren", () => {
    const vnode = h("div", null, "text")
    expect(hasArrayChildren(vnode)).toBe(false)
  })

  it("returns false for HasSingleChild", () => {
    const vnode = h("div", null, h("span", null))
    expect(hasArrayChildren(vnode)).toBe(false)
  })

  it("allows type-narrowing: children is VNode[] after guard", () => {
    const vnode = h("div", null, h("span", null), h("p", null))
    if (hasArrayChildren(vnode)) {
      expect(Array.isArray(vnode.children)).toBe(true)
    } else {
      throw new Error("expected hasArrayChildren to be true")
    }
  })
})

// ---------------------------------------------------------------------------
// hasTextChildren
// ---------------------------------------------------------------------------

describe("hasTextChildren", () => {
  it("returns true for a text child produced by h()", () => {
    const vnode = h("p", null, "hello world")
    expect(hasTextChildren(vnode)).toBe(true)
  })

  it("returns false for NoChildren", () => {
    const vnode = h("div", null)
    expect(hasTextChildren(vnode)).toBe(false)
  })

  it("returns false for HasSingleChild", () => {
    const vnode = h("div", null, h("span", null))
    expect(hasTextChildren(vnode)).toBe(false)
  })

  it("returns false for HasNonKeyedChildren", () => {
    const vnode = h("div", null, h("span", null), h("p", null))
    expect(hasTextChildren(vnode)).toBe(false)
  })

  it("returns false for HasKeyedChildren", () => {
    const vnode = h("ul", null, h("li", { key: "a" }), h("li", { key: "b" }))
    expect(hasTextChildren(vnode)).toBe(false)
  })

  it("allows type-narrowing: children is string after guard", () => {
    const vnode = h("span", null, "text content")
    if (hasTextChildren(vnode)) {
      expect(typeof vnode.children).toBe("string")
      expect(vnode.children).toBe("text content")
    } else {
      throw new Error("expected hasTextChildren to be true")
    }
  })

  it("VNode constructed with HasTextChildren childFlag passes the guard", () => {
    const vnode = new VNode(
      VNodeFlags.Element,
      "div",
      null,
      null,
      "raw text",
      ChildFlags.HasTextChildren,
      null,
    )
    expect(hasTextChildren(vnode)).toBe(true)
  })
})
