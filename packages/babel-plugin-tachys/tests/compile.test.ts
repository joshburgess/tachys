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

describe("babel-plugin-tachys (v0.0.1 static JSX)", () => {
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

  it("bails on components with props", () => {
    const input = `
      function Hello(props) {
        return <span>hello</span>;
      }
    `
    const out = transform(input)
    expect(out).not.toContain("markCompiled")
    expect(out).not.toContain("_template")
  })

  it("bails on dynamic text", () => {
    const input = `
      function Dyn() {
        return <span>{value}</span>;
      }
    `
    const out = transform(input)
    expect(out).not.toContain("markCompiled")
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
