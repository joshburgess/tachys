import { describe, expect, it } from "vitest"
import { h, mount } from "../../src/index"
import { renderToString, renderToReadableStream } from "../../src/server"

/** Collect all chunks from a ReadableStream into a single string. */
async function collectStream(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader()
  let result = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += value
  }
  return result
}

describe("prop name mapping", () => {
  describe("client-side (DOM)", () => {
    it("maps htmlFor to for attribute", () => {
      const container = document.createElement("div")
      mount(h("label", { htmlFor: "input-1" }, "Name"), container)
      const label = container.querySelector("label")!
      expect(label.getAttribute("for")).toBe("input-1")
    })

    it("maps tabIndex to tabindex attribute", () => {
      const container = document.createElement("div")
      mount(h("div", { tabIndex: 0 }), container)
      expect(container.firstElementChild!.getAttribute("tabindex")).toBe("0")
    })

    it("maps readOnly to readonly attribute", () => {
      const container = document.createElement("div")
      mount(h("input", { readOnly: true }), container)
      expect(container.querySelector("input")!.hasAttribute("readonly")).toBe(true)
    })

    it("maps colSpan to colspan attribute", () => {
      const container = document.createElement("div")
      mount(h("table", null, h("tr", null, h("td", { colSpan: 2 }, "cell"))), container)
      expect(container.querySelector("td")!.getAttribute("colspan")).toBe("2")
    })

    it("maps maxLength to maxlength attribute", () => {
      const container = document.createElement("div")
      mount(h("input", { maxLength: 10 }), container)
      expect(container.querySelector("input")!.getAttribute("maxlength")).toBe("10")
    })

    it("maps autoComplete to autocomplete attribute", () => {
      const container = document.createElement("div")
      mount(h("input", { autoComplete: "email" }), container)
      expect(container.querySelector("input")!.getAttribute("autocomplete")).toBe("email")
    })

    it("maps contentEditable to contenteditable attribute", () => {
      const container = document.createElement("div")
      mount(h("div", { contentEditable: "true" }), container)
      expect(container.firstElementChild!.getAttribute("contenteditable")).toBe("true")
    })

    it("passes through standard attributes unchanged", () => {
      const container = document.createElement("div")
      mount(h("div", { id: "test", "data-custom": "val" }), container)
      expect(container.firstElementChild!.getAttribute("id")).toBe("test")
      expect(container.firstElementChild!.getAttribute("data-custom")).toBe("val")
    })

    it("removes mapped attributes when set to false", () => {
      const container = document.createElement("div")
      mount(h("input", { readOnly: false }), container)
      expect(container.querySelector("input")!.hasAttribute("readonly")).toBe(false)
    })
  })

  describe("SSR (renderToString)", () => {
    it("maps htmlFor to for in HTML output", () => {
      const html = renderToString(h("label", { htmlFor: "input-1" }, "Name"))
      expect(html).toBe('<label for="input-1">Name</label>')
    })

    it("maps tabIndex to tabindex in HTML output", () => {
      const html = renderToString(h("div", { tabIndex: 0 }))
      expect(html).toBe('<div tabindex="0"></div>')
    })

    it("maps readOnly to readonly boolean attribute", () => {
      const html = renderToString(h("input", { readOnly: true }))
      expect(html).toBe("<input readonly>")
    })

    it("maps colSpan to colspan in HTML output", () => {
      const html = renderToString(h("td", { colSpan: 2 }, "cell"))
      expect(html).toBe('<td colspan="2">cell</td>')
    })

    it("maps maxLength to maxlength in HTML output", () => {
      const html = renderToString(h("input", { maxLength: 10 }))
      expect(html).toBe('<input maxlength="10">')
    })

    it("maps httpEquiv to http-equiv in HTML output", () => {
      const html = renderToString(h("meta", { httpEquiv: "refresh", content: "5" }))
      expect(html).toContain('http-equiv="refresh"')
    })
  })

  describe("SSR (renderToReadableStream)", () => {
    it("maps htmlFor to for in streamed output", async () => {
      const html = await collectStream(
        renderToReadableStream(h("label", { htmlFor: "x" }, "Label")),
      )
      expect(html).toBe('<label for="x">Label</label>')
    })

    it("maps readOnly to readonly in streamed output", async () => {
      const html = await collectStream(
        renderToReadableStream(h("input", { readOnly: true })),
      )
      expect(html).toBe("<input readonly>")
    })
  })
})
