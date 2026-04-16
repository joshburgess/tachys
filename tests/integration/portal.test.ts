import { describe, expect, it, beforeEach } from "vitest"
import { h, mount, patch, createPortal, useState, flushUpdates, unmount, useEffect, createTextVNode } from "../../src/index"
import type { VNode } from "../../src/vnode"

function setup(): HTMLDivElement {
  return document.createElement("div")
}

describe("createPortal", () => {
  let parent: HTMLDivElement
  let portalTarget: HTMLDivElement

  beforeEach(() => {
    parent = setup()
    portalTarget = setup()
  })

  // 1. Portal mounts children into the target container (not the parent)
  it("renders children into the portal target container, not the parent", () => {
    const vnode = createPortal(h("div", null, "portal content"), portalTarget)
    mount(vnode, parent)

    expect(portalTarget.innerHTML).toBe("<div>portal content</div>")
    expect(parent.querySelector("div")).toBeNull()
  })

  // 2. Portal leaves a placeholder in the original parent
  it("leaves a placeholder text node in the original parent", () => {
    const vnode = createPortal(h("span", null, "hello"), portalTarget)
    mount(vnode, parent)

    // The portal content is NOT in parent as an element
    expect(parent.querySelector("span")).toBeNull()
    // But there should be at least one text node (the placeholder)
    const textNodes = Array.from(parent.childNodes).filter(
      (n) => n.nodeType === Node.TEXT_NODE,
    )
    expect(textNodes.length).toBeGreaterThanOrEqual(1)
  })

  // 3. Portal children update correctly when patched with new children
  it("updates portal children in the target container when patched", () => {
    const old = createPortal(h("p", null, "v1"), portalTarget)
    mount(old, parent)
    expect(portalTarget.innerHTML).toBe("<p>v1</p>")

    const next = createPortal(h("p", null, "v2"), portalTarget)
    patch(old, next, parent)
    expect(portalTarget.innerHTML).toBe("<p>v2</p>")
    // Parent still has no element child
    expect(parent.querySelector("p")).toBeNull()
  })

  // 4. Portal unmount removes children from target container
  it("removes children from the portal target container on unmount", () => {
    const vnode = createPortal(h("div", null, "remove me"), portalTarget)
    mount(vnode, parent)
    expect(portalTarget.childNodes.length).toBe(1)

    unmount(vnode, parent)
    expect(portalTarget.childNodes.length).toBe(0)
  })

  // 5. Portal unmount removes placeholder from original parent
  it("removes the placeholder from the original parent on unmount", () => {
    const vnode = createPortal(h("div", null, "content"), portalTarget)
    mount(vnode, parent)

    // Before unmount: placeholder exists in parent
    expect(parent.childNodes.length).toBeGreaterThanOrEqual(1)

    unmount(vnode, parent)
    expect(parent.childNodes.length).toBe(0)
  })

  // 6. Portal with nested elements renders full subtree in target
  it("renders a deeply nested subtree into the target container", () => {
    const vnode = createPortal(
      h("section", null,
        h("ul", null,
          h("li", { key: "a" }, "item A"),
          h("li", { key: "b" }, "item B"),
        ),
      ),
      portalTarget,
    )
    mount(vnode, parent)

    expect(portalTarget.querySelector("section")).not.toBeNull()
    expect(portalTarget.querySelectorAll("li").length).toBe(2)
    expect(portalTarget.querySelector("ul")!.textContent).toBe("item Aitem B")
    // None of that structure appears in parent
    expect(parent.querySelector("section")).toBeNull()
  })

  // 7. Multiple portals render into different containers
  it("supports multiple portals rendering into different target containers", () => {
    const targetA = setup()
    const targetB = setup()

    const portalA = createPortal(h("span", null, "A"), targetA)
    const portalB = createPortal(h("span", null, "B"), targetB)

    const wrapper = h("div", null, portalA, portalB)
    mount(wrapper, parent)

    expect(targetA.innerHTML).toBe("<span>A</span>")
    expect(targetB.innerHTML).toBe("<span>B</span>")
    expect(parent.querySelector("span")).toBeNull()
  })

  // 8. Portal works alongside regular children
  it("regular children render in parent while portal children render in target", () => {
    const portalVNode = createPortal(h("em", null, "portal child"), portalTarget)
    const wrapper = h("div", null,
      h("strong", null, "regular child"),
      portalVNode,
    )
    mount(wrapper, parent)

    // Regular child is inside parent's div
    expect(parent.querySelector("strong")!.textContent).toBe("regular child")
    // Portal child is in target, not parent
    expect(parent.querySelector("em")).toBeNull()
    expect(portalTarget.querySelector("em")!.textContent).toBe("portal child")
  })

  // 9. Portal with text children
  it("renders a plain text VNode via portal into the target", () => {
    const textChild = createTextVNode("just text")
    const vnode = createPortal(textChild, portalTarget)
    mount(vnode, parent)

    expect(portalTarget.textContent).toBe("just text")
    // No text content from portal in parent (only the empty placeholder)
    const parentText = Array.from(parent.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join("")
    expect(parentText).toBe("") // placeholder is empty string
  })

  // 10. Portal with component children that use hooks
  it("renders a component child with useState inside a portal", () => {
    let setter: (v: string) => void

    function Greeting() {
      const [name, setName] = useState("World")
      setter = setName
      return h("h1", null, `Hello, ${name}!`)
    }

    const portalVNode = createPortal(h(Greeting, null), portalTarget)
    mount(portalVNode, parent)

    expect(portalTarget.querySelector("h1")!.textContent).toBe("Hello, World!")
    expect(parent.querySelector("h1")).toBeNull()

    setter!("Phasm")
    flushUpdates()

    expect(portalTarget.querySelector("h1")!.textContent).toBe("Hello, Phasm!")
    expect(parent.querySelector("h1")).toBeNull()
  })

  // Additional: patch portal - change text content of element inside portal
  it("patches text content within the portal target", () => {
    const old = createPortal(h("div", null, "before"), portalTarget)
    mount(old, parent)
    expect(portalTarget.querySelector("div")!.textContent).toBe("before")

    const next = createPortal(h("div", null, "after"), portalTarget)
    patch(old, next, parent)
    expect(portalTarget.querySelector("div")!.textContent).toBe("after")
  })

  // Additional: portal content is completely absent from parent's innerHTML
  it("does not leak portal content into parent's innerHTML", () => {
    const vnode = createPortal(
      h("dialog", null, "secret modal content"),
      portalTarget,
    )
    mount(vnode, parent)

    expect(parent.innerHTML).not.toContain("dialog")
    expect(parent.innerHTML).not.toContain("secret modal content")
    expect(portalTarget.innerHTML).toBe("<dialog>secret modal content</dialog>")
  })

  // Additional: unmount cleans up both portal content and placeholder together
  it("leaves both parent and portal target empty after unmount", () => {
    const vnode = createPortal(h("div", null, "bye"), portalTarget)
    mount(vnode, parent)

    expect(parent.childNodes.length).toBeGreaterThan(0)
    expect(portalTarget.childNodes.length).toBeGreaterThan(0)

    unmount(vnode, parent)

    expect(parent.childNodes.length).toBe(0)
    expect(portalTarget.childNodes.length).toBe(0)
  })

  // Additional: portal with useEffect — effect runs after mount, cleanup runs on unmount
  it("runs useEffect inside a portal component and cleans up on unmount", () => {
    const log: string[] = []

    function Tracked() {
      useEffect(() => {
        log.push("mounted")
        return () => {
          log.push("cleanup")
        }
      }, [])
      return h("div", null, "tracked")
    }

    const vnode = createPortal(h(Tracked, null), portalTarget)
    mount(vnode, parent)
    expect(log).toEqual(["mounted"])

    unmount(vnode, parent)
    expect(log).toEqual(["mounted", "cleanup"])
  })
})
