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

  it("bails on dynamic attributes whose value isn't a prop reference", () => {
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

  it("compiles a capitalized child tag as a nested compiled component", () => {
    const input = `
      function Outer() {
        return <div><Inner /></div>;
      }
    `
    const out = transform(input)
    expect(out).toContain("markCompiled")
    // Template carries a marker at the nested component's position.
    expect(out).toContain('_template("<div><!></div>")')
    // Mount calls Inner and replaces the marker with its dom.
    expect(out).toMatch(/_cs\d+ = Inner\(\{\}\)/)
    expect(out).toMatch(/replaceChild\(_cs\d+\.dom,/)
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
    // Sole expression child uses pre-allocated text node: template emits a
    // space placeholder and mount writes .data directly.
    expect(out).toContain('_template("<span> </span>")')
    expect(out).not.toContain("document.createTextNode")
    expect(out).not.toContain("replaceChild")
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
    // Prealloc placeholder because the slot is the sole child.
    expect(out).toContain('_template("<span> </span>")')
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
    // Slot is sole child of <p>, so prealloc space placeholder applies here.
    expect(out).toContain('_template("<div><p> </p></div>")')
    // _root.firstChild reaches <p>, .firstChild reaches the text placeholder.
    expect(out).toMatch(/_root\.firstChild\.firstChild/)
    expect(out).toMatch(/_t\d+\.data\s*=\s*String\(props\.x\)/)
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

describe("babel-plugin-tachys (v0.2 attribute slots)", () => {
  it("compiles a dynamic className into element.className assignment", () => {
    const input = `
      function Row({ className }) {
        return <tr className={className}><td>x</td></tr>;
      }
    `
    const out = transform(input)
    // className is stripped from the template HTML
    expect(out).toContain('_template("<tr><td>x</td></tr>")')
    // Fast-path assignment, not setAttribute
    expect(out).toContain("_root.className =")
    expect(out).toContain("String(props.className)")
    // Patch guard compares state.className and assigns state._root.className
    expect(out).toContain("state.className !== props.className")
    expect(out).toContain("state._root.className")
  })

  it("compiles a dynamic id into setAttribute on a nested element", () => {
    const input = `
      function Card({ rowId }) {
        return <div><span id={rowId}>x</span></div>;
      }
    `
    const out = transform(input)
    expect(out).toContain('_template("<div><span>x</span></div>")')
    // Element ref navigates into nested element
    expect(out).toMatch(/_e0\s*=\s*_root\.firstChild/)
    expect(out).toContain('_e0.setAttribute("id", String(props.rowId))')
    expect(out).toContain("state._e0.setAttribute")
  })

  it("groups multiple attrs on the same element under one ref", () => {
    const input = `
      function Row({ cls, rowId }) {
        return <tr className={cls} id={rowId}><td>x</td></tr>;
      }
    `
    const out = transform(input)
    // Root attrs share _root (no new _eN variable)
    expect(out).not.toMatch(/_e\d+\s*=\s*_root(?!\.)/)
    expect(out).toContain("_root.className = String(props.cls)")
    expect(out).toContain('_root.setAttribute("id", String(props.rowId))')
  })

  it("emits one guard per prop in patch even with multiple slots per prop", () => {
    const input = `
      function M({ name }) {
        return <div id={name}>{name}</div>;
      }
    `
    const out = transform(input)
    // Should be exactly one guard for `name`
    const guards = out.match(/state\.name\s*!==\s*props\.name/g) ?? []
    expect(guards.length).toBe(1)
    // Both writes appear inside it: a setAttribute for id and a .data write
    expect(out).toContain('setAttribute("id"')
    expect(out).toMatch(/_t\d+\.data\s*=/)
  })

  it("bails on style as attribute (not supported yet)", () => {
    const input = `
      function Styled({ style }) {
        return <div style={style}>x</div>;
      }
    `
    const out = transform(input)
    // We DO support unknown attrs via setAttribute, so style compiles -
    // but it writes "style" as a string attribute which is valid HTML.
    // Keep this as a sanity check that the compile succeeds.
    expect(out).toContain("markCompiled")
    expect(out).toContain('setAttribute("style"')
  })
})

describe("babel-plugin-tachys (v0.4b ternary attrs)", () => {
  it("compiles a ternary className into an inline conditional", () => {
    const input = `
      function Row({ selected }) {
        return <tr className={selected ? "danger" : ""}><td>x</td></tr>;
      }
    `
    const out = transform(input)
    expect(out).toContain("markCompiled")
    // Template has no className baked in.
    expect(out).toContain('_template("<tr><td>x</td></tr>")')
    // Mount: inline ternary, no String() wrap.
    expect(out).toContain('_root.className = props.selected ? "danger" : ""')
    // Patch: same ternary inside the grouped selected guard.
    expect(out).toContain("state.selected !== props.selected")
    expect(out).toContain(
      'state._root.className = props.selected ? "danger" : ""',
    )
  })

  it("compiles a ternary className with a destructured prop", () => {
    const input = `
      function Row({ selected }) {
        return <tr className={selected ? "sel" : "norm"}><td>x</td></tr>;
      }
    `
    const out = transform(input)
    expect(out).toContain('props.selected ? "sel" : "norm"')
    expect(out).not.toContain("String(props.selected)")
  })

  it("compiles a ternary into setAttribute for non-className attrs", () => {
    const input = `
      function Row({ active }) {
        return <div aria-pressed={active ? "true" : "false"}>x</div>;
      }
    `
    const out = transform(input)
    expect(out).toMatch(
      /setAttribute\("aria-pressed",\s*props\.active \? "true" : "false"\)/,
    )
  })

  it("bails when a ternary branch is not a string literal", () => {
    const input = `
      function Row({ selected, dynVal }) {
        return <tr className={selected ? dynVal : "off"}><td>x</td></tr>;
      }
    `
    const out = transform(input)
    expect(out).not.toContain("markCompiled")
  })

  it("bails when the ternary test is not a prop reference", () => {
    const input = `
      function Row() {
        return <tr className={SOME_GLOBAL ? "a" : "b"}><td>x</td></tr>;
      }
    `
    const out = transform(input)
    expect(out).not.toContain("markCompiled")
  })
})

describe("babel-plugin-tachys (v0.4c memo compare)", () => {
  it("emits a compare that checks every dynamic prop", () => {
    const input = `
      function Row({ id, label, selected, onSelect }) {
        return (
          <tr className={selected ? "danger" : ""}>
            <td>{id}</td>
            <td><a onClick={onSelect}>{label}</a></td>
          </tr>
        );
      }
    `
    const out = transform(input)
    // The compare is the third arg to markCompiled.
    expect(out).toMatch(/markCompiled\([\s\S]*?,[\s\S]*?,\s*\(prev, next\)/)
    expect(out).toContain("prev.selected === next.selected")
    expect(out).toContain("prev.id === next.id")
    expect(out).toContain("prev.onSelect === next.onSelect")
    expect(out).toContain("prev.label === next.label")
    // Must be combined with && (otherwise any single match would skip
    // patch when other props changed).
    expect(out).toMatch(/&&/)
  })

  it("emits no compare for fully static components", () => {
    const input = `
      function Static() {
        return <div className="x"><span>hi</span></div>;
      }
    `
    const out = transform(input)
    // Only two args to markCompiled: mount + patch.
    expect(out).not.toContain("(prev, next)")
    expect(out).not.toContain("prev.")
  })

  it("dedups repeated prop references", () => {
    const input = `
      function M({ name }) {
        return <div id={name}>{name}</div>;
      }
    `
    const out = transform(input)
    const matches = out.match(/prev\.name\s*===\s*next\.name/g) ?? []
    expect(matches.length).toBe(1)
  })
})

describe("babel-plugin-tachys (v0.3 event handlers)", () => {
  it("compiles onClick into direct .onclick assignment", () => {
    const input = `
      function Btn({ onSelect }) {
        return <button onClick={onSelect}>go</button>;
      }
    `
    const out = transform(input)
    // Event attr is stripped from the template
    expect(out).toContain('_template("<button>go</button>")')
    // Mount installs a state-closure wrapper so patch never rebinds the
    // DOM listener. The wrapper reads state.onSelect at dispatch time.
    expect(out).toMatch(/_root\.onclick\s*=\s*function\s*\(ev\)/)
    expect(out).toContain("state.onSelect.call(this, ev)")
    // Patch updates state only.
    expect(out).toContain("state.onSelect !== props.onSelect")
    expect(out).toContain("state.onSelect = props.onSelect")
    expect(out).not.toContain("state._root.onclick")
  })

  it("compiles onInput on a nested element", () => {
    const input = `
      function F({ onType }) {
        return <div><input onInput={onType} /></div>;
      }
    `
    const out = transform(input)
    expect(out).toContain('_template("<div><input></div>")')
    expect(out).toMatch(/_e0\s*=\s*_root\.firstChild/)
    // State-closure wrapper on the nested element.
    expect(out).toMatch(/_e0\.oninput\s*=\s*function\s*\(ev\)/)
    expect(out).toContain("state.onType.call(this, ev)")
  })

  it("mixes event + text + attr slots on the same element", () => {
    const input = `
      function Row({ cls, onSelect, label }) {
        return <tr className={cls} onClick={onSelect}><td>{label}</td></tr>;
      }
    `
    const out = transform(input)
    expect(out).toContain("_root.className = String(props.cls)")
    // Handler is state-closure-wrapped; no direct props.onSelect assignment.
    expect(out).toMatch(/_root\.onclick\s*=\s*function\s*\(ev\)/)
    expect(out).toContain("state.onSelect.call(this, ev)")
    // `{label}` is the sole child of <td>, so it uses a prealloc text node:
    // navigate to it and write .data directly, no createTextNode.
    expect(out).toMatch(/_t\d+\s*=\s*_root\.firstChild\.firstChild/)
    expect(out).toMatch(/_t\d+\.data\s*=\s*String\(props\.label\)/)
    expect(out).not.toContain("document.createTextNode")
  })
})

describe("babel-plugin-tachys (runtime smoke)", () => {
  it("attr slots update the DOM in jsdom", async () => {
    const { JSDOM } = await import("jsdom")
    const dom = new JSDOM("<!doctype html><html><body></body></html>")
    const doc = dom.window.document

    const input = `
      function Row({ cls, label }) {
        return <tr className={cls}><td>{label}</td></tr>;
      }
    `
    const out = transform(input)
    const stubbed = out.replace(/import \{[^}]*\} from "tachys";?/g, "")

    const markCompiled = (
      mount: (p: Record<string, unknown>) => { dom: Element; state: Record<string, unknown> },
      patch: (s: Record<string, unknown>, p: Record<string, unknown>) => void,
    ): unknown => ({ mount, patch })
    const _template = (html: string): Element => {
      const tpl = doc.createElement("template")
      tpl.innerHTML = html
      return tpl.content.firstElementChild as Element
    }
    const fn = new Function(
      "document",
      "markCompiled",
      "_template",
      `${stubbed}; return Row;`,
    )
    const Row = fn(doc, markCompiled, _template) as {
      mount: (p: Record<string, unknown>) => { dom: Element; state: Record<string, unknown> }
      patch: (s: Record<string, unknown>, p: Record<string, unknown>) => void
    }

    const inst = Row.mount({ cls: "danger", label: "row-1" })
    expect((inst.dom as Element).outerHTML).toBe(
      '<tr class="danger"><td>row-1</td></tr>',
    )

    Row.patch(inst.state, { cls: "success", label: "row-1" })
    expect((inst.dom as Element).outerHTML).toBe(
      '<tr class="success"><td>row-1</td></tr>',
    )

    Row.patch(inst.state, { cls: "success", label: "row-2" })
    expect((inst.dom as Element).outerHTML).toBe(
      '<tr class="success"><td>row-2</td></tr>',
    )
  })

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

  it("end-to-end Krausest-style Row (className + events + text slots)", async () => {
    const { JSDOM } = await import("jsdom")
    const dom = new JSDOM("<!doctype html><html><body></body></html>")
    const doc = dom.window.document

    // This is close to what js-framework-benchmark Row components look like
    // across frameworks: dynamic class, two click handlers, and a label slot.
    const input = `
      function Row({ selected, onSelect, onRemove, label }) {
        return (
          <tr className={selected}>
            <td>x</td>
            <td><a onClick={onSelect}>{label}</a></td>
            <td><a onClick={onRemove}>remove</a></td>
          </tr>
        );
      }
    `
    const out = transform(input)
    const stubbed = out.replace(/import \{[^}]*\} from "tachys";?/g, "")

    const markCompiled = (
      mount: (p: Record<string, unknown>) => { dom: Element; state: Record<string, unknown> },
      patch: (s: Record<string, unknown>, p: Record<string, unknown>) => void,
    ): unknown => ({ mount, patch })
    const _template = (html: string): Element => {
      const t = doc.createElement("template")
      t.innerHTML = `<table><tbody>${html}</tbody></table>`
      return t.content.firstElementChild!.firstElementChild!.firstElementChild as Element
    }
    const fn = new Function(
      "document",
      "markCompiled",
      "_template",
      `${stubbed}; return Row;`,
    )
    const Row = fn(doc, markCompiled, _template) as {
      mount: (p: Record<string, unknown>) => { dom: Element; state: Record<string, unknown> }
      patch: (s: Record<string, unknown>, p: Record<string, unknown>) => void
    }

    let selectFired = 0
    let removeFired = 0
    const inst = Row.mount({
      selected: "",
      onSelect: () => selectFired++,
      onRemove: () => removeFired++,
      label: "foo",
    })
    expect((inst.dom as Element).outerHTML).toBe(
      '<tr class=""><td>x</td><td><a>foo</a></td><td><a>remove</a></td></tr>'
    )

    // First anchor = select; click it.
    const selectA = (inst.dom as Element).querySelectorAll("a")[0]!
    ;(selectA as HTMLAnchorElement).click()
    expect(selectFired).toBe(1)

    // Second anchor = remove.
    const removeA = (inst.dom as Element).querySelectorAll("a")[1]!
    ;(removeA as HTMLAnchorElement).click()
    expect(removeFired).toBe(1)

    // Patch label + selection class.
    Row.patch(inst.state, {
      selected: "danger",
      onSelect: () => selectFired++,
      onRemove: () => removeFired++,
      label: "bar",
    })
    expect((inst.dom as Element).outerHTML).toBe(
      '<tr class="danger"><td>x</td><td><a>bar</a></td><td><a>remove</a></td></tr>'
    )

    // The new handler reference should be bound too
    ;(selectA as HTMLAnchorElement).click()
    expect(selectFired).toBe(2)
  })
})

describe("babel-plugin-tachys (v0.5 template literal slots)", () => {
  it("compiles a template literal className with one prop", () => {
    const input = `
      function Row({ variant }) {
        return <div className={\`row-\${variant}\`} />;
      }
    `
    const out = transform(input)
    expect(out).toContain('_template("<div></div>")')
    // Mount emits the template literal directly -- no String() wrap.
    expect(out).toMatch(/_root\.className\s*=\s*`row-\$\{props\.variant\}`/)
    expect(out).not.toMatch(/String\(props\.variant\)/)
    // Patch still guards by the single prop.
    expect(out).toContain("state.variant !== props.variant")
    expect(out).toContain("state.variant = props.variant")
  })

  it("compiles a template literal referencing multiple props", () => {
    const input = `
      function Row({ first, last }) {
        return <div className={\`\${first}-\${last}\`} />;
      }
    `
    const out = transform(input)
    // Patch uses the dirty-locals composite path:
    expect(out).toContain("const _d0 = state.first !== props.first")
    expect(out).toContain("const _d1 = state.last !== props.last")
    // One write guarded by OR of both dirty flags.
    expect(out).toMatch(/if \(_d0 \|\| _d1\) \{/)
    // State syncs are conditional and separate.
    expect(out).toContain("if (_d0) {")
    expect(out).toContain("state.first = props.first")
    expect(out).toContain("state.last = props.last")
  })

  it("compiles a template literal as a text child", () => {
    const input = `
      function Greet({ first, last }) {
        return <span>{\`hello \${first} \${last}!\`}</span>;
      }
    `
    const out = transform(input)
    expect(out).toContain('_template("<span> </span>")')
    // Mount writes .data with the template literal directly.
    expect(out).toMatch(/\.data\s*=\s*`hello \$\{props\.first\} \$\{props\.last\}!`/)
  })

  it("supports mixing simple and composite slots on the same component", () => {
    const input = `
      function Row({ cls, name }) {
        return <div className={\`row-\${cls}\`}><span>{name}</span></div>;
      }
    `
    const out = transform(input)
    // Composite path kicks in (any composite forces whole patch to it).
    expect(out).toContain("const _d0 = state.cls !== props.cls")
    expect(out).toContain("const _d1 = state.name !== props.name")
    // The simple text slot gets its own guarded write.
    expect(out).toMatch(/if \(_d1\) \{[\s\S]*?\.data\s*=\s*String\(props\.name\)/)
    // The composite attr slot gets its single-dep guard.
    expect(out).toMatch(/if \(_d0\) \{[\s\S]*?\.className\s*=\s*`row-\$\{props\.cls\}`/)
  })

  it("memo compare includes all props used by composite slots", () => {
    const input = `
      function Row({ a, b }) {
        return <div className={\`\${a}-\${b}\`} />;
      }
    `
    const out = transform(input)
    expect(out).toContain("prev.a === next.a")
    expect(out).toContain("prev.b === next.b")
    expect(out).toMatch(/&&/)
  })

  it("runs composite slots end-to-end in jsdom", async () => {
    const { JSDOM } = await import("jsdom")
    const dom = new JSDOM("<!doctype html><html><body></body></html>")
    const doc = dom.window.document

    const input = `
      function Row({ cls, first, last }) {
        return <div className={\`row-\${cls}\`}><span>{\`\${first} \${last}\`}</span></div>;
      }
    `
    const out = transform(input)
    const stubbed = out.replace(/import \{[^}]*\} from "tachys";?/g, "")

    const markCompiled = (
      mount: (p: Record<string, unknown>) => { dom: Element; state: Record<string, unknown> },
      patch: (s: Record<string, unknown>, p: Record<string, unknown>) => void,
    ): unknown => ({ mount, patch })
    const _template = (html: string): Element => {
      const tpl = doc.createElement("template")
      tpl.innerHTML = html
      return tpl.content.firstElementChild as Element
    }
    const fn = new Function(
      "document",
      "markCompiled",
      "_template",
      `${stubbed}; return Row;`,
    )
    const Row = fn(doc, markCompiled, _template) as {
      mount: (p: Record<string, unknown>) => { dom: Element; state: Record<string, unknown> }
      patch: (s: Record<string, unknown>, p: Record<string, unknown>) => void
    }

    const inst = Row.mount({ cls: "lit", first: "ada", last: "lovelace" })
    expect((inst.dom as Element).outerHTML).toBe(
      '<div class="row-lit"><span>ada lovelace</span></div>',
    )

    // Patch only the composite attr's dep:
    Row.patch(inst.state, { cls: "bold", first: "ada", last: "lovelace" })
    expect((inst.dom as Element).outerHTML).toBe(
      '<div class="row-bold"><span>ada lovelace</span></div>',
    )

    // Patch only one of the text slot's deps:
    Row.patch(inst.state, { cls: "bold", first: "grace", last: "lovelace" })
    expect((inst.dom as Element).outerHTML).toBe(
      '<div class="row-bold"><span>grace lovelace</span></div>',
    )

    // No-op patch must not change state/data identity.
    const textNode = inst.state["_t1"] as Text
    const dataBefore = textNode.data
    Row.patch(inst.state, { cls: "bold", first: "grace", last: "lovelace" })
    expect(textNode.data).toBe(dataBefore)
  })

  it("bails on a template literal whose expression is not a prop ref", () => {
    const input = `
      function Row({ x }) {
        const y = 1;
        return <div className={\`\${y}\`} />;
      }
    `
    const out = transform(input)
    // Multi-statement body falls through the compiler grammar, so this
    // also exercises the top-level bail; more importantly: no _template
    // should be emitted for this function.
    expect(out).not.toContain("markCompiled")
  })

  it("bails on a template literal that tags a function", () => {
    const input = `
      function Row({ x }) {
        return <div className={tagged\`\${x}\`} />;
      }
    `
    const out = transform(input)
    // Tagged template -> not handled -> fall through, no compile.
    expect(out).not.toContain("markCompiled")
  })
})

describe("babel-plugin-tachys (v0.7 nested compiled components)", () => {
  it("compiles a child with a prop-ref prop", () => {
    const input = `
      function App({ label }) {
        return <div><Badge label={label} /></div>;
      }
    `
    const out = transform(input)
    // Parent template carries a marker for Badge's position.
    expect(out).toContain('_template("<div><!></div>")')
    // Mount passes the resolved props to Badge.
    expect(out).toMatch(/_cs\d+ = Badge\(\{\s*label:\s*props\.label\s*\}\)/)
    // Patch guards the child.patch call by the dep's dirty flag.
    expect(out).toContain("const _d0 = state.label !== props.label")
    expect(out).toMatch(/if \(_d0\) \{[\s\S]*?Badge\.patch\(state\._cs\d+\.state,\s*\{\s*label:\s*props\.label/)
    // State sync happens after all writes.
    expect(out).toContain("state.label = props.label")
  })

  it("compiles a child with a nested member-access prop", () => {
    const input = `
      function App({ row }) {
        return <div><Row id={row.id} label={row.label} /></div>;
      }
    `
    const out = transform(input)
    // Both passed to Row; rewritten as props.row.id / props.row.label.
    expect(out).toMatch(/Row\(\{\s*id:\s*props\.row\.id,\s*label:\s*props\.row\.label\s*\}\)/)
    // One shared parent dep because both nested reads go through `row`.
    expect(out).toContain("const _d0 = state.row !== props.row")
  })

  it("compiles a static child (no deps) with no patch call", () => {
    const input = `
      function Wrapper() {
        return <div><Header /></div>;
      }
    `
    const out = transform(input)
    expect(out).toContain("markCompiled")
    // No reactive deps -> no compare, no patch work.
    expect(out).not.toContain("(prev, next)")
    expect(out).not.toContain("Header.patch")
  })

  it("compiles a child alongside a text slot on the parent", () => {
    const input = `
      function App({ title, badge }) {
        return <section><h1>{title}</h1><Badge label={badge} /></section>;
      }
    `
    const out = transform(input)
    expect(out).toContain('_template("<section><h1> </h1><!></section>")')
    // Composite path kicks in (has a component slot).
    expect(out).toContain("const _d0 = state.title !== props.title")
    expect(out).toContain("const _d1 = state.badge !== props.badge")
    // Text slot guarded by its single dep.
    expect(out).toMatch(/if \(_d0\) \{[\s\S]*?\.data\s*=\s*String\(props\.title\)/)
    // Component slot guarded by its single dep.
    expect(out).toMatch(/if \(_d1\) \{[\s\S]*?Badge\.patch/)
  })

  it("compiles a child with a literal prop (no dep)", () => {
    const input = `
      function App({ name }) {
        return <div><Row kind="admin" name={name} /></div>;
      }
    `
    const out = transform(input)
    expect(out).toMatch(/Row\(\{\s*kind:\s*"admin",\s*name:\s*props\.name\s*\}\)/)
    // Only `name` is reactive.
    expect(out).toContain("const _d0 = state.name !== props.name")
    // The kind literal is still re-emitted on patch (cheap object build).
    expect(out).toMatch(/if \(_d0\) \{[\s\S]*?Row\.patch\([\s\S]*?kind:\s*"admin"/)
  })

  it("compiles a boolean-shorthand child prop", () => {
    const input = `
      function App() {
        return <div><Row disabled /></div>;
      }
    `
    const out = transform(input)
    // Boolean-shorthand attr becomes `disabled: true`.
    expect(out).toMatch(/Row\(\{\s*disabled:\s*true\s*\}\)/)
  })

  it("bails on a child with a spread prop", () => {
    const input = `
      function App({ row }) {
        return <div><Row {...row} /></div>;
      }
    `
    const out = transform(input)
    expect(out).not.toContain("markCompiled")
  })

  it("bails on a child with an unresolvable expression prop", () => {
    const input = `
      function App({ x }) {
        return <div><Row handler={() => x + 1} /></div>;
      }
    `
    const out = transform(input)
    // Arrow function isn't in our child-prop grammar -> bail.
    expect(out).not.toContain("markCompiled")
  })

  it("memo compare includes all child deps", () => {
    const input = `
      function App({ a, b }) {
        return <div><Row x={a} y={b} /></div>;
      }
    `
    const out = transform(input)
    expect(out).toContain("prev.a === next.a")
    expect(out).toContain("prev.b === next.b")
    expect(out).toMatch(/&&/)
  })

  it("runs nested compiled component end-to-end in jsdom", async () => {
    const { JSDOM } = await import("jsdom")
    const dom = new JSDOM("<!doctype html><html><body></body></html>")
    const doc = dom.window.document

    // Two functions: child Row and parent App that nests it.
    const input = `
      function Row({ label }) { return <span className="r">{label}</span>; }
      function App({ badge }) { return <div><Row label={badge} /></div>; }
    `
    const out = transform(input)
    const stubbed = out.replace(/import \{[^}]*\} from "tachys";?/g, "")

    const markCompiled = (
      mount: (p: Record<string, unknown>) => { dom: Element; state: Record<string, unknown> },
      patch: (s: Record<string, unknown>, p: Record<string, unknown>) => void,
    ): ((p: Record<string, unknown>) => { dom: Element; state: Record<string, unknown> }) => {
      const callable = mount as ((p: Record<string, unknown>) => { dom: Element; state: Record<string, unknown> }) & {
        patch: typeof patch
      }
      callable.patch = patch
      return callable
    }
    const _template = (html: string): Element => {
      const tpl = doc.createElement("template")
      tpl.innerHTML = html
      return tpl.content.firstElementChild as Element
    }
    const fn = new Function(
      "document",
      "markCompiled",
      "_template",
      `${stubbed}; return { Row, App };`,
    )
    const { App } = fn(doc, markCompiled, _template) as {
      App: ((p: Record<string, unknown>) => { dom: Element; state: Record<string, unknown> }) & {
        patch: (s: Record<string, unknown>, p: Record<string, unknown>) => void
      }
      Row: unknown
    }

    const inst = App({ badge: "one" })
    expect((inst.dom as Element).outerHTML).toBe(
      '<div><span class="r">one</span></div>',
    )

    App.patch(inst.state, { badge: "two" })
    expect((inst.dom as Element).outerHTML).toBe(
      '<div><span class="r">two</span></div>',
    )

    // No-op patch: same ref -> neither parent dirty nor child.patch fires.
    App.patch(inst.state, { badge: "two" })
    expect((inst.dom as Element).outerHTML).toBe(
      '<div><span class="r">two</span></div>',
    )
  })
})

describe("babel-plugin-tachys (v0.6 literal attr expressions)", () => {
  it("compiles a numeric attr literal directly into the template", () => {
    const input = `
      function Box() {
        return <div tabindex={0} />;
      }
    `
    const out = transform(input)
    expect(out).toContain('_template("<div tabindex=\\"0\\"></div>")')
    // No slot -> no markCompiled call needed for reactivity.
    expect(out).not.toContain("state.tabindex")
  })

  it("compiles a string-literal expression attr into the template", () => {
    const input = `
      function Box() {
        return <div className={"foo"} />;
      }
    `
    const out = transform(input)
    expect(out).toContain('_template("<div class=\\"foo\\"></div>")')
    expect(out).not.toContain("_root.className")
  })

  it("does not treat event attrs with literal values as static", () => {
    const input = `
      function Row({ x }) {
        return <div onClick={42}>{x}</div>;
      }
    `
    const out = transform(input)
    // Event attr with non-function literal is nonsensical -> bail.
    expect(out).not.toContain("markCompiled")
  })

  it("coexists with dynamic attrs on the same element", () => {
    const input = `
      function Row({ id }) {
        return <div tabindex={0} id={id} />;
      }
    `
    const out = transform(input)
    // Static tabindex gets baked in; dynamic id stays in the slot table.
    expect(out).toContain('_template("<div tabindex=\\"0\\"></div>")')
    expect(out).toMatch(/setAttribute\("id",\s*String\(props\.id\)\)/)
  })
})
