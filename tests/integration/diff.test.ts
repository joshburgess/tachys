import { describe, expect, it, vi } from "vitest"
import { h, mount, patch, unmount } from "../../src/index"
import type { VNode } from "../../src/vnode"

describe("diff / patch", () => {
  let container: HTMLDivElement

  function setup(): HTMLDivElement {
    return document.createElement("div")
  }

  function render(vnode: VNode, target: HTMLDivElement): void {
    mount(vnode, target)
  }

  describe("prop diffing", () => {
    it("should add a new prop", () => {
      container = setup()
      const old = h("div", null)
      render(old, container)
      const next = h("div", { className: "new" })
      patch(old, next, container)
      expect(container.innerHTML).toBe('<div class="new"></div>')
    })

    it("should update an existing prop", () => {
      container = setup()
      const old = h("div", { className: "old" })
      render(old, container)
      const next = h("div", { className: "new" })
      patch(old, next, container)
      expect(container.innerHTML).toBe('<div class="new"></div>')
    })

    it("should remove a prop", () => {
      container = setup()
      const old = h("div", { className: "remove-me" })
      render(old, container)
      const next = h("div", null)
      patch(old, next, container)
      expect((container.firstChild as HTMLDivElement).className).toBe("")
    })

    it("should update style object", () => {
      container = setup()
      const old = h("div", { style: { color: "red", fontSize: "14px" } })
      render(old, container)
      const next = h("div", { style: { color: "blue", fontWeight: "bold" } })
      patch(old, next, container)
      const div = container.firstChild as HTMLDivElement
      expect(div.style.color).toBe("blue")
      expect(div.style.fontWeight).toBe("bold")
      expect(div.style.fontSize).toBe("")
    })

    it("should update event handlers", () => {
      container = setup()
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      const old = h("button", { onClick: handler1 }, "btn")
      render(old, container)
      const next = h("button", { onClick: handler2 }, "btn")
      patch(old, next, container)
      ;(container.firstChild as HTMLButtonElement).click()
      expect(handler1).not.toHaveBeenCalled()
      expect(handler2).toHaveBeenCalledTimes(1)
    })
  })

  describe("text changes", () => {
    it("should update text content", () => {
      container = setup()
      const old = h("p", null, "old text")
      render(old, container)
      const next = h("p", null, "new text")
      patch(old, next, container)
      expect(container.innerHTML).toBe("<p>new text</p>")
    })

    it("should skip update for same text", () => {
      container = setup()
      const old = h("p", null, "same")
      render(old, container)
      const textNode = (container.firstChild as HTMLElement).firstChild
      const next = h("p", null, "same")
      patch(old, next, container)
      // Same DOM text node should be reused
      expect((container.firstChild as HTMLElement).firstChild).toBe(textNode)
    })
  })

  describe("type changes", () => {
    it("should replace element with different tag", () => {
      container = setup()
      const old = h("div", null, "content")
      render(old, container)
      const next = h("span", null, "content")
      patch(old, next, container)
      expect(container.innerHTML).toBe("<span>content</span>")
    })

    it("should replace element with text", () => {
      container = setup()
      const old = h("div", null, h("span", null, "child"))
      render(old, container)
      const next = h("div", null, "just text")
      patch(old, next, container)
      expect(container.innerHTML).toBe("<div>just text</div>")
    })

    it("should replace text with element", () => {
      container = setup()
      const old = h("div", null, "just text")
      render(old, container)
      const next = h("div", null, h("span", null, "child"))
      patch(old, next, container)
      expect(container.innerHTML).toBe("<div><span>child</span></div>")
    })
  })

  describe("non-keyed children", () => {
    it("should grow list", () => {
      container = setup()
      const old = h("ul", null, h("li", null, "a"), h("li", null, "b"))
      render(old, container)
      const next = h("ul", null, h("li", null, "a"), h("li", null, "b"), h("li", null, "c"))
      patch(old, next, container)
      expect(container.innerHTML).toBe("<ul><li>a</li><li>b</li><li>c</li></ul>")
    })

    it("should shrink list", () => {
      container = setup()
      const old = h("ul", null, h("li", null, "a"), h("li", null, "b"), h("li", null, "c"))
      render(old, container)
      const next = h("ul", null, h("li", null, "a"))
      patch(old, next, container)
      expect(container.innerHTML).toBe("<ul><li>a</li></ul>")
    })

    it("should update items in place", () => {
      container = setup()
      const old = h("ul", null, h("li", null, "a"), h("li", null, "b"))
      render(old, container)
      const next = h("ul", null, h("li", null, "x"), h("li", null, "y"))
      patch(old, next, container)
      expect(container.innerHTML).toBe("<ul><li>x</li><li>y</li></ul>")
    })
  })

  describe("keyed children", () => {
    function li(key: string, text: string): VNode {
      return h("li", { key }, text)
    }

    function getTextContents(parent: Element): string[] {
      return Array.from(parent.querySelectorAll("li")).map((el) => el.textContent!)
    }

    it("should append items", () => {
      container = setup()
      const old = h("ul", null, li("a", "A"), li("b", "B"))
      render(old, container)
      const next = h("ul", null, li("a", "A"), li("b", "B"), li("c", "C"))
      patch(old, next, container)
      expect(getTextContents(container)).toEqual(["A", "B", "C"])
    })

    it("should prepend items", () => {
      container = setup()
      const old = h("ul", null, li("b", "B"), li("c", "C"))
      render(old, container)
      const next = h("ul", null, li("a", "A"), li("b", "B"), li("c", "C"))
      patch(old, next, container)
      expect(getTextContents(container)).toEqual(["A", "B", "C"])
    })

    it("should remove from middle", () => {
      container = setup()
      const old = h("ul", null, li("a", "A"), li("b", "B"), li("c", "C"))
      render(old, container)
      const next = h("ul", null, li("a", "A"), li("c", "C"))
      patch(old, next, container)
      expect(getTextContents(container)).toEqual(["A", "C"])
    })

    it("should reverse order", () => {
      container = setup()
      const old = h("ul", null, li("a", "A"), li("b", "B"), li("c", "C"))
      render(old, container)

      // Capture DOM nodes
      const ul = container.firstChild as HTMLUListElement
      const originalNodes = Array.from(ul.children)

      const next = h("ul", null, li("c", "C"), li("b", "B"), li("a", "A"))
      patch(old, next, container)
      expect(getTextContents(container)).toEqual(["C", "B", "A"])

      // Verify DOM nodes were moved, not recreated
      const newNodes = Array.from(ul.children)
      expect(newNodes[0]).toBe(originalNodes[2]) // "C" was the 3rd, now 1st
      expect(newNodes[1]).toBe(originalNodes[1]) // "B" stayed in middle
      expect(newNodes[2]).toBe(originalNodes[0]) // "A" was 1st, now 3rd
    })

    it("should swap two rows", () => {
      container = setup()
      const old = h("ul", null, li("a", "A"), li("b", "B"), li("c", "C"), li("d", "D"))
      render(old, container)

      const ul = container.firstChild as HTMLUListElement
      const nodeB = ul.children[1]
      const nodeD = ul.children[3]

      const next = h("ul", null, li("a", "A"), li("d", "D"), li("c", "C"), li("b", "B"))
      patch(old, next, container)
      expect(getTextContents(container)).toEqual(["A", "D", "C", "B"])

      // Verify DOM reuse
      expect(ul.children[1]).toBe(nodeD)
      expect(ul.children[3]).toBe(nodeB)
    })

    it("should handle shuffle", () => {
      container = setup()
      const old = h(
        "ul",
        null,
        li("a", "A"),
        li("b", "B"),
        li("c", "C"),
        li("d", "D"),
        li("e", "E"),
      )
      render(old, container)

      const ul = container.firstChild as HTMLUListElement
      const nodeMap = new Map<string, Element>()
      for (const child of Array.from(ul.children)) {
        nodeMap.set(child.textContent!, child)
      }

      const next = h(
        "ul",
        null,
        li("d", "D"),
        li("a", "A"),
        li("e", "E"),
        li("c", "C"),
        li("b", "B"),
      )
      patch(old, next, container)
      expect(getTextContents(container)).toEqual(["D", "A", "E", "C", "B"])

      // Verify all DOM nodes were reused
      const newChildren = Array.from(ul.children)
      expect(newChildren[0]).toBe(nodeMap.get("D"))
      expect(newChildren[1]).toBe(nodeMap.get("A"))
      expect(newChildren[2]).toBe(nodeMap.get("E"))
      expect(newChildren[3]).toBe(nodeMap.get("C"))
      expect(newChildren[4]).toBe(nodeMap.get("B"))
    })

    it("should handle remove all and insert new", () => {
      container = setup()
      const old = h("ul", null, li("a", "A"), li("b", "B"))
      render(old, container)
      const next = h("ul", null, li("c", "C"), li("d", "D"))
      patch(old, next, container)
      expect(getTextContents(container)).toEqual(["C", "D"])
    })

    it("should handle insert in middle", () => {
      container = setup()
      const old = h("ul", null, li("a", "A"), li("c", "C"))
      render(old, container)
      const next = h("ul", null, li("a", "A"), li("b", "B"), li("c", "C"))
      patch(old, next, container)
      expect(getTextContents(container)).toEqual(["A", "B", "C"])
    })

    it("should handle move and update text", () => {
      container = setup()
      const old = h("ul", null, li("a", "A"), li("b", "B"), li("c", "C"))
      render(old, container)
      const next = h("ul", null, li("c", "C!"), li("a", "A!"), li("b", "B!"))
      patch(old, next, container)
      expect(getTextContents(container)).toEqual(["C!", "A!", "B!"])
    })
  })

  describe("component patching", () => {
    it("should re-render component with new props", () => {
      container = setup()
      const Greeting = (props: Record<string, unknown>) => h("span", null, `hello ${props["name"]}`)
      const old = h(Greeting, { name: "world" })
      render(old, container)
      expect(container.innerHTML).toBe("<span>hello world</span>")

      const next = h(Greeting, { name: "everyone" })
      patch(old, next, container)
      expect(container.innerHTML).toBe("<span>hello everyone</span>")
    })

    it("should replace component with different component", () => {
      container = setup()
      const CompA = () => h("div", null, "A")
      const CompB = () => h("div", null, "B")
      const old = h(CompA, null)
      render(old, container)
      const next = h(CompB, null)
      patch(old, next, container)
      expect(container.innerHTML).toBe("<div>B</div>")
    })
  })

  describe("unmount", () => {
    it("should remove DOM node and clear references", () => {
      container = setup()
      const vnode = h("div", { className: "bye" }, h("span", null, "child"))
      render(vnode, container)
      expect(container.childNodes.length).toBe(1)

      unmount(vnode, container)
      expect(container.childNodes.length).toBe(0)
      expect(vnode.dom).toBeNull()

      const childVNode = vnode.children as VNode
      // After unmount of the element, children references are cleared
    })

    it("should unmount component and clear rendered output", () => {
      container = setup()
      const MyComp = () => h("p", null, "test")
      const vnode = h(MyComp, null)
      render(vnode, container)
      expect(container.innerHTML).toBe("<p>test</p>")

      unmount(vnode, container)
      expect(container.innerHTML).toBe("")
      expect(vnode.dom).toBeNull()
      expect(vnode.children).toBeNull()
    })
  })

  describe("referential equality skip", () => {
    it("should skip patching when old === new", () => {
      container = setup()
      const vnode = h("div", null, "static")
      render(vnode, container)
      const domBefore = vnode.dom

      patch(vnode, vnode, container)
      expect(vnode.dom).toBe(domBefore)
    })
  })

  describe("children transitions", () => {
    it("should transition from no children to text children", () => {
      container = setup()
      const old = h("div", null)
      render(old, container)
      const next = h("div", null, "hello")
      patch(old, next, container)
      expect(container.innerHTML).toBe("<div>hello</div>")
    })

    it("should transition from text children to no children", () => {
      container = setup()
      const old = h("div", null, "hello")
      render(old, container)
      const next = h("div", null)
      patch(old, next, container)
      expect(container.innerHTML).toBe("<div></div>")
    })

    it("should transition from no children to array children", () => {
      container = setup()
      const old = h("ul", null)
      render(old, container)
      const next = h("ul", null, h("li", null, "a"), h("li", null, "b"))
      patch(old, next, container)
      expect(container.innerHTML).toBe("<ul><li>a</li><li>b</li></ul>")
    })

    it("should transition from array children to no children", () => {
      container = setup()
      const old = h("ul", null, h("li", null, "a"), h("li", null, "b"))
      render(old, container)
      const next = h("ul", null)
      patch(old, next, container)
      expect(container.innerHTML).toBe("<ul></ul>")
    })

    it("should transition from single child to array children", () => {
      container = setup()
      const old = h("div", null, h("span", null, "only"))
      render(old, container)
      const next = h("div", null, h("span", null, "a"), h("span", null, "b"))
      patch(old, next, container)
      expect(container.innerHTML).toBe("<div><span>a</span><span>b</span></div>")
    })

    it("should transition from array children to single child", () => {
      container = setup()
      const old = h("div", null, h("span", null, "a"), h("span", null, "b"))
      render(old, container)
      const next = h("div", null, h("span", null, "only"))
      patch(old, next, container)
      expect(container.innerHTML).toBe("<div><span>only</span></div>")
    })
  })
})
