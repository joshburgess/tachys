/**
 * Fresh-creation benchmarks — force real DOM creation every iteration.
 *
 * The standard create benches in tachys.bench.ts and inferno-reference.bench.ts
 * reuse the same container across iterations, so after the warmup pass the
 * render() call only diffs against an identical existing tree (a no-op). That
 * measures the diff fast-path, not DOM creation.
 *
 * These benches build a fresh container inside the iteration body, forcing
 * every call to createElement 1,000 rows worth of real DOM. This is where
 * Inferno's template-cloning optimization (cloneNode from precompiled
 * templates) is expected to give it an edge over libraries that go through
 * document.createElement per element.
 *
 * The document.createElement("div") for the container adds one extra DOM op
 * per iteration, negligible against 6,000 createElement calls for the rows.
 */
import { render as infernoRender } from "inferno"
import { createElement as infernoCreate } from "inferno-create-element"
import { bench, describe } from "vitest"
import { h, render } from "../../src/index"
import type { VNode } from "../../src/vnode"

const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome"]
const nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie"]
const colours = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "gray"]

interface RowData {
  id: number
  label: string
}

function buildRowData(count: number): RowData[] {
  const data: RowData[] = []
  for (let i = 0; i < count; i++) {
    data.push({
      id: i,
      label: `${adjectives[i % adjectives.length]} ${colours[i % colours.length]} ${nouns[i % nouns.length]}`,
    })
  }
  return data
}

// --- Tachys tree factory ---

function TachysRow(id: number, label: string, key: number): VNode {
  return h(
    "tr",
    { key },
    h("td", { className: "col-md-1" }, String(id)),
    h("td", { className: "col-md-4" }, h("a", null, label)),
    h("td", { className: "col-md-1" }, h("a", null, "x")),
  )
}

function TachysTable(data: RowData[]): VNode {
  return h(
    "table",
    { className: "table table-hover" },
    h("tbody", null, ...data.map((row) => TachysRow(row.id, row.label, row.id))),
  )
}

// --- Inferno tree factory ---

function InfernoRow({ id, label }: { id: number; label: string }) {
  return infernoCreate(
    "tr",
    null,
    infernoCreate("td", { className: "col-md-1" }, id),
    infernoCreate("td", { className: "col-md-4" }, infernoCreate("a", null, label)),
    infernoCreate("td", { className: "col-md-1" }, infernoCreate("a", null, "x")),
  )
}

function InfernoTable({ data }: { data: RowData[] }) {
  return infernoCreate(
    "table",
    { className: "table table-hover" },
    infernoCreate(
      "tbody",
      null,
      data.map((row) => infernoCreate(InfernoRow, { key: row.id, id: row.id, label: row.label })),
    ),
  )
}

// ---------------------------------------------------------------------------

describe("Fresh DOM creation (no-op diff eliminated)", () => {
  // 1,000 rows

  bench("Tachys: create 1,000 rows (fresh container each iteration)", () => {
    const container = document.createElement("div")
    render(TachysTable(buildRowData(1000)), container as Element)
  })

  bench("Inferno: create 1,000 rows (fresh container each iteration)", () => {
    const container = document.createElement("div")
    infernoRender(infernoCreate(InfernoTable, { data: buildRowData(1000) }), container)
  })

  // 10,000 rows

  bench("Tachys: create 10,000 rows (fresh container each iteration)", () => {
    const container = document.createElement("div")
    render(TachysTable(buildRowData(10000)), container as Element)
  })

  bench("Inferno: create 10,000 rows (fresh container each iteration)", () => {
    const container = document.createElement("div")
    infernoRender(infernoCreate(InfernoTable, { data: buildRowData(10000) }), container)
  })
})
