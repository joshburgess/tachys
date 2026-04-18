/**
 * Inferno.js reference benchmarks.
 *
 * These establish the primary comparison target. Tachys aims to match
 * or exceed these numbers on all operations.
 */
import { render } from "inferno"
import { createElement } from "inferno-create-element"
import { bench, describe } from "vitest"

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

function Row({ id, label }: { id: number; label: string }) {
  return createElement(
    "tr",
    null,
    createElement("td", { className: "col-md-1" }, id),
    createElement("td", { className: "col-md-4" }, createElement("a", null, label)),
    createElement("td", { className: "col-md-1" }, createElement("a", null, "x")),
  )
}

function Table({ data }: { data: RowData[] }) {
  return createElement(
    "table",
    { className: "table table-hover" },
    createElement(
      "tbody",
      null,
      data.map((row) => createElement(Row, { key: row.id, id: row.id, label: row.label })),
    ),
  )
}

describe("Inferno Reference", () => {
  let container: HTMLElement

  bench(
    "create 1,000 rows",
    () => {
      render(createElement(Table, { data: buildRowData(1000) }), container)
    },
    {
      setup: () => {
        container = document.createElement("div")
      },
      teardown: () => {
        render(null, container)
      },
    },
  )

  bench(
    "create 10,000 rows",
    () => {
      render(createElement(Table, { data: buildRowData(10000) }), container)
    },
    {
      setup: () => {
        container = document.createElement("div")
      },
      teardown: () => {
        render(null, container)
      },
    },
  )

  bench(
    "replace all 1,000 rows",
    () => {
      render(createElement(Table, { data: buildRowData(1000) }), container)
    },
    {
      setup: () => {
        container = document.createElement("div")
        render(createElement(Table, { data: buildRowData(1000) }), container)
      },
      teardown: () => {
        render(null, container)
      },
    },
  )

  bench(
    "update every 10th row (of 1,000)",
    () => {
      const newData = currentData.map((row, i) =>
        i % 10 === 0 ? { ...row, label: `${row.label} !!!` } : row,
      )
      render(createElement(Table, { data: newData }), container)
    },
    {
      setup: () => {
        container = document.createElement("div")
        currentData = buildRowData(1000)
        render(createElement(Table, { data: currentData }), container)
      },
      teardown: () => {
        render(null, container)
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
      render(createElement(Table, { data: newData }), container)
    },
    {
      setup: () => {
        container = document.createElement("div")
        currentData = buildRowData(1000)
        render(createElement(Table, { data: currentData }), container)
      },
      teardown: () => {
        render(null, container)
      },
    },
  )

  bench(
    "remove row (middle of 1,000)",
    () => {
      const newData = [...currentData.slice(0, 500), ...currentData.slice(501)]
      render(createElement(Table, { data: newData }), container)
    },
    {
      setup: () => {
        container = document.createElement("div")
        currentData = buildRowData(1000)
        render(createElement(Table, { data: currentData }), container)
      },
      teardown: () => {
        render(null, container)
      },
    },
  )

  bench(
    "select row (highlight one)",
    () => {
      const selected = currentData[5]!.id
      render(
        createElement(
          "table",
          { className: "table table-hover" },
          createElement(
            "tbody",
            null,
            currentData.map((row) =>
              createElement(
                "tr",
                {
                  key: row.id,
                  className: row.id === selected ? "danger" : "",
                },
                createElement("td", { className: "col-md-1" }, row.id),
                createElement("td", { className: "col-md-4" }, createElement("a", null, row.label)),
                createElement("td", { className: "col-md-1" }, createElement("a", null, "x")),
              ),
            ),
          ),
        ),
        container,
      )
    },
    {
      setup: () => {
        container = document.createElement("div")
        currentData = buildRowData(1000)
        render(createElement(Table, { data: currentData }), container)
      },
      teardown: () => {
        render(null, container)
      },
    },
  )

  bench(
    "append 1,000 rows to 1,000",
    () => {
      const appended = [
        ...currentData,
        ...buildRowData(1000).map((r, i) => ({ ...r, id: r.id + 1000 })),
      ]
      render(createElement(Table, { data: appended }), container)
    },
    {
      setup: () => {
        container = document.createElement("div")
        currentData = buildRowData(1000)
        render(createElement(Table, { data: currentData }), container)
      },
      teardown: () => {
        render(null, container)
      },
    },
  )
})

let currentData: RowData[] = []
