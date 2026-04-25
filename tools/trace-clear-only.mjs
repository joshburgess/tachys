#!/usr/bin/env node
// Capture a Chrome trace and isolate only the time inside each clear
// operation using console.timeStamp markers. Mirrors how the bench
// would measure 09_clear (clear click → DOM empty).

import fs from "node:fs"
import pwPkg from "/Users/joshburgess/code/js-framework-benchmark/webdriver-ts/node_modules/playwright/index.js"
const { chromium } = pwPkg

const URL = process.env.BENCH_URL || "http://localhost:8080/frameworks/keyed/tachys/"
const ITERATIONS = Number(process.env.ITERATIONS || 30)
const OUT = process.env.OUT || "/tmp/trace-clear-only.json"

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

const CPU_THROTTLE = Number(process.env.CPU_THROTTLE || 1)
if (CPU_THROTTLE > 1) {
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE })
  console.log(`CPU throttling: ${CPU_THROTTLE}x`)
}

await page.goto(URL, { waitUntil: "domcontentloaded" })
await page.locator("#run").waitFor()

// Warmup
for (let i = 0; i < 5; i++) {
  await page.click("#run")
  await page.locator("tbody tr:nth-child(1000)").waitFor()
  await page.click("#clear")
  await page.waitForFunction(() => !document.querySelectorAll("tbody tr").length)
}

const events = []
cdp.on("Tracing.dataCollected", (m) => {
  for (const e of m.value) events.push(e)
})

await cdp.send("Tracing.start", {
  transferMode: "ReportEvents",
  traceConfig: {
    enableSampling: false,
    enableSystrace: false,
    excludedCategories: [],
    includedCategories: [
      "blink.user_timing",
      "devtools.timeline",
      "disabled-by-default-devtools.timeline",
    ],
  },
})

for (let i = 0; i < ITERATIONS; i++) {
  // Populate (untimed phase) — wrap run with a marker pair we can ignore
  await page.click("#run")
  await page.locator("tbody tr:nth-child(1000)").waitFor()

  // Settle a bit so any deferred run-side work finishes before we mark.
  await page.waitForTimeout(20)

  // Mark beginning of timed clear phase via performance.mark (shows up
  // in trace under blink.user_timing).
  await page.evaluate((i) => performance.mark(`clear-start-${i}`), i)
  await page.click("#clear")
  await page.waitForFunction(() => !document.querySelectorAll("tbody tr").length)
  await page.evaluate((i) => performance.mark(`clear-end-${i}`), i)
}

const stoppedP = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve))
await cdp.send("Tracing.end")
await stoppedP

await browser.close()

fs.writeFileSync(OUT, JSON.stringify({ traceEvents: events }))

// --- Analysis ---------------------------------------------------------

const SCRIPT = new Set([
  "EventDispatch",
  "EvaluateScript",
  "v8.evaluateModule",
  "FunctionCall",
  "TimerFire",
  "FireIdleCallback",
  "FireAnimationFrame",
  "RunMicrotasks",
  "V8.Execute",
])
const PAINT = new Set([
  "Layout",
  "UpdateLayoutTree",
  "Paint",
  "Layerize",
  "PrePaint",
  "Commit",
  "RasterTask",
  "CompositeLayers",
  "RecalculateStyles",
  "ParseHTML",
])

// Find clear-start-N and clear-end-N user-timing marks; pair them.
const marks = new Map() // index -> { start, end }
for (const e of events) {
  if (e.cat && e.cat.includes("blink.user_timing")) {
    const m = /^clear-(start|end)-(\d+)$/.exec(e.name)
    if (!m) continue
    const idx = +m[2]
    const slot = marks.get(idx) || {}
    slot[m[1]] = e.ts
    marks.set(idx, slot)
  }
}
const windows = []
for (const [, w] of marks) {
  if (w.start != null && w.end != null) windows.push([w.start, w.end])
}
windows.sort((a, b) => a[0] - b[0])
console.log(`Captured ${windows.length} clear windows of ${ITERATIONS} expected.`)

const xEvents = events.filter((e) => e.ph === "X" && typeof e.dur === "number")

// For each window, sum merged script-category time and paint time.
function intervalMerge(intervals) {
  intervals.sort((a, b) => a[0] - b[0])
  let total = 0, cs = -1, ce = -1
  for (const [s, e] of intervals) {
    if (s >= ce) {
      if (cs >= 0) total += ce - cs
      cs = s; ce = e
    } else if (e > ce) ce = e
  }
  if (cs >= 0) total += ce - cs
  return total
}

function sumInWindow(eventNames, ws, we) {
  const ivals = []
  for (const e of xEvents) {
    if (!eventNames.has(e.name)) continue
    const s = Math.max(e.ts, ws)
    const ee = Math.min(e.ts + e.dur, we)
    if (ee > s) ivals.push([s, ee])
  }
  return intervalMerge(ivals) / 1000
}

let totalScript = 0, totalPaint = 0, totalWall = 0
const perIterScript = []
const nameTotals = new Map()
for (const [ws, we] of windows) {
  totalWall += (we - ws) / 1000
  const s = sumInWindow(SCRIPT, ws, we)
  totalScript += s
  perIterScript.push(s)
  totalPaint += sumInWindow(PAINT, ws, we)
  // Per-name breakdown within window (raw, no overlap merging — just
  // shows where time is spent)
  for (const e of xEvents) {
    if (!SCRIPT.has(e.name)) continue
    if (e.ts + e.dur < ws || e.ts > we) continue
    const overlap = Math.min(e.ts + e.dur, we) - Math.max(e.ts, ws)
    if (overlap <= 0) continue
    const cur = nameTotals.get(e.name) || { count: 0, totalUs: 0 }
    cur.count += 1
    cur.totalUs += overlap
    nameTotals.set(e.name, cur)
  }
}

const N = windows.length
console.log(`\nClear-only timing across ${N} iterations:`)
console.log(`  Wall time:   ${totalWall.toFixed(2)} ms total | ${(totalWall / N).toFixed(3)} ms/clear`)
console.log(`  Script time: ${totalScript.toFixed(2)} ms total | ${(totalScript / N).toFixed(3)} ms/clear`)
console.log(`  Paint time:  ${totalPaint.toFixed(2)} ms total | ${(totalPaint / N).toFixed(3)} ms/clear`)

// Median per-iter script
perIterScript.sort((a, b) => a - b)
const median = perIterScript[Math.floor(N / 2)]
console.log(`  Script median per clear: ${median.toFixed(3)} ms`)

console.log("\nScript-category breakdown across all clear windows:")
console.log("  total_ms    count   name")
console.log("  --------    -----   ----")
for (const [name, v] of [...nameTotals.entries()].sort((a, b) => b[1].totalUs - a[1].totalUs)) {
  console.log(`  ${(v.totalUs / 1000).toFixed(3).padStart(8)}    ${String(v.count).padStart(5)}   ${name}`)
}

console.log(`\nWrote raw trace to ${OUT}`)
