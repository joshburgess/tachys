#!/usr/bin/env node
// Compare per-event histograms between tachys and inferno traces. Looks
// for differences in event COUNTS (not duration), which can reveal
// thrashing or extra microtasks.

import fs from "fs"
import path from "path"

const dir = "/Users/joshburgess/code/js-framework-benchmark/webdriver-ts/traces"

function aggregate(prefix, range) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort()
    .slice(range[0], range[1])
  const counts = {}
  const durs = {}
  for (const f of files) {
    const trace = JSON.parse(fs.readFileSync(path.join(dir, f)))
    const events = trace.traceEvents || trace
    const seen = {}
    const seenDur = {}
    for (const e of events) {
      if (
        e.cat &&
        (e.cat.includes("devtools.timeline") ||
          e.cat.includes("blink.user_timing"))
      ) {
        seen[e.name] = (seen[e.name] || 0) + 1
        if (e.dur) seenDur[e.name] = (seenDur[e.name] || 0) + e.dur
      }
    }
    for (const [n, c] of Object.entries(seen)) {
      counts[n] = (counts[n] || []).concat(c)
    }
    for (const [n, d] of Object.entries(seenDur)) {
      durs[n] = (durs[n] || []).concat(d / 1000)
    }
  }
  return { counts, durs }
}

const t = aggregate("tachys-v0.0.1-keyed_07_create10k_", [40, 60])
const i = aggregate("inferno-v8.2.2-keyed_07_create10k_", [40, 60])

const median = (vs) => vs.slice().sort((a, b) => a - b)[Math.floor(vs.length / 2)]

const allNames = new Set([
  ...Object.keys(t.counts),
  ...Object.keys(i.counts),
])
const rows = []
for (const n of allNames) {
  const tc = t.counts[n] ? median(t.counts[n]) : 0
  const ic = i.counts[n] ? median(i.counts[n]) : 0
  const td = t.durs[n] ? median(t.durs[n]) : 0
  const id = i.durs[n] ? median(i.durs[n]) : 0
  rows.push({ n, tc, ic, dc: tc - ic, td, id, dd: td - id })
}
rows.sort((a, b) => Math.abs(b.dd) - Math.abs(a.dd))
console.log(
  "name".padEnd(36),
  "tachys-cnt",
  "inf-cnt",
  "Δcnt",
  "tachys-ms",
  "inf-ms",
  "Δms",
)
for (const r of rows.slice(0, 30)) {
  console.log(
    r.n.padEnd(36),
    String(r.tc).padStart(8),
    String(r.ic).padStart(7),
    String(r.dc).padStart(5),
    r.td.toFixed(2).padStart(10),
    r.id.toFixed(2).padStart(7),
    (r.dd >= 0 ? "+" : "") + r.dd.toFixed(2).padStart(6),
  )
}
