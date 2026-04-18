/**
 * babel-plugin-tachys
 *
 * Compiles Tachys function components that return static JSX into
 * markCompiled + _template form, skipping the VDOM entirely at runtime.
 *
 * v0.0.1 scope: static JSX only.
 *   - Function component whose body is a single `return <jsx/>`
 *   - JSX tree uses only lowercase tag names (host elements)
 *   - All attribute values are string literals
 *   - All children are JSXText or nested JSXElement matching the rules above
 *
 * Anything outside this grammar falls through unchanged; the existing
 * jsx-runtime path handles it.
 *
 * Future iterations add text slots, attribute slots, event handlers, and
 * conditional rendering.
 */

import type { PluginObj, PluginPass } from "@babel/core"
import { declare } from "@babel/helper-plugin-utils"
// @ts-expect-error -- @babel/plugin-syntax-jsx ships no types
import syntaxJsxRaw from "@babel/plugin-syntax-jsx"
import type * as BabelCore from "@babel/core"

import { compileStaticJsx } from "./compile"

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

        const compiled = compileStaticJsx(path.node, t)
        if (compiled === null) return

        const tplId = `_tpl$${name}_${state.templateCounter++}`
        state.pendingTemplates.push({ id: tplId, html: compiled.html })

        const markCompiledName = reserveImport(state, "markCompiled")

        const mountFn = t.arrowFunctionExpression(
          [],
          t.objectExpression([
            t.objectProperty(
              t.identifier("dom"),
              t.callExpression(
                t.memberExpression(
                  t.identifier(tplId),
                  t.identifier("cloneNode"),
                ),
                [t.booleanLiteral(true)],
              ),
            ),
            t.objectProperty(
              t.identifier("state"),
              t.objectExpression([]),
            ),
          ]),
        )

        const patchFn = t.arrowFunctionExpression(
          [],
          t.blockStatement([]),
        )

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
