/**
 * Re-hydrate a portable `CompiledIR` into the Babel-typed `CompiledResult`
 * that the Babel-AST emitter consumes. Every IR expression source string
 * is parsed back into a Babel expression node via
 * `@babel/parser.parseExpression`.
 *
 * This bridge lets the Babel plugin route its pipeline through IR without
 * rewriting the AST-based emitter. A future non-Babel emitter (pure
 * string builder, or SWC-AST builder) would consume `CompiledIR` directly
 * and skip this step.
 */

import { parseExpression } from "@babel/parser"
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

type T = typeof BabelCore.types

/**
 * Parse an IR expression source string back into a Babel expression
 * node. `parseExpression` accepts a plain expression at the top level
 * (unlike `parse`, which needs a statement).
 */
function parseSrc(src: string): BabelCore.types.Expression {
  return parseExpression(src) as unknown as BabelCore.types.Expression
}

/**
 * Parse a template-literal source string and return the TemplateLiteral
 * node. Template-literal slots go through a dedicated accessor because
 * the emitter reaches into `.expressions` / `.quasis` fields directly.
 */
function parseTemplateLiteral(
  t: T,
  src: string,
): BabelCore.types.TemplateLiteral {
  const parsed = parseSrc(src)
  if (!t.isTemplateLiteral(parsed)) {
    throw new Error(
      `ir-to-compiled: expected TemplateLiteral, got ${parsed.type} for source: ${src}`,
    )
  }
  return parsed
}

function compositeFromIR(t: T, composite: IRCompositeExpr): CompositeExpr {
  return {
    expr: parseTemplateLiteral(t, composite.srcExpr),
    propNames: [...composite.propNames],
  }
}

function childPropEntryFromIR(entry: IRChildPropEntry): ChildPropEntry {
  if (entry.kind === "spread") {
    return {
      kind: "spread",
      valueExpr: parseSrc(entry.valueSrc),
      deps: [...entry.deps],
    }
  }
  return {
    kind: "prop",
    name: entry.name,
    valueExpr: parseSrc(entry.valueSrc),
    deps: [...entry.deps],
  }
}

function slotFromIR(t: T, slot: IRSlot): Slot {
  switch (slot.kind) {
    case "text": {
      const result: Slot = {
        kind: "text",
        path: [...slot.path],
        propName: slot.propName,
        placeholder: slot.placeholder,
      }
      if (slot.composite !== undefined) {
        result.composite = compositeFromIR(t, slot.composite)
      }
      return result
    }
    case "attr": {
      const result: Slot = {
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
        result.composite = compositeFromIR(t, slot.composite)
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
        props: slot.props.map(childPropEntryFromIR),
        allDeps: [...slot.allDeps],
      }
    case "list":
      return {
        kind: "list",
        path: [...slot.path],
        componentRef: slot.componentRef,
        arrayPropName: slot.arrayPropName,
        itemParamName: slot.itemParamName,
        keyExpr: parseSrc(slot.keySrc),
        propSpecs: slot.propSpecs.map((p) => ({
          name: p.name,
          valueExpr: parseSrc(p.valueSrc),
        })),
        parentPropDeps: [...slot.parentPropDeps],
      }
    case "cond":
      return {
        kind: "cond",
        path: [...slot.path],
        componentRef: slot.componentRef,
        condExpr: parseSrc(slot.condSrc),
        condDeps: [...slot.condDeps],
        props: slot.props.map(childPropEntryFromIR),
        allDeps: [...slot.allDeps],
      }
    case "alt":
      return {
        kind: "alt",
        path: [...slot.path],
        condExpr: parseSrc(slot.condSrc),
        condDeps: [...slot.condDeps],
        refA: slot.refA,
        propsA: slot.propsA.map(childPropEntryFromIR),
        refB: slot.refB,
        propsB: slot.propsB.map(childPropEntryFromIR),
        allDeps: [...slot.allDeps],
      }
  }
}

/**
 * Parse every expression in the IR back into Babel AST form, producing
 * the `CompiledResult` shape that the Babel-AST emitter consumes.
 */
export function irToCompiled(t: T, ir: CompiledIR): CompiledResult {
  return {
    html: ir.html,
    slots: ir.slots.map((s) => slotFromIR(t, s)),
    propsParamName: ir.propsParamName,
  }
}
