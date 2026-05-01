#!/usr/bin/env node
// CDP CPU profile for select_row. Click the label-anchor in alternating rows
// inside a single Profiler.start/stop window so we capture enough samples
// per iteration to see something. Aggregates self-time across iterations
// by (functionName, url, line, col).
//
// Env:
//   ITERATIONS    -> default 30
//   CLICKS_PER_ITER -> default 50 (clicks inside one profile window)
//   SAMPLING_US   -> default 50 (microseconds)
//   LABEL         -> tag for output

import fs from "node:fs"
import path from "node:path"
import pwPkg from "/Users/joshburgess/code/js-framework-benchmark/webdriver-ts/node_modules/playwright/index.js"
const { chromium } = pwPkg

const URL = process.env.BENCH_URL || "http://localhost:8080/frameworks/keyed/tachys/"
const ITERATIONS = Number(process.env.ITERATIONS || 30)
const CLICKS_PER_ITER = Number(process.env.CLICKS_PER_ITER || 50)
const SAMPLING_US = Number(process.env.SAMPLING_US || 50)
const LABEL = process.env.LABEL || "tachys"

const OUT_DIR = `/tmp/04-${LABEL}-prof`
fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch({
  headless: false,
  args: [
    "--enable-precise-memory-info",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--disable-features=CalculateNativeWinOcclusion",
  ],
})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()

const cdp = await ctx.newCDPSession(page)
await cdp.send("Profiler.enable")
await cdp.send("Profiler.setSamplingInterval", { interval: SAMPLING_US })

await page.goto(URL, { waitUntil: "domcontentloaded" })
await page.locator("#run").waitFor()
await page.click("#run")
await page.locator("tbody tr:nth-child(1000)").waitFor()

// Warmup
await page.evaluate(
  ({ clicks }) => {
    const tbody = document.querySelector("tbody")
    for (let j = 0; j < clicks; j++) {
      const idx = (j % 19) * 47 + 100
      tbody.children[idx].querySelector("td.col-md-4 a").click()
    }
  },
  { clicks: 100 },
)

const profiles = []
for (let i = 0; i < ITERATIONS; i++) {
  await cdp.send("Profiler.start")
  await page.evaluate(
    ({ clicks, seed }) => {
      const tbody = document.querySelector("tbody")
      for (let j = 0; j < clicks; j++) {
        const idx = ((seed + j) % 19) * 47 + 100
        tbody.children[idx].querySelector("td.col-md-4 a").click()
      }
    },
    { clicks: CLICKS_PER_ITER, seed: i },
  )
  const { profile } = await cdp.send("Profiler.stop")
  profiles.push(profile)
  fs.writeFileSync(
    path.join(OUT_DIR, `04-${String(i).padStart(2, "0")}.cpuprofile`),
    JSON.stringify(profile),
  )
}

await browser.close()

function aggregate(profiles) {
  const totals = new Map()
  let grandSelfUs = 0
  for (const prof of profiles) {
    const nodeById = new Map()
    for (const node of prof.nodes) nodeById.set(node.id, node)
    const { samples, timeDeltas } = prof
    for (let i = 0; i < samples.length; i++) {
      const dt = timeDeltas[i] || 0
      if (dt <= 0) continue
      const node = nodeById.get(samples[i])
      if (!node) continue
      const f = node.callFrame
      const key = `${f.functionName || "(anonymous)"}|${f.url || ""}|${f.lineNumber}|${f.columnNumber}`
      const cur = totals.get(key)
      if (cur) {
        cur.self += dt
        cur.hits += 1
      } else {
        totals.set(key, { self: dt, hits: 1, frame: f })
      }
      grandSelfUs += dt
    }
  }
  return { totals, grandSelfUs }
}

const { totals, grandSelfUs } = aggregate(profiles)
const sorted = [...totals.entries()].sort((a, b) => b[1].self - a[1].self)

console.log(
  `\n[${LABEL} 04_select] Profiles: ${profiles.length}, total sampled time: ${(grandSelfUs / 1000).toFixed(2)} ms`,
)
console.log("\nTop 30 self-time frames:\n")
console.log("  self_ms   self%   hits  function  (url:line:col)")
console.log("  -------   -----   ----  ---------------------------")
for (const [, v] of sorted.slice(0, 30)) {
  const ms = (v.self / 1000).toFixed(3)
  const pct = ((v.self / grandSelfUs) * 100).toFixed(2)
  const f = v.frame
  const name = f.functionName || "(anonymous)"
  const loc = `${f.url || "<vm>"}:${f.lineNumber}:${f.columnNumber}`
  console.log(
    `  ${ms.padStart(7)}   ${pct.padStart(5)}   ${String(v.hits).padStart(4)}  ${name.padEnd(30)}  ${loc}`,
  )
}

const byUrl = new Map()
for (const [, v] of totals) {
  const u = v.frame.url || "<vm>"
  byUrl.set(u, (byUrl.get(u) || 0) + v.self)
}
console.log("\nSelf time grouped by url:\n")
for (const [u, us] of [...byUrl.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(
    `  ${(us / 1000).toFixed(3).padStart(7)} ms   ${((us / grandSelfUs) * 100).toFixed(2).padStart(5)}%   ${u}`,
  )
}

console.log(`\nWrote individual profiles to ${OUT_DIR}/`)
