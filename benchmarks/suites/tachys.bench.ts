/**
 * Tachys benchmarks — the same operations as baseline-dom and inferno-reference.
 *
 * Uses the h() factory and render/patch/unmount APIs to exercise the full
 * VDOM pipeline: creation, reconciliation, event delegation, and pooling.
 *
 * Note on "create" benches: the Inferno reference bench calls render() in a
 * loop against the same container, so iterations 2-N diff against the existing
 * tree rather than building fresh DOM. To make cross-library comparison
 * apples-to-apples we do the same here (render() also handles mount-then-diff
 * internally). The patch benches (replace/update/swap/remove/select/append)
 * still exercise real diff work because the new tree differs structurally.
 */
import { bench, describe } from "vitest"
import { h, render, mount, patch, unmount } from "../../src/index"
import { clearPool } from "../../src/index"
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

function Row(id: number, label: string, key: number): VNode {
  return h(
    "tr",
    { key },
    h("td", { className: "col-md-1" }, String(id)),
    h("td", { className: "col-md-4" }, h("a", null, label)),
    h("td", { className: "col-md-1" }, h("a", null, "x")),
  )
}

function Table(data: RowData[]): VNode {
  return h(
    "table",
    { className: "table table-hover" },
    h("tbody", null, ...data.map((row) => Row(row.id, row.label, row.id))),
  )
}

let currentTree: VNode
let currentData: RowData[]

describe("Tachys", () => {
  let container: HTMLElement

  bench(
    "create 1,000 rows",
    () => {
      render(Table(buildRowData(1000)), container as Element)
    },
    {
      setup: () => {
        container = document.createElement("div")
        clearPool()
      },
      teardown: () => {
        render(null, container as Element)
      },
    },
  )

  bench(
    "create 10,000 rows",
    () => {
      render(Table(buildRowData(10000)), container as Element)
    },
    {
      setup: () => {
        container = document.createElement("div")
        clearPool()
      },
      teardown: () => {
        render(null, container as Element)
      },
    },
  )

  bench(
    "replace all 1,000 rows",
    () => {
      const newTree = Table(buildRowData(1000))
      patch(currentTree, newTree, container as Element)
      currentTree = newTree
    },
    {
      setup: () => {
        container = document.createElement("div")
        currentTree = Table(buildRowData(1000))
        mount(currentTree, container as Element)
      },
      teardown: () => {
        unmount(currentTree, container as Element)
      },
    },
  )

  bench(
    "update every 10th row (of 1,000)",
    () => {
      const newData = currentData.map((row, i) =>
        i % 10 === 0 ? { ...row, label: `${row.label} !!!` } : row,
      )
      const newTree = Table(newData)
      patch(currentTree, newTree, container as Element)
      currentTree = newTree
    },
    {
      setup: () => {
        container = document.createElement("div")
        currentData = buildRowData(1000)
        currentTree = Table(currentData)
        mount(currentTree, container as Element)
      },
      teardown: () => {
        unmount(currentTree, container as Element)
      },
    },
  )

  bench(
    "swap rows (2nd and 999th)",
    () => {
      const newData = [...currentData]
      const tmp = newData[1]!
      newData[1] = newData[998]!
      newData[998] = tmp
      const newTree = Table(newData)
      patch(currentTree, newTree, container as Element)
      currentTree = newTree
    },
    {
      setup: () => {
        container = document.createElement("div")
        currentData = buildRowData(1000)
        currentTree = Table(currentData)
        mount(currentTree, container as Element)
      },
      teardown: () => {
        unmount(currentTree, container as Element)
      },
    },
  )

  bench(
    "remove row (middle of 1,000)",
    () => {
      const newData = [...currentData.slice(0, 500), ...currentData.slice(501)]
      const newTree = Table(newData)
      patch(currentTree, newTree, container as Element)
      currentTree = newTree
    },
    {
      setup: () => {
        container = document.createElement("div")
        currentData = buildRowData(1000)
        currentTree = Table(currentData)
        mount(currentTree, container as Element)
      },
      teardown: () => {
        unmount(currentTree, container as Element)
      },
    },
  )

  bench(
    "select row (highlight one)",
    () => {
      const selected = currentData[5]!.id
      const newTree = h(
        "table",
        { className: "table table-hover" },
        h(
          "tbody",
          null,
          ...currentData.map((row) =>
            h(
              "tr",
              {
                key: row.id,
                className: row.id === selected ? "danger" : "",
              },
              h("td", { className: "col-md-1" }, String(row.id)),
              h("td", { className: "col-md-4" }, h("a", null, row.label)),
              h("td", { className: "col-md-1" }, h("a", null, "x")),
            ),
          ),
        ),
      )
      patch(currentTree, newTree, container as Element)
      currentTree = newTree
    },
    {
      setup: () => {
        container = document.createElement("div")
        currentData = buildRowData(1000)
        currentTree = Table(currentData)
        mount(currentTree, container as Element)
      },
      teardown: () => {
        unmount(currentTree, container as Element)
      },
    },
  )

  bench(
    "append 1,000 rows to 1,000",
    () => {
      const appended = [
        ...currentData,
        ...buildRowData(1000).map((r) => ({ ...r, id: r.id + 1000 })),
      ]
      const newTree = Table(appended)
      patch(currentTree, newTree, container as Element)
      currentTree = newTree
    },
    {
      setup: () => {
        container = document.createElement("div")
        currentData = buildRowData(1000)
        currentTree = Table(currentData)
        mount(currentTree, container as Element)
      },
      teardown: () => {
        unmount(currentTree, container as Element)
      },
    },
  )
})
