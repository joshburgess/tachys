/**
 * Convert the Babel-typed `CompiledResult` produced by `compile.ts` into
 * the portable `CompiledIR` in `ir.ts`. Every user-authored expression is
 * serialized to a source-code string via `@babel/generator`; the list of
 * parent prop names each expression reads is copied through unchanged.
 *
 * This is the "adapter" between the Babel-specific frontend and the
 * portable IR that the emitter consumes. A future SWC frontend would
 * produce `CompiledIR` directly (via its own AST walk); the emitter is
 * unaware of which frontend produced its input.
 */

import * as generatorNs from "@babel/generator"
import type * as BabelCore from "@babel/core"

import type {
  ChildPropEntry,
  CompiledResult,
  CompositeExpr,
  Slot,
} from "./compile"
import type {
  CompiledIR,
  IRChildPropEntry,
  IRCompositeExpr,
  IRSlot,
} from "compiler-core-tachys"

/**
 * `@babel/generator` ships the generator function under different export
 * names depending on the resolution (CJS ships it as the default export;
 * the named re-exports differ between versions). Normalize across forms
 * so the plugin works in every consumer setup.
 */
type GenerateFn = (
  ast: BabelCore.types.Node,
  opts?: { compact?: boolean; comments?: boolean },
) => { code: string }
const ns = generatorNs as unknown as {
  default?: GenerateFn | { default?: GenerateFn }
}
const defaultExport = ns.default
const generateFn: GenerateFn =
  typeof defaultExport === "function"
    ? defaultExport
    : defaultExport !== undefined && typeof defaultExport.default === "function"
      ? defaultExport.default
      : (generatorNs as unknown as GenerateFn)

/**
 * Stringify a Babel expression node to its JavaScript source form.
 * Uses `compact: true` so the emitted source is whitespace-minimal;
 * downstream formatting (from @babel/generator's final pass on the
 * whole module) handles pretty-printing.
 */
function exprSrc(expr: BabelCore.types.Expression): string {
  return generateFn(expr as BabelCore.types.Node, {
    compact: true,
    comments: false,
  }).code
}

function compositeToIR(composite: CompositeExpr): IRCompositeExpr {
  return {
    srcExpr: exprSrc(composite.expr),
    propNames: [...composite.propNames],
  }
}

function childPropEntryToIR(entry: ChildPropEntry): IRChildPropEntry {
  if (entry.kind === "spread") {
    return {
      kind: "spread",
      valueSrc: exprSrc(entry.valueExpr),
      deps: [...entry.deps],
    }
  }
  return {
    kind: "prop",
    name: entry.name,
    valueSrc: exprSrc(entry.valueExpr),
    deps: [...entry.deps],
  }
}

function slotToIR(slot: Slot): IRSlot {
  switch (slot.kind) {
    case "text": {
      const result: IRSlot = {
        kind: "text",
        path: [...slot.path],
        propName: slot.propName,
        placeholder: slot.placeholder,
      }
      if (slot.composite !== undefined) {
        result.composite = compositeToIR(slot.composite)
      }
      return result
    }
    case "attr": {
      const result: IRSlot = {
        kind: "attr",
        path: [...slot.path],
        attrName: slot.attrName,
        strategy: slot.strategy,
        propName: slot.propName,
      }
      if (slot.ternary !== undefined) {
        result.ternary = {
          ifTrue: slot.ternary.ifTrue,
          ifFalse: slot.ternary.ifFalse,
        }
      }
      if (slot.composite !== undefined) {
        result.composite = compositeToIR(slot.composite)
      }
      return result
    }
    case "event":
      return {
        kind: "event",
        path: [...slot.path],
        domProp: slot.domProp,
        propName: slot.propName,
      }
    case "component":
      return {
        kind: "component",
        path: [...slot.path],
        componentRef: slot.componentRef,
        props: slot.props.map(childPropEntryToIR),
        allDeps: [...slot.allDeps],
      }
    case "list":
      return {
        kind: "list",
        path: [...slot.path],
        componentRef: slot.componentRef,
        arrayPropName: slot.arrayPropName,
        itemParamName: slot.itemParamName,
        keySrc: exprSrc(slot.keyExpr),
        propSpecs: slot.propSpecs.map((p) => ({
          name: p.name,
          valueSrc: exprSrc(p.valueExpr),
        })),
        parentPropDeps: [...slot.parentPropDeps],
      }
    case "cond":
      return {
        kind: "cond",
        path: [...slot.path],
        componentRef: slot.componentRef,
        condSrc: exprSrc(slot.condExpr),
        condDeps: [...slot.condDeps],
        props: slot.props.map(childPropEntryToIR),
        allDeps: [...slot.allDeps],
      }
    case "alt":
      return {
        kind: "alt",
        path: [...slot.path],
        condSrc: exprSrc(slot.condExpr),
        condDeps: [...slot.condDeps],
        refA: slot.refA,
        propsA: slot.propsA.map(childPropEntryToIR),
        refB: slot.refB,
        propsB: slot.propsB.map(childPropEntryToIR),
        allDeps: [...slot.allDeps],
      }
  }
}

/**
 * Convert a Babel-typed `CompiledResult` into the portable IR. Every
 * expression node is serialized to a source string; all other fields
 * are deep-copied so callers can safely mutate the IR.
 */
export function compiledToIR(compiled: CompiledResult): CompiledIR {
  return {
    html: compiled.html,
    slots: compiled.slots.map(slotToIR),
    propsParamName: compiled.propsParamName,
  }
}
