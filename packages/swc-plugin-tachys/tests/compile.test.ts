import { describe, expect, it } from "vitest"

import { transform as swcTransform } from "../src/index"

async function transform(code: string, filename = "input.jsx"): Promise<string> {
  const out = await swcTransform(code, { filename })
  return out.code
}

describe("swc-plugin-tachys (static JSX)", () => {
  it("compiles a static element into _template + markCompiled", async () => {
    const input = `
      function Greeting() {
        return <span class="greeting">hello</span>;
      }
    `
    const out = await transform(input)

    expect(out).toMatch(/import \{[^}]*markCompiled[^}]*\} from "tachys"/)
    expect(out).toMatch(/import \{[^}]*_template[^}]*\} from "tachys"/)
    expect(out).toContain(
      '_template("<span class=\\"greeting\\">hello</span>")',
    )
    expect(out).toContain("markCompiled(")
    expect(out).toContain("cloneNode(true)")
    expect(out).not.toMatch(/\b(?:h|jsx|jsxs)\s*\(/)
  })

  it("rewrites className to class in the emitted HTML", async () => {
    const input = `
      function Button() {
        return <button className="btn-primary">ok</button>;
      }
    `
    const out = await transform(input)
    expect(out).toContain(
      '_template("<button class=\\"btn-primary\\">ok</button>")',
    )
  })

  it("handles nested static elements", async () => {
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
    const out = await transform(input)
    expect(out).toContain("markCompiled")
    expect(out).toMatch(/_template\("<div class=\\"card\\">/)
    expect(out).toContain("<h2>title</h2>")
    expect(out).toContain("<p>body</p>")
  })

  it("handles void elements without children", async () => {
    const input = `
      function Rule() {
        return <hr class="sep" />;
      }
    `
    const out = await transform(input)
    expect(out).toContain('_template("<hr class=\\"sep\\">")')
  })

  it("escapes special characters in attributes and text", async () => {
    const input = `
      function Q() {
        return <p title="a&b">&lt;ok&gt;</p>;
      }
    `
    const out = await transform(input)
    expect(out).toContain('title=\\"a&amp;b\\"')
  })

  it("bails on non-PascalCase functions", async () => {
    const input = `
      function helper() {
        return <span>hi</span>;
      }
    `
    const out = await transform(input)
    expect(out).not.toContain("markCompiled")
  })

  it("compiles multiple components in one file with unique template ids", async () => {
    const input = `
      function A() { return <span>a</span>; }
      function B() { return <span>b</span>; }
    `
    const out = await transform(input)
    expect(out).toContain("_tpl$A_0")
    expect(out).toContain("_tpl$B_1")
    expect(out).toContain('_template("<span>a</span>")')
    expect(out).toContain('_template("<span>b</span>")')
  })

  it("handles exported function declarations", async () => {
    const input = `
      export function Greeting() {
        return <span>hi</span>;
      }
    `
    const out = await transform(input)
    expect(out).toContain("markCompiled")
    expect(out).toContain('_template("<span>hi</span>")')
  })
})

describe("swc-plugin-tachys (text slots)", () => {
  it("compiles a props identifier component with a text slot", async () => {
    const input = `
      function Hello(props) {
        return <span>{props.name}</span>;
      }
    `
    const out = await transform(input)
    expect(out).toContain("markCompiled")
    expect(out).toContain('_template("<span> </span>")')
    expect(out).not.toContain("document.createTextNode")
    expect(out).toContain("state.name !== props.name")
    expect(out).toContain(".data =")
  })

  it("compiles a destructured-props component", async () => {
    const input = `
      function Row({ label }) {
        return <span>{label}</span>;
      }
    `
    const out = await transform(input)
    expect(out).toContain("markCompiled")
    expect(out).toContain('_template("<span> </span>")')
    expect(out).toContain("props.label")
    expect(out).toContain("state.label !== props.label")
  })

  it("compiles multiple text slots within the same element", async () => {
    const input = `
      function Pair({ a, b }) {
        return <div>{a}{b}</div>;
      }
    `
    const out = await transform(input)
    expect(out).toContain('_template("<div><!><!></div>")')
    expect(out).toContain("state.a !== props.a")
    expect(out).toContain("state.b !== props.b")
  })

  it("compiles text slots mixed with static text", async () => {
    const input = `
      function G({ name }) {
        return <span>hello {name}</span>;
      }
    `
    const out = await transform(input)
    expect(out).toContain('_template("<span>hello <!></span>")')
  })

  it("bails on expression-container children that are not props references", async () => {
    const input = `
      function Bad() {
        return <span>{someGlobal}</span>;
      }
    `
    const out = await transform(input)
    expect(out).not.toContain("markCompiled")
  })

  it("bails on rename destructuring", async () => {
    const input = `
      function Bad({ x: y }) {
        return <span>{y}</span>;
      }
    `
    const out = await transform(input)
    expect(out).not.toContain("markCompiled")
  })
})

describe("swc-plugin-tachys (attr and event slots)", () => {
  it("compiles a dynamic className attribute", async () => {
    const input = `
      function Btn({ cls }) {
        return <button className={cls}>ok</button>;
      }
    `
    const out = await transform(input)
    expect(out).toContain("markCompiled")
    expect(out).toContain("className")
  })

  it("compiles an onClick event handler", async () => {
    const input = `
      function Btn({ handler }) {
        return <button onClick={handler}>ok</button>;
      }
    `
    const out = await transform(input)
    expect(out).toContain("markCompiled")
    expect(out).toContain("onclick")
    expect(out).toContain("props.handler")
  })

  it("compiles a dynamic setAttribute attribute", async () => {
    const input = `
      function Img({ url }) {
        return <img src={url} />;
      }
    `
    const out = await transform(input)
    expect(out).toContain("markCompiled")
    expect(out).toContain("setAttribute")
    expect(out).toContain("props.url")
  })
})

describe("swc-plugin-tachys (ternary attrs)", () => {
  it("compiles a className ternary of string literals", async () => {
    const input = `
      function Row({ selected }) {
        return <tr className={selected ? "danger" : ""}></tr>;
      }
    `
    const out = await transform(input)
    expect(out).toContain("markCompiled")
    expect(out).toContain('_template("<tr></tr>")')
    expect(out).toContain("state.selected !== props.selected")
    expect(out).toContain("className")
    expect(out).toContain('"danger"')
  })

  it("compiles a setAttribute ternary of string literals", async () => {
    const input = `
      function Img({ hot }) {
        return <img src={hot ? "a.png" : "b.png"} />;
      }
    `
    const out = await transform(input)
    expect(out).toContain("markCompiled")
    expect(out).toContain("setAttribute")
  })
})

describe("swc-plugin-tachys (keyed lists)", () => {
  it("compiles arr.map(item => <Row />) with key", async () => {
    const input = `
      function List({ rows }) {
        return <tbody>{rows.map(d => <Row key={d.id} id={d.id} label={d.label} />)}</tbody>;
      }
    `
    const out = await transform(input)
    expect(out).toContain("markCompiled")
    expect(out).toContain('_template("<tbody><!></tbody>")')
    expect(out).toContain("_mountList")
    expect(out).toContain("_patchList")
    expect(out).toContain("props.rows")
  })

  it("compiles list with props.* array source", async () => {
    const input = `
      function List(props) {
        return <tbody>{props.rows.map(d => <Row key={d.id} label={d.label} />)}</tbody>;
      }
    `
    const out = await transform(input)
    expect(out).toContain("markCompiled")
    expect(out).toContain("_mountList")
  })

  it("compiles list with parent-prop dep inside item expression", async () => {
    const input = `
      function List({ rows, selected }) {
        return <tbody>{rows.map(d => <Row key={d.id} className={selected === d.id ? "danger" : ""} />)}</tbody>;
      }
    `
    const out = await transform(input)
    expect(out).toContain("markCompiled")
    expect(out).toContain("_mountList")
    expect(out).toContain("props.selected")
  })

  it("bails on .map without key", async () => {
    const input = `
      function List({ rows }) {
        return <tbody>{rows.map(d => <Row label={d.label} />)}</tbody>;
      }
    `
    const out = await transform(input)
    expect(out).not.toContain("markCompiled")
  })

  it("bails on .map of non-prop array", async () => {
    const input = `
      function List() {
        return <tbody>{globalArr.map(d => <Row key={d.id} />)}</tbody>;
      }
    `
    const out = await transform(input)
    expect(out).not.toContain("markCompiled")
  })

  it("bails on .map whose callback returns a host element", async () => {
    const input = `
      function List({ rows }) {
        return <tbody>{rows.map(d => <tr key={d.id}>{d.label}</tr>)}</tbody>;
      }
    `
    const out = await transform(input)
    expect(out).not.toContain("markCompiled")
  })
})

describe("swc-plugin-tachys (component slots)", () => {
  it("compiles a child component with prop reference", async () => {
    const input = `
      function Outer({ name }) {
        return <div><Inner label={name} /></div>;
      }
    `
    const out = await transform(input)
    expect(out).toContain("markCompiled")
    expect(out).toContain('_template("<div><!></div>")')
    expect(out).toMatch(/Inner\(\{/)
  })

  it("compiles a bare child component", async () => {
    const input = `
      function Outer() {
        return <div><Inner /></div>;
      }
    `
    const out = await transform(input)
    expect(out).toContain("markCompiled")
    expect(out).toContain('_template("<div><!></div>")')
    expect(out).toMatch(/Inner\(\{\}\)/)
  })
})
