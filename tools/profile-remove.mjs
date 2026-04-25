#!/usr/bin/env node
// Mirror of profile-clear.mjs for 06_remove-one-1k.
// Replicates the init state from webdriver-ts/src/benchmarksWebdriverCDP.ts:
// click run, then warmup-delete rows 9, 8, 7, 6, 5 (the descending pattern),
// then a 6th delete at row 6. Measured op: delete row 4, repeat per iter.

import path from "node:path"
import fs from "node:fs"
import pwPkg from "/Users/joshburgess/code/js-framework-benchmark/webdriver-ts/node_modules/playwright/index.js"
const { chromium } = pwPkg

const URL = process.env.BENCH_URL || "http://localhost:8080/frameworks/keyed/tachys/"
const ITERATIONS = Number(process.env.ITERATIONS || 60)
const SAMPLING_US = Number(process.env.SAMPLING_US || 10)
const OUT_DIR = process.env.OUT_DIR || "/tmp/remove-prof"
const ROWS_TO_SKIP = 4
const WARMUP = 5

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

async function rowCount() {
  return await page.evaluate(() => document.querySelectorAll("tbody tr").length)
}

async function deleteRow(idx) {
  const before = await rowCount()
  await page.locator(`xpath=//tbody/tr[${idx}]/td[3]/a/span[1]`).click()
  await page.waitForFunction((c) => document.querySelectorAll("tbody tr").length === c, before - 1)
}

// 1. Populate
await page.click("#run")
await page.locator("tbody tr:nth-child(1000)").waitFor()

// 2. Warmup deletes: positions 9, 8, 7, 6, 5
for (let i = 0; i < WARMUP; i++) {
  await deleteRow(WARMUP - i + ROWS_TO_SKIP)
}
// Verify: row 5 should now have id 10
const row5Id = await page.evaluate(() => document.querySelector("tbody tr:nth-child(5) td:nth-child(1)")?.textContent)
console.log(`After warmup, row 5 id = ${row5Id} (expected 10)`)

// 3. Sixth delete at row 6 (rowsToSkip + 2)
await deleteRow(ROWS_TO_SKIP + 2)

// Sanity
const row4IdBefore = await page.evaluate(() => document.querySelector("tbody tr:nth-child(4) td:nth-child(1)")?.textContent)
const totalRowsBefore = await rowCount()
console.log(`Before measured loop: row 4 id = ${row4IdBefore} (expected 4), rows = ${totalRowsBefore}`)

// 4. Measured iterations: delete row 4, profile each
const profiles = []
for (let i = 0; i < ITERATIONS; i++) {
  await page.waitForTimeout(20)
  const before = await rowCount()
  await cdp.send("Profiler.start")
  await page.locator(`xpath=//tbody/tr[${ROWS_TO_SKIP}]/td[3]/a/span[1]`).click()
  await page.waitForFunction((c) => document.querySelectorAll("tbody tr").length === c, before - 1)
  const { profile } = await cdp.send("Profiler.stop")
  profiles.push(profile)
  fs.writeFileSync(path.join(OUT_DIR, `remove-${String(i).padStart(2, "0")}.cpuprofile`), JSON.stringify(profile))
}

await browser.close()

// Aggregate (same logic as profile-clear.mjs)
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
console.log(`\nProfiles: ${profiles.length}, total sampled time: ${(grandSelfUs / 1000).toFixed(2)} ms`)
console.log("\nTop 40 self-time frames:\n")
console.log("  self_ms   self%   hits  function  (url:line:col)")
console.log("  -------   -----   ----  ---------------------------")
for (const [, v] of sorted.slice(0, 40)) {
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
