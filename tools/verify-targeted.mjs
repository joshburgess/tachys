#!/usr/bin/env node
// Verify the by-key targeted-row patch path actually triggers in the
// bench. After warmup, perform N select_row clicks and read
// `globalThis.__targetedHits`. If the targeted path is wired up and
// triggering, the hit count should equal the click count.

import pwPkg from "/Users/joshburgess/code/js-framework-benchmark/webdriver-ts/node_modules/playwright/index.js"
const { chromium } = pwPkg

const URL = process.env.BENCH_URL || "http://localhost:8080/frameworks/keyed/tachys/"
const CLICKS = Number(process.env.CLICKS || 50)

const browser = await chromium.launch({ headless: false })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()

await page.goto(URL, { waitUntil: "domcontentloaded" })
await page.locator("#run").waitFor()
await page.click("#run")
await page.locator("tbody tr:nth-child(1000)").waitFor()

// Reset counter after mount.
await page.evaluate(() => {
  globalThis.__targetedHits = 0
})

const result = await page.evaluate((clicks) => {
  const tbody = document.querySelector("tbody")
  for (let j = 0; j < clicks; j++) {
    const idx = (j % 19) * 47 + 100
    const row = tbody.children[idx]
    row.querySelector("td.col-md-4 a").click()
  }
  return globalThis.__targetedHits ?? 0
}, CLICKS)

console.log(`clicks=${CLICKS} targetedHits=${result}`)
await browser.close()
