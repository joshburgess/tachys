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

import { compileComponent, type Slot } from "./compile"

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

        const replacement = t.variableDeclaration("const", [
          t.variableDeclarator(
            t.identifier(name),
            t.callExpression(t.identifier(markCompiledName), [
              mountFn,
              patchFn,
            ]),
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
        // _tN.data = String(props.x);
        stmts.push(
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.memberExpression(
                t.identifier(refName),
                t.identifier("data"),
              ),
              t.callExpression(t.identifier("String"), [
                t.memberExpression(
                  t.identifier(propsName),
                  t.identifier(slot.propName),
                ),
              ]),
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
                [
                  t.callExpression(t.identifier("String"), [
                    t.memberExpression(
                      t.identifier(propsName),
                      t.identifier(slot.propName),
                    ),
                  ]),
                ],
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
      if (!seenPropNames.has(slot.propName)) {
        seenPropNames.add(slot.propName)
        stateProps.push(
          t.objectProperty(
            t.identifier(slot.propName),
            t.memberExpression(
              t.identifier(propsName),
              t.identifier(slot.propName),
            ),
          ),
        )
      }
      continue
    }

    if (slot.kind === "attr") {
      const elName = ensureElementRef(slot.path)
      const valueExpr = t.callExpression(t.identifier("String"), [
        t.memberExpression(
          t.identifier(propsName),
          t.identifier(slot.propName),
        ),
      ])

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

      if (!seenPropNames.has(slot.propName)) {
        seenPropNames.add(slot.propName)
        stateProps.push(
          t.objectProperty(
            t.identifier(slot.propName),
            t.memberExpression(
              t.identifier(propsName),
              t.identifier(slot.propName),
            ),
          ),
        )
      }
      continue
    }

    if (slot.kind === "event") {
      const elName = ensureElementRef(slot.path)
      // _el.onclick = props.onSelect;
      stmts.push(
        t.expressionStatement(
          t.assignmentExpression(
            "=",
            t.memberExpression(
              t.identifier(elName),
              t.identifier(slot.domProp),
            ),
            t.memberExpression(
              t.identifier(propsName),
              t.identifier(slot.propName),
            ),
          ),
        ),
      )
      if (!seenPropNames.has(slot.propName)) {
        seenPropNames.add(slot.propName)
        stateProps.push(
          t.objectProperty(
            t.identifier(slot.propName),
            t.memberExpression(
              t.identifier(propsName),
              t.identifier(slot.propName),
            ),
          ),
        )
      }
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

  stmts.push(
    t.returnStatement(
      t.objectExpression([
        t.objectProperty(t.identifier("dom"), t.identifier("_root")),
        t.objectProperty(
          t.identifier("state"),
          t.objectExpression(stateProps),
        ),
      ]),
    ),
  )

  const params = slots.length > 0 ? [t.identifier(propsName)] : []
  return t.arrowFunctionExpression(params, t.blockStatement(stmts))
}

/**
 * Build patch body. Groups slots by `propName` so each prop's compare
 * happens exactly once per patch call, and all writes that depend on
 * that prop sit inside the same `if` body.
 */
function buildPatch(
  t: typeof BabelCore.types,
  slots: Slot[],
  propsName: string,
): BabelCore.types.ArrowFunctionExpression {
  if (slots.length === 0) {
    return t.arrowFunctionExpression([], t.blockStatement([]))
  }

  const grouped = new Map<string, { slot: Slot; index: number }[]>()
  slots.forEach((slot, index) => {
    const arr = grouped.get(slot.propName) ?? []
    arr.push({ slot, index })
    grouped.set(slot.propName, arr)
  })

  const stmts: BabelCore.types.Statement[] = []

  for (const [propName, group] of grouped) {
    const writes: BabelCore.types.Statement[] = []
    for (const { slot, index } of group) {
      const refName = slotRefName(index)
      const valueExpr = t.callExpression(t.identifier("String"), [
        t.memberExpression(
          t.identifier(propsName),
          t.identifier(slot.propName),
        ),
      ])

      if (slot.kind === "text") {
        writes.push(
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.memberExpression(
                t.memberExpression(
                  t.identifier("state"),
                  t.identifier(refName),
                ),
                t.identifier("data"),
              ),
              valueExpr,
            ),
          ),
        )
      } else if (slot.kind === "attr") {
        const elExpr = stateElementExpr(t, slots, slot.path)

        if (slot.strategy === "className") {
          writes.push(
            t.expressionStatement(
              t.assignmentExpression(
                "=",
                t.memberExpression(elExpr, t.identifier("className")),
                valueExpr,
              ),
            ),
          )
        } else {
          writes.push(
            t.expressionStatement(
              t.callExpression(
                t.memberExpression(elExpr, t.identifier("setAttribute")),
                [t.stringLiteral(slot.attrName), valueExpr],
              ),
            ),
          )
        }
      } else if (slot.kind === "event") {
        // state._eN.onclick = props.onSelect
        const elExpr = stateElementExpr(t, slots, slot.path)
        writes.push(
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.memberExpression(elExpr, t.identifier(slot.domProp)),
              t.memberExpression(
                t.identifier(propsName),
                t.identifier(slot.propName),
              ),
            ),
          ),
        )
      }
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
