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

  it("flattens a fragment child into its parent's children", () => {
    const input = `
      function F({ a, b }) {
        return <div><>{a}{b}</></div>;
      }
    `
    const out = transform(input)
    expect(out).toContain("markCompiled")
    expect(out).toContain('_template("<div><!><!></div>")')
    expect(out).toContain("String(props.a)")
    expect(out).toContain("String(props.b)")
  })

  it("flattens nested fragments", () => {
    const input = `
      function F({ a, b, c }) {
        return <div><><>{a}</>{b}{c}</></div>;
      }
    `
    const out = transform(input)
    expect(out).toContain("markCompiled")
    expect(out).toContain('_template("<div><!><!><!></div>")')
    expect(out).toContain("String(props.a)")
    expect(out).toContain("String(props.b)")
    expect(out).toContain("String(props.c)")
  })

  it("flattens a fragment containing static text and a slot", () => {
    const input = `
      function F({ name }) {
        return <span><>hello {name}</></span>;
      }
    `
    const out = transform(input)
    expect(out).toContain("markCompiled")
    expect(out).toContain('_template("<span>hello <!></span>")')
    expect(out).toContain("String(props.name)")
  })

  it("bails on a fragment at the top level of the return", () => {
    const input = `
      function F({ a }) {
        return <>{a}</>;
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

  it("compiles className={cond ? str : null} as a guarded mount write", () => {
    const input = `
      function Row({ selected }) {
        return <tr className={selected ? "danger" : null}><td>x</td></tr>;
      }
    `
    const out = transform(input)
    expect(out).toContain("markCompiled")
    expect(out).toContain('_template("<tr><td>x</td></tr>")')
    // Mount: skip the write entirely when selected is falsy so the row's
    // <tr> stays attribute-free (no `class=""`).
    expect(out).toMatch(
      /if\s*\(\s*props\.selected\s*\)\s*\{?\s*_root\.className = "danger"/,
    )
    // Patch: still a single assignment (null collapses to "") so a
    // true→false transition clears the className.
    expect(out).toContain('state._root.className = props.selected ? "danger" : ""')
  })

  it("compiles className={cond ? null : str} (negated) as a guarded mount write", () => {
    const input = `
      function Row({ active }) {
        return <span className={active ? null : "muted"}>x</span>;
      }
    `
    const out = transform(input)
    expect(out).toMatch(
      /if\s*\(\s*!props\.active\s*\)\s*\{?\s*_root\.className = "muted"/,
    )
  })

  it("compiles setAttribute ternary with null branch as set/remove", () => {
    const input = `
      function Row({ pressed }) {
        return <button aria-pressed={pressed ? "true" : null}>x</button>;
      }
    `
    const out = transform(input)
    // Mount skips the write when pressed is falsy.
    expect(out).toMatch(
      /if\s*\(\s*props\.pressed\s*\)\s*\{?\s*_root\.setAttribute\("aria-pressed", "true"\)/,
    )
    // Patch toggles between setAttribute and removeAttribute.
    expect(out).toContain('state._root.setAttribute("aria-pressed", "true")')
    expect(out).toContain('state._root.removeAttribute("aria-pressed")')
  })

  it("treats `false` and `undefined` ternary branches the same as null", () => {
    const inputFalse = `
      function R({ x }) {
        return <i className={x ? "on" : false}>x</i>;
      }
    `
    const inputUndefined = `
      function R({ x }) {
        return <i className={x ? "on" : undefined}>x</i>;
      }
    `
    for (const src of [inputFalse, inputUndefined]) {
      const out = transform(src)
      expect(out).toMatch(
        /if\s*\(\s*props\.x\s*\)\s*\{?\s*_root\.className = "on"/,
      )
    }
  })
})

describe("babel-plugin-tachys (v0.4c memo compare)", () => {
  it("emits a leading-bail in patch that checks every dynamic prop", () => {
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
    // The early-bail lives at the top of the patch function. No separate
    // compare callback passed as the third arg.
    expect(out).not.toMatch(/markCompiled\([\s\S]*?,[\s\S]*?,\s*\(prev, next\)/)
    expect(out).toContain("state.selected === props.selected")
    expect(out).toContain("state.id === props.id")
    expect(out).toContain("state.onSelect === props.onSelect")
    expect(out).toContain("state.label === props.label")
    // Must be combined with && so any single mismatch falls through to
    // the per-slot write guards below.
    expect(out).toMatch(/&&/)
  })

  it("emits no leading bail for fully static components", () => {
    const input = `
      function Static() {
        return <div className="x"><span>hi</span></div>;
      }
    `
    const out = transform(input)
    // No per-prop checks at all.
    expect(out).not.toContain("(prev, next)")
    expect(out).not.toContain("prev.")
    expect(out).not.toMatch(/state\.\w+ === props\.\w+/)
  })

  it("dedups repeated prop references in the leading bail", () => {
    const input = `
      function M({ name }) {
        return <div id={name}>{name}</div>;
      }
    `
    const out = transform(input)
    const matches = out.match(/state\.name\s*===\s*props\.name/g) ?? []
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
    const _batched = <T,>(f: () => T): T => f()
    const fn = new Function(
      "document",
      "markCompiled",
      "_template",
      "_batched",
      `${stubbed}; return Row;`,
    )
    const Row = fn(doc, markCompiled, _template, _batched) as {
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

  it("leading-bail includes all props used by composite slots", () => {
    const input = `
      function Row({ a, b }) {
        return <div className={\`\${a}-\${b}\`} />;
      }
    `
    const out = transform(input)
    expect(out).toContain("state.a === props.a")
    expect(out).toContain("state.b === props.b")
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

  it("compiles a child with a pure spread prop", () => {
    const input = `
      function App({ row }) {
        return <div><Row {...row} /></div>;
      }
    `
    const out = transform(input)
    expect(out).toContain("markCompiled")
    // Spread emitted into the child props object.
    expect(out).toMatch(/Row\(\{\s*\.\.\.props\.row\s*\}\)/)
    // Leading-bail + per-slot dirty check both track the spread source.
    expect(out).toContain("state.row === props.row")
    expect(out).toContain("state.row !== props.row")
  })

  it("compiles a child with a spread plus explicit prop (spread first)", () => {
    const input = `
      function App({ row, selected }) {
        return <div><Row {...row} selected={selected} /></div>;
      }
    `
    const out = transform(input)
    expect(out).toContain("markCompiled")
    // Order preserved: spread then explicit (so explicit wins).
    expect(out).toMatch(
      /Row\(\{\s*\.\.\.props\.row,\s*selected:\s*props\.selected\s*\}\)/,
    )
    expect(out).toContain("state.row === props.row")
    expect(out).toContain("state.selected === props.selected")
  })

  it("compiles a child with explicit prop before spread (spread wins)", () => {
    const input = `
      function App({ row }) {
        return <div><Row selected={false} {...row} /></div>;
      }
    `
    const out = transform(input)
    expect(out).toContain("markCompiled")
    // Explicit key emitted first, then spread -- matches source order.
    expect(out).toMatch(
      /Row\(\{\s*selected:\s*false,\s*\.\.\.props\.row\s*\}\)/,
    )
  })

  it("compiles a child with multiple spreads", () => {
    const input = `
      function App({ base, overrides }) {
        return <div><Row {...base} {...overrides} /></div>;
      }
    `
    const out = transform(input)
    expect(out).toContain("markCompiled")
    expect(out).toMatch(
      /Row\(\{\s*\.\.\.props\.base,\s*\.\.\.props\.overrides\s*\}\)/,
    )
    expect(out).toContain("state.base === props.base")
    expect(out).toContain("state.overrides === props.overrides")
  })

  it("bails on a child whose spread source is not a prop ref", () => {
    const input = `
      function App() {
        return <div><Row {...someGlobal} /></div>;
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

  it("leading-bail includes all child deps", () => {
    const input = `
      function App({ a, b }) {
        return <div><Row x={a} y={b} /></div>;
      }
    `
    const out = transform(input)
    expect(out).toContain("state.a === props.a")
    expect(out).toContain("state.b === props.b")
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

  it("runs spread-props child end-to-end in jsdom", async () => {
    const { JSDOM } = await import("jsdom")
    const dom = new JSDOM("<!doctype html><html><body></body></html>")
    const doc = dom.window.document

    const input = `
      function Row({ label, tone }) {
        return <span className={tone}>{label}</span>;
      }
      function App({ row, tone }) {
        return <div><Row {...row} tone={tone} /></div>;
      }
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

    // Spread provides both label and (defaulted) tone; explicit `tone` after
    // the spread overrides the spread value since source order is preserved.
    const inst = App({ row: { label: "hi", tone: "ignored" }, tone: "ok" })
    expect((inst.dom as Element).outerHTML).toBe(
      '<div><span class="ok">hi</span></div>',
    )

    App.patch(inst.state, { row: { label: "yo", tone: "ignored2" }, tone: "ok" })
    expect((inst.dom as Element).outerHTML).toBe(
      '<div><span class="ok">yo</span></div>',
    )

    App.patch(inst.state, { row: { label: "yo", tone: "ignored2" }, tone: "danger" })
    expect((inst.dom as Element).outerHTML).toBe(
      '<div><span class="danger">yo</span></div>',
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

describe("babel-plugin-tachys (v0.8 keyed list compilation)", () => {
  it("compiles {arr.map(item => <Row/>)} into _mountList", () => {
    const input = `
      function Row({ id }) { return <span>{id}</span>; }
      function List({ items }) {
        return <ul>{items.map(item => <Row key={item.id} id={item.id} />)}</ul>;
      }
    `
    const out = transform(input)
    // Template has a <!> comment anchor inside ul.
    expect(out).toContain('_template("<ul><!></ul>")')
    // Runtime imports got added.
    expect(out).toMatch(/import \{[^}]*_mountList[^}]*\} from "tachys"/)
    expect(out).toMatch(/import \{[^}]*_patchList[^}]*\} from "tachys"/)
    // Module-level helpers emitted with component-scoped names.
    // makeProps is a mutator over a scratch arg so _patchList can reuse
    // one props object per row instead of allocating per iteration.
    expect(out).toMatch(/const _lp\$List_0 = \(item, __r = \{\}\) =>/)
    expect(out).toMatch(/const _lk\$List_0 = item => item\.id/)
    // Mount calls _mountList with the resolved args.
    expect(out).toMatch(
      /_mountList\(props\.items,\s*Row,\s*_lp\$List_0,\s*_lk\$List_0,\s*_lm\d+\)/,
    )
    // Patch calls _patchList under the items dirty-check, with the
    // hoisted makePropsOrDiff helper passed alongside makeProps and keyOf.
    expect(out).toMatch(
      /_patchList\(state\._ls\d+,\s*props\.items,\s*Row,\s*_lp\$List_0,\s*_lk\$List_0,\s*_lpd\$List_0\)/,
    )
  })

  it("emits non-key props in the makeProps arrow", () => {
    const input = `
      function Row({ id, label }) { return <span>{label}</span>; }
      function List({ rows }) {
        return <div>{rows.map(r => <Row key={r.id} id={r.id} label={r.label} />)}</div>;
      }
    `
    const out = transform(input)
    // Key is not duplicated into makeProps.
    expect(out).toMatch(
      /const _lp\$List_0 = \(r, __r = \{\}\) => \{[\s\S]*__r\.id = r\.id[\s\S]*__r\.label = r\.label[\s\S]*return __r/,
    )
    expect(out).toMatch(/const _lk\$List_0 = r => r\.id/)
  })

  it("bails when the map callback has no key prop", () => {
    const input = `
      function Row({ id }) { return <span>{id}</span>; }
      function List({ items }) {
        return <ul>{items.map(item => <Row id={item.id} />)}</ul>;
      }
    `
    const out = transform(input)
    // Row still compiles; List must remain as a FunctionDeclaration.
    expect(out).toContain("function List(")
    expect(out).not.toContain("const List = markCompiled")
  })

  it("bails when the map callback body is a host element", () => {
    const input = `
      function List({ items }) {
        return <ul>{items.map(item => <li key={item.id}>{item.id}</li>)}</ul>;
      }
    `
    const out = transform(input)
    expect(out).toContain("function List(")
    expect(out).not.toContain("const List = markCompiled")
  })

  it("compiles when an attr captures a parent prop (inline closure)", () => {
    const input = `
      function Row({ id, flag }) { return <span>{id}</span>; }
      function List({ items, highlight }) {
        return <ul>{items.map(item => <Row key={item.id} id={item.id} flag={highlight} />)}</ul>;
      }
    `
    const out = transform(input)
    // List compiles; makeProps is now inline (captures props.highlight) and
    // no hoisted helper is emitted.
    expect(out).toContain("const List = markCompiled")
    expect(out).not.toMatch(/const _lp\$List_0 =/)
    expect(out).not.toMatch(/const _lk\$List_0 =/)
    // The inline closure reads the parent prop directly.
    expect(out).toMatch(/__r\.flag = props\.highlight/)
    // The dirty-check path ORs both the array and the captured parent prop.
    expect(out).toMatch(/state\.items !== props\.items/)
    expect(out).toMatch(/state\.highlight !== props\.highlight/)
    // Leading-bail covers both reactive props.
    expect(out).toMatch(
      /state\.items === props\.items[\s\S]*state\.highlight === props\.highlight/,
    )
    // Parent-dep array is passed so _patchList can short-circuit item
    // identity when parent deps are unchanged.
    expect(out).toMatch(/_mountList\([\s\S]*\[props\.highlight\]\)/)
    expect(out).toMatch(/_patchList\([\s\S]*\[props\.highlight\]\)/)
  })

  it("supports props.<name>.map form (no destructure)", () => {
    const input = `
      function Row({ id }) { return <span>{id}</span>; }
      function List(props) {
        return <ul>{props.items.map(item => <Row key={item.id} id={item.id} />)}</ul>;
      }
    `
    const out = transform(input)
    expect(out).toContain("markCompiled")
    expect(out).toMatch(
      /_mountList\(props\.items,\s*Row,\s*_lp\$List_0,\s*_lk\$List_0/,
    )
  })

  it("accepts template literal attr values that only reference the item", () => {
    const input = `
      function Row({ label }) { return <span>{label}</span>; }
      function List({ items }) {
        return <ul>{items.map(item => <Row key={item.id} label={\`#\${item.id}\`} />)}</ul>;
      }
    `
    const out = transform(input)
    expect(out).toContain("markCompiled")
    expect(out).toMatch(/__r\.label = `#\$\{item\.id\}`/)
  })

  it("leading-bail keeps the array prop", () => {
    const input = `
      function Row({ id }) { return <span>{id}</span>; }
      function List({ items }) {
        return <ul>{items.map(item => <Row key={item.id} id={item.id} />)}</ul>;
      }
    `
    const out = transform(input)
    expect(out).toContain("state.items === props.items")
  })

  it("runs a keyed list end-to-end in jsdom", async () => {
    const { JSDOM } = await import("jsdom")
    const dom = new JSDOM("<!doctype html><html><body></body></html>")
    const doc = dom.window.document

    const input = `
      function Row({ id, label }) {
        return <li className="row">{label}</li>;
      }
      function List({ items }) {
        return <ul>{items.map(item => <Row key={item.id} id={item.id} label={item.label} />)}</ul>;
      }
    `
    const out = transform(input)
    const stubbed = out.replace(/import \{[^}]*\} from "tachys";?/g, "")

    type MountResult = { dom: Element; state: Record<string, unknown> }

    const markCompiled = (
      mount: (p: Record<string, unknown>) => MountResult,
      patch: (s: Record<string, unknown>, p: Record<string, unknown>) => void,
      compare?: (
        a: Record<string, unknown>,
        b: Record<string, unknown>,
      ) => boolean,
    ): ((p: Record<string, unknown>) => MountResult) & {
      patch: typeof patch
      _compare?: typeof compare
    } => {
      const callable = mount as ((p: Record<string, unknown>) => MountResult) & {
        patch: typeof patch
        _compare?: typeof compare
      }
      callable.patch = patch
      if (compare !== undefined) callable._compare = compare
      return callable
    }
    const _template = (html: string): Element => {
      const tpl = doc.createElement("template")
      tpl.innerHTML = html
      return tpl.content.firstElementChild as Element
    }

    // Bring in the real runtime helpers from the library source. We
    // can't just import them because their types expect a real global
    // `document`; stub it via the same `new Function` trick.
    const runtime = await import("../../../src/compiled")
    const { _mountList, _patchList } = runtime

    const fn = new Function(
      "document",
      "markCompiled",
      "_template",
      "_mountList",
      "_patchList",
      `${stubbed}; return { Row, List };`,
    )
    const { List } = fn(
      doc,
      markCompiled,
      _template,
      _mountList,
      _patchList,
    ) as {
      List: ((p: Record<string, unknown>) => MountResult) & {
        patch: (s: Record<string, unknown>, p: Record<string, unknown>) => void
      }
    }

    const items = [
      { id: 1, label: "one" },
      { id: 2, label: "two" },
      { id: 3, label: "three" },
    ]
    const inst = List({ items })
    expect((inst.dom as Element).outerHTML).toBe(
      '<ul>' +
        '<li class="row">one</li>' +
        '<li class="row">two</li>' +
        '<li class="row">three</li>' +
        '<!---->' +
      '</ul>',
    )

    // Swap order: keyed diff must not re-mount anything.
    const reordered = [items[2]!, items[0]!, items[1]!]
    List.patch(inst.state, { items: reordered })
    expect((inst.dom as Element).outerHTML).toBe(
      '<ul>' +
        '<li class="row">three</li>' +
        '<li class="row">one</li>' +
        '<li class="row">two</li>' +
        '<!---->' +
      '</ul>',
    )

    // Remove the middle item.
    List.patch(inst.state, { items: [reordered[0]!, reordered[2]!] })
    expect((inst.dom as Element).outerHTML).toBe(
      '<ul>' +
        '<li class="row">three</li>' +
        '<li class="row">two</li>' +
        '<!---->' +
      '</ul>',
    )

    // Append a new item.
    List.patch(inst.state, {
      items: [reordered[0]!, reordered[2]!, { id: 4, label: "four" }],
    })
    expect((inst.dom as Element).outerHTML).toBe(
      '<ul>' +
        '<li class="row">three</li>' +
        '<li class="row">two</li>' +
        '<li class="row">four</li>' +
        '<!---->' +
      '</ul>',
    )

    // Patch an existing item's label -- key stays the same, child.patch fires.
    const patched = [
      { id: 3, label: "THREE" },
      reordered[2]!,
      { id: 4, label: "four" },
    ]
    List.patch(inst.state, { items: patched })
    expect((inst.dom as Element).outerHTML).toBe(
      '<ul>' +
        '<li class="row">THREE</li>' +
        '<li class="row">two</li>' +
        '<li class="row">four</li>' +
        '<!---->' +
      '</ul>',
    )
  })

  it("runs a parent-prop-capturing list end-to-end in jsdom", async () => {
    const { JSDOM } = await import("jsdom")
    const dom = new JSDOM("<!doctype html><html><body></body></html>")
    const doc = dom.window.document

    // selectedId crosses the item boundary -- the inline closure reads it
    // from the parent `props` on every _patchList iteration. Only the two
    // rows whose `selected` flag flipped should re-render; others short
    // out via Row's auto-generated _compare.
    const input = `
      function Row({ id, label, selected }) {
        return <li className={selected ? "on" : "off"}>{label}</li>;
      }
      function List({ items, selectedId }) {
        return <ul>{items.map(item => <Row key={item.id} id={item.id} label={item.label} selected={item.id === selectedId} />)}</ul>;
      }
    `
    const out = transform(input)

    // No hoisted helpers for this list.
    expect(out).not.toMatch(/const _lp\$List_\d+ =/)
    expect(out).not.toMatch(/const _lk\$List_\d+ =/)
    // Inline closure reads props.selectedId.
    expect(out).toMatch(/item\.id === props\.selectedId/)

    const stubbed = out.replace(/import \{[^}]*\} from "tachys";?/g, "")

    type MountResult = { dom: Element; state: Record<string, unknown> }

    let patchCallCount = 0
    const markCompiled = (
      mount: (p: Record<string, unknown>) => MountResult,
      patch: (s: Record<string, unknown>, p: Record<string, unknown>) => void,
      compare?: (
        a: Record<string, unknown>,
        b: Record<string, unknown>,
      ) => boolean,
    ): ((p: Record<string, unknown>) => MountResult) & {
      patch: typeof patch
      _compare?: typeof compare
    } => {
      const wrappedPatch = (
        s: Record<string, unknown>,
        p: Record<string, unknown>,
      ) => {
        patchCallCount++
        patch(s, p)
      }
      const callable = mount as ((p: Record<string, unknown>) => MountResult) & {
        patch: typeof patch
        _compare?: typeof compare
      }
      callable.patch = wrappedPatch
      if (compare !== undefined) callable._compare = compare
      return callable
    }
    const _template = (html: string): Element => {
      const tpl = doc.createElement("template")
      tpl.innerHTML = html
      return tpl.content.firstElementChild as Element
    }

    const runtime = await import("../../../src/compiled")
    const { _mountList, _patchList } = runtime

    const fn = new Function(
      "document",
      "markCompiled",
      "_template",
      "_mountList",
      "_patchList",
      `${stubbed}; return { Row, List };`,
    )
    const { List } = fn(
      doc,
      markCompiled,
      _template,
      _mountList,
      _patchList,
    ) as {
      List: ((p: Record<string, unknown>) => MountResult) & {
        patch: (s: Record<string, unknown>, p: Record<string, unknown>) => void
      }
    }

    const items = [
      { id: 1, label: "one" },
      { id: 2, label: "two" },
      { id: 3, label: "three" },
    ]
    const inst = List({ items, selectedId: 1 })
    expect((inst.dom as Element).outerHTML).toBe(
      '<ul>' +
        '<li class="on">one</li>' +
        '<li class="off">two</li>' +
        '<li class="off">three</li>' +
        '<!---->' +
      '</ul>',
    )

    // Flip selection from 1 -> 2 keeping items identity stable. Each row
    // enters Row.patch (which increments the counter), but the leading
    // all-equal bail short-circuits row 3 before any DOM write. Total
    // counted patches are 1 List.patch + 3 Row.patch calls.
    patchCallCount = 0
    List.patch(inst.state, { items, selectedId: 2 })
    expect((inst.dom as Element).outerHTML).toBe(
      '<ul>' +
        '<li class="off">one</li>' +
        '<li class="on">two</li>' +
        '<li class="off">three</li>' +
        '<!---->' +
      '</ul>',
    )
    expect(patchCallCount).toBe(4)
  })
})

describe("babel-plugin-tachys (v0.9 conditional compiled children)", () => {
  it("compiles {cond && <Compiled .../>} into _mountCond / _patchCond", () => {
    const input = `
      function Badge({ label }) {
        return <span className="badge">{label}</span>;
      }
      function Panel({ visible, label }) {
        return <div>{visible && <Badge label={label} />}</div>;
      }
    `
    const out = transform(input)
    expect(out).toContain("_mountCond")
    expect(out).toContain("_patchCond")
    expect(out).toContain("<!>")
    expect(out).toContain("const Panel = markCompiled")
  })

  it("passes an inline () => ({...}) closure so makeProps reads live parent props", () => {
    const input = `
      function Badge({ label }) {
        return <span>{label}</span>;
      }
      function Panel({ visible, label }) {
        return <div>{visible && <Badge label={label} />}</div>;
      }
    `
    const out = transform(input)
    // makeProps must be an arrow that returns the child props object;
    // it must read props.label so the closure sees updated values.
    expect(out).toMatch(/\(\)\s*=>\s*\(\{\s*label:\s*props\.label\s*\}\)/)
  })

  it("leading-bail includes both cond deps and child prop deps", () => {
    const input = `
      function Badge({ label }) {
        return <span>{label}</span>;
      }
      function Panel({ visible, label }) {
        return <div>{visible && <Badge label={label} />}</div>;
      }
    `
    const out = transform(input)
    expect(out).toContain("state.visible === props.visible")
    expect(out).toContain("state.label === props.label")
  })

  it("supports a member-access condition", () => {
    const input = `
      function Badge({ label }) {
        return <span>{label}</span>;
      }
      function Panel(props) {
        return <div>{props.user.active && <Badge label={props.user.name} />}</div>;
      }
    `
    const out = transform(input)
    expect(out).toContain("_mountCond")
    expect(out).toContain("props.user.active")
    expect(out).toContain("props.user.name")
  })

  // Ternary ({cond ? <A/> : <B/>}) is handled in the v1.0 alt-slot suite.

  it("bails on a host element on the right of &&", () => {
    const input = `
      function Panel({ visible }) {
        return <div>{visible && <span>hi</span>}</div>;
      }
    `
    const out = transform(input)
    expect(out).toContain("function Panel(")
    expect(out).not.toContain("const Panel = markCompiled")
  })

  it("bails when the conditional child has JSX children (slot would need to know structure)", () => {
    const input = `
      function Badge({ label }) {
        return <span>{label}</span>;
      }
      function Panel({ visible, label }) {
        return <div>{visible && <Badge label={label}>extra</Badge>}</div>;
      }
    `
    const out = transform(input)
    expect(out).toContain("function Panel(")
    expect(out).not.toContain("const Panel = markCompiled")
  })

  it("bails when cond references an unresolvable expression", () => {
    // `something` is a free variable here, neither a destructured param
    // nor a `props.*` member chain.
    const input = `
      function Badge({ label }) {
        return <span>{label}</span>;
      }
      function Panel({ label }) {
        return <div>{something && <Badge label={label} />}</div>;
      }
    `
    const out = transform(input)
    expect(out).toContain("function Panel(")
    expect(out).not.toContain("const Panel = markCompiled")
  })

  it("runs cond end-to-end in jsdom (mount, toggle, patch, remount)", async () => {
    const { JSDOM } = await import("jsdom")
    const dom = new JSDOM("<!doctype html><html><body></body></html>")
    const doc = dom.window.document

    const input = `
      function Badge({ label }) {
        return <span className="badge">{label}</span>;
      }
      function Panel({ visible, label }) {
        return <div>{visible && <Badge label={label} />}</div>;
      }
    `
    const out = transform(input)
    const stubbed = out.replace(/import \{[^}]*\} from "tachys";?/g, "")

    type MountResult = { dom: Element; state: Record<string, unknown> }

    const markCompiled = (
      mount: (p: Record<string, unknown>) => MountResult,
      patch: (s: Record<string, unknown>, p: Record<string, unknown>) => void,
      compare?: (
        a: Record<string, unknown>,
        b: Record<string, unknown>,
      ) => boolean,
    ): ((p: Record<string, unknown>) => MountResult) & {
      patch: typeof patch
      _compare?: typeof compare
    } => {
      const callable = mount as ((p: Record<string, unknown>) => MountResult) & {
        patch: typeof patch
        _compare?: typeof compare
      }
      callable.patch = patch
      if (compare !== undefined) callable._compare = compare
      return callable
    }
    const _template = (html: string): Element => {
      const tpl = doc.createElement("template")
      tpl.innerHTML = html
      return tpl.content.firstElementChild as Element
    }

    const runtime = await import("../../../src/compiled")
    const { _mountCond, _patchCond } = runtime

    const fn = new Function(
      "document",
      "markCompiled",
      "_template",
      "_mountCond",
      "_patchCond",
      `${stubbed}; return { Badge, Panel };`,
    )
    const { Panel } = fn(
      doc,
      markCompiled,
      _template,
      _mountCond,
      _patchCond,
    ) as {
      Panel: ((p: Record<string, unknown>) => MountResult) & {
        patch: (s: Record<string, unknown>, p: Record<string, unknown>) => void
      }
    }

    // Initial mount: visible=false -> only the anchor, no badge.
    const inst = Panel({ visible: false, label: "hello" })
    expect((inst.dom as Element).outerHTML).toBe("<div><!----></div>")

    // Toggle visible on: badge should mount before the anchor.
    Panel.patch(inst.state, { visible: true, label: "hello" })
    expect((inst.dom as Element).outerHTML).toBe(
      '<div><span class="badge">hello</span><!----></div>',
    )

    // Keep visible, change label: child.patch fires, DOM updates in place.
    const spanBefore = (inst.dom as Element).querySelector("span.badge")!
    Panel.patch(inst.state, { visible: true, label: "world" })
    expect((inst.dom as Element).outerHTML).toBe(
      '<div><span class="badge">world</span><!----></div>',
    )
    // Node identity must persist across a same-cond patch.
    expect((inst.dom as Element).querySelector("span.badge")).toBe(spanBefore)

    // Toggle visible off: badge unmounts.
    Panel.patch(inst.state, { visible: false, label: "world" })
    expect((inst.dom as Element).outerHTML).toBe("<div><!----></div>")

    // Toggle back on: fresh badge, new DOM node.
    Panel.patch(inst.state, { visible: true, label: "again" })
    const spanAfter = (inst.dom as Element).querySelector("span.badge")!
    expect(spanAfter).not.toBe(spanBefore)
    expect((inst.dom as Element).outerHTML).toBe(
      '<div><span class="badge">again</span><!----></div>',
    )
  })
})

describe("babel-plugin-tachys (v1.0 ternary alt slots)", () => {
  it("compiles {cond ? <A/> : <B/>} into _mountAlt / _patchAlt", () => {
    const input = `
      function Yes({ label }) { return <span className="yes">{label}</span>; }
      function No({ label }) { return <span className="no">{label}</span>; }
      function Panel({ visible, label }) {
        return <div>{visible ? <Yes label={label} /> : <No label={label} />}</div>;
      }
    `
    const out = transform(input)
    expect(out).toContain("_mountAlt")
    expect(out).toContain("_patchAlt")
    expect(out).toContain("const Panel = markCompiled")
  })

  it("leading-bail covers cond + both branches' deps", () => {
    const input = `
      function Yes({ name }) { return <span>{name}</span>; }
      function No({ count }) { return <span>{count}</span>; }
      function Panel({ visible, name, count }) {
        return <div>{visible ? <Yes name={name} /> : <No count={count} />}</div>;
      }
    `
    const out = transform(input)
    expect(out).toContain("state.visible === props.visible")
    expect(out).toContain("state.name === props.name")
    expect(out).toContain("state.count === props.count")
  })

  it("bails when a branch is a host element", () => {
    const input = `
      function A({}) { return <span>a</span>; }
      function Panel({ visible }) {
        return <div>{visible ? <A /> : <span>fallback</span>}</div>;
      }
    `
    const out = transform(input)
    expect(out).toContain("function Panel(")
    expect(out).not.toContain("const Panel = markCompiled")
  })

  it("bails when a branch has JSX children", () => {
    const input = `
      function Yes({ label }) { return <span>{label}</span>; }
      function No({ label }) { return <span>{label}</span>; }
      function Panel({ visible, label }) {
        return <div>{visible ? <Yes label={label}>x</Yes> : <No label={label} />}</div>;
      }
    `
    const out = transform(input)
    expect(out).toContain("function Panel(")
    expect(out).not.toContain("const Panel = markCompiled")
  })

  it("runs a ternary end-to-end in jsdom (branch swap + in-place patch)", async () => {
    const { JSDOM } = await import("jsdom")
    const dom = new JSDOM("<!doctype html><html><body></body></html>")
    const doc = dom.window.document

    const input = `
      function Yes({ label }) { return <span className="yes">{label}</span>; }
      function No({ label }) { return <span className="no">{label}</span>; }
      function Panel({ visible, label }) {
        return <div>{visible ? <Yes label={label} /> : <No label={label} />}</div>;
      }
    `
    const out = transform(input)
    const stubbed = out.replace(/import \{[^}]*\} from "tachys";?/g, "")

    type MountResult = { dom: Element; state: Record<string, unknown> }

    const markCompiled = (
      mount: (p: Record<string, unknown>) => MountResult,
      patch: (s: Record<string, unknown>, p: Record<string, unknown>) => void,
      compare?: (
        a: Record<string, unknown>,
        b: Record<string, unknown>,
      ) => boolean,
    ): ((p: Record<string, unknown>) => MountResult) & {
      patch: typeof patch
      _compare?: typeof compare
    } => {
      const callable = mount as ((p: Record<string, unknown>) => MountResult) & {
        patch: typeof patch
        _compare?: typeof compare
      }
      callable.patch = patch
      if (compare !== undefined) callable._compare = compare
      return callable
    }
    const _template = (html: string): Element => {
      const tpl = doc.createElement("template")
      tpl.innerHTML = html
      return tpl.content.firstElementChild as Element
    }

    const runtime = await import("../../../src/compiled")
    const { _mountAlt, _patchAlt } = runtime

    const fn = new Function(
      "document",
      "markCompiled",
      "_template",
      "_mountAlt",
      "_patchAlt",
      `${stubbed}; return { Panel };`,
    )
    const { Panel } = fn(
      doc,
      markCompiled,
      _template,
      _mountAlt,
      _patchAlt,
    ) as {
      Panel: ((p: Record<string, unknown>) => MountResult) & {
        patch: (s: Record<string, unknown>, p: Record<string, unknown>) => void
      }
    }

    // Initial mount: visible=true -> Yes branch.
    const inst = Panel({ visible: true, label: "hi" })
    expect((inst.dom as Element).outerHTML).toBe(
      '<div><span class="yes">hi</span><!----></div>',
    )
    const yesBefore = (inst.dom as Element).querySelector("span.yes")!

    // Patch with same branch, new label: in-place update, identity preserved.
    Panel.patch(inst.state, { visible: true, label: "hello" })
    expect((inst.dom as Element).outerHTML).toBe(
      '<div><span class="yes">hello</span><!----></div>',
    )
    expect((inst.dom as Element).querySelector("span.yes")).toBe(yesBefore)

    // Flip cond: swap to No branch.
    Panel.patch(inst.state, { visible: false, label: "hello" })
    expect((inst.dom as Element).outerHTML).toBe(
      '<div><span class="no">hello</span><!----></div>',
    )

    // Flip back: fresh Yes node (no stale state).
    Panel.patch(inst.state, { visible: true, label: "again" })
    const yesAfter = (inst.dom as Element).querySelector("span.yes")!
    expect(yesAfter).not.toBe(yesBefore)
    expect((inst.dom as Element).outerHTML).toBe(
      '<div><span class="yes">again</span><!----></div>',
    )
  })
})
