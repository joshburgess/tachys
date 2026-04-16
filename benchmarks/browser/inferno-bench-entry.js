/**
 * Inferno browser benchmark entry point.
 * Bundled by Rollup into a standalone script for the browser harness.
 */
import { render } from "inferno"
import { createElement } from "inferno-create-element"

const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome"]
const nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie"]
const colours = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "gray"]

function buildRowData(count) {
  const data = []
  for (let i = 0; i < count; i++) {
    data.push({
      id: i,
      label: `${adjectives[i % adjectives.length]} ${colours[i % colours.length]} ${nouns[i % nouns.length]}`,
    })
  }
  return data
}

function Row({ id, label }) {
  return createElement(
    "tr",
    null,
    createElement("td", { className: "col-md-1" }, id),
    createElement("td", { className: "col-md-4" }, createElement("a", null, label)),
    createElement("td", { className: "col-md-1" }, createElement("a", null, "x")),
  )
}

function Table({ data }) {
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

function benchmark(name, setup, run, teardown, iterations = 20) {
  const times = []
  for (let i = 0; i < iterations; i++) {
    const state = setup()
    const start = performance.now()
    run(state)
    const end = performance.now()
    times.push(end - start)
    teardown(state)
  }
  times.sort((a, b) => a - b)
  const median = times[Math.floor(times.length / 2)]
  const mean = times.reduce((a, b) => a + b, 0) / times.length
  const min = times[0]
  const max = times[times.length - 1]
  return { name, median, mean, min, max, times }
}

export function runInfernoBenchmarks(container) {
  const results = []
  let currentData

  // create 1,000 rows
  results.push(
    benchmark(
      "create 1,000 rows",
      () => {
        render(null, container)
        return {}
      },
      () => {
        render(createElement(Table, { data: buildRowData(1000) }), container)
      },
      () => {
        render(null, container)
      },
      50,
    ),
  )

  // create 10,000 rows
  results.push(
    benchmark(
      "create 10,000 rows",
      () => {
        render(null, container)
        return {}
      },
      () => {
        render(createElement(Table, { data: buildRowData(10000) }), container)
      },
      () => {
        render(null, container)
      },
      10,
    ),
  )

  // replace all 1,000 rows
  results.push(
    benchmark(
      "replace all 1,000 rows",
      () => {
        render(null, container)
        render(createElement(Table, { data: buildRowData(1000) }), container)
        return {}
      },
      () => {
        render(createElement(Table, { data: buildRowData(1000) }), container)
      },
      () => {
        render(null, container)
      },
      50,
    ),
  )

  // update every 10th row
  results.push(
    benchmark(
      "update every 10th row (of 1,000)",
      () => {
        render(null, container)
        currentData = buildRowData(1000)
        render(createElement(Table, { data: currentData }), container)
        return {}
      },
      () => {
        currentData = currentData.map((row, i) =>
          i % 10 === 0 ? { ...row, label: `${row.label} !!!` } : row,
        )
        render(createElement(Table, { data: currentData }), container)
      },
      () => {
        render(null, container)
      },
      50,
    ),
  )

  // swap rows
  results.push(
    benchmark(
      "swap rows (2nd and 999th)",
      () => {
        render(null, container)
        currentData = buildRowData(1000)
        render(createElement(Table, { data: currentData }), container)
        return {}
      },
      () => {
        const newData = [...currentData]
        const tmp = newData[1]
        newData[1] = newData[998]
        newData[998] = tmp
        currentData = newData
        render(createElement(Table, { data: newData }), container)
      },
      () => {
        render(null, container)
      },
      50,
    ),
  )

  // remove row
  results.push(
    benchmark(
      "remove row (middle of 1,000)",
      () => {
        render(null, container)
        currentData = buildRowData(1000)
        render(createElement(Table, { data: currentData }), container)
        return {}
      },
      () => {
        currentData = [...currentData.slice(0, 500), ...currentData.slice(501)]
        render(createElement(Table, { data: currentData }), container)
      },
      () => {
        render(null, container)
      },
      50,
    ),
  )

  // select row
  results.push(
    benchmark(
      "select row (highlight one)",
      () => {
        render(null, container)
        currentData = buildRowData(1000)
        render(createElement(Table, { data: currentData }), container)
        return {}
      },
      () => {
        const selected = currentData[5].id
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
                  createElement(
                    "td",
                    { className: "col-md-4" },
                    createElement("a", null, row.label),
                  ),
                  createElement("td", { className: "col-md-1" }, createElement("a", null, "x")),
                ),
              ),
            ),
          ),
          container,
        )
      },
      () => {
        render(null, container)
      },
      50,
    ),
  )

  // append 1,000 rows
  results.push(
    benchmark(
      "append 1,000 rows to 1,000",
      () => {
        render(null, container)
        currentData = buildRowData(1000)
        render(createElement(Table, { data: currentData }), container)
        return {}
      },
      () => {
        const appended = [
          ...currentData,
          ...buildRowData(1000).map((r) => ({ ...r, id: r.id + 1000 })),
        ]
        render(createElement(Table, { data: appended }), container)
      },
      () => {
        render(null, container)
      },
      50,
    ),
  )

  return results
}
