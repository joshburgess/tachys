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
 * Composite slot value: a template literal whose expressions have all been
 * normalized so bare destructured identifiers become `props.<name>`. Carries
 * the list of reactive prop refs so patch knows which props to diff before
 * re-evaluating the expression.
 */
export interface CompositeExpr {
  expr: BabelCore.types.TemplateLiteral
  /** Unique prop names referenced, in stable order. */
  propNames: string[]
}

/**
 * A dynamic insertion point in the compiled template. `path` is a chain of
 * DOM child indices from the root element; the mount code walks this path
 * at instance creation to locate the placeholder node.
 */
export interface TextSlot {
  kind: "text"
  /** DOM child-index path from the template root. */
  path: number[]
  /**
   * Name on `props` to read (post-normalization of destructured params).
   * For composite slots this is the first prop name referenced -- kept as
   * the primary grouping key.
   */
  propName: string
  /**
   * Present when the slot value is a template literal that reads one or
   * more props. Mount emits the template literal inline; patch diffs all
   * referenced props together.
   */
  composite?: CompositeExpr
  /**
   * How the template carries the placeholder:
   *   - "marker": the template emits `<!>` and mount swaps it for a
   *     freshly-created text node via replaceChild.
   *   - "prealloc": the template emits a space character so the parser
   *     pre-allocates a text node; mount just navigates to it and
   *     writes `.data = ...`.
   *
   * "prealloc" is safe only when the slot has no adjacent JSXText
   * siblings (otherwise the parser would merge them into one text node).
   */
  placeholder: "marker" | "prealloc"
}

/**
 * A dynamic attribute on an element. `path` is the path to the element
 * itself (not a child). `attrName` is the HTML attribute name (e.g.,
 * "class", "id"). `strategy` picks how the mount/patch writes the value:
 *   - "className" uses the fast `.className =` assignment.
 *   - "setAttribute" falls back to generic `setAttribute(name, value)`.
 */
export interface AttrSlot {
  kind: "attr"
  path: number[]
  attrName: string
  strategy: "className" | "setAttribute"
  propName: string
  /**
   * Present when the value is a ConditionalExpression whose branches are
   * both StringLiteral. Mount/patch emit `props.x ? "a" : "b"` instead of
   * `String(props.x)`. Common for the `className={selected ? "danger" : ""}`
   * Krausest pattern.
   */
  ternary?: { ifTrue: string; ifFalse: string }
  /**
   * Present when the value is a template literal reading one or more props.
   * Takes precedence over `ternary`.
   */
  composite?: CompositeExpr
}

/**
 * A dynamic event listener on an element. `domProp` is the lowercased
 * DOM property name (e.g., "onclick"). Assigning directly to the
 * property replaces any prior listener, so patch can re-bind cheaply.
 */
export interface EventSlot {
  kind: "event"
  path: number[]
  domProp: string
  propName: string
}

export type Slot = TextSlot | AttrSlot | EventSlot

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

  const attrs = renderAttributes(el.openingElement.attributes, ctx, parentPath)
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
  ctx: CompileContext,
  elementPath: number[],
): string | null {
  const t = ctx.t
  let out = ""
  for (const attr of attrs) {
    if (!t.isJSXAttribute(attr)) return null
    const attrName = attr.name
    if (!t.isJSXIdentifier(attrName)) return null
    const jsxName = attrName.name
    const htmlName = jsxAttrNameToHtml(jsxName)
    const value = attr.value

    if (value === null || value === undefined) {
      out += ` ${htmlName}`
      continue
    }

    if (t.isStringLiteral(value)) {
      out += ` ${htmlName}="${escapeAttr(value.value)}"`
      continue
    }

    if (t.isJSXExpressionContainer(value)) {
      const expr = value.expression

      // Literal expressions with no prop dependency bake directly into
      // the template HTML at compile time, matching what a plain string
      // attribute would do. Event attrs reject literals (nonsensical).
      if (t.isStringLiteral(expr) || t.isNumericLiteral(expr)) {
        if (isEventAttrName(jsxName)) return null
        const literal = t.isStringLiteral(expr)
          ? expr.value
          : String(expr.value)
        out += ` ${htmlName}="${escapeAttr(literal)}"`
        continue
      }

      const ternary = resolveTernaryAttr(expr, ctx)
      if (ternary !== null) {
        if (isEventAttrName(jsxName)) return null
        const strategy: "className" | "setAttribute" =
          jsxName === "className" || jsxName === "class"
            ? "className"
            : "setAttribute"
        ctx.slots.push({
          kind: "attr",
          path: elementPath,
          attrName: htmlName,
          strategy,
          propName: ternary.propName,
          ternary: { ifTrue: ternary.ifTrue, ifFalse: ternary.ifFalse },
        })
        continue
      }

      const composite = resolveTemplateExpr(expr, ctx)
      if (composite !== null) {
        if (isEventAttrName(jsxName)) return null
        const strategy: "className" | "setAttribute" =
          jsxName === "className" || jsxName === "class"
            ? "className"
            : "setAttribute"
        ctx.slots.push({
          kind: "attr",
          path: elementPath,
          attrName: htmlName,
          strategy,
          propName: composite.propNames[0]!,
          composite,
        })
        continue
      }

      const propName = resolvePropExpr(expr, ctx)
      if (propName === null) return null

      if (isEventAttrName(jsxName)) {
        ctx.slots.push({
          kind: "event",
          path: elementPath,
          domProp: jsxName.toLowerCase(),
          propName,
        })
        continue
      }

      const strategy: "className" | "setAttribute" =
        jsxName === "className" || jsxName === "class"
          ? "className"
          : "setAttribute"
      ctx.slots.push({
        kind: "attr",
        path: elementPath,
        attrName: htmlName,
        strategy,
        propName,
      })
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

function isEventAttrName(name: string): boolean {
  if (name.length < 3) return false
  if (name.charCodeAt(0) !== 111) return false // 'o'
  if (name.charCodeAt(1) !== 110) return false // 'n'
  const third = name.charCodeAt(2)
  return third >= 65 && third <= 90
}

type EffectiveChild =
  | { kind: "text"; value: string }
  | { kind: "element"; node: BabelCore.types.JSXElement }
  | { kind: "expr"; node: BabelCore.types.JSXExpressionContainer }

function collectEffectiveChildren(
  children: Array<
    | BabelCore.types.JSXText
    | BabelCore.types.JSXExpressionContainer
    | BabelCore.types.JSXSpreadChild
    | BabelCore.types.JSXElement
    | BabelCore.types.JSXFragment
  >,
  t: T,
): EffectiveChild[] | null {
  const out: EffectiveChild[] = []
  for (const child of children) {
    if (t.isJSXText(child)) {
      const normalized = normalizeJsxText(child.value)
      if (normalized === "") continue
      out.push({ kind: "text", value: normalized })
      continue
    }
    if (t.isJSXElement(child)) {
      out.push({ kind: "element", node: child })
      continue
    }
    if (t.isJSXExpressionContainer(child)) {
      out.push({ kind: "expr", node: child })
      continue
    }
    return null
  }
  return out
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
  const effective = collectEffectiveChildren(children, ctx.t)
  if (effective === null) return null

  let out = ""
  for (let i = 0; i < effective.length; i++) {
    const child = effective[i]!

    if (child.kind === "text") {
      out += escapeText(child.value)
      continue
    }

    if (child.kind === "element") {
      const nested = renderElement(child.node, ctx, [...parentPath, i])
      if (nested === null) return null
      out += nested
      continue
    }

    if (child.kind === "expr") {
      const composite = resolveTemplateExpr(child.node.expression, ctx)
      const propName =
        composite !== null
          ? composite.propNames[0]!
          : resolvePropExpr(child.node.expression, ctx)
      if (propName === null) return null

      const prev = i > 0 ? effective[i - 1]! : null
      const next = i < effective.length - 1 ? effective[i + 1]! : null
      // Prealloc requires both neighbors (if any) to be elements: two
      // adjacent text-like things (JSXText or another ExpressionContainer
      // using a space placeholder) would collapse into a single merged
      // text node during HTML parsing.
      const isBlocking = (c: EffectiveChild | null): boolean =>
        c !== null && c.kind !== "element"
      const canPrealloc = !isBlocking(prev) && !isBlocking(next)

      if (canPrealloc) {
        // Pre-allocated text node placeholder: mount writes .data directly.
        // A single space is enough; the parser yields one text child. The
        // space is overwritten in mount before the component is inserted.
        ctx.slots.push({
          kind: "text",
          path: [...parentPath, i],
          propName,
          placeholder: "prealloc",
          ...(composite !== null ? { composite } : {}),
        })
        out += " "
      } else {
        // Marker path: emit a comment, mount swaps it for a text node.
        ctx.slots.push({
          kind: "text",
          path: [...parentPath, i],
          propName,
          placeholder: "marker",
          ...(composite !== null ? { composite } : {}),
        })
        out += "<!>"
      }
    }
  }
  return out
}

/**
 * Detect `props.x ? "a" : "b"` (or `x ? "a" : "b"` under destructuring).
 * Both branches must be StringLiteral. Returns the prop name plus the two
 * branch values so the caller can emit a conditional expression inline.
 */
function resolveTernaryAttr(
  expr:
    | BabelCore.types.Expression
    | BabelCore.types.JSXEmptyExpression,
  ctx: CompileContext,
): { propName: string; ifTrue: string; ifFalse: string } | null {
  const t = ctx.t
  if (!t.isConditionalExpression(expr)) return null
  const consequent = expr.consequent
  const alternate = expr.alternate
  if (!t.isStringLiteral(consequent)) return null
  if (!t.isStringLiteral(alternate)) return null
  const propName = resolvePropExpr(expr.test, ctx)
  if (propName === null) return null
  return {
    propName,
    ifTrue: consequent.value,
    ifFalse: alternate.value,
  }
}

/**
 * Detect a template literal whose embedded expressions are all prop refs.
 * Returns a normalized TemplateLiteral node (destructured names rewritten
 * to `props.<name>`) plus the list of referenced prop names. Returns null
 * for anything outside that shape so the caller can fall through to the
 * simple single-prop path or bail.
 */
function resolveTemplateExpr(
  expr:
    | BabelCore.types.Expression
    | BabelCore.types.JSXEmptyExpression,
  ctx: CompileContext,
): CompositeExpr | null {
  const t = ctx.t
  if (!t.isTemplateLiteral(expr)) return null

  const propNames: string[] = []
  const seen = new Set<string>()
  const normalizedExprs: BabelCore.types.Expression[] = []
  for (const sub of expr.expressions) {
    if (t.isTSType(sub)) return null
    const propName = resolvePropExpr(
      sub as BabelCore.types.Expression,
      ctx,
    )
    if (propName === null) return null
    if (!seen.has(propName)) {
      seen.add(propName)
      propNames.push(propName)
    }
    // Normalize bare destructured identifier to `props.<name>`. Member
    // expression (`props.x`) can be reused as-is.
    if (t.isIdentifier(sub)) {
      normalizedExprs.push(
        t.memberExpression(t.identifier("props"), t.identifier(propName)),
      )
    } else {
      normalizedExprs.push(sub as BabelCore.types.Expression)
    }
  }

  const tpl = t.templateLiteral(expr.quasis, normalizedExprs)
  return { expr: tpl, propNames }
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
