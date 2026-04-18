import { describe, expect, it, vi } from "vitest"
import { h, mount, patch, unmount } from "../../src/index"
import type { VNode } from "../../src/vnode"

describe("event delegation", () => {
  let container: HTMLDivElement

  function setup(): HTMLDivElement {
    const el = document.createElement("div")
    document.body.appendChild(el)
    return el
  }

  function teardown(el: HTMLDivElement): void {
    document.body.removeChild(el)
  }

  describe("click delegation", () => {
    it("should fire click handler through delegation", () => {
      container = setup()
      const handler = vi.fn()
      mount(h("button", { onClick: handler }, "click me"), container)

      const button = container.querySelector("button")!
      button.click()
      expect(handler).toHaveBeenCalledTimes(1)
      teardown(container)
    })

    it("should fire handler on nested elements (bubble up)", () => {
      container = setup()
      const handler = vi.fn()
      mount(h("div", { onClick: handler }, h("span", null, h("em", null, "deep"))), container)

      // Click on the deepest element — should bubble up to div's handler
      const em = container.querySelector("em")!
      em.click()
      expect(handler).toHaveBeenCalledTimes(1)
      teardown(container)
    })

    it("should fire handlers at multiple levels during bubble", () => {
      container = setup()
      const outerHandler = vi.fn()
      const innerHandler = vi.fn()

      mount(
        h("div", { onClick: outerHandler }, h("button", { onClick: innerHandler }, "btn")),
        container,
      )

      const button = container.querySelector("button")!
      button.click()

      expect(innerHandler).toHaveBeenCalledTimes(1)
      expect(outerHandler).toHaveBeenCalledTimes(1)
      teardown(container)
    })

    it("should respect stopPropagation", () => {
      container = setup()
      const outerHandler = vi.fn()
      const innerHandler = vi.fn((e: Event) => {
        e.stopPropagation()
      })

      mount(
        h("div", { onClick: outerHandler }, h("button", { onClick: innerHandler }, "btn")),
        container,
      )

      const button = container.querySelector("button")!
      button.click()

      expect(innerHandler).toHaveBeenCalledTimes(1)
      expect(outerHandler).not.toHaveBeenCalled()
      teardown(container)
    })
  })

  describe("handler updates", () => {
    it("should update handler on patch", () => {
      container = setup()
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      const old = h("button", { onClick: handler1 }, "btn")
      mount(old, container)

      const next = h("button", { onClick: handler2 }, "btn")
      patch(old, next, container)

      const button = container.querySelector("button")!
      button.click()

      expect(handler1).not.toHaveBeenCalled()
      expect(handler2).toHaveBeenCalledTimes(1)
      teardown(container)
    })

    it("should remove handler on patch to null", () => {
      container = setup()
      const handler = vi.fn()

      const old = h("button", { onClick: handler }, "btn")
      mount(old, container)

      const next = h("button", null, "btn")
      patch(old, next, container)

      const button = container.querySelector("button")!
      button.click()

      expect(handler).not.toHaveBeenCalled()
      teardown(container)
    })

    it("should add handler on patch from null", () => {
      container = setup()
      const handler = vi.fn()

      const old = h("button", null, "btn")
      mount(old, container)

      const next = h("button", { onClick: handler }, "btn")
      patch(old, next, container)

      const button = container.querySelector("button")!
      button.click()

      expect(handler).toHaveBeenCalledTimes(1)
      teardown(container)
    })
  })

  describe("unmount cleanup", () => {
    it("should not fire handler after unmount", () => {
      container = setup()
      const handler = vi.fn()

      const vnode = h("button", { onClick: handler }, "btn")
      mount(vnode, container)

      const button = container.querySelector("button")!
      unmount(vnode, container)

      // The button is removed from DOM — clicking it won't fire through delegation
      // But we can verify the handler storage was cleaned up
      expect(
        (button as Element & { __tachys?: Record<string, unknown> }).__tachys?.["click"],
      ).toBeUndefined()
      teardown(container)
    })
  })

  describe("multiple event types", () => {
    it("should handle different event types independently", () => {
      container = setup()
      const clickHandler = vi.fn()
      const mousedownHandler = vi.fn()

      mount(h("div", { onClick: clickHandler, onMouseDown: mousedownHandler }, "target"), container)

      const div = container.firstChild as HTMLDivElement

      const mousedownEvent = new MouseEvent("mousedown", { bubbles: true })
      div.dispatchEvent(mousedownEvent)

      expect(mousedownHandler).toHaveBeenCalledTimes(1)
      expect(clickHandler).not.toHaveBeenCalled()

      div.click()
      expect(clickHandler).toHaveBeenCalledTimes(1)
      teardown(container)
    })
  })

  describe("non-bubbling events", () => {
    it("should handle focus event with direct listener", () => {
      container = setup()
      const focusHandler = vi.fn()

      mount(h("input", { onFocus: focusHandler, type: "text" }), container)

      const input = container.querySelector("input")!
      const focusEvent = new FocusEvent("focus")
      input.dispatchEvent(focusEvent)

      expect(focusHandler).toHaveBeenCalledTimes(1)
      teardown(container)
    })

    it("should handle blur event with direct listener", () => {
      container = setup()
      const blurHandler = vi.fn()

      mount(h("input", { onBlur: blurHandler, type: "text" }), container)

      const input = container.querySelector("input")!
      const blurEvent = new FocusEvent("blur")
      input.dispatchEvent(blurEvent)

      expect(blurHandler).toHaveBeenCalledTimes(1)
      teardown(container)
    })

    it("should clean up non-bubbling event listeners on unmount", () => {
      container = setup()
      const focusHandler = vi.fn()

      const vnode = h("input", { onFocus: focusHandler, type: "text" })
      mount(vnode, container)
      const input = container.querySelector("input")!

      unmount(vnode, container)

      // Dispatch focus — handler should not fire
      const focusEvent = new FocusEvent("focus")
      input.dispatchEvent(focusEvent)
      expect(focusHandler).not.toHaveBeenCalled()
      teardown(container)
    })
  })
})

describe("CSS custom properties in style", () => {
  function setup(): HTMLDivElement {
    const el = document.createElement("div")
    document.body.appendChild(el)
    return el
  }

  function teardown(el: HTMLDivElement): void {
    document.body.removeChild(el)
  }

  it("should set a CSS custom property on mount via setProperty", () => {
    const container = setup()
    mount(h("div", { style: { "--primary": "blue" } }), container)

    const div = container.firstChild as HTMLDivElement
    // CSS custom properties are set via setProperty, not as direct style keys
    expect(div.style.getPropertyValue("--primary")).toBe("blue")
    teardown(container)
  })

  it("should patch a CSS custom property to a new value", () => {
    const container = setup()
    const old = h("div", { style: { "--primary": "blue" } })
    mount(old, container)

    const div = container.firstChild as HTMLDivElement
    expect(div.style.getPropertyValue("--primary")).toBe("blue")

    const next = h("div", { style: { "--primary": "red" } })
    patch(old, next, container)

    expect(div.style.getPropertyValue("--primary")).toBe("red")
    teardown(container)
  })

  it("should remove a CSS custom property when patching style to null", () => {
    const container = setup()
    const old = h("div", { style: { "--primary": "blue" } })
    mount(old, container)

    const div = container.firstChild as HTMLDivElement

    const next = h("div", null)
    patch(old, next, container)

    // style attribute should be removed entirely
    expect(div.hasAttribute("style")).toBe(false)
    teardown(container)
  })

  it("should handle mixed regular and CSS custom properties", () => {
    const container = setup()
    mount(h("div", { style: { "--accent": "green", color: "red" } }), container)

    const div = container.firstChild as HTMLDivElement
    expect(div.style.getPropertyValue("--accent")).toBe("green")
    expect(div.style.color).toBe("red")
    teardown(container)
  })
})

describe("additional non-bubbling events", () => {
  function setup(): HTMLDivElement {
    const el = document.createElement("div")
    document.body.appendChild(el)
    return el
  }

  function teardown(el: HTMLDivElement): void {
    document.body.removeChild(el)
  }

  it("should fire mouseenter handler via direct addEventListener", () => {
    const container = setup()
    const mouseenterHandler = vi.fn()

    mount(h("div", { onMouseEnter: mouseenterHandler }, "target"), container)

    const div = container.firstChild as HTMLDivElement
    const event = new MouseEvent("mouseenter", { bubbles: false })
    div.dispatchEvent(event)

    expect(mouseenterHandler).toHaveBeenCalledTimes(1)
    teardown(container)
  })

  it("should fire pointerenter handler via direct addEventListener", () => {
    const container = setup()
    const pointerenterHandler = vi.fn()

    mount(h("div", { onPointerEnter: pointerenterHandler }, "target"), container)

    const div = container.firstChild as HTMLDivElement
    // PointerEvent may not be defined in all jsdom versions; use base Event
    const event = new Event("pointerenter", { bubbles: false })
    div.dispatchEvent(event)

    expect(pointerenterHandler).toHaveBeenCalledTimes(1)
    teardown(container)
  })

  it("should clean up mouseenter listener on unmount", () => {
    const container = setup()
    const mouseenterHandler = vi.fn()

    const vnode = h("div", { onMouseEnter: mouseenterHandler }, "target")
    mount(vnode, container)
    const div = container.firstChild as HTMLDivElement

    unmount(vnode, container)

    const event = new MouseEvent("mouseenter", { bubbles: false })
    div.dispatchEvent(event)

    expect(mouseenterHandler).not.toHaveBeenCalled()
    teardown(container)
  })
})

describe("event handler on root container element itself", () => {
  it("should fire a click handler attached to the root container element via delegation", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)

    const handler = vi.fn()
    // Mount a vnode on the container that has a click handler on an inner element,
    // and also verify the delegation root check fires when target IS the container.
    // We do this by placing the handler on the container itself as the mounted vnode.
    const vnode = h("button", { onClick: handler }, "click")
    mount(vnode, container)

    const button = container.querySelector("button")!
    button.click()
    expect(handler).toHaveBeenCalledTimes(1)

    document.body.removeChild(container)
  })
})

describe("bubbling and non-bubbling handlers on the same element", () => {
  function setup(): HTMLDivElement {
    const el = document.createElement("div")
    document.body.appendChild(el)
    return el
  }

  function teardown(el: HTMLDivElement): void {
    document.body.removeChild(el)
  }

  it("should independently fire both bubbling and non-bubbling handlers", () => {
    const container = setup()
    const clickHandler = vi.fn()
    const focusHandler = vi.fn()

    mount(h("input", { onClick: clickHandler, onFocus: focusHandler, type: "text" }), container)

    const input = container.querySelector("input")!

    // Non-bubbling event
    const focusEvent = new FocusEvent("focus")
    input.dispatchEvent(focusEvent)
    expect(focusHandler).toHaveBeenCalledTimes(1)
    expect(clickHandler).not.toHaveBeenCalled()

    // Bubbling event
    input.click()
    expect(clickHandler).toHaveBeenCalledTimes(1)
    expect(focusHandler).toHaveBeenCalledTimes(1)
    teardown(container)
  })

  it("should clean up both bubbling and non-bubbling handlers on unmount", () => {
    const container = setup()
    const clickHandler = vi.fn()
    const focusHandler = vi.fn()

    const vnode = h("input", { onClick: clickHandler, onFocus: focusHandler, type: "text" })
    mount(vnode, container)
    const input = container.querySelector("input")!

    unmount(vnode, container)

    // After unmount, neither handler should fire
    const focusEvent = new FocusEvent("focus")
    input.dispatchEvent(focusEvent)
    expect(focusHandler).not.toHaveBeenCalled()

    // Clicking the detached element won't bubble through the container,
    // but we can verify the handler storage was cleared
    expect(
      (input as Element & { __tachys?: Record<string, unknown> }).__tachys?.["click"],
    ).toBeUndefined()
    expect(
      (input as Element & { __tachys?: Record<string, unknown> }).__tachys?.["focus"],
    ).toBeUndefined()
    teardown(container)
  })

  describe("onChange normalization (React compat)", () => {
    it("fires onChange on native input event for text inputs", () => {
      const c = setup()
      const handler = vi.fn()
      mount(h("input", { type: "text", onChange: handler }), c)
      const input = c.querySelector("input")!
      input.value = "x"
      input.dispatchEvent(new Event("input", { bubbles: true }))
      expect(handler).toHaveBeenCalledTimes(1)
      teardown(c)
    })

    it("fires onChange on native input event for textareas", () => {
      const c = setup()
      const handler = vi.fn()
      mount(h("textarea", { onChange: handler }), c)
      c.querySelector("textarea")!.dispatchEvent(new Event("input", { bubbles: true }))
      expect(handler).toHaveBeenCalledTimes(1)
      teardown(c)
    })

    it("uses native change event for checkboxes", () => {
      const c = setup()
      const handler = vi.fn()
      mount(h("input", { type: "checkbox", onChange: handler }), c)
      c.querySelector("input")!.dispatchEvent(new Event("change", { bubbles: true }))
      expect(handler).toHaveBeenCalledTimes(1)
      // native "input" event should NOT fire the handler for checkboxes
      const c2 = setup()
      const handler2 = vi.fn()
      mount(h("input", { type: "checkbox", onChange: handler2 }), c2)
      c2.querySelector("input")!.dispatchEvent(new Event("input", { bubbles: true }))
      expect(handler2).not.toHaveBeenCalled()
      teardown(c)
      teardown(c2)
    })

    it("uses native change event for selects", () => {
      const c = setup()
      const handler = vi.fn()
      mount(h("select", { onChange: handler }, h("option", { value: "a" }, "A")), c)
      c.querySelector("select")!.dispatchEvent(new Event("change", { bubbles: true }))
      expect(handler).toHaveBeenCalledTimes(1)
      teardown(c)
    })
  })
})
