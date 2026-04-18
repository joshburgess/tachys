/**
 * Raw DOM baseline benchmarks.
 *
 * These establish an absolute performance floor — the fastest possible
 * DOM operations without any VDOM overhead. All other benchmarks are
 * compared against these numbers.
 */
import { bench, describe } from "vitest"

function buildRowData(count: number): Array<{ id: number; label: string }> {
  const data: Array<{ id: number; label: string }> = []
  const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome"]
  const nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie"]
  const colours = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "gray"]
  for (let i = 0; i < count; i++) {
    data.push({
      id: i,
      label: `${adjectives[i % adjectives.length]} ${colours[i % colours.length]} ${nouns[i % nouns.length]}`,
    })
  }
  return data
}

function createRow(parent: HTMLElement, id: number, label: string): HTMLTableRowElement {
  const tr = document.createElement("tr")
  const td1 = document.createElement("td")
  td1.className = "col-md-1"
  td1.textContent = String(id)
  const td2 = document.createElement("td")
  td2.className = "col-md-4"
  const a = document.createElement("a")
  a.textContent = label
  td2.appendChild(a)
  const td3 = document.createElement("td")
  td3.className = "col-md-1"
  const del = document.createElement("a")
  del.textContent = "x"
  td3.appendChild(del)
  tr.appendChild(td1)
  tr.appendChild(td2)
  tr.appendChild(td3)
  parent.appendChild(tr)
  return tr
}

describe("Raw DOM Baseline", () => {
  let container: HTMLElement

  bench(
    "create 1,000 rows",
    () => {
      container.textContent = ""
      const tbody = document.createElement("tbody")
      const data = buildRowData(1000)
      for (let i = 0; i < data.length; i++) {
        const row = data[i]!
        createRow(tbody, row.id, row.label)
      }
      container.appendChild(tbody)
    },
    {
      setup: () => {
        container = document.createElement("div")
      },
    },
  )

  bench(
    "create 10,000 rows",
    () => {
      container.textContent = ""
      const tbody = document.createElement("tbody")
      const data = buildRowData(10000)
      for (let i = 0; i < data.length; i++) {
        const row = data[i]!
        createRow(tbody, row.id, row.label)
      }
      container.appendChild(tbody)
    },
    {
      setup: () => {
        container = document.createElement("div")
      },
    },
  )

  bench(
    "replace all 1,000 rows",
    () => {
      container.textContent = ""
      const tbody = document.createElement("tbody")
      const data = buildRowData(1000)
      for (let i = 0; i < data.length; i++) {
        const row = data[i]!
        createRow(tbody, row.id, row.label)
      }
      container.appendChild(tbody)
    },
    {
      setup: () => {
        container = document.createElement("div")
        const tbody = document.createElement("tbody")
        const data = buildRowData(1000)
        for (let i = 0; i < data.length; i++) {
          const row = data[i]!
          createRow(tbody, row.id, row.label)
        }
        container.appendChild(tbody)
      },
    },
  )

  bench(
    "update every 10th row (of 1,000)",
    () => {
      const rows = container.querySelectorAll("tr")
      for (let i = 0; i < rows.length; i += 10) {
        const a = rows[i]!.querySelector("td:nth-child(2) a")!
        a.textContent = `${a.textContent} !!!`
      }
    },
    {
      setup: () => {
        container = document.createElement("div")
        const tbody = document.createElement("tbody")
        const data = buildRowData(1000)
        for (let i = 0; i < data.length; i++) {
          const row = data[i]!
          createRow(tbody, row.id, row.label)
        }
        container.appendChild(tbody)
      },
    },
  )

  bench(
    "swap rows (2nd and 999th)",
    () => {
      const tbody = container.querySelector("tbody")!
      const rows = tbody.children
      const row2 = rows[1]!
      const row999 = rows[998]!
      const next999 = row999.nextSibling
      tbody.insertBefore(row999, row2)
      tbody.insertBefore(row2, next999)
    },
    {
      setup: () => {
        container = document.createElement("div")
        const tbody = document.createElement("tbody")
        const data = buildRowData(1000)
        for (let i = 0; i < data.length; i++) {
          const row = data[i]!
          createRow(tbody, row.id, row.label)
        }
        container.appendChild(tbody)
      },
    },
  )

  // Measures removeChild from the middle + appendChild at the end. The
  // re-append keeps the pool at 1,000 rows so every iteration has a valid
  // children[500] target. Cost is dominated by the removeChild + live list
  // shift; the appendChild on a detached-but-populated <tr> is cheap.
  bench(
    "remove row (middle of 1,000)",
    () => {
      const tbody = container.querySelector("tbody")!
      const row = tbody.children[500]!
      tbody.removeChild(row)
      tbody.appendChild(row)
    },
    {
      setup: () => {
        container = document.createElement("div")
        const tbody = document.createElement("tbody")
        const data = buildRowData(1000)
        for (let i = 0; i < data.length; i++) {
          const row = data[i]!
          createRow(tbody, row.id, row.label)
        }
        container.appendChild(tbody)
      },
    },
  )

  bench(
    "select row (highlight one)",
    () => {
      const rows = container.querySelectorAll("tr")
      if (rows[0]!.className === "danger") {
        rows[0]!.className = ""
      }
      rows[5]!.className = "danger"
    },
    {
      setup: () => {
        container = document.createElement("div")
        const tbody = document.createElement("tbody")
        const data = buildRowData(1000)
        for (let i = 0; i < data.length; i++) {
          const row = data[i]!
          createRow(tbody, row.id, row.label)
        }
        container.appendChild(tbody)
      },
    },
  )

  bench(
    "append 1,000 rows to 1,000",
    () => {
      const tbody = container.querySelector("tbody")!
      const data = buildRowData(1000)
      for (let i = 0; i < data.length; i++) {
        const row = data[i]!
        createRow(tbody, row.id + 1000, row.label)
      }
    },
    {
      setup: () => {
        container = document.createElement("div")
        const tbody = document.createElement("tbody")
        const data = buildRowData(1000)
        for (let i = 0; i < data.length; i++) {
          const row = data[i]!
          createRow(tbody, row.id, row.label)
        }
        container.appendChild(tbody)
      },
    },
  )
})
