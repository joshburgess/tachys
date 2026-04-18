/**
 * Typed tag helpers. Terse hyperscript-style DSL as an alternative to
 * `h("div", props, ...children)` or JSX.
 *
 * Each function accepts either:
 *   tag(props, ...children)  -- props object first
 *   tag(...children)         -- no props, children only
 *
 * Props are derived from JSX.IntrinsicElements so you get full
 * per-element autocomplete and prop type checking.
 *
 *   import { div, span, button } from "tachys/tags"
 *
 *   div({ className: "row" },
 *     span(null, "label: "),
 *     button({ onClick: onSave }, "Save"))
 *
 * JS reserved identifiers (`<var>`, `<switch>`) are suffixed with `_`.
 * SVG `<use>` is exported as `useEl` to avoid colliding with the
 * React `use()` hook.
 */

import { h } from "./jsx"
import type { JSX } from "./jsx-types"
import type { VNode } from "./vnode"

type Child = VNode | string | number | null | undefined

export interface TagFn<K extends keyof JSX.IntrinsicElements> {
  (props: JSX.IntrinsicElements[K] | null, ...children: Child[]): VNode
  (...children: Child[]): VNode
}

function isPropsLike(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v !== "object") return false
  // VNodes have a numeric `flags` field; treat them as children, not props.
  return typeof (v as { flags?: unknown }).flags !== "number"
}

function make<K extends keyof JSX.IntrinsicElements>(tag: K): TagFn<K> {
  return ((first?: unknown, ...rest: Child[]): VNode => {
    if (first === null || first === undefined) {
      return h(tag, null, ...rest)
    }
    if (isPropsLike(first)) {
      return h(tag, first as JSX.IntrinsicElements[K], ...rest)
    }
    return h(tag, null, first as Child, ...rest)
  }) as TagFn<K>
}

// --- HTML ---

export const a = make("a")
export const abbr = make("abbr")
export const address = make("address")
export const area = make("area")
export const article = make("article")
export const aside = make("aside")
export const audio = make("audio")
export const b = make("b")
export const base = make("base")
export const bdi = make("bdi")
export const bdo = make("bdo")
export const blockquote = make("blockquote")
export const body = make("body")
export const br = make("br")
export const button = make("button")
export const canvas = make("canvas")
export const caption = make("caption")
export const cite = make("cite")
export const code = make("code")
export const col = make("col")
export const colgroup = make("colgroup")
export const data = make("data")
export const datalist = make("datalist")
export const dd = make("dd")
export const del = make("del")
export const details = make("details")
export const dfn = make("dfn")
export const dialog = make("dialog")
export const div = make("div")
export const dl = make("dl")
export const dt = make("dt")
export const em = make("em")
export const embed = make("embed")
export const fieldset = make("fieldset")
export const figcaption = make("figcaption")
export const figure = make("figure")
export const footer = make("footer")
export const form = make("form")
export const h1 = make("h1")
export const h2 = make("h2")
export const h3 = make("h3")
export const h4 = make("h4")
export const h5 = make("h5")
export const h6 = make("h6")
export const head = make("head")
export const header = make("header")
export const hgroup = make("hgroup")
export const hr = make("hr")
export const html = make("html")
export const i = make("i")
export const iframe = make("iframe")
export const img = make("img")
export const input = make("input")
export const ins = make("ins")
export const kbd = make("kbd")
export const label = make("label")
export const legend = make("legend")
export const li = make("li")
export const link = make("link")
export const main = make("main")
export const map = make("map")
export const mark = make("mark")
export const menu = make("menu")
export const meta = make("meta")
export const meter = make("meter")
export const nav = make("nav")
export const noscript = make("noscript")
export const object = make("object")
export const ol = make("ol")
export const optgroup = make("optgroup")
export const option = make("option")
export const output = make("output")
export const p = make("p")
export const picture = make("picture")
export const pre = make("pre")
export const progress = make("progress")
export const q = make("q")
export const rp = make("rp")
export const rt = make("rt")
export const ruby = make("ruby")
export const s = make("s")
export const samp = make("samp")
export const script = make("script")
export const search = make("search")
export const section = make("section")
export const select = make("select")
export const slot = make("slot")
export const small = make("small")
export const source = make("source")
export const span = make("span")
export const strong = make("strong")
export const style = make("style")
export const sub = make("sub")
export const summary = make("summary")
export const sup = make("sup")
export const table = make("table")
export const tbody = make("tbody")
export const td = make("td")
export const template = make("template")
export const textarea = make("textarea")
export const tfoot = make("tfoot")
export const th = make("th")
export const thead = make("thead")
export const time = make("time")
export const title = make("title")
export const tr = make("tr")
export const track = make("track")
export const u = make("u")
export const ul = make("ul")
export const video = make("video")
export const wbr = make("wbr")

// `var` is a JS reserved identifier; exported as `var_`.
export const var_ = make("var")

// --- SVG ---

export const svg = make("svg")
export const animate = make("animate")
export const animateMotion = make("animateMotion")
export const animateTransform = make("animateTransform")
export const circle = make("circle")
export const clipPath = make("clipPath")
export const defs = make("defs")
export const desc = make("desc")
export const ellipse = make("ellipse")
export const feBlend = make("feBlend")
export const feColorMatrix = make("feColorMatrix")
export const feComponentTransfer = make("feComponentTransfer")
export const feComposite = make("feComposite")
export const feConvolveMatrix = make("feConvolveMatrix")
export const feDiffuseLighting = make("feDiffuseLighting")
export const feDisplacementMap = make("feDisplacementMap")
export const feDistantLight = make("feDistantLight")
export const feFlood = make("feFlood")
export const feFuncA = make("feFuncA")
export const feFuncB = make("feFuncB")
export const feFuncG = make("feFuncG")
export const feFuncR = make("feFuncR")
export const feGaussianBlur = make("feGaussianBlur")
export const feImage = make("feImage")
export const feMerge = make("feMerge")
export const feMergeNode = make("feMergeNode")
export const feMorphology = make("feMorphology")
export const feOffset = make("feOffset")
export const fePointLight = make("fePointLight")
export const feSpecularLighting = make("feSpecularLighting")
export const feSpotLight = make("feSpotLight")
export const feTile = make("feTile")
export const feTurbulence = make("feTurbulence")
export const filter = make("filter")
export const foreignObject = make("foreignObject")
export const g = make("g")
export const image = make("image")
export const line = make("line")
export const linearGradient = make("linearGradient")
export const marker = make("marker")
export const mask = make("mask")
export const metadata = make("metadata")
export const path = make("path")
export const pattern = make("pattern")
export const polygon = make("polygon")
export const polyline = make("polyline")
export const radialGradient = make("radialGradient")
export const rect = make("rect")
export const stop = make("stop")
export const symbol = make("symbol")
export const text = make("text")
export const textPath = make("textPath")
export const tspan = make("tspan")

// `switch` is a JS reserved identifier; exported as `switch_`.
export const switch_ = make("switch")

// SVG `<use>` renamed to avoid colliding with the React `use()` hook.
export const useEl = make("use")
