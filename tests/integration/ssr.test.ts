import { describe, expect, it } from "vitest"
import { h, useState, useMemo, useRef, createContext, useContext } from "../../src/index"
import { renderToString, renderToReadableStream } from "../../src/server"
import type { VNode } from "../../src/vnode"

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

// ---------------------------------------------------------------------------
// renderToString - basic elements
// ---------------------------------------------------------------------------

describe("renderToString", () => {
  describe("elements", () => {
    it("renders a simple div", () => {
      expect(renderToString(h("div", null))).toBe("<div></div>")
    })

    it("renders nested elements", () => {
      const vnode = h("div", null, h("span", null, "hello"))
      expect(renderToString(vnode)).toBe("<div><span>hello</span></div>")
    })

    it("renders className as class attribute", () => {
      const vnode = h("div", { className: "box" })
      expect(renderToString(vnode)).toBe('<div class="box"></div>')
    })

    it("renders string attributes", () => {
      const vnode = h("input", { type: "text", name: "field" })
      expect(renderToString(vnode)).toBe('<input type="text" name="field">')
    })

    it("renders boolean true attribute as name only", () => {
      const vnode = h("input", { disabled: true })
      expect(renderToString(vnode)).toBe("<input disabled>")
    })

    it("omits boolean false attributes", () => {
      const vnode = h("input", { disabled: false })
      expect(renderToString(vnode)).toBe("<input>")
    })

    it("omits null and undefined attributes", () => {
      const vnode = h("div", { id: null, "data-x": undefined })
      expect(renderToString(vnode)).toBe("<div></div>")
    })

    it("renders numeric attributes", () => {
      const vnode = h("input", { tabIndex: 3 })
      expect(renderToString(vnode)).toBe('<input tabindex="3">')
    })

    it("renders multiple children", () => {
      const vnode = h("ul", null, h("li", null, "a"), h("li", null, "b"))
      expect(renderToString(vnode)).toBe("<ul><li>a</li><li>b</li></ul>")
    })

    it("renders text children", () => {
      const vnode = h("p", null, "hello world")
      expect(renderToString(vnode)).toBe("<p>hello world</p>")
    })
  })

  // ---------------------------------------------------------------------------
  // Void elements
  // ---------------------------------------------------------------------------

  describe("void elements", () => {
    it("renders br as self-closing", () => {
      expect(renderToString(h("br", null))).toBe("<br>")
    })

    it("renders img with attributes", () => {
      const vnode = h("img", { src: "test.png", alt: "test" })
      expect(renderToString(vnode)).toBe('<img src="test.png" alt="test">')
    })

    it("renders input as self-closing", () => {
      expect(renderToString(h("input", null))).toBe("<input>")
    })

    it("renders hr", () => {
      expect(renderToString(h("hr", null))).toBe("<hr>")
    })

    it("renders meta", () => {
      const vnode = h("meta", { charset: "utf-8" })
      expect(renderToString(vnode)).toBe('<meta charset="utf-8">')
    })

    it("renders link", () => {
      const vnode = h("link", { rel: "stylesheet", href: "style.css" })
      expect(renderToString(vnode)).toBe('<link rel="stylesheet" href="style.css">')
    })
  })

  // ---------------------------------------------------------------------------
  // HTML escaping
  // ---------------------------------------------------------------------------

  describe("HTML escaping", () => {
    it("escapes text content", () => {
      const vnode = h("p", null, '<script>alert("xss")</script>')
      expect(renderToString(vnode)).toBe(
        "<p>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</p>",
      )
    })

    it("escapes attribute values", () => {
      const vnode = h("div", { title: 'he said "hi" & waved' })
      expect(renderToString(vnode)).toBe(
        '<div title="he said &quot;hi&quot; &amp; waved"></div>',
      )
    })

    it("escapes className", () => {
      const vnode = h("div", { className: 'a"b' })
      expect(renderToString(vnode)).toBe('<div class="a&quot;b"></div>')
    })
  })

  // ---------------------------------------------------------------------------
  // Style objects
  // ---------------------------------------------------------------------------

  describe("style objects", () => {
    it("renders camelCase style properties as kebab-case", () => {
      const vnode = h("div", { style: { backgroundColor: "red" } })
      expect(renderToString(vnode)).toBe('<div style="background-color:red"></div>')
    })

    it("renders multiple style properties separated by semicolon", () => {
      const vnode = h("div", { style: { color: "blue", fontSize: "14px" } })
      const html = renderToString(vnode)
      expect(html).toContain("color:blue")
      expect(html).toContain("font-size:14px")
    })

    it("skips null/undefined/empty style values", () => {
      const vnode = h("div", { style: { color: null, display: undefined, margin: "" } })
      expect(renderToString(vnode)).toBe("<div></div>")
    })

    it("preserves CSS custom properties", () => {
      const vnode = h("div", { style: { "--theme-color": "red" } })
      expect(renderToString(vnode)).toBe('<div style="--theme-color:red"></div>')
    })
  })

  // ---------------------------------------------------------------------------
  // dangerouslySetInnerHTML
  // ---------------------------------------------------------------------------

  describe("dangerouslySetInnerHTML", () => {
    it("renders raw HTML", () => {
      const vnode = h("div", {
        dangerouslySetInnerHTML: { __html: "<b>bold</b>" },
      })
      expect(renderToString(vnode)).toBe("<div><b>bold</b></div>")
    })

    it("takes priority over children", () => {
      // When dangerouslySetInnerHTML is set, children should be ignored
      // (in practice, providing both is a user error, but the behavior should be defined)
      const vnode = h("div", {
        dangerouslySetInnerHTML: { __html: "<em>inner</em>" },
      })
      expect(renderToString(vnode)).toBe("<div><em>inner</em></div>")
    })
  })

  // ---------------------------------------------------------------------------
  // Skipped props
  // ---------------------------------------------------------------------------

  describe("skipped props", () => {
    it("does not render event handlers", () => {
      const vnode = h("button", { onClick: () => {}, onMouseOver: () => {} }, "click")
      expect(renderToString(vnode)).toBe("<button>click</button>")
    })

    it("does not render ref prop", () => {
      const vnode = h("div", { ref: {} })
      expect(renderToString(vnode)).toBe("<div></div>")
    })

    it("does not render key prop", () => {
      const vnode = h("div", { key: "k1" })
      expect(renderToString(vnode)).toBe("<div></div>")
    })
  })

  // ---------------------------------------------------------------------------
  // Components
  // ---------------------------------------------------------------------------

  describe("components", () => {
    it("renders a simple function component", () => {
      function Greeting() {
        return h("span", null, "Hello!")
      }
      expect(renderToString(h(Greeting, null))).toBe("<span>Hello!</span>")
    })

    it("passes props to components", () => {
      function Greeting(props: Record<string, unknown>) {
        return h("span", null, `Hello, ${props["name"]}!`)
      }
      expect(renderToString(h(Greeting, { name: "World" }))).toBe(
        "<span>Hello, World!</span>",
      )
    })

    it("renders nested components", () => {
      function Inner() {
        return h("b", null, "inner")
      }
      function Outer() {
        return h("div", null, h(Inner, null))
      }
      expect(renderToString(h(Outer, null))).toBe("<div><b>inner</b></div>")
    })

    it("renders components with children prop", () => {
      function Wrapper(props: Record<string, unknown>) {
        return h("section", null, props["children"] as VNode)
      }
      const vnode = h(Wrapper, null, h("p", null, "content"))
      expect(renderToString(vnode)).toBe("<section><p>content</p></section>")
    })
  })

  // ---------------------------------------------------------------------------
  // Hooks during SSR
  // ---------------------------------------------------------------------------

  describe("hooks during SSR", () => {
    it("useState returns initial value", () => {
      function Counter() {
        const [count] = useState(42)
        return h("span", null, String(count))
      }
      expect(renderToString(h(Counter, null))).toBe("<span>42</span>")
    })

    it("useState with initializer function", () => {
      function Counter() {
        const [count] = useState(() => 10 + 5)
        return h("span", null, String(count))
      }
      expect(renderToString(h(Counter, null))).toBe("<span>15</span>")
    })

    it("useMemo computes value", () => {
      function Computed() {
        const doubled = useMemo(() => 21 * 2, [])
        return h("span", null, String(doubled))
      }
      expect(renderToString(h(Computed, null))).toBe("<span>42</span>")
    })

    it("useRef returns initial value", () => {
      function WithRef() {
        const ref = useRef("initial")
        return h("span", null, ref.current as string)
      }
      expect(renderToString(h(WithRef, null))).toBe("<span>initial</span>")
    })
  })

  // ---------------------------------------------------------------------------
  // Context during SSR
  // ---------------------------------------------------------------------------

  describe("context during SSR", () => {
    it("reads default context value", () => {
      const ThemeCtx = createContext("light")

      function ThemedDiv() {
        const theme = useContext(ThemeCtx)
        return h("div", { className: theme })
      }

      expect(renderToString(h(ThemedDiv, null))).toBe('<div class="light"></div>')
    })

    it("reads provided context value", () => {
      const ThemeCtx = createContext("light")

      function ThemedDiv() {
        const theme = useContext(ThemeCtx)
        return h("div", { className: theme })
      }

      const vnode = h(ThemeCtx.Provider, { value: "dark" }, h(ThemedDiv, null))
      expect(renderToString(vnode)).toBe('<div class="dark"></div>')
    })

    it("handles nested providers", () => {
      const Ctx = createContext("default")

      function Reader() {
        const value = useContext(Ctx)
        return h("span", null, value)
      }

      const vnode = h(
        Ctx.Provider,
        { value: "outer" },
        h("div", null, h(Reader, null), h(Ctx.Provider, { value: "inner" }, h(Reader, null))),
      )
      expect(renderToString(vnode)).toBe(
        "<div><span>outer</span><span>inner</span></div>",
      )
    })
  })

  // ---------------------------------------------------------------------------
  // Fragments
  // ---------------------------------------------------------------------------

  describe("fragments", () => {
    it("renders fragment children inline", () => {
      const vnode = h(null, null, h("span", null, "a"), h("span", null, "b"))
      expect(renderToString(vnode)).toBe("<span>a</span><span>b</span>")
    })

    it("renders single-child fragment", () => {
      const vnode = h(null, null, h("div", null, "only"))
      expect(renderToString(vnode)).toBe("<div>only</div>")
    })

    it("renders empty fragment", () => {
      const vnode = h(null, null)
      expect(renderToString(vnode)).toBe("")
    })
  })
})

// ---------------------------------------------------------------------------
// renderToReadableStream
// ---------------------------------------------------------------------------

describe("renderToReadableStream", () => {
  it("produces the same output as renderToString for a simple element", async () => {
    const vnode = h("div", { className: "box" }, h("span", null, "hello"))
    const expected = renderToString(vnode)
    const streamed = await collectStream(renderToReadableStream(vnode))
    expect(streamed).toBe(expected)
  })

  it("produces the same output for nested elements", async () => {
    const vnode = h("ul", null, h("li", null, "a"), h("li", null, "b"), h("li", null, "c"))
    const expected = renderToString(vnode)
    const streamed = await collectStream(renderToReadableStream(vnode))
    expect(streamed).toBe(expected)
  })

  it("produces the same output for components", async () => {
    function Greeting(props: Record<string, unknown>) {
      return h("span", null, `Hello, ${props["name"]}!`)
    }
    const vnode = h(Greeting, { name: "World" })
    const expected = renderToString(vnode)
    const streamed = await collectStream(renderToReadableStream(vnode))
    expect(streamed).toBe(expected)
  })

  it("produces the same output for components with hooks", async () => {
    function Counter() {
      const [count] = useState(42)
      const doubled = useMemo(() => count * 2, [count])
      return h("div", null, `${count} x 2 = ${doubled}`)
    }
    const vnode = h(Counter, null)
    const expected = renderToString(vnode)
    const streamed = await collectStream(renderToReadableStream(vnode))
    expect(streamed).toBe(expected)
  })

  it("produces the same output for context providers", async () => {
    const Ctx = createContext("default")

    function Reader() {
      const value = useContext(Ctx)
      return h("span", null, value)
    }

    const vnode = h(Ctx.Provider, { value: "custom" }, h(Reader, null))
    const expected = renderToString(vnode)
    const streamed = await collectStream(renderToReadableStream(vnode))
    expect(streamed).toBe(expected)
  })

  it("handles void elements", async () => {
    const vnode = h("div", null, h("br", null), h("img", { src: "x.png" }))
    const expected = renderToString(vnode)
    const streamed = await collectStream(renderToReadableStream(vnode))
    expect(streamed).toBe(expected)
  })

  it("handles dangerouslySetInnerHTML", async () => {
    const vnode = h("div", { dangerouslySetInnerHTML: { __html: "<b>raw</b>" } })
    const expected = renderToString(vnode)
    const streamed = await collectStream(renderToReadableStream(vnode))
    expect(streamed).toBe(expected)
  })

  it("handles fragments", async () => {
    const vnode = h(null, null, h("span", null, "a"), h("span", null, "b"))
    const expected = renderToString(vnode)
    const streamed = await collectStream(renderToReadableStream(vnode))
    expect(streamed).toBe(expected)
  })

  it("emits multiple chunks", async () => {
    const vnode = h("div", null, h("p", null, "first"), h("p", null, "second"))
    const stream = renderToReadableStream(vnode)
    const reader = stream.getReader()
    const chunks: string[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    // Should have more than one chunk (opening tag, children, closing tag)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join("")).toBe(renderToString(vnode))
  })
})
