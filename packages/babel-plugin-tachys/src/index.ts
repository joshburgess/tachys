/**
 * babel-plugin-tachys
 *
 * Compiles Tachys function components into markCompiled + _template form,
 * skipping the VDOM entirely at runtime.
 *
 * v0.1 scope:
 *   - Function component, zero or one param (identifier `props` or
 *     object-pattern destructuring of shorthand identifiers).
 *   - Body is a single `return <jsx/>`.
 *   - JSX tree uses only lowercase host tags.
 *   - String-literal attribute values.
 *   - Children may be JSXText, static JSXElement, or JSXExpressionContainer
 *     whose expression is a destructured name or `props.x` (text slot).
 *
 * Anything outside this grammar falls through unchanged; the existing
 * jsx-runtime path handles it.
 *
 * Future iterations add attribute slots, event handlers, and conditional
 * rendering.
 */

import type { PluginObj, PluginPass } from "@babel/core"
import { declare } from "@babel/helper-plugin-utils"
// @ts-expect-error -- @babel/plugin-syntax-jsx ships no types
import syntaxJsxRaw from "@babel/plugin-syntax-jsx"
import type * as BabelCore from "@babel/core"

import {
  compileComponent,
  type AttrSlot,
  type ComponentSlot,
  type Slot,
  type TextSlot,
} from "./compile"

const syntaxJsx =
  (syntaxJsxRaw as { default?: unknown }).default ?? syntaxJsxRaw

interface PluginState extends PluginPass {
  tachysImports: {
    markCompiled: string | null
    template: string | null
  }
  templateCounter: number
  pendingTemplates: Array<{ id: string; html: string }>
}

const PACKAGE_NAME = "tachys"

type DeclareFn = <S extends PluginPass>(
  builder: (api: BabelCore.ConfigAPI & typeof BabelCore) => PluginObj<S>,
) => unknown
const declareT = declare as unknown as DeclareFn

const plugin = declareT<PluginState>((api) => {
  api.assertVersion(7)
  const t = api.types as typeof BabelCore.types

  return {
    name: "babel-plugin-tachys",
    inherits: syntaxJsx as BabelCore.PluginObj,

    pre() {
      this.tachysImports = { markCompiled: null, template: null }
      this.templateCounter = 0
      this.pendingTemplates = []
    },

    visitor: {
      Program: {
        exit(path, state) {
          if (state.pendingTemplates.length === 0) return

          ensureImport(path, t, state, "markCompiled")
          const templateLocal = ensureImport(path, t, state, "_template")

          for (let i = state.pendingTemplates.length - 1; i >= 0; i--) {
            const tpl = state.pendingTemplates[i]!
            const decl = t.variableDeclaration("const", [
              t.variableDeclarator(
                t.identifier(tpl.id),
                t.callExpression(t.identifier(templateLocal), [
                  t.stringLiteral(tpl.html),
                ]),
              ),
            ])
            path.unshiftContainer("body", decl)
          }
        },
      },

      FunctionDeclaration(path, state) {
        const id = path.node.id
        if (id === null || id === undefined) return
        const name = id.name
        if (!isPascalCase(name)) return

        const compiled = compileComponent(path.node, t)
        if (compiled === null) return

        const tplId = `_tpl$${name}_${state.templateCounter++}`
        state.pendingTemplates.push({ id: tplId, html: compiled.html })

        const markCompiledName = reserveImport(state, "markCompiled")

        const mountFn = buildMount(t, tplId, compiled.slots, compiled.propsParamName)
        const patchFn = buildPatch(t, compiled.slots, compiled.propsParamName)
        const compareFn = buildCompare(t, compiled.slots)

        const markCompiledArgs: BabelCore.types.Expression[] = [mountFn, patchFn]
        if (compareFn !== null) markCompiledArgs.push(compareFn)

        const replacement = t.variableDeclaration("const", [
          t.variableDeclarator(
            t.identifier(name),
            t.callExpression(
              t.identifier(markCompiledName),
              markCompiledArgs,
            ),
          ),
        ])

        path.replaceWith(replacement)
      },
    },
  }
})

export default plugin

function isPascalCase(name: string): boolean {
  const first = name.charCodeAt(0)
  return first >= 65 && first <= 90
}

function slotRefName(index: number): string {
  return `_t${index}`
}

/**
 * Build an expression that navigates from `_root` to the node at `path`
 * using firstChild / nextSibling chains. This is O(path length) per slot
 * and avoids the cost of creating a TreeWalker per instance.
 */
function buildPathExpr(
  t: typeof BabelCore.types,
  rootName: string,
  path: number[],
): BabelCore.types.Expression {
  let expr: BabelCore.types.Expression = t.identifier(rootName)
  for (const index of path) {
    expr = t.memberExpression(expr, t.identifier("firstChild"))
    for (let i = 0; i < index; i++) {
      expr = t.memberExpression(expr, t.identifier("nextSibling"))
    }
  }
  return expr
}

function pathKey(path: number[]): string {
  return path.join(",")
}

/**
 * Build the expression used to derive an attribute's value from props.
 * For a plain prop reference we emit `String(props.x)` so any non-string
 * value coerces safely. When the JSX source was a ConditionalExpression
 * with StringLiteral branches we emit that ternary inline, skipping the
 * String() wrap (both branches are already strings). Template literals
 * carrying `${props.x}` expressions are emitted inline; patch/mount reuse
 * the normalized AST stored on the slot.
 */
function buildAttrValueExpr(
  t: typeof BabelCore.types,
  slot: AttrSlot,
  propsName: string,
): BabelCore.types.Expression {
  if (slot.composite !== undefined) {
    return substituteProps(t, slot.composite.expr, propsName)
  }
  const propRef = t.memberExpression(
    t.identifier(propsName),
    t.identifier(slot.propName),
  )
  if (slot.ternary !== undefined) {
    return t.conditionalExpression(
      propRef,
      t.stringLiteral(slot.ternary.ifTrue),
      t.stringLiteral(slot.ternary.ifFalse),
    )
  }
  return t.callExpression(t.identifier("String"), [propRef])
}

/**
 * Build the text-node value expression. Composite slots emit the template
 * literal directly (template literals stringify their interpolations, so
 * no outer String() wrap is needed). Simple slots emit `String(props.x)`.
 */
function buildTextValueExpr(
  t: typeof BabelCore.types,
  slot: TextSlot,
  propsName: string,
): BabelCore.types.Expression {
  if (slot.composite !== undefined) {
    return substituteProps(t, slot.composite.expr, propsName)
  }
  return t.callExpression(t.identifier("String"), [
    t.memberExpression(
      t.identifier(propsName),
      t.identifier(slot.propName),
    ),
  ])
}

/**
 * The composite expression is stored with `props` as the object name. If
 * the caller renamed the props param (currently always "props", but kept
 * in case it diverges), swap the object identifier on each `props.*`
 * MemberExpression that sits at top level inside the template literal.
 */
function substituteProps(
  t: typeof BabelCore.types,
  expr: BabelCore.types.TemplateLiteral,
  propsName: string,
): BabelCore.types.TemplateLiteral {
  if (propsName === "props") return expr
  const rewritten = expr.expressions.map((e) => {
    if (
      t.isMemberExpression(e) &&
      t.isIdentifier(e.object) &&
      e.object.name === "props"
    ) {
      return t.memberExpression(
        t.identifier(propsName),
        e.property as BabelCore.types.Identifier,
      )
    }
    return e as BabelCore.types.Expression
  })
  return t.templateLiteral(expr.quasis, rewritten)
}

/**
 * Record every prop the slot references in the component's `state` object,
 * skipping any prop already seen. Composite slots reference multiple props
 * via the template literal's expression list; simple slots reference just
 * `slot.propName`.
 */
function registerSlotProps(
  slot: Slot,
  seenPropNames: Set<string>,
  stateProps: BabelCore.types.ObjectProperty[],
  t: typeof BabelCore.types,
  propsName: string,
): void {
  const names = slotPropNames(slot)
  for (const name of names) {
    if (seenPropNames.has(name)) continue
    seenPropNames.add(name)
    stateProps.push(
      t.objectProperty(
        t.identifier(name),
        t.memberExpression(t.identifier(propsName), t.identifier(name)),
      ),
    )
  }
}

/**
 * Collect every reactive prop name referenced across all slots, preserving
 * first-seen order. Composite slots contribute their full propNames list.
 */
function collectReactiveProps(slots: Slot[]): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const slot of slots) {
    for (const name of slotPropNames(slot)) {
      if (seen.has(name)) continue
      seen.add(name)
      names.push(name)
    }
  }
  return names
}

/**
 * Stable state-key name for the mount result of a nested component slot.
 */
function componentInstanceName(index: number): string {
  return `_cs${index}`
}

/**
 * Build the object expression passed to a child component as its props.
 * Each entry uses the ComponentSlot's pre-resolved value expression.
 */
function buildChildPropsObject(
  t: typeof BabelCore.types,
  slot: ComponentSlot,
  propsName: string,
): BabelCore.types.ObjectExpression {
  const props: BabelCore.types.ObjectProperty[] = []
  for (const p of slot.props) {
    props.push(
      t.objectProperty(
        t.identifier(p.name),
        maybeRetargetPropsName(t, p.valueExpr, propsName),
      ),
    )
  }
  return t.objectExpression(props)
}

/**
 * If the surrounding component's props param is not literally `props`
 * (reserved for future renaming), retarget root `props.*` member reads
 * to the caller-chosen name. No-op today; keeps the emitter future-proof.
 */
function maybeRetargetPropsName(
  t: typeof BabelCore.types,
  expr: BabelCore.types.Expression,
  propsName: string,
): BabelCore.types.Expression {
  if (propsName === "props") return expr
  // TODO: full walker if/when we support renamed props params.
  return expr
}

/**
 * Return the list of prop names a slot depends on (for dirty-check).
 */
function slotPropNames(slot: Slot): string[] {
  if (slot.kind === "component") return slot.allDeps
  if (
    (slot.kind === "text" || slot.kind === "attr") &&
    slot.composite !== undefined
  ) {
    return slot.composite.propNames
  }
  return [slot.propName]
}

function buildMount(
  t: typeof BabelCore.types,
  tplId: string,
  slots: Slot[],
  propsName: string,
): BabelCore.types.ArrowFunctionExpression {
  const stmts: BabelCore.types.Statement[] = []

  // const _root = _tpl$X.cloneNode(true);
  stmts.push(
    t.variableDeclaration("const", [
      t.variableDeclarator(
        t.identifier("_root"),
        t.callExpression(
          t.memberExpression(
            t.identifier(tplId),
            t.identifier("cloneNode"),
          ),
          [t.booleanLiteral(true)],
        ),
      ),
    ]),
  )

  const stateProps: BabelCore.types.ObjectProperty[] = []
  const seenPropNames = new Set<string>()

  // Cache element refs for attribute-slot paths so multiple attrs on the
  // same element share one navigation + one state entry.
  const elementRefs = new Map<string, string>()
  let elementCounter = 0
  const ensureElementRef = (
    path: number[],
  ): string => {
    if (path.length === 0) return "_root"
    const key = pathKey(path)
    const existing = elementRefs.get(key)
    if (existing !== undefined) return existing
    const name = `_e${elementCounter++}`
    elementRefs.set(key, name)
    stmts.push(
      t.variableDeclaration("const", [
        t.variableDeclarator(
          t.identifier(name),
          buildPathExpr(t, "_root", path),
        ),
      ]),
    )
    return name
  }

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!

    if (slot.kind === "text") {
      const refName = slotRefName(i)

      if (slot.placeholder === "prealloc") {
        // const _tN = <path-to-text-node>;
        stmts.push(
          t.variableDeclaration("const", [
            t.variableDeclarator(
              t.identifier(refName),
              buildPathExpr(t, "_root", slot.path),
            ),
          ]),
        )
        // _tN.data = <value>;
        stmts.push(
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.memberExpression(
                t.identifier(refName),
                t.identifier("data"),
              ),
              buildTextValueExpr(t, slot, propsName),
            ),
          ),
        )
      } else {
        // Marker path: create a fresh text node, replace the <!> comment.
        const markerName = `_m${i}`
        stmts.push(
          t.variableDeclaration("const", [
            t.variableDeclarator(
              t.identifier(markerName),
              buildPathExpr(t, "_root", slot.path),
            ),
          ]),
        )
        stmts.push(
          t.variableDeclaration("const", [
            t.variableDeclarator(
              t.identifier(refName),
              t.callExpression(
                t.memberExpression(
                  t.identifier("document"),
                  t.identifier("createTextNode"),
                ),
                [buildTextValueExpr(t, slot, propsName)],
              ),
            ),
          ]),
        )
        stmts.push(
          t.expressionStatement(
            t.callExpression(
              t.memberExpression(
                t.memberExpression(
                  t.identifier(markerName),
                  t.identifier("parentNode"),
                ),
                t.identifier("replaceChild"),
              ),
              [t.identifier(refName), t.identifier(markerName)],
            ),
          ),
        )
      }

      stateProps.push(
        t.objectProperty(t.identifier(refName), t.identifier(refName)),
      )
      registerSlotProps(slot, seenPropNames, stateProps, t, propsName)
      continue
    }

    if (slot.kind === "attr") {
      const elName = ensureElementRef(slot.path)
      const valueExpr = buildAttrValueExpr(t, slot, propsName)

      if (slot.strategy === "className") {
        stmts.push(
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.memberExpression(
                t.identifier(elName),
                t.identifier("className"),
              ),
              valueExpr,
            ),
          ),
        )
      } else {
        stmts.push(
          t.expressionStatement(
            t.callExpression(
              t.memberExpression(
                t.identifier(elName),
                t.identifier("setAttribute"),
              ),
              [t.stringLiteral(slot.attrName), valueExpr],
            ),
          ),
        )
      }

      registerSlotProps(slot, seenPropNames, stateProps, t, propsName)
      continue
    }

    if (slot.kind === "event") {
      // Register the element ref now so state includes it; the actual
      // listener assignment happens after the `state` variable exists so
      // the wrapper function can close over it.
      ensureElementRef(slot.path)
      registerSlotProps(slot, seenPropNames, stateProps, t, propsName)
      continue
    }

    if (slot.kind === "component") {
      const markerName = `_cm${i}`
      const instName = componentInstanceName(i)

      // const _cmN = <marker path>;
      stmts.push(
        t.variableDeclaration("const", [
          t.variableDeclarator(
            t.identifier(markerName),
            buildPathExpr(t, "_root", slot.path),
          ),
        ]),
      )
      // const _csN = Child(<props obj>);
      stmts.push(
        t.variableDeclaration("const", [
          t.variableDeclarator(
            t.identifier(instName),
            t.callExpression(t.identifier(slot.componentRef), [
              buildChildPropsObject(t, slot, propsName),
            ]),
          ),
        ]),
      )
      // _cmN.parentNode.replaceChild(_csN.dom, _cmN);
      stmts.push(
        t.expressionStatement(
          t.callExpression(
            t.memberExpression(
              t.memberExpression(
                t.identifier(markerName),
                t.identifier("parentNode"),
              ),
              t.identifier("replaceChild"),
            ),
            [
              t.memberExpression(
                t.identifier(instName),
                t.identifier("dom"),
              ),
              t.identifier(markerName),
            ],
          ),
        ),
      )
      // state._csN = _csN
      stateProps.push(
        t.objectProperty(t.identifier(instName), t.identifier(instName)),
      )
      registerSlotProps(slot, seenPropNames, stateProps, t, propsName)
    }
  }

  // Attribute + event slots need element refs in patch. Expose them via state.
  for (const [, elName] of elementRefs) {
    stateProps.push(
      t.objectProperty(t.identifier(elName), t.identifier(elName)),
    )
  }
  // If any attr/event slot targets the root, expose _root as well.
  const needsRoot = slots.some(
    (s) =>
      (s.kind === "attr" || s.kind === "event") && s.path.length === 0,
  )
  if (needsRoot) {
    stateProps.push(
      t.objectProperty(t.identifier("_root"), t.identifier("_root")),
    )
  }

  // const state = { ... };
  stmts.push(
    t.variableDeclaration("const", [
      t.variableDeclarator(
        t.identifier("state"),
        t.objectExpression(stateProps),
      ),
    ]),
  )

  // Event listener assignments use a state-closure wrapper so patch does
  // not need to rebind the DOM listener when props.onX changes identity.
  // The wrapper reads `state.onX` lazily at event-dispatch time and uses
  // `.call(this, ev)` to preserve the `this` binding DOM listeners get.
  for (const slot of slots) {
    if (slot.kind !== "event") continue
    const elName = ensureElementRef(slot.path)
    const wrapper = t.functionExpression(
      null,
      [t.identifier("ev")],
      t.blockStatement([
        t.returnStatement(
          t.callExpression(
            t.memberExpression(
              t.memberExpression(
                t.identifier("state"),
                t.identifier(slot.propName),
              ),
              t.identifier("call"),
            ),
            [t.thisExpression(), t.identifier("ev")],
          ),
        ),
      ]),
    )
    stmts.push(
      t.expressionStatement(
        t.assignmentExpression(
          "=",
          t.memberExpression(
            t.identifier(elName),
            t.identifier(slot.domProp),
          ),
          wrapper,
        ),
      ),
    )
  }

  stmts.push(
    t.returnStatement(
      t.objectExpression([
        t.objectProperty(t.identifier("dom"), t.identifier("_root")),
        t.objectProperty(t.identifier("state"), t.identifier("state")),
      ]),
    ),
  )

  const params = slots.length > 0 ? [t.identifier(propsName)] : []
  return t.arrowFunctionExpression(params, t.blockStatement(stmts))
}

/**
 * Build patch body.
 *
 * Simple path (no composite slots): group slots by their single `propName`
 * and emit one `if (state.x !== props.x) { writes...; state.x = props.x }`
 * per prop. Writes for the same prop share one compare + one state update.
 *
 * Composite path: when any slot depends on more than one prop (template
 * literal), we can't fold writes + state updates into one block -- the
 * state update for a shared prop would poison later checks. Instead emit:
 *   const _dX = state.x !== props.x;       // one per reactive prop
 *   if (<OR of deps>) { write }            // one per slot
 *   if (_dX) state.x = props.x;            // one per reactive prop
 * This keeps every per-prop compare at O(1) while letting multi-prop
 * writes observe the correct staleness for all deps.
 */
function buildPatch(
  t: typeof BabelCore.types,
  slots: Slot[],
  propsName: string,
): BabelCore.types.ArrowFunctionExpression {
  if (slots.length === 0) {
    return t.arrowFunctionExpression([], t.blockStatement([]))
  }

  const hasComposite = slots.some(
    (s) =>
      s.kind === "component" ||
      ((s.kind === "text" || s.kind === "attr") && s.composite !== undefined),
  )

  return hasComposite
    ? buildPatchComposite(t, slots, propsName)
    : buildPatchSimple(t, slots, propsName)
}

function buildPatchSimple(
  t: typeof BabelCore.types,
  slots: Slot[],
  propsName: string,
): BabelCore.types.ArrowFunctionExpression {
  // Simple path is only entered when no slot is a ComponentSlot or has
  // a composite expression, so every slot has a single `.propName`.
  const grouped = new Map<string, { slot: Slot; index: number }[]>()
  slots.forEach((slot, index) => {
    if (slot.kind === "component") return
    const arr = grouped.get(slot.propName) ?? []
    arr.push({ slot, index })
    grouped.set(slot.propName, arr)
  })

  const stmts: BabelCore.types.Statement[] = []

  for (const [propName, group] of grouped) {
    const writes: BabelCore.types.Statement[] = []
    for (const { slot, index } of group) {
      const write = buildSlotWrite(t, slot, index, slots, propsName)
      if (write !== null) writes.push(write)
    }

    // state.<prop> = props.<prop>
    writes.push(
      t.expressionStatement(
        t.assignmentExpression(
          "=",
          t.memberExpression(t.identifier("state"), t.identifier(propName)),
          t.memberExpression(t.identifier(propsName), t.identifier(propName)),
        ),
      ),
    )

    stmts.push(
      t.ifStatement(
        t.binaryExpression(
          "!==",
          t.memberExpression(t.identifier("state"), t.identifier(propName)),
          t.memberExpression(t.identifier(propsName), t.identifier(propName)),
        ),
        t.blockStatement(writes),
      ),
    )
  }

  return t.arrowFunctionExpression(
    [t.identifier("state"), t.identifier(propsName)],
    t.blockStatement(stmts),
  )
}

function buildPatchComposite(
  t: typeof BabelCore.types,
  slots: Slot[],
  propsName: string,
): BabelCore.types.ArrowFunctionExpression {
  const propNames = collectReactiveProps(slots)
  const dirtyLocals = new Map<string, string>()

  const stmts: BabelCore.types.Statement[] = []

  // const _d<i> = state.<p> !== props.<p>
  propNames.forEach((name, i) => {
    const local = `_d${i}`
    dirtyLocals.set(name, local)
    stmts.push(
      t.variableDeclaration("const", [
        t.variableDeclarator(
          t.identifier(local),
          t.binaryExpression(
            "!==",
            t.memberExpression(t.identifier("state"), t.identifier(name)),
            t.memberExpression(t.identifier(propsName), t.identifier(name)),
          ),
        ),
      ]),
    )
  })

  // For each slot: emit the write guarded by OR of its dirty deps.
  // Slots with zero deps (e.g. a static <Child/>) never need re-running.
  slots.forEach((slot, index) => {
    const deps = slotPropNames(slot)
    if (deps.length === 0) return
    const write = buildSlotWrite(t, slot, index, slots, propsName)
    if (write === null) return
    let test: BabelCore.types.Expression = t.identifier(dirtyLocals.get(deps[0]!)!)
    for (let i = 1; i < deps.length; i++) {
      test = t.logicalExpression(
        "||",
        test,
        t.identifier(dirtyLocals.get(deps[i]!)!),
      )
    }
    stmts.push(t.ifStatement(test, t.blockStatement([write])))
  })

  // if (_d<i>) state.<p> = props.<p>
  propNames.forEach((name) => {
    const local = dirtyLocals.get(name)!
    stmts.push(
      t.ifStatement(
        t.identifier(local),
        t.blockStatement([
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.memberExpression(t.identifier("state"), t.identifier(name)),
              t.memberExpression(t.identifier(propsName), t.identifier(name)),
            ),
          ),
        ]),
      ),
    )
  })

  return t.arrowFunctionExpression(
    [t.identifier("state"), t.identifier(propsName)],
    t.blockStatement(stmts),
  )
}

/**
 * Emit a single DOM write for a slot in the patch body. Returns null for
 * event slots (the state-closure wrapper installed at mount-time already
 * observes the latest `state.<prop>` at dispatch).
 */
function buildSlotWrite(
  t: typeof BabelCore.types,
  slot: Slot,
  index: number,
  slots: Slot[],
  propsName: string,
): BabelCore.types.Statement | null {
  if (slot.kind === "text") {
    const refName = slotRefName(index)
    const textExpr = buildTextValueExpr(t, slot, propsName)
    return t.expressionStatement(
      t.assignmentExpression(
        "=",
        t.memberExpression(
          t.memberExpression(
            t.identifier("state"),
            t.identifier(refName),
          ),
          t.identifier("data"),
        ),
        textExpr,
      ),
    )
  }
  if (slot.kind === "attr") {
    const elExpr = stateElementExpr(t, slots, slot.path)
    const valueExpr = buildAttrValueExpr(t, slot, propsName)
    if (slot.strategy === "className") {
      return t.expressionStatement(
        t.assignmentExpression(
          "=",
          t.memberExpression(elExpr, t.identifier("className")),
          valueExpr,
        ),
      )
    }
    return t.expressionStatement(
      t.callExpression(
        t.memberExpression(elExpr, t.identifier("setAttribute")),
        [t.stringLiteral(slot.attrName), valueExpr],
      ),
    )
  }
  if (slot.kind === "component") {
    // Call the child's .patch with a rebuilt props object. The parent's
    // dirty-check (one OR per dep) has already decided we actually need
    // to re-enter the child; the child's own compare can still short out.
    return t.expressionStatement(
      t.callExpression(
        t.memberExpression(
          t.identifier(slot.componentRef),
          t.identifier("patch"),
        ),
        [
          t.memberExpression(
            t.memberExpression(
              t.identifier("state"),
              t.identifier(componentInstanceName(index)),
            ),
            t.identifier("state"),
          ),
          buildChildPropsObject(t, slot, propsName),
        ],
      ),
    )
  }
  // event slots: no DOM rebind needed; state mutation happens at the
  // bottom of the patch via the dirty-sync blocks (or the grouped if
  // body in the simple path).
  return null
}

/**
 * Build the optional `compare(prev, next)` passed as the third arg to
 * markCompiled. When every slot-referenced prop is reference-equal between
 * renders, returning true tells the runtime to skip `patch` altogether.
 *
 * Returns null when there are no dynamic props — a memo on a fully static
 * component would be dead code.
 */
function buildCompare(
  t: typeof BabelCore.types,
  slots: Slot[],
): BabelCore.types.ArrowFunctionExpression | null {
  const names = collectReactiveProps(slots)
  if (names.length === 0) return null

  const comparisons = names.map((name) =>
    t.binaryExpression(
      "===",
      t.memberExpression(t.identifier("prev"), t.identifier(name)),
      t.memberExpression(t.identifier("next"), t.identifier(name)),
    ),
  )
  let expr: BabelCore.types.Expression = comparisons[0]!
  for (let i = 1; i < comparisons.length; i++) {
    expr = t.logicalExpression("&&", expr, comparisons[i]!)
  }
  return t.arrowFunctionExpression(
    [t.identifier("prev"), t.identifier("next")],
    expr,
  )
}

/**
 * Build the expression that reads the element ref for a given slot path
 * out of `state` during patch. Reconstructs the name assigned by
 * buildMount deterministically by replaying its dedup logic.
 */
function stateElementExpr(
  t: typeof BabelCore.types,
  slots: Slot[],
  path: number[],
): BabelCore.types.Expression {
  if (path.length === 0) {
    return t.memberExpression(t.identifier("state"), t.identifier("_root"))
  }
  const key = path.join(",")
  let counter = 0
  const seen = new Map<string, number>()
  for (const s of slots) {
    if (s.kind !== "attr" && s.kind !== "event") continue
    if (s.path.length === 0) continue
    const k = s.path.join(",")
    if (!seen.has(k)) {
      seen.set(k, counter++)
    }
    if (k === key) {
      return t.memberExpression(
        t.identifier("state"),
        t.identifier(`_e${seen.get(k)!}`),
      )
    }
  }
  throw new Error(`no element ref for path [${path.join(",")}]`)
}

function reserveImport(
  state: PluginState,
  local: "markCompiled" | "_template",
): string {
  const key = local === "markCompiled" ? "markCompiled" : "template"
  const existing = state.tachysImports[key]
  if (existing !== null) return existing
  state.tachysImports[key] = local
  return local
}

function ensureImport(
  path: BabelCore.NodePath<BabelCore.types.Program>,
  t: typeof BabelCore.types,
  state: PluginState,
  local: "markCompiled" | "_template",
): string {
  const name = reserveImport(state, local)

  let existingDecl: BabelCore.types.ImportDeclaration | null = null
  for (const node of path.node.body) {
    if (!t.isImportDeclaration(node)) continue
    if (node.source.value !== PACKAGE_NAME) continue
    existingDecl = node
    for (const spec of node.specifiers) {
      if (!t.isImportSpecifier(spec)) continue
      const imported = spec.imported
      if (t.isIdentifier(imported) && imported.name === local) {
        return spec.local.name
      }
    }
    break
  }

  const spec = t.importSpecifier(t.identifier(name), t.identifier(local))

  if (existingDecl !== null) {
    existingDecl.specifiers.push(spec)
    return name
  }

  const decl = t.importDeclaration([spec], t.stringLiteral(PACKAGE_NAME))
  path.unshiftContainer("body", decl)
  return name
}
