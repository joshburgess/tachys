#!/usr/bin/env node
// Drive Chrome at the running bench server, click a "create rows" button
// (run / runlots / add) inside a CDP CPU profile and aggregate self-time
// across iterations by (functionName, url, line, col). Mirrors
// profile-clear.mjs's structure.
//
// Env:
//   BENCH=01    -> click #run, wait for 1000 rows (01_run1k)
//   BENCH=07    -> click #runlots, wait for 10000 rows (07_create10k)
//   BENCH=08    -> setup with 1000 rows via #run, then click #add,
//                  wait for 2000 rows (08_create1k-after1k_x2 per-click)
//   BENCH_URL   -> default http://localhost:8080/frameworks/keyed/tachys/
//   ITERATIONS  -> default 30
//   SAMPLING_US -> default 50 (microseconds)
//   LABEL       -> tag for profile filenames + console line

import path from "node:path"
import fs from "node:fs"
import pwPkg from "/Users/joshburgess/code/js-framework-benchmark/webdriver-ts/node_modules/playwright/index.js"
const { chromium } = pwPkg

const URL = process.env.BENCH_URL || "http://localhost:8080/frameworks/keyed/tachys/"
const ITERATIONS = Number(process.env.ITERATIONS || 30)
const SAMPLING_US = Number(process.env.SAMPLING_US || 50)
const BENCH = process.env.BENCH || "01"
const LABEL = process.env.LABEL || "tachys"

const RECIPES = {
  "01": { selector: "#run", target: 1000, prep: null },
  "07": { selector: "#runlots", target: 10000, prep: null },
  "08": { selector: "#add", target: 2000, prep: { selector: "#run", target: 1000 } },
}
const recipe = RECIPES[BENCH]
if (!recipe) {
  console.error(`Unknown BENCH=${BENCH}; expected 01, 07, or 08`)
  process.exit(2)
}

const OUT_DIR = `/tmp/${BENCH}-${LABEL}-prof`
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

async function rowsAre(n) {
  await page.waitForFunction(
    (count) => document.querySelectorAll("tbody tr").length === count,
    recipe.target === 0 ? 0 : n,
    { timeout: 30000 },
  )
}
async function tbodyEmpty() {
  await page.waitForFunction(() => !document.querySelectorAll("tbody tr").length, null, { timeout: 30000 })
}

async function setup() {
  if (recipe.prep) {
    await page.click(recipe.prep.selector)
    await page.waitForFunction((c) => document.querySelectorAll("tbody tr").length === c, recipe.prep.target, { timeout: 15000 })
  }
}

async function teardown() {
  await page.click("#clear")
  await tbodyEmpty()
}

// Warmup: 5 cycles.
for (let i = 0; i < 5; i++) {
  await setup()
  await page.click(recipe.selector)
  await page.waitForFunction((c) => document.querySelectorAll("tbody tr").length === c, recipe.target, { timeout: 15000 })
  await teardown()
}

const profiles = []
for (let i = 0; i < ITERATIONS; i++) {
  await setup()
  await page.waitForTimeout(20)

  await cdp.send("Profiler.start")
  await page.click(recipe.selector)
  await page.waitForFunction((c) => document.querySelectorAll("tbody tr").length === c, recipe.target, { timeout: 15000 })
  const { profile } = await cdp.send("Profiler.stop")
  profiles.push(profile)
  fs.writeFileSync(path.join(OUT_DIR, `${BENCH}-${String(i).padStart(2, "0")}.cpuprofile`), JSON.stringify(profile))

  await teardown()
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

console.log(`\n[${LABEL} ${BENCH}] Profiles: ${profiles.length}, total sampled time: ${(grandSelfUs / 1000).toFixed(2)} ms`)
console.log("\nTop 30 self-time frames:\n")
console.log("  self_ms   self%   hits  function  (url:line:col)")
console.log("  -------   -----   ----  ---------------------------")
for (const [, v] of sorted.slice(0, 30)) {
  const ms = (v.self / 1000).toFixed(3)
  const pct = ((v.self / grandSelfUs) * 100).toFixed(2)
  const f = v.frame
  const name = f.functionName || "(anonymous)"
  const loc = `${f.url || "<vm>"}:${f.lineNumber}:${f.columnNumber}`
  console.log(`  ${ms.padStart(7)}   ${pct.padStart(5)}   ${String(v.hits).padStart(4)}  ${name.padEnd(30)}  ${loc}`)
}

const byUrl = new Map()
for (const [, v] of totals) {
  const u = v.frame.url || "<vm>"
  byUrl.set(u, (byUrl.get(u) || 0) + v.self)
}
console.log("\nSelf time grouped by url:\n")
for (const [u, us] of [...byUrl.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${(us / 1000).toFixed(3).padStart(7)} ms   ${((us / grandSelfUs) * 100).toFixed(2).padStart(5)}%   ${u}`)
}

console.log(`\nWrote individual profiles to ${OUT_DIR}/`)
