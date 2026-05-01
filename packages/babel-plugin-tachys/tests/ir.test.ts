import { parse } from "@babel/parser"
import * as t from "@babel/types"
import { describe, expect, it } from "vitest"

import { compileComponent } from "../src/compile"
import { compiledToIR } from "../src/compiled-to-ir"
import { irToCompiled } from "../src/ir-to-compiled"

/**
 * Pull the first `FunctionDeclaration` out of a source snippet and hand
 * it to `compileComponent`. Kept in-test to avoid leaking the Babel
 * fixture plumbing into library code.
 */
function compileFromSource(src: string) {
  const file = parse(src, {
    sourceType: "module",
    plugins: ["jsx"],
  })
  const fn = file.program.body.find((n) => t.isFunctionDeclaration(n))
  if (fn === undefined) throw new Error("no FunctionDeclaration in fixture")
  const compiled = compileComponent(
    fn as t.FunctionDeclaration,
    t as unknown as typeof import("@babel/core").types,
  )
  if (compiled === null) throw new Error("compileComponent bailed")
  return compiled
}

describe("CompiledIR (portable boundary)", () => {
  it("round-trips a text-slot component through IR without losing information", () => {
    const compiled = compileFromSource(`
      function Greeting({ name }) {
        return <span class="g">{name}</span>;
      }
    `)
    const ir = compiledToIR(compiled)

    expect(ir.html).toBe('<span class="g"> </span>')
    expect(ir.slots).toHaveLength(1)
    const slot = ir.slots[0]!
    expect(slot.kind).toBe("text")
    if (slot.kind === "text") {
      expect(slot.propName).toBe("name")
      expect(slot.placeholder).toBe("prealloc")
    }

    // Re-hydrating the IR yields an equivalent CompiledResult.
    const roundTripped = irToCompiled(t as unknown as typeof import("@babel/core").types, ir)
    expect(roundTripped.html).toBe(compiled.html)
    expect(roundTripped.slots).toHaveLength(compiled.slots.length)
  })

  it("serializes component-slot expressions to source strings", () => {
    const compiled = compileFromSource(`
      function App({ row, tone }) {
        return <div><Row {...row} selected={tone} /></div>;
      }
    `)
    const ir = compiledToIR(compiled)

    expect(ir.slots).toHaveLength(1)
    const slot = ir.slots[0]!
    expect(slot.kind).toBe("component")
    if (slot.kind === "component") {
      expect(slot.componentRef).toBe("Row")
      expect(slot.props).toHaveLength(2)
      const [spread, selected] = slot.props
      expect(spread?.kind).toBe("spread")
      if (spread?.kind === "spread") expect(spread.valueSrc).toBe("props.row")
      expect(selected?.kind).toBe("prop")
      if (selected?.kind === "prop") {
        expect(selected.name).toBe("selected")
        expect(selected.valueSrc).toBe("props.tone")
      }
      expect(slot.allDeps).toEqual(["row", "tone"])
    }
  })

  it("serializes list-slot key and item expressions", () => {
    const compiled = compileFromSource(`
      function RowList({ data, selectedId }) {
        return <div>{data.map(d => <Row key={d.id} item={d} selected={d.id === selectedId} />)}</div>;
      }
    `)
    const ir = compiledToIR(compiled)

    const list = ir.slots.find((s) => s.kind === "list")
    expect(list).toBeDefined()
    if (list?.kind === "list") {
      expect(list.itemParamName).toBe("d")
      expect(list.arrayPropName).toBe("data")
      expect(list.keySrc).toBe("d.id")
      expect(list.propSpecs.map((p) => p.name)).toEqual(["item", "selected"])
      // Selection expr references both the item param and the parent prop.
      const selectedSpec = list.propSpecs.find((p) => p.name === "selected")
      expect(selectedSpec?.valueSrc).toBe("d.id===props.selectedId")
      expect(list.parentPropDeps).toEqual(["selectedId"])
    }
  })

  it("serializes cond-slot cond + props", () => {
    const compiled = compileFromSource(`
      function App({ show, label }) {
        return <div>{show && <Child label={label} />}</div>;
      }
    `)
    const ir = compiledToIR(compiled)
    const cond = ir.slots.find((s) => s.kind === "cond")
    expect(cond).toBeDefined()
    if (cond?.kind === "cond") {
      expect(cond.componentRef).toBe("Child")
      expect(cond.condSrc).toBe("props.show")
      expect(cond.condDeps).toEqual(["show"])
      expect(cond.props).toEqual([
        { kind: "prop", name: "label", valueSrc: "props.label", deps: ["label"] },
      ])
    }
  })
})
