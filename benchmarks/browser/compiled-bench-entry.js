/**
 * Tachys browser benchmark using plugin-compiled Row + Table.
 *
 * The components below are exactly what `babel-plugin-tachys` emits for
 * the equivalent JSX source (verified by the plugin test suite). Hand-
 * written here to avoid pulling Babel into the benchmark build pipeline.
 *
 * The Table wrapper now uses the plugin's keyed-list helpers (`_mountList`
 * / `_patchList`), so this row reflects the full compiled output. The
 * select bench uses a TableSelect whose items carry a precomputed
 * `selected` flag, matching the pattern the plugin supports (attributes
 * may only read from the item param).
 */
import {
  _mountList,
  _patchList,
  _template,
  clearPool,
  markCompiled,
  mount,
  patch,
} from "../../dist/index.js"

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

// ── Compiled SelectRow (className ternary, `selected` prop) ──────────────
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
    prev.id === next.id && prev.label === next.label && prev.selected === next.selected,
)

// ── Compiled Table (exactly what the plugin emits for the list case) ────
// Source equivalent:
//   function Table({ data }) {
//     return (
//       <table className="table table-hover">
//         <tbody>
//           {data.map(row => <Row key={row.id} id={row.id} label={row.label} />)}
//         </tbody>
//       </table>
//     )
//   }

const _tpl$Table_0 = _template('<table class="table table-hover"><tbody><!></tbody></table>')
const _lp$Table_0 = (row) => ({ id: row.id, label: row.label })
const _lk$Table_0 = (row) => row.id

const Table = markCompiled(
  (props) => {
    const _root = _tpl$Table_0.cloneNode(true)
    const _lm0 = _root.firstChild.firstChild
    const _ls0 = _mountList(props.data, Row, _lp$Table_0, _lk$Table_0, _lm0)
    const state = { _ls0, data: props.data }
    return { dom: _root, state }
  },
  (state, props) => {
    const _d0 = state.data !== props.data
    if (_d0) {
      _patchList(state._ls0, props.data, Row, _lp$Table_0, _lk$Table_0)
    }
    if (_d0) state.data = props.data
  },
  (prev, next) => prev.data === next.data,
)

// ── Compiled TableSelect (uses SelectRow + precomputed `selected` field) ─

const _tpl$TableSelect_0 = _template('<table class="table table-hover"><tbody><!></tbody></table>')
const _lp$TableSelect_0 = (row) => ({
  id: row.id,
  label: row.label,
  selected: row.selected,
})
const _lk$TableSelect_0 = (row) => row.id

const TableSelect = markCompiled(
  (props) => {
    const _root = _tpl$TableSelect_0.cloneNode(true)
    const _lm0 = _root.firstChild.firstChild
    const _ls0 = _mountList(props.data, SelectRow, _lp$TableSelect_0, _lk$TableSelect_0, _lm0)
    const state = { _ls0, data: props.data }
    return { dom: _root, state }
  },
  (state, props) => {
    const _d0 = state.data !== props.data
    if (_d0) {
      _patchList(state._ls0, props.data, SelectRow, _lp$TableSelect_0, _lk$TableSelect_0)
    }
    if (_d0) state.data = props.data
  },
  (prev, next) => prev.data === next.data,
)

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

// Mounts a compiled component's output into a container element by
// replacing the container's contents. Matches the raw-h() harness so
// comparisons stay apples-to-apples.
function mountCompiled(component, props, container) {
  const inst = component(props)
  container.textContent = ""
  container.appendChild(inst.dom)
  return inst
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
        mountCompiled(Table, { data: buildRowData(1000) }, container)
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
        mountCompiled(Table, { data: buildRowData(10000) }, container)
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
        const inst = mountCompiled(Table, { data: buildRowData(1000) }, container)
        return { inst }
      },
      (state) => {
        Table.patch(state.inst.state, { data: buildRowData(1000) })
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
        const inst = mountCompiled(Table, { data }, container)
        return { inst, data }
      },
      (state) => {
        const newData = state.data.map((row, i) =>
          i % 10 === 0 ? { ...row, label: `${row.label} !!!` } : row,
        )
        Table.patch(state.inst.state, { data: newData })
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
        const inst = mountCompiled(Table, { data }, container)
        return { inst, data }
      },
      (state) => {
        const newData = [...state.data]
        const tmp = newData[1]
        newData[1] = newData[998]
        newData[998] = tmp
        Table.patch(state.inst.state, { data: newData })
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
        const inst = mountCompiled(Table, { data }, container)
        return { inst, data }
      },
      (state) => {
        const newData = [...state.data.slice(0, 500), ...state.data.slice(501)]
        Table.patch(state.inst.state, { data: newData })
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
        const data = buildRowData(1000).map((r) => ({ ...r, selected: false }))
        const inst = mountCompiled(TableSelect, { data }, container)
        return { inst, data }
      },
      (state) => {
        const newData = state.data.map((r, i) => (i === 5 ? { ...r, selected: true } : r))
        TableSelect.patch(state.inst.state, { data: newData })
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
        const inst = mountCompiled(Table, { data }, container)
        return { inst, data }
      },
      (state) => {
        const appended = [
          ...state.data,
          ...buildRowData(1000).map((r) => ({ ...r, id: r.id + 1000 })),
        ]
        Table.patch(state.inst.state, { data: appended })
      },
      () => {
        container.textContent = ""
      },
      50,
    ),
  )

  return results
}
