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
   * both string-or-null. `null` (also `false` / `undefined`) means "omit
   * the attribute on mount and clear it on patch" so the bench source can
   * write `className={selected ? "danger" : null}` and avoid the per-row
   * `class=""` write that otherwise costs paint time on Krausest 08.
   */
  ternary?: { ifTrue: string | null; ifFalse: string | null }
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

/**
 * A child compiled component slot. The parent's template carries a `<!>`
 * marker at the child's position; mount replaces it with the child's
 * mounted root. The child's own `.patch` handles per-render updates.
 *
 * Each prop is stored as the resolved expression (destructured params
 * rewritten to `props.<name>`) plus the list of parent prop names it
 * reads, so the parent can dirty-check before rebuilding the child props
 * object and calling `Child.patch`.
 */
/**
 * One entry in a child component's prop list. Spread entries emit
 * `...value` into the resulting object literal; explicit entries emit
 * `name: value`. Source order is preserved so later explicit keys can
 * override earlier spreads (matching the runtime JSX semantics).
 */
export type ChildPropEntry =
  | {
      kind: "prop"
      name: string
      valueExpr: BabelCore.types.Expression
      /** Parent prop names this value reads; empty for literals. */
      deps: string[]
    }
  | {
      kind: "spread"
      valueExpr: BabelCore.types.Expression
      /** Parent prop names the spread source reads. */
      deps: string[]
    }

export interface ComponentSlot {
  kind: "component"
  path: number[]
  /** Local name of the component being rendered (e.g. "Row"). */
  componentRef: string
  /** Ordered prop entries to pass to the child on mount/patch. */
  props: ChildPropEntry[]
  /** Union of all prop deps, deduped and in first-seen order. */
  allDeps: string[]
}

/**
 * A keyed list of compiled child components rendered from `{arr.map(...)}`.
 * The parent template carries a `<!>` marker at the list's position that
 * serves as the DOM anchor: `_mountList` inserts each child before it, and
 * `_patchList` reconciles order without disturbing surrounding siblings.
 *
 * Props are split into `keyExpr` (the `key={...}` prop, required) and the
 * remaining entries. Each expression keeps the item param intact and has
 * any parent-scope identifiers rewritten to `props.<name>`. When no parent
 * prop is referenced the emitter can hoist the helpers to module scope;
 * when `parentPropDeps` is non-empty the closure is inlined at the call
 * site so it captures the live parent `props`.
 */
export interface ListSlot {
  kind: "list"
  path: number[]
  /** Local name of the child component (e.g. "Row"). */
  componentRef: string
  /** Parent prop name that holds the array. */
  arrayPropName: string
  /**
   * Parameter name the JSX source used for each item (e.g. `row`). The
   * emitted helpers rename this to a stable local, but callers reading the
   * ListSlot need the original for diagnostics.
   */
  itemParamName: string
  /** Key expression (from `key={...}`), with itemParam preserved as-is. */
  keyExpr: BabelCore.types.Expression
  /**
   * Ordered non-key prop entries. Each valueExpr references `itemParamName`
   * or `props.<name>` (parent-scope names are normalized to `props.*`).
   */
  propSpecs: Array<{
    name: string
    valueExpr: BabelCore.types.Expression
  }>
  /**
   * Parent prop names referenced across `keyExpr` + every `propSpecs` entry,
   * deduped in first-seen order. Empty for item-only lists.
   */
  parentPropDeps: string[]
  /**
   * Indices into `parentPropDeps` for parent props that participate in a
   * `<keyExpr> === <props.X>` propSpec. See IRListSlot.selectionDepIndices.
   */
  selectionDepIndices: number[]
  /**
   * True when this list is the last child of its parent template element.
   * In that case the compiler skips emitting the `<!>` marker for the list,
   * and `_mountList` receives the parent element directly instead of a
   * comment anchor; rows are appended via `parent.appendChild`. Saves one
   * DOM node per list and (more importantly) avoids the trailing comment
   * sibling that was inflating Chromium's PrePaint/Layout cycle on
   * mid-list `removeChild` (Krausest 06_remove-one-1k).
   */
  tailOfParent: boolean
}

/**
 * A conditional child rendered from `{cond && <Compiled prop={...}/>}`.
 * The parent template carries a `<!>` marker at the child's position.
 * On mount the runtime inserts the child before the marker iff `cond`
 * is truthy; on patch it mounts/unmounts as `cond` flips and dispatches
 * the child's own patch while it stays mounted.
 *
 * The ternary form (`cond ? <A/> : <B/>`) is not yet supported — only
 * the short-circuit `&&` grammar with a single compiled child on the
 * right is recognized.
 */
export interface CondSlot {
  kind: "cond"
  path: number[]
  /** Local name of the conditional child component. */
  componentRef: string
  /** Condition expression with parent prop names rewritten to `props.*`. */
  condExpr: BabelCore.types.Expression
  /** Parent prop names the cond reads (subset of allDeps). */
  condDeps: string[]
  /** Ordered prop entries passed to the child, mirroring ComponentSlot. */
  props: ChildPropEntry[]
  /** Union of condDeps + every prop's deps, deduped and in first-seen order. */
  allDeps: string[]
}

/**
 * A ternary conditional child rendered from
 * `{<cond> ? <A prop={...}/> : <B prop={...}/>}`. Exactly one of the two
 * branches is mounted at any time; cond flips swap the subtree.
 *
 * Each branch stores its own componentRef and resolved props entry list;
 * they may reference different compiled components or the same one with
 * different props shapes. `allDeps` is the union over cond + both sides.
 */
export interface AltSlot {
  kind: "alt"
  path: number[]
  /** Condition expression, parent prop names rewritten to `props.*`. */
  condExpr: BabelCore.types.Expression
  condDeps: string[]
  /** Truthy branch component + props. */
  refA: string
  propsA: ChildPropEntry[]
  /** Falsy branch component + props. */
  refB: string
  propsB: ChildPropEntry[]
  /** Union of all parent prop deps across cond + both branches. */
  allDeps: string[]
}

export type Slot =
  | TextSlot
  | AttrSlot
  | EventSlot
  | ComponentSlot
  | ListSlot
  | CondSlot
  | AltSlot

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

/**
 * Build a ComponentSlot for a PascalCase JSX child. Returns null if any
 * attribute is a spread, a non-literal non-prop-ref expression, or an
 * unsupported shape; the caller then falls back to the bail path.
 */
function buildComponentSlot(
  el: BabelCore.types.JSXElement,
  ctx: CompileContext,
  path: number[],
): ComponentSlot | null {
  const t = ctx.t
  const nameNode = el.openingElement.name
  if (!t.isJSXIdentifier(nameNode)) return null
  if (el.children.length > 0) return null

  const props: ChildPropEntry[] = []
  const depsSet = new Set<string>()
  const allDeps: string[] = []

  const recordDeps = (deps: string[]): void => {
    for (const dep of deps) {
      if (depsSet.has(dep)) continue
      depsSet.add(dep)
      allDeps.push(dep)
    }
  }

  for (const attr of el.openingElement.attributes) {
    if (t.isJSXSpreadAttribute(attr)) {
      const resolved = resolveChildPropExpr(attr.argument, ctx)
      if (resolved === null) return null
      recordDeps(resolved.deps)
      props.push({ kind: "spread", valueExpr: resolved.expr, deps: resolved.deps })
      continue
    }
    if (!t.isJSXAttribute(attr)) return null
    const attrName = attr.name
    if (!t.isJSXIdentifier(attrName)) return null
    const propName = attrName.name

    const value = attr.value
    let valueExpr: BabelCore.types.Expression | null = null
    let deps: string[] = []

    if (value === null || value === undefined) {
      valueExpr = t.booleanLiteral(true)
    } else if (t.isStringLiteral(value)) {
      valueExpr = t.stringLiteral(value.value)
    } else if (t.isJSXExpressionContainer(value)) {
      const expr = value.expression
      if (t.isJSXEmptyExpression(expr)) return null
      const resolved = resolveChildPropExpr(expr, ctx)
      if (resolved === null) return null
      valueExpr = resolved.expr
      deps = resolved.deps
    } else {
      return null
    }

    recordDeps(deps)
    props.push({ kind: "prop", name: propName, valueExpr: valueExpr, deps })
  }

  return {
    kind: "component",
    path,
    componentRef: nameNode.name,
    props,
    allDeps,
  }
}

/**
 * Detect `arr.map(item => <Row .../>)` where `arr` is a parent prop and
 * the callback returns a single PascalCase JSX element whose attributes
 * reference only the item parameter (or literals). Requires a `key={...}`
 * attribute so the runtime helper can diff.
 *
 * Returns a ListSlot without `path` (caller fills it in). Returns null for
 * anything outside the grammar so the caller can fall through to other
 * expr-child handlers.
 */
function resolveListExpr(
  expr:
    | BabelCore.types.Expression
    | BabelCore.types.JSXEmptyExpression,
  ctx: CompileContext,
): Omit<ListSlot, "path"> | null {
  const t = ctx.t
  if (!t.isCallExpression(expr)) return null
  const callee = expr.callee
  if (!t.isMemberExpression(callee)) return null
  if (callee.computed) return null
  if (!t.isIdentifier(callee.property)) return null
  if (callee.property.name !== "map") return null
  if (expr.arguments.length !== 1) return null

  // Array source must be a parent prop reference.
  const arrayObj = callee.object
  let arrayPropName: string | null = null
  if (t.isIdentifier(arrayObj)) {
    if (
      ctx.destructuredNames === null ||
      !ctx.destructuredNames.has(arrayObj.name)
    ) {
      return null
    }
    arrayPropName = arrayObj.name
  } else if (
    t.isMemberExpression(arrayObj) &&
    t.isIdentifier(arrayObj.object) &&
    arrayObj.object.name === "props" &&
    t.isIdentifier(arrayObj.property) &&
    !arrayObj.computed
  ) {
    arrayPropName = arrayObj.property.name
  } else {
    return null
  }

  // Callback must be a single-param arrow whose body is a JSX element.
  const cb = expr.arguments[0]!
  if (!t.isArrowFunctionExpression(cb)) return null
  if (cb.params.length !== 1) return null
  const param = cb.params[0]!
  if (!t.isIdentifier(param)) return null
  const itemParamName = param.name
  let body: BabelCore.types.Node = cb.body
  if (t.isBlockStatement(body)) {
    if (body.body.length !== 1) return null
    const stmt = body.body[0]!
    if (!t.isReturnStatement(stmt)) return null
    if (stmt.argument === null || stmt.argument === undefined) return null
    body = stmt.argument
  }
  if (!t.isJSXElement(body)) return null
  const childEl = body
  const nameNode = childEl.openingElement.name
  if (!t.isJSXIdentifier(nameNode)) return null
  const componentRef = nameNode.name
  if (isHostTag(componentRef)) return null
  if (childEl.children.length > 0) return null

  // Every attribute value must reference only the item param, literals, or
  // parent-scope props (destructured names or `props.*` chains). Parent
  // refs are rewritten to `props.<name>` and recorded as deps so the
  // dirty-check path observes them.
  let keyExpr: BabelCore.types.Expression | null = null
  const propSpecs: ListSlot["propSpecs"] = []
  const parentSeen = new Set<string>()
  const parentPropDeps: string[] = []
  for (const attr of childEl.openingElement.attributes) {
    if (!t.isJSXAttribute(attr)) return null
    if (!t.isJSXIdentifier(attr.name)) return null
    const propName = attr.name.name
    const value = attr.value
    let valueExpr: BabelCore.types.Expression
    if (value === null || value === undefined) {
      valueExpr = t.booleanLiteral(true)
    } else if (t.isStringLiteral(value)) {
      valueExpr = t.stringLiteral(value.value)
    } else if (t.isJSXExpressionContainer(value)) {
      const e = value.expression
      if (t.isJSXEmptyExpression(e)) return null
      const resolved = resolveListItemExpr(e, itemParamName, ctx)
      if (resolved === null) return null
      for (const d of resolved.deps) {
        if (parentSeen.has(d)) continue
        parentSeen.add(d)
        parentPropDeps.push(d)
      }
      valueExpr = resolved.expr
    } else {
      return null
    }
    if (propName === "key") {
      keyExpr = valueExpr
    } else {
      propSpecs.push({ name: propName, valueExpr })
    }
  }
  if (keyExpr === null) return null

  // Detect propSpecs of form `<keyExpr> === props.<X>` (or symmetric). When
  // parent prop X changes, only the row whose key equals the old or new
  // value of X can have its boolean prop flip; the rest are unchanged.
  // This lets the runtime skip the full row iteration when only such
  // "selection" deps changed.
  const selectionDepSet = new Set<number>()
  for (const spec of propSpecs) {
    const ve = spec.valueExpr
    if (!t.isBinaryExpression(ve)) continue
    if (ve.operator !== "===" && ve.operator !== "==") continue
    const lhs = ve.left
    const rhs = ve.right
    let depName: string | null = null
    if (
      t.isExpression(lhs) &&
      t.isNodesEquivalent(lhs, keyExpr) &&
      isParentPropRef(rhs, t)
    ) {
      depName = (rhs as BabelCore.types.MemberExpression).property
        ? ((rhs as BabelCore.types.MemberExpression).property as BabelCore.types.Identifier).name
        : null
    } else if (
      t.isExpression(rhs) &&
      t.isNodesEquivalent(rhs, keyExpr) &&
      isParentPropRef(lhs, t)
    ) {
      depName = (lhs as BabelCore.types.MemberExpression).property
        ? ((lhs as BabelCore.types.MemberExpression).property as BabelCore.types.Identifier).name
        : null
    }
    if (depName === null) continue
    const idx = parentPropDeps.indexOf(depName)
    if (idx < 0) continue
    selectionDepSet.add(idx)
  }
  const selectionDepIndices: number[] = []
  for (let i = 0; i < parentPropDeps.length; i++) {
    if (selectionDepSet.has(i)) selectionDepIndices.push(i)
  }

  return {
    kind: "list",
    componentRef,
    arrayPropName,
    itemParamName,
    keyExpr,
    propSpecs,
    parentPropDeps,
    selectionDepIndices,
    tailOfParent: false,
  }
}

function isParentPropRef(
  node: BabelCore.types.Node,
  t: typeof BabelCore.types,
): boolean {
  if (!t.isMemberExpression(node)) return false
  if (node.computed) return false
  if (!t.isIdentifier(node.object) || node.object.name !== "props") return false
  if (!t.isIdentifier(node.property)) return false
  return true
}

/**
 * Resolve one branch of a conditional child JSX element into a
 * `{ componentRef, props, deps }` triple, appending its deps into the
 * caller's dedup tracker. Used by both CondSlot (single branch) and
 * AltSlot (two branches sharing a dep set).
 */
function resolveBranchElement(
  el: BabelCore.types.JSXElement,
  ctx: CompileContext,
  depsSet: Set<string>,
  allDeps: string[],
): {
  componentRef: string
  props: ChildPropEntry[]
} | null {
  const t = ctx.t
  const nameNode = el.openingElement.name
  if (!t.isJSXIdentifier(nameNode)) return null
  const componentRef = nameNode.name
  if (isHostTag(componentRef)) return null
  if (el.children.length > 0) return null

  const props: ChildPropEntry[] = []
  const recordDeps = (deps: string[]): void => {
    for (const d of deps) {
      if (depsSet.has(d)) continue
      depsSet.add(d)
      allDeps.push(d)
    }
  }
  for (const attr of el.openingElement.attributes) {
    if (t.isJSXSpreadAttribute(attr)) {
      const r = resolveChildPropExpr(attr.argument, ctx)
      if (r === null) return null
      recordDeps(r.deps)
      props.push({ kind: "spread", valueExpr: r.expr, deps: r.deps })
      continue
    }
    if (!t.isJSXAttribute(attr)) return null
    if (!t.isJSXIdentifier(attr.name)) return null
    const propName = attr.name.name
    const value = attr.value
    let valueExpr: BabelCore.types.Expression
    let deps: string[] = []
    if (value === null || value === undefined) {
      valueExpr = t.booleanLiteral(true)
    } else if (t.isStringLiteral(value)) {
      valueExpr = t.stringLiteral(value.value)
    } else if (t.isJSXExpressionContainer(value)) {
      const e = value.expression
      if (t.isJSXEmptyExpression(e)) return null
      const r = resolveChildPropExpr(e, ctx)
      if (r === null) return null
      valueExpr = r.expr
      deps = r.deps
    } else {
      return null
    }
    recordDeps(deps)
    props.push({ kind: "prop", name: propName, valueExpr, deps })
  }
  return { componentRef, props }
}

/**
 * Detect `<cond> && <Compiled prop={...}/>` where `<cond>` is resolvable
 * via `resolveChildPropExpr` (literals, prop refs, member chains, template
 * literals, or conditional expressions whose leaves are valid) and the
 * right-hand side is a single PascalCase JSX element with no children.
 *
 * Attribute values follow the same grammar as ComponentSlot. Returns a
 * CondSlot without `path` (caller fills it in), or null for anything
 * outside the grammar.
 */
function resolveCondExpr(
  expr:
    | BabelCore.types.Expression
    | BabelCore.types.JSXEmptyExpression,
  ctx: CompileContext,
): Omit<CondSlot, "path"> | null {
  const t = ctx.t
  if (!t.isLogicalExpression(expr)) return null
  if (expr.operator !== "&&") return null

  const leftResolved = resolveChildPropExpr(
    expr.left as BabelCore.types.Expression,
    ctx,
  )
  if (leftResolved === null) return null

  const right = expr.right
  if (!t.isJSXElement(right)) return null

  const depsSet = new Set<string>()
  const allDeps: string[] = []
  for (const d of leftResolved.deps) {
    if (depsSet.has(d)) continue
    depsSet.add(d)
    allDeps.push(d)
  }

  const branch = resolveBranchElement(right, ctx, depsSet, allDeps)
  if (branch === null) return null

  return {
    kind: "cond",
    componentRef: branch.componentRef,
    condExpr: leftResolved.expr,
    condDeps: leftResolved.deps,
    props: branch.props,
    allDeps,
  }
}

/**
 * Detect `<cond> ? <A prop={...}/> : <B prop={...}/>`. Both branches must
 * be PascalCase JSX elements with no children and only supported attribute
 * shapes. Returns an AltSlot without `path` (caller fills it in), or null
 * for anything outside the grammar.
 */
function resolveAltExpr(
  expr:
    | BabelCore.types.Expression
    | BabelCore.types.JSXEmptyExpression,
  ctx: CompileContext,
): Omit<AltSlot, "path"> | null {
  const t = ctx.t
  if (!t.isConditionalExpression(expr)) return null

  const testResolved = resolveChildPropExpr(expr.test, ctx)
  if (testResolved === null) return null

  const cons = expr.consequent
  const alt = expr.alternate
  if (!t.isJSXElement(cons) || !t.isJSXElement(alt)) return null

  const depsSet = new Set<string>()
  const allDeps: string[] = []
  for (const d of testResolved.deps) {
    if (depsSet.has(d)) continue
    depsSet.add(d)
    allDeps.push(d)
  }

  const branchA = resolveBranchElement(cons, ctx, depsSet, allDeps)
  if (branchA === null) return null
  const branchB = resolveBranchElement(alt, ctx, depsSet, allDeps)
  if (branchB === null) return null

  return {
    kind: "alt",
    condExpr: testResolved.expr,
    condDeps: testResolved.deps,
    refA: branchA.componentRef,
    propsA: branchA.props,
    refB: branchB.componentRef,
    propsB: branchB.props,
    allDeps,
  }
}

/**
 * Resolve an expression used inside `arr.map(item => <Row .../>)` for a
 * single attribute or key value. Accepts literals, the item param (and
 * member chains rooted on it), template literals, conditional/binary/
 * logical/unary combinations of these, plus parent-scope identifiers
 * resolvable via `resolveChildPropExpr`. Parent refs get rewritten to
 * `props.<name>` and recorded as deps so the caller can mark the list
 * slot reactive to them.
 *
 * Returns null for anything outside this grammar.
 */
function resolveListItemExpr(
  expr: BabelCore.types.Expression,
  itemParam: string,
  ctx: CompileContext,
): { expr: BabelCore.types.Expression; deps: string[] } | null {
  const t = ctx.t

  if (
    t.isStringLiteral(expr) ||
    t.isNumericLiteral(expr) ||
    t.isBooleanLiteral(expr) ||
    t.isNullLiteral(expr)
  ) {
    return { expr, deps: [] }
  }

  if (t.isIdentifier(expr)) {
    if (expr.name === itemParam) return { expr, deps: [] }
    return resolveChildPropExpr(expr, ctx)
  }

  if (t.isMemberExpression(expr)) {
    if (expr.computed) return null
    let cursor: BabelCore.types.Expression = expr
    while (t.isMemberExpression(cursor)) {
      if (cursor.computed) return null
      cursor = cursor.object
    }
    if (t.isIdentifier(cursor) && cursor.name === itemParam) {
      return { expr, deps: [] }
    }
    return resolveChildPropExpr(expr, ctx)
  }

  if (t.isTemplateLiteral(expr)) {
    const parts: BabelCore.types.Expression[] = []
    const depSet = new Set<string>()
    const deps: string[] = []
    for (const sub of expr.expressions) {
      if (t.isTSType(sub)) return null
      const r = resolveListItemExpr(
        sub as BabelCore.types.Expression,
        itemParam,
        ctx,
      )
      if (r === null) return null
      parts.push(r.expr)
      for (const d of r.deps) {
        if (depSet.has(d)) continue
        depSet.add(d)
        deps.push(d)
      }
    }
    return { expr: t.templateLiteral(expr.quasis, parts), deps }
  }

  if (t.isConditionalExpression(expr)) {
    const test = resolveListItemExpr(expr.test, itemParam, ctx)
    const cons = resolveListItemExpr(expr.consequent, itemParam, ctx)
    const alt = resolveListItemExpr(expr.alternate, itemParam, ctx)
    if (test === null || cons === null || alt === null) return null
    const depSet = new Set<string>()
    const deps: string[] = []
    for (const d of [...test.deps, ...cons.deps, ...alt.deps]) {
      if (depSet.has(d)) continue
      depSet.add(d)
      deps.push(d)
    }
    return {
      expr: t.conditionalExpression(test.expr, cons.expr, alt.expr),
      deps,
    }
  }

  if (t.isBinaryExpression(expr)) {
    if (t.isPrivateName(expr.left)) return null
    const left = resolveListItemExpr(
      expr.left as BabelCore.types.Expression,
      itemParam,
      ctx,
    )
    const right = resolveListItemExpr(expr.right, itemParam, ctx)
    if (left === null || right === null) return null
    const depSet = new Set<string>()
    const deps: string[] = []
    for (const d of [...left.deps, ...right.deps]) {
      if (depSet.has(d)) continue
      depSet.add(d)
      deps.push(d)
    }
    return {
      expr: t.binaryExpression(expr.operator, left.expr, right.expr),
      deps,
    }
  }

  if (t.isLogicalExpression(expr)) {
    const left = resolveListItemExpr(expr.left, itemParam, ctx)
    const right = resolveListItemExpr(expr.right, itemParam, ctx)
    if (left === null || right === null) return null
    const depSet = new Set<string>()
    const deps: string[] = []
    for (const d of [...left.deps, ...right.deps]) {
      if (depSet.has(d)) continue
      depSet.add(d)
      deps.push(d)
    }
    return {
      expr: t.logicalExpression(expr.operator, left.expr, right.expr),
      deps,
    }
  }

  if (t.isUnaryExpression(expr)) {
    const arg = resolveListItemExpr(expr.argument, itemParam, ctx)
    if (arg === null) return null
    return {
      expr: t.unaryExpression(expr.operator, arg.expr, expr.prefix),
      deps: arg.deps,
    }
  }

  return null
}

/**
 * Resolve an expression used as a child-component prop value. Accepts
 * literals, bare prop identifiers, `props.*` member chains (arbitrary
 * depth), template literals, and conditional expressions whose branches
 * are themselves valid. Returns the normalized expression plus the list
 * of parent prop names it reads.
 *
 * Returns null for anything outside this grammar.
 */
function resolveChildPropExpr(
  expr: BabelCore.types.Expression,
  ctx: CompileContext,
): { expr: BabelCore.types.Expression; deps: string[] } | null {
  const t = ctx.t

  if (
    t.isStringLiteral(expr) ||
    t.isNumericLiteral(expr) ||
    t.isBooleanLiteral(expr) ||
    t.isNullLiteral(expr)
  ) {
    return { expr, deps: [] }
  }

  if (t.isIdentifier(expr)) {
    if (ctx.destructuredNames === null) return null
    if (!ctx.destructuredNames.has(expr.name)) return null
    return {
      expr: t.memberExpression(t.identifier("props"), t.identifier(expr.name)),
      deps: [expr.name],
    }
  }

  if (t.isMemberExpression(expr)) {
    // Walk to the root of a MemberExpression chain. Root must be either
    // `props` (kept as-is) or a destructured identifier (rewritten to
    // `props.<name>`).
    let cursor: BabelCore.types.Expression = expr
    while (t.isMemberExpression(cursor)) {
      if (cursor.computed) return null
      cursor = cursor.object
    }
    if (t.isIdentifier(cursor)) {
      if (cursor.name === "props") {
        const root = collectMemberRootDep(expr, t)
        return root === null ? null : { expr, deps: [root] }
      }
      if (
        ctx.destructuredNames !== null &&
        ctx.destructuredNames.has(cursor.name)
      ) {
        const depName = cursor.name
        const rewritten = rewriteMemberRoot(expr, t, depName)
        return { expr: rewritten, deps: [depName] }
      }
    }
    return null
  }

  if (t.isTemplateLiteral(expr)) {
    const parts: BabelCore.types.Expression[] = []
    const deps: string[] = []
    const seen = new Set<string>()
    for (const sub of expr.expressions) {
      if (t.isTSType(sub)) return null
      const r = resolveChildPropExpr(sub as BabelCore.types.Expression, ctx)
      if (r === null) return null
      parts.push(r.expr)
      for (const d of r.deps) {
        if (!seen.has(d)) {
          seen.add(d)
          deps.push(d)
        }
      }
    }
    return { expr: t.templateLiteral(expr.quasis, parts), deps }
  }

  if (t.isConditionalExpression(expr)) {
    const test = resolveChildPropExpr(expr.test, ctx)
    const cons = resolveChildPropExpr(expr.consequent, ctx)
    const alt = resolveChildPropExpr(expr.alternate, ctx)
    if (test === null || cons === null || alt === null) return null
    const deps: string[] = []
    const seen = new Set<string>()
    for (const d of [...test.deps, ...cons.deps, ...alt.deps]) {
      if (!seen.has(d)) {
        seen.add(d)
        deps.push(d)
      }
    }
    return {
      expr: t.conditionalExpression(test.expr, cons.expr, alt.expr),
      deps,
    }
  }

  return null
}

/**
 * Collect the single parent prop name a `props.<name>...` member chain
 * reads. Returns null if the chain roots on `props` but the first
 * property access is computed (shouldn't happen given the caller-side
 * checks, but kept as a safety net).
 */
function collectMemberRootDep(
  expr: BabelCore.types.Expression,
  t: T,
): string | null {
  let cursor: BabelCore.types.Expression = expr
  while (t.isMemberExpression(cursor)) {
    const next = cursor.object
    if (
      t.isIdentifier(next) &&
      next.name === "props" &&
      t.isIdentifier(cursor.property) &&
      !cursor.computed
    ) {
      return cursor.property.name
    }
    cursor = next
  }
  return null
}

/**
 * Clone a MemberExpression chain, replacing its root identifier with
 * `props.<rootName>`. Used to rewrite `row.id` to `props.row.id` when
 * `row` is a destructured param.
 */
function rewriteMemberRoot(
  expr: BabelCore.types.MemberExpression,
  t: T,
  rootName: string,
): BabelCore.types.MemberExpression {
  const parts: Array<{
    property: BabelCore.types.Expression | BabelCore.types.Identifier | BabelCore.types.PrivateName
    computed: boolean
  }> = []
  let cursor: BabelCore.types.Expression = expr
  while (t.isMemberExpression(cursor)) {
    parts.unshift({ property: cursor.property, computed: cursor.computed })
    cursor = cursor.object
  }
  let out: BabelCore.types.Expression = t.memberExpression(
    t.identifier("props"),
    t.identifier(rootName),
  )
  for (const p of parts) {
    out = t.memberExpression(out, p.property, p.computed)
  }
  return out as BabelCore.types.MemberExpression
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
    if (t.isJSXFragment(child)) {
      // Fragments are transparent: flatten their children into the parent's
      // effective children list. Nested fragments are handled recursively.
      const inner = collectEffectiveChildren(child.children, t)
      if (inner === null) return null
      for (const c of inner) out.push(c)
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
      const childName = ctx.t.isJSXIdentifier(child.node.openingElement.name)
        ? child.node.openingElement.name.name
        : null
      if (childName !== null && !isHostTag(childName)) {
        // Capitalized child = nested component. Emit a marker and record
        // a ComponentSlot; the parent's mount/patch call the child's
        // mount/patch at this position.
        const slot = buildComponentSlot(child.node, ctx, [...parentPath, i])
        if (slot === null) return null
        // Marker requires at least one adjacent non-text neighbor to avoid
        // merging with surrounding whitespace; the comment node itself
        // survives HTML parsing regardless of neighbors, so no prealloc
        // decision is needed here.
        ctx.slots.push(slot)
        out += "<!>"
        continue
      }
      const nested = renderElement(child.node, ctx, [...parentPath, i])
      if (nested === null) return null
      out += nested
      continue
    }

    if (child.kind === "expr") {
      // `{arr.map(item => <Row key={item.id} ... />)}` -- keyed compiled list.
      // Must sit alone (bordered only by elements) so the <!> marker does
      // not merge with surrounding text during HTML parsing.
      const list = resolveListExpr(child.node.expression, ctx)
      if (list !== null) {
        const prev = i > 0 ? effective[i - 1]! : null
        const next = i < effective.length - 1 ? effective[i + 1]! : null
        const isTextLike = (c: EffectiveChild | null): boolean =>
          c !== null && c.kind !== "element"
        if (isTextLike(prev) || isTextLike(next)) return null
        // When the list is the last child of its parent template, skip the
        // `<!>` marker. The runtime appends rows directly via the parent
        // element. This shaves one DOM node per list and removes the
        // trailing comment that was inflating Chromium's PrePaint/Layout
        // pass on mid-list removeChild (Krausest 06_remove-one-1k).
        const tailOfParent = next === null
        ctx.slots.push({
          ...list,
          path: [...parentPath, i],
          tailOfParent,
        })
        if (!tailOfParent) out += "<!>"
        continue
      }

      // `{cond && <Compiled .../>}` -- conditional compiled child. Same
      // neighbor rule as lists: the `<!>` marker must not butt up against
      // text-like siblings that would merge during HTML parsing.
      const cond = resolveCondExpr(child.node.expression, ctx)
      if (cond !== null) {
        const prev = i > 0 ? effective[i - 1]! : null
        const next = i < effective.length - 1 ? effective[i + 1]! : null
        const isTextLike = (c: EffectiveChild | null): boolean =>
          c !== null && c.kind !== "element"
        if (isTextLike(prev) || isTextLike(next)) return null
        ctx.slots.push({
          ...cond,
          path: [...parentPath, i],
        })
        out += "<!>"
        continue
      }

      // `{cond ? <A/> : <B/>}` -- ternary conditional child. Same
      // neighbor rule as cond/list.
      const alt = resolveAltExpr(child.node.expression, ctx)
      if (alt !== null) {
        const prev = i > 0 ? effective[i - 1]! : null
        const next = i < effective.length - 1 ? effective[i + 1]! : null
        const isTextLike = (c: EffectiveChild | null): boolean =>
          c !== null && c.kind !== "element"
        if (isTextLike(prev) || isTextLike(next)) return null
        ctx.slots.push({
          ...alt,
          path: [...parentPath, i],
        })
        out += "<!>"
        continue
      }

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
): { propName: string; ifTrue: string | null; ifFalse: string | null } | null {
  const t = ctx.t
  if (!t.isConditionalExpression(expr)) return null
  const ifTrue = ternaryBranchValue(expr.consequent, t)
  if (ifTrue === undefined) return null
  const ifFalse = ternaryBranchValue(expr.alternate, t)
  if (ifFalse === undefined) return null
  // At least one branch must be a real string. `(cond ? null : null)`
  // contributes nothing and falls through to other resolvers.
  if (ifTrue === null && ifFalse === null) return null
  const propName = resolvePropExpr(expr.test, ctx)
  if (propName === null) return null
  return { propName, ifTrue, ifFalse }
}

// `null` / `undefined` / `false` in either branch maps to "omit attribute"
// on mount and "clear" on patch. Returns `undefined` for anything we cannot
// constant-fold.
function ternaryBranchValue(
  node: BabelCore.types.Expression,
  t: typeof BabelCore.types,
): string | null | undefined {
  if (t.isStringLiteral(node)) return node.value
  if (t.isNullLiteral(node)) return null
  if (t.isBooleanLiteral(node) && node.value === false) return null
  if (t.isIdentifier(node) && node.name === "undefined") return null
  return undefined
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
