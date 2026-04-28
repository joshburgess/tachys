/**
 * String emitter for `CompiledIR`. Consumes the portable IR and produces
 * JavaScript source strings via the typed DSL in `js-dsl.ts`. No dependency
 * on any particular AST library — the Babel plugin shell parses the final
 * source string back into a Babel AST via `@babel/parser.parseExpression`
 * when it needs to hand a node to `path.replaceWith`.
 *
 * The emitter targets the same output shape as the original Babel-AST
 * emitter so the existing test suite (which asserts with substring
 * `.toContain` and regex `.toMatch`) keeps passing without retargeting.
 */

import * as D from "./js-dsl"
import type {
  CompiledIR,
  IRAltSlot,
  IRChildPropEntry,
  IRComponentSlot,
  IRCondSlot,
  IRListSlot,
  IRSlot,
  IRTextSlot,
} from "./ir"

type ListHelpers =
  | {
      kind: "hoisted"
      makePropsId: string
      keyOfId: string
      makePropsOrDiffId: string
    }
  | { kind: "inline" }

export interface EmitInput {
  ir: CompiledIR
  listHelpers: Map<number, ListHelpers>
  markCompiledName: string
}

export interface EmitResult {
  /** Source of the `markCompiled(mount, patch)` call expression. */
  callSrc: string
  /**
   * List helpers that the caller wanted hoisted. `kind: "hoisted"` entries
   * in `listHelpers` get an emitted `(item) => ({...})` / `(item) => key`
   * source pair the caller uses to declare module-scope consts.
   */
  hoistedHelpers: Array<{
    makePropsId: string
    makePropsSrc: string
    keyOfId: string
    keyOfSrc: string
    makePropsOrDiffId: string
    makePropsOrDiffSrc: string
  }>
}

/**
 * Build the path-navigation expression from `_root` to the node at `path`.
 * Same as the original emitter: firstChild + N * nextSibling per level.
 */
function pathExpr(rootName: string, path: readonly number[]): D.JsExpr {
  let expr: D.JsExpr = D.id(rootName)
  for (const index of path) {
    expr = D.member(expr, "firstChild")
    for (let i = 0; i < index; i++) {
      expr = D.member(expr, "nextSibling")
    }
  }
  return expr
}

function pathKey(path: readonly number[]): string {
  return path.join(",")
}

function slotRefName(index: number): string {
  return `_t${index}`
}
function listInstanceName(index: number): string {
  return `_ls${index}`
}
function condInstanceName(index: number): string {
  return `_cd${index}`
}
function altInstanceName(index: number): string {
  return `_al${index}`
}
function componentInstanceName(index: number): string {
  return `_cs${index}`
}

/**
 * Raw expression from IR source. The IR stores user expressions as JS
 * source strings and guarantees only that they are valid JS; precedence
 * is unknown, so we treat them at `ASSIGN` level — `wrap()` will add
 * parens when embedded in a tighter context.
 */
function rawExpr(src: string): D.JsExpr {
  return D.raw(src)
}

/**
 * Value expression for a text slot. Composite slots embed the template
 * literal directly (template literals stringify their interpolations);
 * simple slots wrap the prop read in `String(...)`.
 */
function textValueExpr(slot: IRTextSlot): D.JsExpr {
  if (slot.composite !== undefined) {
    return rawExpr(slot.composite.srcExpr)
  }
  return D.call(D.id("String"), [D.member(D.id("props"), slot.propName)])
}

/**
 * Value expression for an attr slot. See `buildAttrValueExpr` in the old
 * emitter for the three cases (composite template, ternary-of-strings,
 * plain prop with String() wrap). Null branches in a ternary collapse to
 * empty-string here; callers that want true omit/remove semantics handle
 * the conditional shape explicitly via `mountAttrStmts`/`patchAttrStmt`.
 */
function attrValueExpr(slot: import("./ir").IRAttrSlot): D.JsExpr {
  if (slot.composite !== undefined) {
    return rawExpr(slot.composite.srcExpr)
  }
  const propRef = D.member(D.id("props"), slot.propName)
  if (slot.ternary !== undefined) {
    return D.ternary(
      propRef,
      D.str(slot.ternary.ifTrue ?? ""),
      D.str(slot.ternary.ifFalse ?? ""),
    )
  }
  return D.call(D.id("String"), [propRef])
}

/**
 * Mount-side write for an attr slot. Returns one statement, or `null` to
 * skip writing entirely. A ternary with a `null` branch lets us avoid the
 * per-row `el.className = ""` write that otherwise leaves a `class=""`
 * attribute on cloneNode'd rows (see Krausest 08 paint regression).
 */
function mountAttrStmts(
  slot: import("./ir").IRAttrSlot,
  elExpr: D.JsExpr,
): D.JsStmt | null {
  const t = slot.ternary
  if (t !== undefined && (t.ifTrue === null || t.ifFalse === null)) {
    const propRef = D.member(D.id("props"), slot.propName)
    if (t.ifTrue !== null && t.ifFalse === null) {
      return D.ifStmt(propRef, [attrWriteStmt(slot, elExpr, D.str(t.ifTrue))])
    }
    if (t.ifTrue === null && t.ifFalse !== null) {
      return D.ifStmt(D.not(propRef), [
        attrWriteStmt(slot, elExpr, D.str(t.ifFalse)),
      ])
    }
    return null
  }
  return attrWriteStmt(slot, elExpr, attrValueExpr(slot))
}

/**
 * Patch-side write for an attr slot. For ternaries with a `null` branch
 * and `setAttribute` strategy, transitions in the null direction emit
 * `removeAttribute` so the attribute fully disappears (matching how the
 * mount path skipped it). `className` strategy keeps the simple
 * assignment with `""` for null since `el.className = ""` is faster than
 * `removeAttribute("class")` on Blink and visually equivalent for the
 * bench's `:not(.danger)` selectors.
 */
function patchAttrStmt(
  slot: import("./ir").IRAttrSlot,
  elExpr: D.JsExpr,
): D.JsStmt {
  const t = slot.ternary
  if (
    t !== undefined &&
    slot.strategy === "setAttribute" &&
    (t.ifTrue === null || t.ifFalse === null)
  ) {
    const propRef = D.member(D.id("props"), slot.propName)
    const setStmt = (val: string) =>
      D.exprStmt(
        D.call(D.member(elExpr, "setAttribute"), [D.str(slot.attrName), D.str(val)]),
      )
    const removeStmt = D.exprStmt(
      D.call(D.member(elExpr, "removeAttribute"), [D.str(slot.attrName)]),
    )
    if (t.ifTrue !== null && t.ifFalse === null) {
      return D.ifStmt(propRef, [setStmt(t.ifTrue)], [removeStmt])
    }
    if (t.ifTrue === null && t.ifFalse !== null) {
      return D.ifStmt(propRef, [removeStmt], [setStmt(t.ifFalse)])
    }
  }
  return attrWriteStmt(slot, elExpr, attrValueExpr(slot))
}

function attrWriteStmt(
  slot: import("./ir").IRAttrSlot,
  elExpr: D.JsExpr,
  value: D.JsExpr,
): D.JsStmt {
  if (slot.strategy === "className") {
    return D.exprStmt(D.assign(D.member(elExpr, "className"), value))
  }
  return D.exprStmt(
    D.call(D.member(elExpr, "setAttribute"), [D.str(slot.attrName), value]),
  )
}

/**
 * Full list of prop names a slot depends on, matching the original
 * `slotPropNames`. Used by the composite patch path for dirty-check OR.
 */
function slotPropNames(slot: IRSlot): string[] {
  if (slot.kind === "component") return slot.allDeps
  if (slot.kind === "list") {
    if (slot.parentPropDeps.length === 0) return [slot.arrayPropName]
    const seen = new Set<string>([slot.arrayPropName])
    const names = [slot.arrayPropName]
    for (const d of slot.parentPropDeps) {
      if (seen.has(d)) continue
      seen.add(d)
      names.push(d)
    }
    return names
  }
  if (slot.kind === "cond") return slot.allDeps
  if (slot.kind === "alt") return slot.allDeps
  if (slot.kind === "event") return [slot.propName]
  if (slot.composite !== undefined) return slot.composite.propNames
  return [slot.propName]
}

function collectReactiveProps(slots: readonly IRSlot[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const slot of slots) {
    for (const n of slotPropNames(slot)) {
      if (seen.has(n)) continue
      seen.add(n)
      out.push(n)
    }
  }
  return out
}

/**
 * Build the object literal passed to a child component as its props.
 * Preserves source order so later explicit keys can override spreads.
 */
function childPropsObj(entries: readonly IRChildPropEntry[]): D.JsExpr {
  const objEntries: D.ObjEntry[] = entries.map((p) => {
    if (p.kind === "spread") {
      return { kind: "spread", value: rawExpr(p.valueSrc) } as const
    }
    return {
      kind: "prop",
      key: p.name,
      value: rawExpr(p.valueSrc),
    } as const
  })
  return D.obj(objEntries)
}

/**
 * `() => ({...})` closure. Used for cond/alt makeProps so the closure
 * reads the current `props` every time it is invoked.
 */
function propsClosure(entries: readonly IRChildPropEntry[]): D.JsExpr {
  return D.arrow([], childPropsObj(entries))
}

/**
 * `(item, __r = {}) => { __r.a = ...; return __r }` for list slots.
 * The default parameter lets mount invoke with one arg (fresh alloc) while
 * the patch hot-loop passes a scratch object it reuses across iterations,
 * eliminating per-row allocations. Field assignment order is stable across
 * calls so V8 keeps a single hidden class for both mount and patch calls.
 */
function listMakePropsExpr(slot: IRListSlot): D.JsExpr {
  const stmts: D.JsStmt[] = []
  for (const p of slot.propSpecs) {
    stmts.push(
      D.exprStmt(
        D.assign(D.member(D.id("__r"), p.name), rawExpr(p.valueSrc)),
      ),
    )
  }
  stmts.push(D.ret(D.id("__r")))
  return D.arrowBlock([slot.itemParamName, "__r = {}"], stmts)
}

/**
 * `(item, __r, __p) => { ... }` — patch-path makeProps with a third
 * `prevState` parameter. Computes each prop value into a local, compares
 * the locals to the corresponding `__p.<name>` slot, and returns `null`
 * when every slot already matches (no work needed). Otherwise writes the
 * locals into `__r` (allocating an empty object on first use) and returns
 * it. The list runtime calls this in place of `makeProps + patchFn` to
 * skip the per-row patch closure on no-op rows entirely.
 *
 * For an empty propSpec list, returns the trivial `(_, __r) => __r ?? {}`
 * since there's nothing to compare; it's never actually invoked because
 * the runtime needs propSpecs to do anything useful, but keeping it
 * defined avoids special-casing in the call site.
 */
function listMakePropsOrDiffExpr(slot: IRListSlot): D.JsExpr {
  const stmts: D.JsStmt[] = []
  if (slot.propSpecs.length === 0) {
    stmts.push(D.ret(D.id("__r")))
    return D.arrowBlock([slot.itemParamName, "__r = {}", "__p"], stmts)
  }
  slot.propSpecs.forEach((p, i) => {
    stmts.push(D.vdecl("const", `__v${i}`, rawExpr(p.valueSrc)))
  })
  let bail: D.JsExpr = D.bin(
    "===",
    D.member(D.id("__p"), slot.propSpecs[0]!.name),
    D.id("__v0"),
  )
  for (let i = 1; i < slot.propSpecs.length; i++) {
    bail = D.and(
      bail,
      D.bin(
        "===",
        D.member(D.id("__p"), slot.propSpecs[i]!.name),
        D.id(`__v${i}`),
      ),
    )
  }
  stmts.push(D.ifStmt(bail, [D.ret(D.nullLit)]))
  stmts.push(
    D.exprStmt(D.assign(D.id("__r"), D.or(D.id("__r"), D.obj([])))),
  )
  slot.propSpecs.forEach((p, i) => {
    stmts.push(
      D.exprStmt(D.assign(D.member(D.id("__r"), p.name), D.id(`__v${i}`))),
    )
  })
  stmts.push(D.ret(D.id("__r")))
  return D.arrowBlock([slot.itemParamName, "__r", "__p"], stmts)
}

/**
 * `(item) => <keyExpr>` for list slots.
 */
function listKeyOfExpr(slot: IRListSlot): D.JsExpr {
  return D.arrow([slot.itemParamName], rawExpr(slot.keySrc))
}

/**
 * Build the mount function as a single `JsExpr` arrow.
 */
function emitMount(
  ir: CompiledIR,
  tplId: string,
  listHelpers: Map<number, ListHelpers>,
): D.JsExpr {
  const stmts: D.JsStmt[] = []
  const slots = ir.slots
  const propsName = ir.propsParamName

  // const _root = <tpl>.cloneNode(true);
  stmts.push(
    D.vdecl(
      "const",
      "_root",
      D.call(D.member(D.id(tplId), "cloneNode"), [D.bool(true)]),
    ),
  )

  const stateEntries: D.ObjEntry[] = []
  const seenPropNames = new Set<string>()

  // Path-binding cache: maps pathKey -> binding name. Lets `pathFrom` walk
  // from the deepest already-bound ancestor so paths that share a prefix
  // (e.g. [1,0] and [1,0,0]) avoid re-traversing from _root.
  const pathBindings = new Map<string, string>()
  pathBindings.set("", "_root")

  function pathFrom(path: readonly number[]): D.JsExpr {
    if (path.length === 0) return D.id("_root")
    for (let len = path.length - 1; len >= 0; len--) {
      const ancestor = pathBindings.get(pathKey(path.slice(0, len)))
      if (ancestor === undefined) continue
      let expr: D.JsExpr = D.id(ancestor)
      for (let j = len; j < path.length; j++) {
        expr = D.member(expr, "firstChild")
        const stepIdx = path[j]!
        for (let k = 0; k < stepIdx; k++) {
          expr = D.member(expr, "nextSibling")
        }
      }
      return expr
    }
    return pathExpr("_root", path)
  }

  function registerPath(path: readonly number[], name: string): void {
    if (path.length === 0) return
    pathBindings.set(pathKey(path), name)
  }

  // Element-ref cache: multiple attrs on the same path share one _eN.
  const elementRefs = new Map<string, string>()
  let elementCounter = 0
  const ensureElementRef = (path: readonly number[]): string => {
    if (path.length === 0) return "_root"
    const key = pathKey(path)
    const existing = elementRefs.get(key)
    if (existing !== undefined) return existing
    const name = `_e${elementCounter++}`
    elementRefs.set(key, name)
    stmts.push(D.vdecl("const", name, pathFrom(path)))
    registerPath(path, name)
    return name
  }

  const registerSlotProps = (slot: IRSlot): void => {
    for (const name of slotPropNames(slot)) {
      if (seenPropNames.has(name)) continue
      seenPropNames.add(name)
      stateEntries.push({
        kind: "prop",
        key: name,
        value: D.member(D.id(propsName), name),
      })
    }
  }

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!

    if (slot.kind === "text") {
      const refName = slotRefName(i)
      if (slot.placeholder === "prealloc") {
        stmts.push(D.vdecl("const", refName, pathFrom(slot.path)))
        registerPath(slot.path, refName)
        stmts.push(
          D.exprStmt(
            D.assign(D.member(D.id(refName), "data"), textValueExpr(slot)),
          ),
        )
      } else {
        const markerName = `_m${i}`
        stmts.push(D.vdecl("const", markerName, pathFrom(slot.path)))
        registerPath(slot.path, markerName)
        stmts.push(
          D.vdecl(
            "const",
            refName,
            D.call(D.member(D.id("document"), "createTextNode"), [
              textValueExpr(slot),
            ]),
          ),
        )
        stmts.push(
          D.exprStmt(
            D.call(D.member(D.member(D.id(markerName), "parentNode"), "replaceChild"), [
              D.id(refName),
              D.id(markerName),
            ]),
          ),
        )
      }
      stateEntries.push({ kind: "shorthand", name: refName })
      registerSlotProps(slot)
      continue
    }

    if (slot.kind === "attr") {
      const elName = ensureElementRef(slot.path)
      const stmt = mountAttrStmts(slot, D.id(elName))
      if (stmt !== null) stmts.push(stmt)
      registerSlotProps(slot)
      continue
    }

    if (slot.kind === "event") {
      // Reserve the element ref. The listener is assigned later, after
      // `state` is declared, so the closure can read `state.onX`.
      ensureElementRef(slot.path)
      registerSlotProps(slot)
      continue
    }

    if (slot.kind === "list") {
      const markerName = `_lm${i}`
      const instName = listInstanceName(i)
      const helpers = listHelpers.get(i)!
      const makeProps =
        helpers.kind === "hoisted" ? D.id(helpers.makePropsId) : listMakePropsExpr(slot)
      const keyOf =
        helpers.kind === "hoisted" ? D.id(helpers.keyOfId) : listKeyOfExpr(slot)

      stmts.push(D.vdecl("const", markerName, pathFrom(slot.path)))
      registerPath(slot.path, markerName)

      const args: D.JsExpr[] = [
        D.member(D.id(propsName), slot.arrayPropName),
        D.id(slot.componentRef),
        makeProps,
        keyOf,
        D.id(markerName),
      ]
      if (slot.parentPropDeps.length > 0) {
        args.push(
          D.arr(slot.parentPropDeps.map((d) => D.member(D.id(propsName), d))),
        )
      }
      stmts.push(
        D.vdecl("const", instName, D.call(D.id("_mountList"), args)),
      )
      stateEntries.push({ kind: "shorthand", name: instName })
      registerSlotProps(slot)
      continue
    }

    if (slot.kind === "cond") {
      const markerName = `_cdm${i}`
      const instName = condInstanceName(i)
      stmts.push(D.vdecl("const", markerName, pathFrom(slot.path)))
      registerPath(slot.path, markerName)
      stmts.push(
        D.vdecl(
          "const",
          instName,
          D.call(D.id("_mountCond"), [
            rawExpr(slot.condSrc),
            D.id(slot.componentRef),
            propsClosure(slot.props),
            D.id(markerName),
          ]),
        ),
      )
      stateEntries.push({ kind: "shorthand", name: instName })
      registerSlotProps(slot)
      continue
    }

    if (slot.kind === "alt") {
      const markerName = `_alm${i}`
      const instName = altInstanceName(i)
      stmts.push(D.vdecl("const", markerName, pathFrom(slot.path)))
      registerPath(slot.path, markerName)
      stmts.push(
        D.vdecl(
          "const",
          instName,
          D.call(D.id("_mountAlt"), [
            rawExpr(slot.condSrc),
            D.id(slot.refA),
            propsClosure(slot.propsA),
            D.id(slot.refB),
            propsClosure(slot.propsB),
            D.id(markerName),
          ]),
        ),
      )
      stateEntries.push({ kind: "shorthand", name: instName })
      registerSlotProps(slot)
      continue
    }

    if (slot.kind === "component") {
      const markerName = `_cm${i}`
      const instName = componentInstanceName(i)
      stmts.push(D.vdecl("const", markerName, pathFrom(slot.path)))
      registerPath(slot.path, markerName)
      stmts.push(
        D.vdecl(
          "const",
          instName,
          D.call(D.id(slot.componentRef), [childPropsObj(slot.props)]),
        ),
      )
      stmts.push(
        D.exprStmt(
          D.call(D.member(D.member(D.id(markerName), "parentNode"), "replaceChild"), [
            D.member(D.id(instName), "dom"),
            D.id(markerName),
          ]),
        ),
      )
      stateEntries.push({ kind: "shorthand", name: instName })
      registerSlotProps(slot)
      continue
    }
  }

  // Element refs + root go into state (for attr/event patches).
  for (const [, elName] of elementRefs) {
    stateEntries.push({ kind: "shorthand", name: elName })
  }
  const needsRoot = slots.some(
    (s) => (s.kind === "attr" || s.kind === "event") && s.path.length === 0,
  )
  if (needsRoot) {
    stateEntries.push({ kind: "shorthand", name: "_root" })
  }

  stmts.push(D.vdecl("const", "state", D.obj(stateEntries)))

  // Event listener wrappers, installed after state is declared so the
  // closure sees `state`. The inner call is wrapped in `_batched(...)` so
  // setStates inside the handler skip the queueMicrotask(autoFlush)
  // boundary and flush synchronously via flushSyncBatch -- collapsing the
  // click / render trace into one FunctionCall, matching the delegated-
  // event path.
  for (const slot of slots) {
    if (slot.kind !== "event") continue
    const elName = ensureElementRef(slot.path)
    const wrapper = rawExpr(
      `function (ev) { return _batched(() => state.${slot.propName}.call(this, ev)); }`,
    )
    stmts.push(D.exprStmt(D.assign(D.member(D.id(elName), slot.domProp), wrapper)))
  }

  stmts.push(
    D.ret(
      D.obj([
        { kind: "prop", key: "dom", value: D.id("_root") },
        { kind: "shorthand", name: "state" },
      ]),
    ),
  )

  const params = slots.length > 0 ? [propsName] : []
  return D.arrowBlock(params, stmts)
}

/**
 * Emit a single DOM write for a slot in the patch body.
 */
function emitSlotWrite(
  slot: IRSlot,
  index: number,
  slots: readonly IRSlot[],
  listHelpers: Map<number, ListHelpers>,
): D.JsStmt | null {
  if (slot.kind === "text") {
    const refName = slotRefName(index)
    return D.exprStmt(
      D.assign(
        D.member(D.member(D.id("state"), refName), "data"),
        textValueExpr(slot),
      ),
    )
  }
  if (slot.kind === "attr") {
    const el = stateElementExpr(slots, slot.path)
    return patchAttrStmt(slot, el)
  }
  if (slot.kind === "component") {
    const compSlot = slot as IRComponentSlot
    return D.exprStmt(
      D.call(D.member(D.id(compSlot.componentRef), "patch"), [
        D.member(D.member(D.id("state"), componentInstanceName(index)), "state"),
        childPropsObj(compSlot.props),
      ]),
    )
  }
  if (slot.kind === "list") {
    const listSlot = slot as IRListSlot
    const helpers = listHelpers.get(index)!
    const makeProps =
      helpers.kind === "hoisted"
        ? D.id(helpers.makePropsId)
        : listMakePropsExpr(listSlot)
    const makePropsOrDiff =
      helpers.kind === "hoisted"
        ? D.id(helpers.makePropsOrDiffId)
        : listMakePropsOrDiffExpr(listSlot)
    const keyOf =
      helpers.kind === "hoisted"
        ? D.id(helpers.keyOfId)
        : listKeyOfExpr(listSlot)
    const args: D.JsExpr[] = [
      D.member(D.id("state"), listInstanceName(index)),
      D.member(D.id("props"), listSlot.arrayPropName),
      D.id(listSlot.componentRef),
      makeProps,
      keyOf,
      makePropsOrDiff,
    ]
    if (listSlot.parentPropDeps.length > 0) {
      args.push(
        D.arr(listSlot.parentPropDeps.map((d) => D.member(D.id("props"), d))),
      )
      if (listSlot.selectionDepIndices.length > 0) {
        args.push(
          D.arr(listSlot.selectionDepIndices.map((i) => D.num(i))),
        )
      }
    }
    return D.exprStmt(D.call(D.id("_patchList"), args))
  }
  if (slot.kind === "cond") {
    const condSlot = slot as IRCondSlot
    return D.exprStmt(
      D.call(D.id("_patchCond"), [
        D.member(D.id("state"), condInstanceName(index)),
        rawExpr(condSlot.condSrc),
        D.id(condSlot.componentRef),
        propsClosure(condSlot.props),
      ]),
    )
  }
  if (slot.kind === "alt") {
    const altSlot = slot as IRAltSlot
    return D.exprStmt(
      D.call(D.id("_patchAlt"), [
        D.member(D.id("state"), altInstanceName(index)),
        rawExpr(altSlot.condSrc),
        D.id(altSlot.refA),
        propsClosure(altSlot.propsA),
        D.id(altSlot.refB),
        propsClosure(altSlot.propsB),
      ]),
    )
  }
  return null
}

/**
 * Rebuild the element ref name assigned in mount for a given path so
 * patch writes can read it off `state`. Mirrors the original's replay.
 */
function stateElementExpr(
  slots: readonly IRSlot[],
  path: readonly number[],
): D.JsExpr {
  if (path.length === 0) return D.member(D.id("state"), "_root")
  const key = pathKey(path)
  let counter = 0
  const seen = new Map<string, number>()
  for (const s of slots) {
    if (s.kind !== "attr" && s.kind !== "event") continue
    if (s.path.length === 0) continue
    const k = pathKey(s.path)
    if (!seen.has(k)) seen.set(k, counter++)
    if (k === key) return D.member(D.id("state"), `_e${seen.get(k)!}`)
  }
  throw new Error(`no element ref for path [${path.join(",")}]`)
}

function emitLeadingBail(propNames: readonly string[], propsName: string): D.JsStmt | null {
  if (propNames.length === 0) return null
  const cmp = (name: string) =>
    D.bin("===", D.member(D.id("state"), name), D.member(D.id(propsName), name))
  let expr: D.JsExpr = cmp(propNames[0]!)
  for (let i = 1; i < propNames.length; i++) expr = D.and(expr, cmp(propNames[i]!))
  return D.ifStmt(expr, [D.retVoid()])
}

function emitPatchSimple(
  ir: CompiledIR,
  listHelpers: Map<number, ListHelpers>,
): D.JsExpr {
  const propsName = ir.propsParamName
  const slots = ir.slots
  const grouped = new Map<string, Array<{ slot: IRSlot; index: number }>>()
  slots.forEach((slot, index) => {
    if (
      slot.kind === "component" ||
      slot.kind === "list" ||
      slot.kind === "cond" ||
      slot.kind === "alt"
    ) {
      return
    }
    const arr = grouped.get(slot.propName) ?? []
    arr.push({ slot, index })
    grouped.set(slot.propName, arr)
  })

  const stmts: D.JsStmt[] = []
  const propNames = collectReactiveProps(slots)
  const bail = emitLeadingBail(propNames, propsName)
  if (bail !== null) stmts.push(bail)
  for (const [propName, group] of grouped) {
    const writes: D.JsStmt[] = []
    for (const { slot, index } of group) {
      const w = emitSlotWrite(slot, index, slots, listHelpers)
      if (w !== null) writes.push(w)
    }
    writes.push(
      D.exprStmt(
        D.assign(
          D.member(D.id("state"), propName),
          D.member(D.id(propsName), propName),
        ),
      ),
    )
    stmts.push(
      D.ifStmt(
        D.bin(
          "!==",
          D.member(D.id("state"), propName),
          D.member(D.id(propsName), propName),
        ),
        writes,
      ),
    )
  }

  return D.arrowBlock(["state", propsName], stmts)
}

function emitPatchComposite(
  ir: CompiledIR,
  listHelpers: Map<number, ListHelpers>,
): D.JsExpr {
  const propsName = ir.propsParamName
  const slots = ir.slots
  const propNames = collectReactiveProps(slots)
  const dirtyLocals = new Map<string, string>()
  const stmts: D.JsStmt[] = []

  const bail = emitLeadingBail(propNames, propsName)
  if (bail !== null) stmts.push(bail)

  propNames.forEach((name, i) => {
    const local = `_d${i}`
    dirtyLocals.set(name, local)
    stmts.push(
      D.vdecl(
        "const",
        local,
        D.bin(
          "!==",
          D.member(D.id("state"), name),
          D.member(D.id(propsName), name),
        ),
      ),
    )
  })

  slots.forEach((slot, index) => {
    const deps = slotPropNames(slot)
    if (deps.length === 0) return
    const write = emitSlotWrite(slot, index, slots, listHelpers)
    if (write === null) return
    let test: D.JsExpr = D.id(dirtyLocals.get(deps[0]!)!)
    for (let i = 1; i < deps.length; i++) {
      test = D.or(test, D.id(dirtyLocals.get(deps[i]!)!))
    }
    stmts.push(D.ifStmt(test, [write]))
  })

  propNames.forEach((name) => {
    const local = dirtyLocals.get(name)!
    stmts.push(
      D.ifStmt(D.id(local), [
        D.exprStmt(
          D.assign(
            D.member(D.id("state"), name),
            D.member(D.id(propsName), name),
          ),
        ),
      ]),
    )
  })

  return D.arrowBlock(["state", propsName], stmts)
}

function emitPatch(
  ir: CompiledIR,
  listHelpers: Map<number, ListHelpers>,
): D.JsExpr {
  if (ir.slots.length === 0) {
    return D.arrowBlock(["state", ir.propsParamName], [])
  }
  const hasComposite = ir.slots.some(
    (s) =>
      s.kind === "component" ||
      s.kind === "list" ||
      s.kind === "cond" ||
      s.kind === "alt" ||
      ((s.kind === "text" || s.kind === "attr") && s.composite !== undefined),
  )
  return hasComposite
    ? emitPatchComposite(ir, listHelpers)
    : emitPatchSimple(ir, listHelpers)
}

/**
 * Top-level emit: produce the `markCompiled(mount, patch)` call source
 * plus any hoisted list helpers the plugin shell should declare at module
 * scope.
 *
 * `tplId` is the const name the shell will bind to `_template("...")`;
 * this emitter just references it.
 */
export function emitComponent(
  ir: CompiledIR,
  opts: {
    tplId: string
    listHelpers: Map<number, ListHelpers>
    markCompiledName: string
  },
): EmitResult {
  const mount = emitMount(ir, opts.tplId, opts.listHelpers)
  const patch = emitPatch(ir, opts.listHelpers)

  const call = D.call(D.id(opts.markCompiledName), [mount, patch])

  const hoisted: EmitResult["hoistedHelpers"] = []
  ir.slots.forEach((slot, index) => {
    if (slot.kind !== "list") return
    const helpers = opts.listHelpers.get(index)
    if (helpers === undefined || helpers.kind !== "hoisted") return
    hoisted.push({
      makePropsId: helpers.makePropsId,
      makePropsSrc: listMakePropsExpr(slot).src,
      keyOfId: helpers.keyOfId,
      keyOfSrc: listKeyOfExpr(slot).src,
      makePropsOrDiffId: helpers.makePropsOrDiffId,
      makePropsOrDiffSrc: listMakePropsOrDiffExpr(slot).src,
    })
  })

  return { callSrc: call.src, hoistedHelpers: hoisted }
}

export type { ListHelpers }
