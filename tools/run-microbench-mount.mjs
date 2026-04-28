#!/usr/bin/env node
import pwPkg from "/Users/joshburgess/code/js-framework-benchmark/webdriver-ts/node_modules/playwright/index.js"
const { chromium } = pwPkg

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
await page.goto(
  "file:///Users/joshburgess/code/tachys/tools/microbench-mount.html",
  { waitUntil: "domcontentloaded" },
)
await page.waitForFunction(
  () => {
    const el = document.getElementById("out")
    return el && el.textContent && el.textContent.length > 0
  },
  { timeout: 120000 },
)
const out = await page.locator("#out").textContent()
console.log(out)
await browser.close()
