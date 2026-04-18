/**
 * Compile a static JSX function component body into an HTML template string.
 *
 * Returns null if the component contains anything the v0.0.1 plugin can't
 * handle, signalling that the caller should leave the function unchanged.
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

export interface CompiledResult {
  html: string
}

export function compileStaticJsx(
  fn: BabelCore.types.FunctionDeclaration,
  t: T,
): CompiledResult | null {
  if (fn.params.length > 0) return null
  if (fn.async || fn.generator) return null

  const body = fn.body.body
  if (body.length !== 1) return null
  const stmt = body[0]!
  if (!t.isReturnStatement(stmt)) return null
  const arg = stmt.argument
  if (arg === null || arg === undefined) return null
  if (!t.isJSXElement(arg)) return null

  const html = renderElement(arg, t)
  if (html === null) return null

  return { html }
}

function renderElement(
  el: BabelCore.types.JSXElement,
  t: T,
): string | null {
  const name = getTagName(el.openingElement.name, t)
  if (name === null) return null
  if (!isHostTag(name)) return null

  const attrs = renderAttributes(el.openingElement.attributes, t)
  if (attrs === null) return null

  if (VOID_ELEMENTS.has(name)) {
    if (el.children.length > 0) return null
    return `<${name}${attrs}>`
  }

  const children = renderChildren(el.children, t)
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
  t: T,
): string | null {
  let out = ""
  for (const child of children) {
    if (t.isJSXText(child)) {
      const text = normalizeJsxText(child.value)
      if (text === "") continue
      out += escapeText(text)
      continue
    }
    if (t.isJSXElement(child)) {
      const nested = renderElement(child, t)
      if (nested === null) return null
      out += nested
      continue
    }
    return null
  }
  return out
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
