import { describe, expect, it } from "vitest"
import {
  a,
  button,
  div,
  h1,
  input,
  span,
  svg,
  switch_,
  useEl,
  var_,
} from "../../src/tags"
import { ChildFlags, VNodeFlags } from "../../src/index"

describe("tags", () => {
  it("produces a VNode with the correct tag name", () => {
    const v = div(null)
    expect(v.type).toBe("div")
    expect(v.flags & VNodeFlags.Element).toBe(VNodeFlags.Element)
  })

  it("accepts props as the first argument", () => {
    const v = div({ className: "row" }, "hello")
    expect(v.className).toBe("row")
    expect(v.children).toBe("hello")
    expect(v.childFlags).toBe(ChildFlags.HasTextChildren)
  })

  it("accepts children without a props object", () => {
    const v = div("text only")
    expect(v.props).toBeNull()
    expect(v.children).toBe("text only")
  })

  it("treats null first arg as no-props (hyperscript style)", () => {
    const v = div(null, "x")
    expect(v.props).toBeNull()
    expect(v.children).toBe("x")
  })

  it("treats VNode first arg as a child, not props", () => {
    const inner = span(null, "inner")
    const outer = div(inner, span(null, "second"))
    expect(outer.type).toBe("div")
    expect(outer.props).toBeNull()
    expect(Array.isArray(outer.children)).toBe(true)
    expect((outer.children as any[]).length).toBe(2)
  })

  it("gives per-element prop typing via IntrinsicElements", () => {
    // This test primarily exercises the types at compile time.
    // At runtime we just verify the call succeeds.
    const v = input({ type: "text", value: "hi", disabled: false })
    expect(v.type).toBe("input")
    expect(v.props).toMatchObject({ type: "text", value: "hi", disabled: false })
  })

  it("supports nested children", () => {
    const tree = div(
      { className: "wrap" },
      h1(null, "title"),
      span(null, "line 1"),
      a({ href: "/x" }, "link"),
    )
    expect(tree.type).toBe("div")
    expect(Array.isArray(tree.children)).toBe(true)
    expect((tree.children as any[]).length).toBe(3)
  })

  it("supports button onClick events", () => {
    let clicked = false
    const v = button({ onClick: () => { clicked = true } }, "go")
    expect(v.type).toBe("button")
    expect(typeof (v.props as any)?.onClick).toBe("function")
    ;(v.props as any).onClick()
    expect(clicked).toBe(true)
  })

  it("creates SVG elements", () => {
    const s = svg(null)
    expect(s.type).toBe("svg")
    expect(s.flags & VNodeFlags.Svg).toBe(VNodeFlags.Svg)
  })

  it("renames JS-reserved tag identifiers with trailing underscore", () => {
    expect(var_(null, "x").type).toBe("var")
    expect(switch_(null).type).toBe("switch")
  })

  it("exports SVG <use> as useEl", () => {
    expect(useEl(null).type).toBe("use")
  })

  it("accepts no arguments", () => {
    const v = div()
    expect(v.type).toBe("div")
    expect(v.children).toBeNull()
  })
})
