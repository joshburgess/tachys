#!/usr/bin/env node
// Capture a Chrome trace (Tracing.start with the same categories as
// js-framework-benchmark webdriver-cdp) for one round of clear clicks.
// Then bucket events by name and report time per category.

import fs from "node:fs"
import pwPkg from "/Users/joshburgess/code/js-framework-benchmark/webdriver-ts/node_modules/playwright/index.js"
const { chromium } = pwPkg

const URL = process.env.BENCH_URL || "http://localhost:8080/frameworks/keyed/tachys/"
const ITERATIONS = Number(process.env.ITERATIONS || 8)
const OUT = process.env.OUT || "/tmp/trace-clear.json"

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

await page.goto(URL, { waitUntil: "domcontentloaded" })
await page.locator("#run").waitFor()

// Warmup
for (let i = 0; i < 5; i++) {
  await page.click("#run")
  await page.locator("tbody tr:nth-child(1000)").waitFor()
  await page.click("#clear")
  await page.waitForFunction(() => !document.querySelectorAll("tbody tr").length)
}

// Populate before tracing
await page.click("#run")
await page.locator("tbody tr:nth-child(1000)").waitFor()
await page.waitForTimeout(200)

// Collect trace events
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

// Issue ITERATIONS clears, repopulating between each
for (let i = 0; i < ITERATIONS; i++) {
  await page.click("#clear")
  await page.waitForFunction(() => !document.querySelectorAll("tbody tr").length)
  if (i < ITERATIONS - 1) {
    await page.click("#run")
    await page.locator("tbody tr:nth-child(1000)").waitFor()
  }
}

const stoppedP = new Promise((resolve) => {
  cdp.once("Tracing.tracingComplete", resolve)
})
await cdp.send("Tracing.end")
await stoppedP

await browser.close()

fs.writeFileSync(OUT, JSON.stringify({ traceEvents: events }))

// --- Analysis ----------------------------------------------------------
// Bucket events by name. Show wall time of the script-relevant events.
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

// We sum durations of complete events (ph === "X") only. To avoid
// double-counting nested events, use containment: only count time
// inside the OUTERMOST event of each category.
const xEvents = events.filter((e) => e.ph === "X" && typeof e.dur === "number")

function sumByName(eventNames) {
  // Filter to relevant
  const evs = xEvents.filter((e) => eventNames.has(e.name))
  // Sort by ts
  evs.sort((a, b) => a.ts - b.ts)
  // Merge overlapping intervals (containment)
  let total = 0
  let curStart = -1
  let curEnd = -1
  for (const e of evs) {
    const s = e.ts
    const ee = e.ts + e.dur
    if (s >= curEnd) {
      if (curStart >= 0) total += curEnd - curStart
      curStart = s
      curEnd = ee
    } else if (ee > curEnd) {
      curEnd = ee
    }
  }
  if (curStart >= 0) total += curEnd - curStart
  return total / 1000 // microseconds -> ms
}

function breakdownByName(eventNames) {
  const buckets = new Map()
  for (const e of xEvents) {
    if (!eventNames.has(e.name)) continue
    const cur = buckets.get(e.name)
    if (cur) {
      cur.count += 1
      cur.totalUs += e.dur
    } else {
      buckets.set(e.name, { count: 1, totalUs: e.dur })
    }
  }
  return [...buckets.entries()].sort((a, b) => b[1].totalUs - a[1].totalUs)
}

const scriptMs = sumByName(SCRIPT)
const paintMs = sumByName(PAINT)
console.log(`\nWrote raw trace to ${OUT}`)
console.log(`Iterations: ${ITERATIONS}`)
console.log(
  `Script-category merged total: ${scriptMs.toFixed(2)} ms (${(scriptMs / ITERATIONS).toFixed(3)} ms/iter)`,
)
console.log(
  `Paint-category merged total:  ${paintMs.toFixed(2)} ms (${(paintMs / ITERATIONS).toFixed(3)} ms/iter)\n`,
)

console.log("Per-name breakdown (script category):")
console.log("  total_ms    count   name")
console.log("  --------    -----   ----")
for (const [name, v] of breakdownByName(SCRIPT)) {
  console.log(
    `  ${(v.totalUs / 1000).toFixed(3).padStart(8)}    ${String(v.count).padStart(5)}   ${name}`,
  )
}

console.log("\nPer-name breakdown (paint category):")
console.log("  total_ms    count   name")
console.log("  --------    -----   ----")
for (const [name, v] of breakdownByName(PAINT)) {
  console.log(
    `  ${(v.totalUs / 1000).toFixed(3).padStart(8)}    ${String(v.count).padStart(5)}   ${name}`,
  )
}
