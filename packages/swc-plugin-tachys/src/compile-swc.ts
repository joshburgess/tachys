/**
 * SWC frontend for Tachys. Walks an SWC `FunctionDeclaration` and
 * produces a `CompiledIR` (from `compiler-core-tachys`) that the shared
 * string emitter can consume. Returns `null` if the function falls
 * outside the supported grammar, so the caller leaves the source
 * unchanged and the existing jsx-runtime path handles it.
 *
 * Supported grammar (first pass):
 *   - Function with 0 params, one Identifier param named `props`, or
 *     one ObjectPattern param with shorthand identifier props.
 *   - Body is a single `return <JSXElement/>`.
 *   - Host tags only (lowercase), string-literal or prop-reference attrs,
 *     event handlers (`onX={propRef}`), component slots (PascalCase
 *     child with prop refs), JSXExpressionContainer text slots.
 *
 * Not yet ported from the Babel frontend: template-literal composites,
 * attribute ternaries, keyed lists, short-circuit / ternary conditional
 * children, fragment flattening. These bail the compilation, which
 * leaves the function unchanged — tests that need those features stay
 * on the Babel plugin for now. The IR boundary means adding them later
 * is a matter of extending this file; the emitter doesn't change.
 */

import type {
  CompiledIR,
  IRAttrSlot,
  IRComponentSlot,
  IREventSlot,
  IRListSlot,
  IRSlot,
  IRTextSlot,
} from "compiler-core-tachys"
import type {
  ArrowFunctionExpression,
  CallExpression,
  ConditionalExpression,
  Expression,
  FunctionDeclaration,
  Identifier,
  JSXAttribute,
  JSXAttributeOrSpread,
  JSXElement,
  JSXElementChild,
  MemberExpression,
  ObjectPattern,
  Pattern,
} from "@swc/types"

import { collectPropRefs, printExpr, type PrintContext } from "./print-expr"

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

interface CompileCtx {
  destructured: Set<string> | null
  slots: IRSlot[]
}

function htmlEscapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function htmlEscapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
}

function isHostTag(name: string): boolean {
  const first = name.charCodeAt(0)
  return first >= 97 && first <= 122
}

function printCtx(ctx: CompileCtx): PrintContext {
  return { destructured: ctx.destructured, bound: new Set<string>() }
}

/**
 * Entry point. Returns `null` for anything outside the supported grammar.
 */
export function compileComponentSwc(
  fn: FunctionDeclaration,
): CompiledIR | null {
  if (fn.async || fn.generator) return null
  if (fn.params.length > 1) return null

  let destructured: Set<string> | null = null
  if (fn.params.length === 1) {
    const p = fn.params[0]!.pat
    if (p.type === "Identifier") {
      if ((p as Identifier).value !== "props") return null
    } else if (p.type === "ObjectPattern") {
      const names = new Set<string>()
      for (const prop of (p as ObjectPattern).properties) {
        if (prop.type !== "AssignmentPatternProperty") return null
        const a = prop as { key: Identifier; value: Expression | null }
        if (a.value !== null) return null
        names.add(a.key.value)
      }
      destructured = names
    } else {
      return null
    }
  }

  const body = fn.body
  if (body === undefined || body.stmts.length !== 1) return null
  const stmt = body.stmts[0]!
  if (stmt.type !== "ReturnStatement") return null
  let arg = stmt.argument
  if (arg === undefined) return null
  // `return (<div/>)` wraps the JSX in a ParenthesisExpression; unwrap
  // any nested parens before requiring a JSXElement.
  while (arg !== undefined && arg.type === "ParenthesisExpression") {
    arg = (arg as { expression: Expression }).expression
  }
  if (arg === undefined) return null
  if (arg.type !== "JSXElement") return null

  const ctx: CompileCtx = { destructured, slots: [] }
  const html = renderElement(arg as JSXElement, ctx, [])
  if (html === null) return null

  return { html, slots: ctx.slots, propsParamName: "props" }
}

/**
 * JSX collapses whitespace-only text that contains a newline between
 * sibling tags — `<div>\n  <h2/>\n  <p/>\n</div>` renders as
 * `<div><h2/><p/></div>`. Drop those JSXText nodes before numbering
 * children so DOM paths match what the template actually contains.
 */
function isCollapsibleJsxWhitespace(s: string): boolean {
  return /\n/.test(s) && s.trim() === ""
}

function renderElement(
  el: JSXElement,
  ctx: CompileCtx,
  path: number[],
): string | null {
  const nameNode = el.opening.name
  if (nameNode.type !== "Identifier") return null
  const name = (nameNode as Identifier).value

  // PascalCase component — emit as a ComponentSlot.
  if (!isHostTag(name)) {
    const slot = buildComponentSlot(el, ctx, path)
    if (slot === null) return null
    ctx.slots.push(slot)
    return "<!>"
  }

  const attrs = renderAttributes(el.opening.attributes, ctx, path)
  if (attrs === null) return null

  if (VOID_ELEMENTS.has(name)) {
    if (el.children.length > 0) return null
    return `<${name}${attrs}>`
  }

  const significantChildren = el.children.filter(
    (c) => !(c.type === "JSXText" && isCollapsibleJsxWhitespace(c.value)),
  )
  const soleDynamicChild =
    significantChildren.length === 1 &&
    significantChildren[0]!.type === "JSXExpressionContainer"

  const children = renderChildren(
    el.children,
    ctx,
    path,
    soleDynamicChild,
  )
  if (children === null) return null

  return `<${name}${attrs}>${children}</${name}>`
}

function buildComponentSlot(
  el: JSXElement,
  ctx: CompileCtx,
  path: number[],
): IRComponentSlot | null {
  const nameNode = el.opening.name
  if (nameNode.type !== "Identifier") return null
  if (el.children.length > 0) return null
  const componentRef = (nameNode as Identifier).value

  const pc = printCtx(ctx)
  const props: IRComponentSlot["props"] = []
  const depsSet = new Set<string>()
  const allDeps: string[] = []
  const recordDeps = (deps: string[]): void => {
    for (const d of deps) {
      if (depsSet.has(d)) continue
      depsSet.add(d)
      allDeps.push(d)
    }
  }

  for (const attr of el.opening.attributes) {
    if (attr.type === "SpreadElement") {
      const expr = attr.arguments
      const deps = collectPropRefs(expr, ctx.destructured)
      const src = printExpr(expr, pc)
      recordDeps(deps)
      props.push({ kind: "spread", valueSrc: src, deps })
      continue
    }
    if (attr.type !== "JSXAttribute") return null
    const a = attr as JSXAttribute
    if (a.name.type !== "Identifier") return null
    const propName = (a.name as Identifier).value
    const value = a.value
    let src: string
    let deps: string[] = []
    if (value === undefined) {
      src = "true"
    } else if (value.type === "StringLiteral") {
      src = JSON.stringify(value.value)
    } else if (value.type === "JSXExpressionContainer") {
      const expr = value.expression
      if (expr.type === "JSXEmptyExpression") return null
      deps = collectPropRefs(expr as Expression, ctx.destructured)
      src = printExpr(expr as Expression, pc)
    } else {
      return null
    }
    recordDeps(deps)
    props.push({ kind: "prop", name: propName, valueSrc: src, deps })
  }

  return { kind: "component", path, componentRef, props, allDeps }
}

function renderChildren(
  children: JSXElementChild[],
  ctx: CompileCtx,
  parentPath: number[],
  soleDynamicChild: boolean,
): string | null {
  let html = ""
  let childIndex = 0
  for (const child of children) {
    if (
      child.type === "JSXText" &&
      isCollapsibleJsxWhitespace(child.value)
    ) {
      continue
    }
    const result = renderChild(
      child,
      ctx,
      [...parentPath, childIndex],
      soleDynamicChild,
    )
    if (result === null) return null
    html += result
    childIndex++
  }
  return html
}

function renderChild(
  child: JSXElementChild,
  ctx: CompileCtx,
  path: number[],
  isSole: boolean,
): string | null {
  switch (child.type) {
    case "JSXText":
      return htmlEscapeText(child.value)
    case "JSXElement":
      return renderElement(child as JSXElement, ctx, path)
    case "JSXExpressionContainer": {
      const expr = child.expression
      if (expr.type === "JSXEmptyExpression") return ""
      // Try keyed list (`arr.map(item => <Row .../>)`) before falling
      // back to text slot. Lists emit a marker comment so mount can
      // splice in the _mountList output in its place.
      const listSlot = resolveListExpr(expr as Expression, ctx, path)
      if (listSlot !== null) {
        ctx.slots.push(listSlot)
        return "<!>"
      }
      return renderTextSlot(expr as Expression, ctx, path, isSole)
    }
    default:
      return null
  }
}

function renderTextSlot(
  expr: Expression,
  ctx: CompileCtx,
  path: number[],
  isSole: boolean,
): string | null {
  // Supported shapes: bare identifier (destructured) or props.<name>.
  // Anything else (call, ternary, template, binary) bails for now.
  let propName: string | null = null
  if (
    expr.type === "Identifier" &&
    ctx.destructured !== null &&
    ctx.destructured.has((expr as Identifier).value)
  ) {
    propName = (expr as Identifier).value
  } else if (
    expr.type === "MemberExpression" &&
    expr.object.type === "Identifier" &&
    (expr.object as Identifier).value === "props" &&
    expr.property.type === "Identifier"
  ) {
    propName = (expr.property as Identifier).value
  }
  if (propName === null) return null
  const slot: IRTextSlot = {
    kind: "text",
    path,
    propName,
    placeholder: isSole ? "prealloc" : "marker",
  }
  ctx.slots.push(slot)
  return isSole ? " " : "<!>"
}

function renderAttributes(
  attrs: JSXAttributeOrSpread[],
  ctx: CompileCtx,
  elementPath: number[],
): string | null {
  let out = ""
  for (const attr of attrs) {
    if (attr.type !== "JSXAttribute") return null
    const a = attr as JSXAttribute
    if (a.name.type !== "Identifier") return null
    const rawName = (a.name as Identifier).value
    const attrName = rawName === "className" ? "class" : rawName

    const value = a.value
    if (value === undefined) {
      out += ` ${attrName}`
      continue
    }
    if (value.type === "StringLiteral") {
      out += ` ${attrName}="${htmlEscapeAttr(value.value)}"`
      continue
    }
    if (value.type !== "JSXExpressionContainer") return null
    const expr = value.expression
    if (expr.type === "JSXEmptyExpression") return null

    // Event handler (onX) → EventSlot.
    if (rawName.startsWith("on") && rawName.length > 2) {
      const eventName = rawName.slice(2).toLowerCase()
      const domProp = `on${eventName}`
      const propName = extractPropName(expr as Expression, ctx)
      if (propName === null) return null
      const slot: IREventSlot = {
        kind: "event",
        path: elementPath,
        domProp,
        propName,
      }
      ctx.slots.push(slot)
      continue
    }

    // Ternary of string literals: `className={cond ? "a" : "b"}`. The
    // emitter inlines the ternary with a single prop dep; this fast path
    // avoids composite evaluation entirely.
    const ternary = resolveTernaryAttr(expr as Expression, ctx)
    if (ternary !== null) {
      const strategy = rawName === "className" ? "className" : "setAttribute"
      const slot: IRAttrSlot = {
        kind: "attr",
        path: elementPath,
        attrName,
        strategy,
        propName: ternary.propName,
        ternary: { ifTrue: ternary.ifTrue, ifFalse: ternary.ifFalse },
      }
      ctx.slots.push(slot)
      continue
    }

    // Dynamic attr → AttrSlot.
    const propName = extractPropName(expr as Expression, ctx)
    if (propName === null) return null
    const strategy = rawName === "className" ? "className" : "setAttribute"
    const slot: IRAttrSlot = {
      kind: "attr",
      path: elementPath,
      attrName,
      strategy,
      propName,
    }
    ctx.slots.push(slot)
  }
  return out
}

/**
 * Detect `arr.map(item => <Row .../>)` where `arr` is a parent prop and the
 * callback returns a single PascalCase JSX element. Every non-key attribute
 * is printed as a source string (with the item param bound so destructured
 * rewrites skip it). Parent prop deps are collected across all values and
 * key so the runtime dirty-check can observe them.
 *
 * Returns a complete `IRListSlot` (caller pushes to `ctx.slots`). Returns
 * null for anything outside the grammar so callers fall through.
 */
function resolveListExpr(
  expr: Expression,
  ctx: CompileCtx,
  path: number[],
): IRListSlot | null {
  if (expr.type !== "CallExpression") return null
  const call = expr as CallExpression
  if (call.callee.type !== "MemberExpression") return null
  const callee = call.callee as MemberExpression
  if (callee.property.type !== "Identifier") return null
  if ((callee.property as Identifier).value !== "map") return null
  if (call.arguments.length !== 1) return null

  const arrayObj = callee.object
  let arrayPropName: string | null = null
  if (arrayObj.type === "Identifier") {
    const name = (arrayObj as Identifier).value
    if (ctx.destructured === null || !ctx.destructured.has(name)) return null
    arrayPropName = name
  } else if (
    arrayObj.type === "MemberExpression" &&
    (arrayObj as MemberExpression).object.type === "Identifier" &&
    ((arrayObj as MemberExpression).object as Identifier).value === "props" &&
    (arrayObj as MemberExpression).property.type === "Identifier"
  ) {
    arrayPropName = ((arrayObj as MemberExpression).property as Identifier)
      .value
  } else {
    return null
  }

  const cbArg = call.arguments[0]!
  if (cbArg.spread !== undefined && cbArg.spread !== null) return null
  const cb = cbArg.expression
  if (cb.type !== "ArrowFunctionExpression") return null
  const arrow = cb as ArrowFunctionExpression
  if (arrow.params.length !== 1) return null
  const param = arrow.params[0]!
  if (param.type !== "Identifier") return null
  const itemParamName = (param as Identifier).value

  let body: Expression
  if (arrow.body.type === "BlockStatement") {
    const stmts = arrow.body.stmts
    if (stmts.length !== 1) return null
    const stmt = stmts[0]!
    if (stmt.type !== "ReturnStatement") return null
    if (stmt.argument === undefined) return null
    body = stmt.argument
  } else {
    body = arrow.body as Expression
  }
  while (body.type === "ParenthesisExpression") {
    body = (body as { expression: Expression }).expression
  }
  if (body.type !== "JSXElement") return null
  const childEl = body as JSXElement
  const nameNode = childEl.opening.name
  if (nameNode.type !== "Identifier") return null
  const componentRef = (nameNode as Identifier).value
  if (isHostTag(componentRef)) return null
  if (childEl.children.length > 0) return null

  const bound = new Set<string>([itemParamName])
  const pc: PrintContext = { destructured: ctx.destructured, bound }

  let keySrc: string | null = null
  const propSpecs: IRListSlot["propSpecs"] = []
  const depsSet = new Set<string>()
  const parentPropDeps: string[] = []
  const recordDeps = (deps: string[]): void => {
    for (const d of deps) {
      if (depsSet.has(d)) continue
      depsSet.add(d)
      parentPropDeps.push(d)
    }
  }

  for (const attr of childEl.opening.attributes) {
    if (attr.type !== "JSXAttribute") return null
    const a = attr as JSXAttribute
    if (a.name.type !== "Identifier") return null
    const propName = (a.name as Identifier).value
    const value = a.value
    let valueSrc: string
    if (value === undefined) {
      valueSrc = "true"
    } else if (value.type === "StringLiteral") {
      valueSrc = JSON.stringify(value.value)
    } else if (value.type === "JSXExpressionContainer") {
      const e = value.expression
      if (e.type === "JSXEmptyExpression") return null
      const exprNode = e as Expression
      try {
        valueSrc = printExpr(exprNode, pc)
      } catch {
        return null
      }
      recordDeps(collectPropRefs(exprNode, ctx.destructured, bound))
    } else {
      return null
    }
    if (propName === "key") {
      keySrc = valueSrc
    } else {
      propSpecs.push({ name: propName, valueSrc })
    }
  }
  if (keySrc === null) return null

  // Detect propSpecs of form `<keySrc> === props.<X>` so the runtime can
  // skip the full row iteration when only those parent deps change. This
  // mirrors the babel-plugin's logic. SWC's IR is source-string-based, so
  // we compare normalized source (whitespace-stripped) instead of AST
  // structural equivalence.
  const normalizedKey = keySrc.replace(/\s+/g, "")
  const selectionDepSet = new Set<number>()
  for (const spec of propSpecs) {
    const m = spec.valueSrc.match(/^(.+?)\s*===\s*(.+?)$/)
    if (m === null) continue
    const lhs = m[1]!.replace(/\s+/g, "")
    const rhs = m[2]!.replace(/\s+/g, "")
    let depName: string | null = null
    const propMatch = (s: string): string | null => {
      const pm = s.match(/^props\.([A-Za-z_$][\w$]*)$/)
      return pm === null ? null : pm[1]!
    }
    if (lhs === normalizedKey) depName = propMatch(rhs)
    else if (rhs === normalizedKey) depName = propMatch(lhs)
    if (depName === null) continue
    const idx = parentPropDeps.indexOf(depName)
    if (idx >= 0) selectionDepSet.add(idx)
  }
  const selectionDepIndices: number[] = []
  for (let i = 0; i < parentPropDeps.length; i++) {
    if (selectionDepSet.has(i)) selectionDepIndices.push(i)
  }

  return {
    kind: "list",
    path,
    componentRef,
    arrayPropName,
    itemParamName,
    keySrc,
    propSpecs,
    parentPropDeps,
    selectionDepIndices,
    tailOfParent: false,
  }
}

/**
 * Detect `cond ? "a" : "b"` where both branches are StringLiterals and the
 * test is a prop reference. Returns `{propName, ifTrue, ifFalse}` or null.
 */
function resolveTernaryAttr(
  expr: Expression,
  ctx: CompileCtx,
): { propName: string; ifTrue: string; ifFalse: string } | null {
  if (expr.type !== "ConditionalExpression") return null
  const ce = expr as ConditionalExpression
  if (ce.consequent.type !== "StringLiteral") return null
  if (ce.alternate.type !== "StringLiteral") return null
  const propName = extractPropName(ce.test as Expression, ctx)
  if (propName === null) return null
  return {
    propName,
    ifTrue: (ce.consequent as { value: string }).value,
    ifFalse: (ce.alternate as { value: string }).value,
  }
}

function extractPropName(expr: Expression, ctx: CompileCtx): string | null {
  if (
    expr.type === "Identifier" &&
    ctx.destructured !== null &&
    ctx.destructured.has((expr as Identifier).value)
  ) {
    return (expr as Identifier).value
  }
  if (
    expr.type === "MemberExpression" &&
    expr.object.type === "Identifier" &&
    (expr.object as Identifier).value === "props" &&
    expr.property.type === "Identifier"
  ) {
    return (expr.property as Identifier).value
  }
  return null
}

/**
 * Helper so callers can check the function-declaration name matches the
 * PascalCase convention before attempting compilation.
 */
export function isPascalCase(name: string): boolean {
  const first = name.charCodeAt(0)
  return first >= 65 && first <= 90
}

// Re-export the Pattern type so tests / callers that need SWC types can
// import it through this package rather than pulling @swc/types directly.
export type { FunctionDeclaration, Pattern }
