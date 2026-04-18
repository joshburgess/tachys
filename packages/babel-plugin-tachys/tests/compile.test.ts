import { transformSync } from "@babel/core"
import { describe, expect, it } from "vitest"

import plugin from "../src/index"

function transform(code: string): string {
  const out = transformSync(code, {
    babelrc: false,
    configFile: false,
    plugins: [plugin],
    filename: "input.jsx",
  })
  if (out === null || out.code === null || out.code === undefined) {
    throw new Error("babel produced no output")
  }
  return out.code
}

describe("babel-plugin-tachys (v0.1 static JSX)", () => {
  it("compiles a static element into _template + markCompiled", () => {
    const input = `
      function Greeting() {
        return <span class="greeting">hello</span>;
      }
    `
    const out = transform(input)

    expect(out).toMatch(/import \{[^}]*markCompiled[^}]*\} from "tachys"/)
    expect(out).toMatch(/import \{[^}]*_template[^}]*\} from "tachys"/)
    expect(out).toContain(
      '_template("<span class=\\"greeting\\">hello</span>")',
    )
    expect(out).toContain("markCompiled(")
    expect(out).toContain("cloneNode(true)")
    // No lingering h(...) or jsx(...) call — JSX was compiled away
    expect(out).not.toMatch(/\b(?:h|jsx|jsxs)\s*\(/)
  })

  it("rewrites className to class in the emitted HTML", () => {
    const input = `
      function Button() {
        return <button className="btn-primary">ok</button>;
      }
    `
    const out = transform(input)
    expect(out).toContain(
      '_template("<button class=\\"btn-primary\\">ok</button>")',
    )
  })

  it("handles nested static elements", () => {
    const input = `
      function Card() {
        return (
          <div class="card">
            <h2>title</h2>
            <p>body</p>
          </div>
        );
      }
    `
    const out = transform(input)
    expect(out).toMatch(
      /_template\("<div class=\\"card\\"><h2>title<\/h2> ?<p>body<\/p><\/div>"\)/,
    )
  })

  it("handles void elements without children", () => {
    const input = `
      function Rule() {
        return <hr class="sep" />;
      }
    `
    const out = transform(input)
    expect(out).toContain('_template("<hr class=\\"sep\\">")')
  })

  it("escapes special characters in attributes and text", () => {
    const input = `
      function Q() {
        return <p title="a&b">&lt;ok&gt;</p>;
      }
    `
    const out = transform(input)
    expect(out).toContain('title=\\"a&amp;b\\"')
  })

  it("bails on dynamic attributes", () => {
    const input = `
      function Dyn() {
        return <span class={cls}>hi</span>;
      }
    `
    const out = transform(input)
    expect(out).not.toContain("markCompiled")
  })

  it("bails on non-PascalCase functions", () => {
    const input = `
      function helper() {
        return <span>hi</span>;
      }
    `
    const out = transform(input)
    expect(out).not.toContain("markCompiled")
  })

  it("bails on capitalized child tags (nested components)", () => {
    const input = `
      function Outer() {
        return <div><Inner /></div>;
      }
    `
    const out = transform(input)
    expect(out).not.toContain("markCompiled")
  })

  it("compiles multiple components in one file with unique template ids", () => {
    const input = `
      function A() { return <span>a</span>; }
      function B() { return <span>b</span>; }
    `
    const out = transform(input)
    expect(out).toContain("_tpl$A_0")
    expect(out).toContain("_tpl$B_1")
    expect(out).toContain('_template("<span>a</span>")')
    expect(out).toContain('_template("<span>b</span>")')
  })

  it("reuses an existing tachys import if present", () => {
    const input = `
      import { h } from "tachys";
      function A() { return <span>a</span>; }
    `
    const out = transform(input)
    const importMatches = out.match(/from "tachys"/g) ?? []
    expect(importMatches.length).toBe(1)
    expect(out).toContain("_template")
    expect(out).toContain("markCompiled")
  })
})

describe("babel-plugin-tachys (v0.1 text slots)", () => {
  it("compiles a props identifier component with a text slot", () => {
    const input = `
      function Hello(props) {
        return <span>{props.name}</span>;
      }
    `
    const out = transform(input)
    expect(out).toContain("markCompiled")
    // Template contains comment marker
    expect(out).toContain('_template("<span><!></span>")')
    // Mount creates a text node, replaces the marker
    expect(out).toContain("document.createTextNode")
    expect(out).toContain("replaceChild")
    // Patch compares and writes .data
    expect(out).toContain("state.name !== props.name")
    expect(out).toContain(".data =")
  })

  it("compiles a destructured-props component", () => {
    const input = `
      function Row({ label }) {
        return <span>{label}</span>;
      }
    `
    const out = transform(input)
    expect(out).toContain("markCompiled")
    expect(out).toContain('_template("<span><!></span>")')
    // Destructured names are rewritten as props.x
    expect(out).toContain("props.label")
    expect(out).toContain("state.label !== props.label")
  })

  it("compiles multiple text slots within the same element", () => {
    const input = `
      function Pair({ a, b }) {
        return <div>{a}{b}</div>;
      }
    `
    const out = transform(input)
    expect(out).toContain('_template("<div><!><!></div>")')
    expect(out).toContain("state.a !== props.a")
    expect(out).toContain("state.b !== props.b")
  })

  it("compiles text slots mixed with static text", () => {
    const input = `
      function G({ name }) {
        return <span>hello {name}</span>;
      }
    `
    const out = transform(input)
    expect(out).toContain('_template("<span>hello <!></span>")')
  })

  it("navigates to a slot nested inside a child element", () => {
    const input = `
      function Nested({ x }) {
        return <div><p>{x}</p></div>;
      }
    `
    const out = transform(input)
    expect(out).toContain('_template("<div><p><!></p></div>")')
    // _root.firstChild reaches <p>, .firstChild reaches the comment
    expect(out).toMatch(/_root\.firstChild\.firstChild/)
  })

  it("does not rebind the same prop twice in state", () => {
    const input = `
      function Dupe({ x }) {
        return <div><span>{x}</span><span>{x}</span></div>;
      }
    `
    const out = transform(input)
    const assigns = out.match(/state\.x\s*=\s*props\.x/g) ?? []
    // Only one write on change -- subsequent slot just updates its own .data
    expect(assigns.length).toBe(1)
  })

  it("bails on expression-container children that are not props references", () => {
    const input = `
      function Bad() {
        return <span>{someGlobal}</span>;
      }
    `
    const out = transform(input)
    expect(out).not.toContain("markCompiled")
  })

  it("bails on rename destructuring", () => {
    const input = `
      function Bad({ x: y }) {
        return <span>{y}</span>;
      }
    `
    const out = transform(input)
    expect(out).not.toContain("markCompiled")
  })
})

describe("babel-plugin-tachys (runtime smoke)", () => {
  it("the emitted mount/patch functions run in jsdom and produce the right DOM", async () => {
    // Set up a minimal document surface; the plugin output calls
    // document.createTextNode and cloneNode().
    const { JSDOM } = await import("jsdom")
    const dom = new JSDOM("<!doctype html><html><body></body></html>")
    const doc = dom.window.document

    const input = `
      function Hello({ name }) {
        return <span class="g">hello {name}</span>;
      }
    `
    const out = transform(input)

    // Replace the tachys imports with stubs so we can eval the output.
    const stubbed = out.replace(
      /import \{[^}]*\} from "tachys";?/g,
      "",
    )

    const markCompiledCalls: unknown[] = []
    const fn = new Function(
      "document",
      "markCompiled",
      "_template",
      `${stubbed}; return Hello;`,
    )

    const markCompiled = (
      mount: (p: Record<string, unknown>) => { dom: Element; state: Record<string, unknown> },
      patch: (s: Record<string, unknown>, p: Record<string, unknown>) => void,
    ): unknown => {
      markCompiledCalls.push(mount)
      return { mount, patch }
    }
    const _template = (html: string): Element => {
      const t = doc.createElement("template")
      t.innerHTML = html
      return t.content.firstElementChild as Element
    }

    const Hello = fn(doc, markCompiled, _template) as {
      mount: (p: Record<string, unknown>) => { dom: Element; state: Record<string, unknown> }
      patch: (s: Record<string, unknown>, p: Record<string, unknown>) => void
    }

    const inst = Hello.mount({ name: "world" })
    expect((inst.dom as Element).outerHTML).toBe(
      '<span class="g">hello world</span>',
    )

    Hello.patch(inst.state, { name: "there" })
    expect((inst.dom as Element).outerHTML).toBe(
      '<span class="g">hello there</span>',
    )

    // Same-value patch: should not touch the DOM
    const spy = (inst.state["_t0"] as Text)
    const before = spy.data
    Hello.patch(inst.state, { name: "there" })
    expect(spy.data).toBe(before)
  })
})
