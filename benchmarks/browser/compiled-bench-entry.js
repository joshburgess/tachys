/**
 * Tachys browser benchmark using a plugin-compiled Row component.
 *
 * The Row below is exactly what `babel-plugin-tachys` emits for the
 * equivalent JSX source (verified by the plugin test suite). Hand-written
 * here to avoid pulling Babel into the benchmark build pipeline.
 *
 * The Table wrapper still uses raw h() -- the plugin's list-compilation
 * pass isn't landed yet, so `data.map(...)` as a child expression bails.
 * This lets the benchmark isolate the compiled-Row speedup against the
 * same raw-h() control already running in index.html.
 */
import { h, mount, patch, clearPool, markCompiled, _template } from "../../dist/index.js"

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

// ── Compiled Row (exactly what babel-plugin-tachys emits) ────────────────
// Source equivalent:
//   function Row({ id, label }) {
//     return (
//       <tr>
//         <td className="col-md-1">{id}</td>
//         <td className="col-md-4"><a>{label}</a></td>
//         <td className="col-md-1"><a>x</a></td>
//       </tr>
//     )
//   }

const _tpl$Row_0 = _template(
  '<tr><td class="col-md-1"> </td><td class="col-md-4"><a> </a></td><td class="col-md-1"><a>x</a></td></tr>',
)

const Row = markCompiled(
  (props) => {
    const _root = _tpl$Row_0.cloneNode(true)
    // Text slots -- prealloc path (text node already present from the " "
    // whitespace placeholder in the template).
    const _t0 = _root.firstChild.firstChild
    _t0.data = String(props.id)
    const _t1 = _root.firstChild.nextSibling.firstChild.firstChild
    _t1.data = String(props.label)
    const state = {
      _t0,
      _t1,
      id: props.id,
      label: props.label,
    }
    return { dom: _root, state }
  },
  (state, props) => {
    if (state.id !== props.id) {
      state._t0.data = String(props.id)
      state.id = props.id
    }
    if (state.label !== props.label) {
      state._t1.data = String(props.label)
      state.label = props.label
    }
  },
  (prev, next) => prev.id === next.id && prev.label === next.label,
)

// ── Compiled Row with className ternary (for select bench) ───────────────
// Source equivalent:
//   function SelectRow({ id, label, selected }) {
//     return (
//       <tr className={selected ? "danger" : ""}>
//         <td className="col-md-1">{id}</td>
//         <td className="col-md-4"><a>{label}</a></td>
//         <td className="col-md-1"><a>x</a></td>
//       </tr>
//     )
//   }

const _tpl$SelectRow_0 = _template(
  '<tr><td class="col-md-1"> </td><td class="col-md-4"><a> </a></td><td class="col-md-1"><a>x</a></td></tr>',
)

const SelectRow = markCompiled(
  (props) => {
    const _root = _tpl$SelectRow_0.cloneNode(true)
    _root.className = props.selected ? "danger" : ""
    const _t0 = _root.firstChild.firstChild
    _t0.data = String(props.id)
    const _t1 = _root.firstChild.nextSibling.firstChild.firstChild
    _t1.data = String(props.label)
    const state = {
      _t0,
      _t1,
      id: props.id,
      label: props.label,
      selected: props.selected,
      _root,
    }
    return { dom: _root, state }
  },
  (state, props) => {
    if (state.selected !== props.selected) {
      state._root.className = props.selected ? "danger" : ""
      state.selected = props.selected
    }
    if (state.id !== props.id) {
      state._t0.data = String(props.id)
      state.id = props.id
    }
    if (state.label !== props.label) {
      state._t1.data = String(props.label)
      state.label = props.label
    }
  },
  (prev, next) =>
    prev.id === next.id &&
    prev.label === next.label &&
    prev.selected === next.selected,
)

function Table(data) {
  return h(
    "table",
    { className: "table table-hover" },
    h(
      "tbody",
      null,
      ...data.map((row) => h(Row, { key: row.id, id: row.id, label: row.label })),
    ),
  )
}

function TableSelect(data, selected) {
  return h(
    "table",
    { className: "table table-hover" },
    h(
      "tbody",
      null,
      ...data.map((row) =>
        h(SelectRow, {
          key: row.id,
          id: row.id,
          label: row.label,
          selected: row.id === selected,
        }),
      ),
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

export function runTachysCompiledBenchmarks(container) {
  const results = []

  results.push(
    benchmark(
      "create 1,000 rows",
      () => {
        container.textContent = ""
        clearPool()
        return {}
      },
      () => {
        const tree = Table(buildRowData(1000))
        mount(tree, container)
        return tree
      },
      () => {
        container.textContent = ""
      },
      50,
    ),
  )

  results.push(
    benchmark(
      "create 10,000 rows",
      () => {
        container.textContent = ""
        clearPool()
        return {}
      },
      () => {
        const tree = Table(buildRowData(10000))
        mount(tree, container)
        return tree
      },
      () => {
        container.textContent = ""
      },
      10,
    ),
  )

  results.push(
    benchmark(
      "replace all 1,000 rows",
      () => {
        container.textContent = ""
        const tree = Table(buildRowData(1000))
        mount(tree, container)
        return { tree }
      },
      (state) => {
        const newTree = Table(buildRowData(1000))
        patch(state.tree, newTree, container)
        state.tree = newTree
      },
      () => {
        container.textContent = ""
      },
      50,
    ),
  )

  results.push(
    benchmark(
      "update every 10th row (of 1,000)",
      () => {
        container.textContent = ""
        const data = buildRowData(1000)
        const tree = Table(data)
        mount(tree, container)
        return { tree, data }
      },
      (state) => {
        const newData = state.data.map((row, i) =>
          i % 10 === 0 ? { ...row, label: `${row.label} !!!` } : row,
        )
        const newTree = Table(newData)
        patch(state.tree, newTree, container)
        state.tree = newTree
        state.data = newData
      },
      () => {
        container.textContent = ""
      },
      50,
    ),
  )

  results.push(
    benchmark(
      "swap rows (2nd and 999th)",
      () => {
        container.textContent = ""
        const data = buildRowData(1000)
        const tree = Table(data)
        mount(tree, container)
        return { tree, data }
      },
      (state) => {
        const newData = [...state.data]
        const tmp = newData[1]
        newData[1] = newData[998]
        newData[998] = tmp
        const newTree = Table(newData)
        patch(state.tree, newTree, container)
        state.tree = newTree
      },
      () => {
        container.textContent = ""
      },
      50,
    ),
  )

  results.push(
    benchmark(
      "remove row (middle of 1,000)",
      () => {
        container.textContent = ""
        const data = buildRowData(1000)
        const tree = Table(data)
        mount(tree, container)
        return { tree, data }
      },
      (state) => {
        const newData = [...state.data.slice(0, 500), ...state.data.slice(501)]
        const newTree = Table(newData)
        patch(state.tree, newTree, container)
        state.tree = newTree
        state.data = newData
      },
      () => {
        container.textContent = ""
      },
      50,
    ),
  )

  results.push(
    benchmark(
      "select row (highlight one)",
      () => {
        container.textContent = ""
        const data = buildRowData(1000)
        const tree = TableSelect(data, -1)
        mount(tree, container)
        return { tree, data }
      },
      (state) => {
        const selected = state.data[5].id
        const newTree = TableSelect(state.data, selected)
        patch(state.tree, newTree, container)
        state.tree = newTree
      },
      () => {
        container.textContent = ""
      },
      50,
    ),
  )

  results.push(
    benchmark(
      "append 1,000 rows to 1,000",
      () => {
        container.textContent = ""
        const data = buildRowData(1000)
        const tree = Table(data)
        mount(tree, container)
        return { tree, data }
      },
      (state) => {
        const appended = [
          ...state.data,
          ...buildRowData(1000).map((r) => ({ ...r, id: r.id + 1000 })),
        ]
        const newTree = Table(appended)
        patch(state.tree, newTree, container)
        state.tree = newTree
      },
      () => {
        container.textContent = ""
      },
      50,
    ),
  )

  return results
}
