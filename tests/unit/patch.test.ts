import { describe, expect, it } from "vitest"
import { h, mount, patch } from "../../src/index"

describe("patchProp: attributes", () => {
  it("sets and updates id via direct property", () => {
    const container = document.createElement("div")
    const old = h("div", { id: "first" })
    mount(old, container)
    expect(container.firstElementChild!.id).toBe("first")

    const next = h("div", { id: "second" })
    patch(old, next, container)
    expect(container.firstElementChild!.id).toBe("second")
  })

  it("maps React camelCase props to HTML attributes", () => {
    const container = document.createElement("div")
    mount(h("label", { htmlFor: "name-input" }), container)
    expect(container.firstElementChild!.getAttribute("for")).toBe("name-input")
  })

  it("maps tabIndex to tabindex", () => {
    const container = document.createElement("div")
    mount(h("input", { tabIndex: 3 }), container)
    expect(container.firstElementChild!.getAttribute("tabindex")).toBe("3")
  })

  it("maps colSpan to colspan", () => {
    const container = document.createElement("div")
    mount(h("td", { colSpan: 2 }), container)
    expect(container.firstElementChild!.getAttribute("colspan")).toBe("2")
  })

  it("maps readOnly to readonly", () => {
    const container = document.createElement("div")
    mount(h("input", { readOnly: true }), container)
    expect(container.firstElementChild!.hasAttribute("readonly")).toBe(true)
  })
})

describe("patchProp: boolean attributes", () => {
  it("sets true boolean as empty attribute", () => {
    const container = document.createElement("div")
    mount(h("input", { disabled: true }), container)
    expect(container.firstElementChild!.hasAttribute("disabled")).toBe(true)
  })

  it("removes false boolean attribute", () => {
    const container = document.createElement("div")
    const old = h("input", { disabled: true })
    mount(old, container)
    expect(container.firstElementChild!.hasAttribute("disabled")).toBe(true)

    const next = h("input", { disabled: false })
    patch(old, next, container)
    expect(container.firstElementChild!.hasAttribute("disabled")).toBe(false)
  })

  it("removes null attribute", () => {
    const container = document.createElement("div")
    const old = h("div", { title: "hi" })
    mount(old, container)
    expect(container.firstElementChild!.getAttribute("title")).toBe("hi")

    const next = h("div", { title: null })
    patch(old, next, container)
    expect(container.firstElementChild!.hasAttribute("title")).toBe(false)
  })
})

describe("patchProp: value and checked", () => {
  it("sets value as DOM property", () => {
    const container = document.createElement("div")
    mount(h("input", { value: "hello" }), container)
    expect((container.firstElementChild as HTMLInputElement).value).toBe("hello")
  })

  it("updates value property on patch", () => {
    const container = document.createElement("div")
    const old = h("input", { value: "old" })
    mount(old, container)

    const next = h("input", { value: "new" })
    patch(old, next, container)
    expect((container.firstElementChild as HTMLInputElement).value).toBe("new")
  })

  it("sets checked as DOM property", () => {
    const container = document.createElement("div")
    mount(h("input", { type: "checkbox", checked: true }), container)
    expect((container.firstElementChild as HTMLInputElement).checked).toBe(true)
  })
})

describe("patchProp: style", () => {
  it("sets style object properties", () => {
    const container = document.createElement("div")
    mount(h("div", { style: { color: "red", fontSize: "14px" } }), container)
    const el = container.firstElementChild as HTMLElement
    expect(el.style.color).toBe("red")
    expect(el.style.fontSize).toBe("14px")
  })

  it("updates style properties on patch", () => {
    const container = document.createElement("div")
    const old = h("div", { style: { color: "red", margin: "10px" } })
    mount(old, container)

    const next = h("div", { style: { color: "blue" } })
    patch(old, next, container)

    const el = container.firstElementChild as HTMLElement
    expect(el.style.color).toBe("blue")
    // margin should be cleared
    expect(el.style.margin).toBe("")
  })

  it("removes style when set to null", () => {
    const container = document.createElement("div")
    const old = h("div", { style: { color: "red" } })
    mount(old, container)

    const next = h("div", { style: null })
    patch(old, next, container)
    expect(container.firstElementChild!.hasAttribute("style")).toBe(false)
  })

  it("handles CSS custom properties", () => {
    const container = document.createElement("div")
    mount(h("div", { style: { "--my-var": "blue" } }), container)
    const el = container.firstElementChild as HTMLElement
    expect(el.style.getPropertyValue("--my-var")).toBe("blue")
  })
})

describe("patchProp: events", () => {
  it("attaches and fires click event", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)

    let clicked = false
    mount(h("button", { onClick: () => { clicked = true } }, "click me"), container)

    const button = container.querySelector("button")!
    button.click()
    expect(clicked).toBe(true)

    document.body.removeChild(container)
  })

  it("updates event handler on patch", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)

    const calls: string[] = []
    const old = h("button", { onClick: () => calls.push("old") }, "btn")
    mount(old, container)

    const next = h("button", { onClick: () => calls.push("new") }, "btn")
    patch(old, next, container)

    container.querySelector("button")!.click()
    expect(calls).toEqual(["new"])

    document.body.removeChild(container)
  })
})

describe("patchProp: prop removal", () => {
  it("removes props not present in new vnode", () => {
    const container = document.createElement("div")
    const old = h("div", { title: "old", "data-x": "1" })
    mount(old, container)

    const next = h("div", { title: "new" })
    patch(old, next, container)

    const el = container.firstElementChild!
    expect(el.getAttribute("title")).toBe("new")
    expect(el.hasAttribute("data-x")).toBe(false)
  })
})
