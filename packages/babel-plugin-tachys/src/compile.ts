/**
 * Compile a JSX function component body into an HTML template plus a list
 * of dynamic slots. Returns null if the component falls outside the
 * supported grammar; the caller then leaves the function unchanged so the
 * existing JSX runtime handles it.
 *
 * Supported grammar (v0.1):
 *   - Function with zero params, or one identifier param (e.g. `props`),
 *     or one ObjectPattern param with only shorthand identifier props.
 *   - Body is a single `return <JSXElement/>`.
 *   - Host tags only (lowercase element names).
 *   - String-literal attribute values.
 *   - Children are JSXText, static JSXElement, or JSXExpressionContainer
 *     whose expression is a bare identifier (matched against destructured
 *     names) or `props.<name>` member access.
 *
 * Anything outside this grammar produces null.
 */

import type * as BabelCore from "@babel/core"

type T = typeof BabelCore.types

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
])

/**
 * A dynamic insertion point in the compiled template. `path` is a chain of
 * DOM child indices from the root element; the mount code walks this path
 * at instance creation to locate the placeholder node.
 */
export interface TextSlot {
  kind: "text"
  /** DOM child-index path from the template root. */
  path: number[]
  /** Name on `props` to read (post-normalization of destructured params). */
  propName: string
}

export type Slot = TextSlot

export interface CompiledResult {
  html: string
  slots: Slot[]
  /** Name used for the props parameter in the emitted mount/patch. */
  propsParamName: string
}

interface CompileContext {
  t: T
  /** Names declared via destructured props, if any. */
  destructuredNames: Set<string> | null
  slots: Slot[]
}

export function compileComponent(
  fn: BabelCore.types.FunctionDeclaration,
  t: T,
): CompiledResult | null {
  if (fn.async || fn.generator) return null
  if (fn.params.length > 1) return null

  let destructured: Set<string> | null = null
  if (fn.params.length === 1) {
    const p = fn.params[0]!
    if (t.isIdentifier(p)) {
      if (p.name !== "props") return null
    } else if (t.isObjectPattern(p)) {
      const names = new Set<string>()
      for (const prop of p.properties) {
        if (!t.isObjectProperty(prop)) return null
        if (!prop.shorthand) return null
        const key = prop.key
        if (!t.isIdentifier(key)) return null
        names.add(key.name)
      }
      destructured = names
    } else {
      return null
    }
  }

  const body = fn.body.body
  if (body.length !== 1) return null
  const stmt = body[0]!
  if (!t.isReturnStatement(stmt)) return null
  const arg = stmt.argument
  if (arg === null || arg === undefined) return null
  if (!t.isJSXElement(arg)) return null

  const ctx: CompileContext = {
    t,
    destructuredNames: destructured,
    slots: [],
  }

  const html = renderElement(arg, ctx, [])
  if (html === null) return null

  return {
    html,
    slots: ctx.slots,
    propsParamName: "props",
  }
}

function renderElement(
  el: BabelCore.types.JSXElement,
  ctx: CompileContext,
  parentPath: number[],
): string | null {
  const t = ctx.t
  const name = getTagName(el.openingElement.name, t)
  if (name === null) return null
  if (!isHostTag(name)) return null

  const attrs = renderAttributes(el.openingElement.attributes, t)
  if (attrs === null) return null

  if (VOID_ELEMENTS.has(name)) {
    if (el.children.length > 0) return null
    return `<${name}${attrs}>`
  }

  const children = renderChildren(el.children, ctx, parentPath)
  if (children === null) return null

  return `<${name}${attrs}>${children}</${name}>`
}

function getTagName(
  node:
    | BabelCore.types.JSXIdentifier
    | BabelCore.types.JSXMemberExpression
    | BabelCore.types.JSXNamespacedName,
  t: T,
): string | null {
  if (t.isJSXIdentifier(node)) return node.name
  return null
}

function isHostTag(name: string): boolean {
  const first = name.charCodeAt(0)
  return first >= 97 && first <= 122
}

function renderAttributes(
  attrs: Array<
    | BabelCore.types.JSXAttribute
    | BabelCore.types.JSXSpreadAttribute
  >,
  t: T,
): string | null {
  let out = ""
  for (const attr of attrs) {
    if (!t.isJSXAttribute(attr)) return null
    const attrName = attr.name
    if (!t.isJSXIdentifier(attrName)) return null
    const name = jsxAttrNameToHtml(attrName.name)
    const value = attr.value

    if (value === null || value === undefined) {
      out += ` ${name}`
      continue
    }

    if (t.isStringLiteral(value)) {
      out += ` ${name}="${escapeAttr(value.value)}"`
      continue
    }

    return null
  }
  return out
}

function jsxAttrNameToHtml(name: string): string {
  if (name === "className") return "class"
  if (name === "htmlFor") return "for"
  return name
}

function renderChildren(
  children: Array<
    | BabelCore.types.JSXText
    | BabelCore.types.JSXExpressionContainer
    | BabelCore.types.JSXSpreadChild
    | BabelCore.types.JSXElement
    | BabelCore.types.JSXFragment
  >,
  ctx: CompileContext,
  parentPath: number[],
): string | null {
  const t = ctx.t
  let out = ""
  let domIndex = 0
  for (const child of children) {
    if (t.isJSXText(child)) {
      const text = normalizeJsxText(child.value)
      if (text === "") continue
      out += escapeText(text)
      domIndex++
      continue
    }
    if (t.isJSXElement(child)) {
      const nested = renderElement(child, ctx, [...parentPath, domIndex])
      if (nested === null) return null
      out += nested
      domIndex++
      continue
    }
    if (t.isJSXExpressionContainer(child)) {
      const propName = resolvePropExpr(child.expression, ctx)
      if (propName === null) return null
      ctx.slots.push({
        kind: "text",
        path: [...parentPath, domIndex],
        propName,
      })
      // Emit a comment marker that the mount code swaps for a real text node.
      out += "<!>"
      domIndex++
      continue
    }
    return null
  }
  return out
}

function resolvePropExpr(
  expr:
    | BabelCore.types.Expression
    | BabelCore.types.JSXEmptyExpression,
  ctx: CompileContext,
): string | null {
  const t = ctx.t
  if (t.isJSXEmptyExpression(expr)) return null

  if (t.isIdentifier(expr)) {
    if (ctx.destructuredNames === null) return null
    if (!ctx.destructuredNames.has(expr.name)) return null
    return expr.name
  }

  if (t.isMemberExpression(expr)) {
    if (expr.computed) return null
    const obj = expr.object
    const prop = expr.property
    if (!t.isIdentifier(obj)) return null
    if (obj.name !== "props") return null
    if (!t.isIdentifier(prop)) return null
    return prop.name
  }

  return null
}

function normalizeJsxText(raw: string): string {
  const lines = raw.split("\n")
  const parts: string[] = []
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!
    if (i > 0) line = line.replace(/^[ \t]+/, "")
    if (i < lines.length - 1) line = line.replace(/[ \t]+$/, "")
    if (line !== "") parts.push(line)
  }
  return parts.join(" ")
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}
