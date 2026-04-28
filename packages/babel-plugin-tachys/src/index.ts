/**
 * babel-plugin-tachys
 *
 * Compiles Tachys function components into `markCompiled` + `_template`
 * form, skipping the VDOM entirely at runtime.
 *
 * Pipeline:
 *   Babel FunctionDeclaration
 *     -> compileComponent (Babel-AST frontend, grammar check)
 *       -> CompiledResult (Babel-typed)
 *         -> compiledToIR (adapter)
 *           -> CompiledIR (portable, see src/ir.ts)
 *             -> emit (string emitter over src/js-dsl.ts)
 *               -> JS source string
 *                 -> parseExpression (re-hydrate into Babel AST so path.replaceWith works)
 *                   -> final module output
 *
 * The `CompiledIR` boundary means a non-Babel frontend (SWC, Oxc, Rust)
 * can target the same IR and reuse the string emitter. The Babel plugin
 * is the only stage that still needs Babel-specific types; everything
 * between compile and emit is AST-library-agnostic.
 */

import { parseExpression } from "@babel/parser"
import type { PluginObj, PluginPass } from "@babel/core"
import { declare } from "@babel/helper-plugin-utils"
// @ts-expect-error -- @babel/plugin-syntax-jsx ships no types
import syntaxJsxRaw from "@babel/plugin-syntax-jsx"
import type * as BabelCore from "@babel/core"

import { emitComponent, type ListHelpers } from "compiler-core-tachys"

import { compileComponent } from "./compile"
import { compiledToIR } from "./compiled-to-ir"

const syntaxJsx =
  (syntaxJsxRaw as { default?: unknown }).default ?? syntaxJsxRaw

interface PluginState extends PluginPass {
  tachysImports: {
    markCompiled: string | null
    template: string | null
    mountList: string | null
    patchList: string | null
    mountCond: string | null
    patchCond: string | null
    mountAlt: string | null
    patchAlt: string | null
    batched: string | null
    attachEvent: string | null
  }
  templateCounter: number
  pendingTemplates: Array<{ id: string; html: string }>
  /**
   * Module-level `const` helpers for compiled lists (makeProps + keyOf).
   * Hoisted so they allocate once per module, not once per parent mount.
   * Emitted as source by emit.ts and parsed into Babel AST here.
   */
  pendingHelpers: Array<{ id: string; init: BabelCore.types.Expression }>
}

const PACKAGE_NAME = "tachys"

type DeclareFn = <S extends PluginPass>(
  builder: (api: BabelCore.ConfigAPI & typeof BabelCore) => PluginObj<S>,
) => unknown
const declareT = declare as unknown as DeclareFn

function parseExpr(src: string): BabelCore.types.Expression {
  return parseExpression(src) as unknown as BabelCore.types.Expression
}

const plugin = declareT<PluginState>((api) => {
  api.assertVersion(7)
  const t = api.types as typeof BabelCore.types

  return {
    name: "babel-plugin-tachys",
    inherits: syntaxJsx as BabelCore.PluginObj,

    pre() {
      this.tachysImports = {
        markCompiled: null,
        template: null,
        mountList: null,
        patchList: null,
        mountCond: null,
        patchCond: null,
        mountAlt: null,
        patchAlt: null,
        batched: null,
        attachEvent: null,
      }
      this.templateCounter = 0
      this.pendingTemplates = []
      this.pendingHelpers = []
    },

    visitor: {
      Program: {
        exit(path, state) {
          if (state.pendingTemplates.length === 0) return

          ensureImport(path, t, state, "markCompiled")
          const templateLocal = ensureImport(path, t, state, "_template")
          if (state.tachysImports.mountList !== null) {
            ensureImport(path, t, state, "_mountList")
          }
          if (state.tachysImports.patchList !== null) {
            ensureImport(path, t, state, "_patchList")
          }
          if (state.tachysImports.mountCond !== null) {
            ensureImport(path, t, state, "_mountCond")
          }
          if (state.tachysImports.patchCond !== null) {
            ensureImport(path, t, state, "_patchCond")
          }
          if (state.tachysImports.mountAlt !== null) {
            ensureImport(path, t, state, "_mountAlt")
          }
          if (state.tachysImports.patchAlt !== null) {
            ensureImport(path, t, state, "_patchAlt")
          }
          if (state.tachysImports.batched !== null) {
            ensureImport(path, t, state, "_batched")
          }
          if (state.tachysImports.attachEvent !== null) {
            ensureImport(path, t, state, "_attachEvent")
          }

          // List-helper module consts come after imports but before
          // template decls so they are bound when compiled component
          // constructors run.
          for (let i = state.pendingHelpers.length - 1; i >= 0; i--) {
            const helper = state.pendingHelpers[i]!
            path.unshiftContainer(
              "body",
              t.variableDeclaration("const", [
                t.variableDeclarator(t.identifier(helper.id), helper.init),
              ]),
            )
          }

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

        const compiledRaw = compileComponent(path.node, t)
        if (compiledRaw === null) return
        const ir = compiledToIR(compiledRaw)

        const tplId = `_tpl$${name}_${state.templateCounter++}`
        state.pendingTemplates.push({ id: tplId, html: ir.html })

        const markCompiledName = reserveImport(state, "markCompiled")

        // Determine list-helper hoisting strategy per slot. Lists with no
        // parent-prop deps hoist two module-scope helpers (makeProps +
        // keyOf); lists that capture parent props emit inline closures.
        const listHelpers = new Map<number, ListHelpers>()
        ir.slots.forEach((slot, index) => {
          if (slot.kind === "list") {
            reserveImport(state, "_mountList")
            reserveImport(state, "_patchList")
            if (slot.parentPropDeps.length === 0) {
              listHelpers.set(index, {
                kind: "hoisted",
                makePropsId: `_lp$${name}_${index}`,
                keyOfId: `_lk$${name}_${index}`,
                makePropsOrDiffId: `_lpd$${name}_${index}`,
              })
            } else {
              listHelpers.set(index, { kind: "inline" })
            }
            return
          }
          if (slot.kind === "cond") {
            reserveImport(state, "_mountCond")
            reserveImport(state, "_patchCond")
          }
          if (slot.kind === "alt") {
            reserveImport(state, "_mountAlt")
            reserveImport(state, "_patchAlt")
          }
          if (slot.kind === "event") {
            reserveImport(state, "_attachEvent")
          }
        })

        const { callSrc, hoistedHelpers } = emitComponent(ir, {
          tplId,
          listHelpers,
          markCompiledName,
        })

        for (const h of hoistedHelpers) {
          state.pendingHelpers.push({
            id: h.makePropsId,
            init: parseExpr(h.makePropsSrc),
          })
          state.pendingHelpers.push({
            id: h.keyOfId,
            init: parseExpr(h.keyOfSrc),
          })
          state.pendingHelpers.push({
            id: h.makePropsOrDiffId,
            init: parseExpr(h.makePropsOrDiffSrc),
          })
        }

        const replacement = t.variableDeclaration("const", [
          t.variableDeclarator(t.identifier(name), parseExpr(callSrc)),
        ])

        path.replaceWith(replacement)
      },
    },
  }
})

export default plugin

// Re-export the portable IR boundary and bridges for consumers that only
// depend on this plugin. The types live in `compiler-core-tachys`; the
// Babel-specific adapters are owned here.
export type {
  CompiledIR,
  IRAltSlot,
  IRAttrSlot,
  IRChildPropEntry,
  IRComponentSlot,
  IRCompositeExpr,
  IRCondSlot,
  IREventSlot,
  IRListSlot,
  IRSlot,
  IRTextSlot,
} from "compiler-core-tachys"
export { emitComponent } from "compiler-core-tachys"
export type { JsExpr, JsStmt } from "compiler-core-tachys"
export { compiledToIR } from "./compiled-to-ir"
export { irToCompiled } from "./ir-to-compiled"

function isPascalCase(name: string): boolean {
  const first = name.charCodeAt(0)
  return first >= 65 && first <= 90
}

type ImportLocal =
  | "markCompiled"
  | "_template"
  | "_mountList"
  | "_patchList"
  | "_mountCond"
  | "_patchCond"
  | "_mountAlt"
  | "_patchAlt"
  | "_batched"
  | "_attachEvent"

function importKey(local: ImportLocal): keyof PluginState["tachysImports"] {
  if (local === "markCompiled") return "markCompiled"
  if (local === "_template") return "template"
  if (local === "_mountList") return "mountList"
  if (local === "_patchList") return "patchList"
  if (local === "_mountCond") return "mountCond"
  if (local === "_patchCond") return "patchCond"
  if (local === "_mountAlt") return "mountAlt"
  if (local === "_patchAlt") return "patchAlt"
  if (local === "_attachEvent") return "attachEvent"
  return "batched"
}

function reserveImport(state: PluginState, local: ImportLocal): string {
  const key = importKey(local)
  const existing = state.tachysImports[key]
  if (existing !== null) return existing
  state.tachysImports[key] = local
  return local
}

function ensureImport(
  path: BabelCore.NodePath<BabelCore.types.Program>,
  t: typeof BabelCore.types,
  state: PluginState,
  local: ImportLocal,
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
