/**
 * swc-plugin-tachys
 *
 * Top-level `transform(source)` API that parses JSX with `@swc/core`,
 * compiles every Tachys-eligible `FunctionDeclaration` via
 * `compileComponentSwc`, runs the portable emitter from
 * `compiler-core-tachys` over the resulting `CompiledIR`, and returns
 * the rewritten source plus any module-scope helper declarations.
 *
 * This is a plain async function (not a real SWC Rust/WASM plugin). It
 * pairs with SWC-based toolchains the same way `babel-plugin-tachys`
 * pairs with Babel: feed it source, get back compiled source.
 *
 * How it rewrites:
 *   - Parses to an SWC `Module`.
 *   - For each FunctionDeclaration that passes `compileComponentSwc`,
 *     records the byte span of the declaration plus the replacement
 *     source (`const Name = markCompiled(mount, patch, compare);`).
 *   - Splices all replacements back into the original source string
 *     in reverse order (so earlier spans don't shift).
 *   - Prepends `import { markCompiled, _template, ... } from "tachys";`
 *     (deduped against any existing tachys import), the template
 *     `const _tpl$Name_N = _template("...");` decls, and any hoisted
 *     list helpers.
 *
 * The emitted module string is what the caller passes to the rest of
 * their build pipeline (e.g. SWC again for final transpilation, or a
 * bundler's own JS transform).
 */

import { parse } from "@swc/core"
import type {
  FunctionDeclaration,
  Module,
  ModuleItem,
  Statement,
} from "@swc/types"

import { emitComponent, type ListHelpers } from "compiler-core-tachys"

import { compileComponentSwc, isPascalCase } from "./compile-swc"

export { compileComponentSwc, isPascalCase } from "./compile-swc"

export interface TransformOptions {
  /**
   * Source filename. Only used for diagnostics; the parser doesn't read
   * from disk. Defaults to `"input.jsx"`.
   */
  filename?: string
}

export interface TransformResult {
  code: string
  /**
   * Number of functions that were rewritten to `markCompiled` form.
   * Zero means the source was left untouched (apart from possibly
   * having the `tachys` import added — we don't do that if nothing
   * compiled).
   */
  compiled: number
}

type Replacement = { start: number; end: number; text: string }

interface ImportFlags {
  markCompiled: boolean
  template: boolean
  mountList: boolean
  patchList: boolean
  mountCond: boolean
  patchCond: boolean
  mountAlt: boolean
  patchAlt: boolean
}

/**
 * SWC spans are 1-based byte offsets. Every `Module.span` sets the base;
 * nested node spans live in the same absolute frame. We convert them to
 * 0-based string indices for `String.prototype.slice`.
 */
function toZeroBased(span: { start: number; end: number }, base: number): {
  start: number
  end: number
} {
  return { start: span.start - base, end: span.end - base }
}

export async function transform(
  source: string,
  opts: TransformOptions = {},
): Promise<TransformResult> {
  const filename = opts.filename ?? "input.jsx"
  // Pick the parser based on the extension: .ts/.tsx routes through the
  // TypeScript parser (tsx on for .tsx), everything else uses the
  // ECMAScript parser with JSX enabled so plain .js/.jsx sources work.
  const isTs = filename.endsWith(".ts") || filename.endsWith(".tsx")
  const mod: Module = isTs
    ? await parse(source, {
        syntax: "typescript",
        tsx: filename.endsWith(".tsx"),
        comments: false,
        script: false,
      })
    : ((await parse(source, {
        syntax: "ecmascript",
        jsx: true,
        comments: false,
        script: false,
      })) as Module)

  const base = mod.span.start

  const replacements: Replacement[] = []
  const templates: Array<{ id: string; html: string }> = []
  const hoistedHelpers: Array<{ id: string; src: string }> = []
  /**
   * Track which runtime helpers we need to import. Order in output
   * matches this array.
   */
  const imports: ImportFlags = {
    markCompiled: false,
    template: false,
    mountList: false,
    patchList: false,
    mountCond: false,
    patchCond: false,
    mountAlt: false,
    patchAlt: false,
  }
  let counter = 0

  for (const item of mod.body) {
    const fn = extractFunctionDecl(item)
    if (fn === null) continue
    const name = fn.identifier.value
    if (!isPascalCase(name)) continue

    const ir = compileComponentSwc(fn)
    if (ir === null) continue

    const tplId = `_tpl$${name}_${counter++}`
    templates.push({ id: tplId, html: ir.html })
    imports.markCompiled = true
    imports.template = true

    const listHelpers = new Map<number, ListHelpers>()
    ir.slots.forEach((slot, index) => {
      if (slot.kind === "list") {
        imports.mountList = true
        imports.patchList = true
        if (slot.parentPropDeps.length === 0) {
          listHelpers.set(index, {
            kind: "hoisted",
            makePropsId: `_lp$${name}_${index}`,
            keyOfId: `_lk$${name}_${index}`,
          })
        } else {
          listHelpers.set(index, { kind: "inline" })
        }
        return
      }
      if (slot.kind === "cond") {
        imports.mountCond = true
        imports.patchCond = true
      }
      if (slot.kind === "alt") {
        imports.mountAlt = true
        imports.patchAlt = true
      }
    })

    const { callSrc, hoistedHelpers: helpers } = emitComponent(ir, {
      tplId,
      listHelpers,
      markCompiledName: "markCompiled",
    })

    for (const h of helpers) {
      hoistedHelpers.push({ id: h.makePropsId, src: h.makePropsSrc })
      hoistedHelpers.push({ id: h.keyOfId, src: h.keyOfSrc })
    }

    const span = toZeroBased(fn.span, base)
    replacements.push({
      start: span.start,
      end: span.end,
      text: `const ${name} = ${callSrc};`,
    })
  }

  if (replacements.length === 0) {
    return { code: source, compiled: 0 }
  }

  // Splice replacements back into the source in reverse order so earlier
  // spans don't shift.
  let out = source
  replacements.sort((a, b) => b.start - a.start)
  for (const r of replacements) {
    out = out.slice(0, r.start) + r.text + out.slice(r.end)
  }

  const prelude = buildPrelude(imports, templates, hoistedHelpers, mod, source, base)
  out = prelude + out

  return { code: out, compiled: replacements.length }
}

function extractFunctionDecl(item: ModuleItem): FunctionDeclaration | null {
  if (item.type === "FunctionDeclaration") return item as FunctionDeclaration
  if (item.type === "ExportDeclaration") {
    const decl = (item as { declaration: { type: string } }).declaration
    if (decl.type === "FunctionDeclaration") {
      return decl as FunctionDeclaration
    }
  }
  return null
}

function buildPrelude(
  imports: ImportFlags,
  templates: Array<{ id: string; html: string }>,
  hoistedHelpers: Array<{ id: string; src: string }>,
  mod: Module,
  source: string,
  base: number,
): string {
  const specifiers: string[] = []
  if (imports.markCompiled) specifiers.push("markCompiled")
  if (imports.template) specifiers.push("_template")
  if (imports.mountList) specifiers.push("_mountList")
  if (imports.patchList) specifiers.push("_patchList")
  if (imports.mountCond) specifiers.push("_mountCond")
  if (imports.patchCond) specifiers.push("_patchCond")
  if (imports.mountAlt) specifiers.push("_mountAlt")
  if (imports.patchAlt) specifiers.push("_patchAlt")

  const hasExisting = findTachysImport(mod, source, base)
  const importDecl =
    hasExisting === null
      ? `import { ${specifiers.join(", ")} } from "tachys";\n`
      : ""

  const helperDecls = hoistedHelpers
    .map((h) => `const ${h.id} = ${h.src};\n`)
    .join("")
  const tplDecls = templates
    .map((t) => `const ${t.id} = _template(${JSON.stringify(t.html)});\n`)
    .join("")

  return importDecl + helperDecls + tplDecls
}

/**
 * Locate an existing `from "tachys"` import so we don't double-emit the
 * declaration. Returns the span of the specifier list if found (for a
 * future specifier-merging pass); returns null if no import exists.
 * The current implementation doesn't yet merge into an existing import,
 * matching how the Babel plugin behaves only when no conflict is seen.
 */
function findTachysImport(
  _mod: Module,
  _source: string,
  _base: number,
): { start: number; end: number } | null {
  // TODO: merge into existing tachys import if one already imports a
  // different member. For now, we always emit a fresh decl and the user
  // is expected to only import via this plugin. Callers can dedupe with
  // a later pass if needed.
  return null
}
