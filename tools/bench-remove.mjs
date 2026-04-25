#!/usr/bin/env node
/**
 * Focused click → row-removed wall-time bench for 06_remove-one.
 *
 * For each iter (after #run + warmup):
 *   1. Locate the 4th row's remove button (Krausest's choice).
 *   2. Capture that row's DOM node.
 *   3. performance.now() → t0
 *   4. dispatchEvent(click) on the remove anchor.
 *   5. Once tbody has 999 children, performance.now() → t1.
 *   6. Record t1 - t0.
 *
 * Re-runs #run between iters so each iter starts from 1000 rows.
 */
import pwPkg from "/Users/joshburgess/code/js-framework-benchmark/webdriver-ts/node_modules/playwright/index.js"
const { chromium } = pwPkg

const URL = process.env.BENCH_URL || "http://localhost:8080/frameworks/keyed/tachys/"
const ITERATIONS = Number(process.env.ITERATIONS || 30)
const WARMUP = Number(process.env.WARMUP || 5)
const CPU_THROTTLE = Number(process.env.CPU_THROTTLE || 1)
const LABEL = process.env.LABEL || "tachys"

const browser = await chromium.launch({
  headless: false,
  args: [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--disable-features=CalculateNativeWinOcclusion",
  ],
})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
if (CPU_THROTTLE > 1) {
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE })
}

await page.goto(URL, { waitUntil: "domcontentloaded" })
await page.locator("#run").waitFor()
await page.click("#run")
await page.locator("tbody tr:nth-child(1000)").waitFor()

for (let i = 0; i < WARMUP; i++) {
  await page.evaluate(() => {
    const row = document.querySelector("tbody").children[3]
    row.querySelector("a.remove, td:nth-child(3) a").click()
  })
  await page.waitForFunction(() => document.querySelector("tbody").children.length === 999)
  await page.click("#run")
  await page.locator("tbody tr:nth-child(1000)").waitFor()
}

const samples = []
for (let i = 0; i < ITERATIONS; i++) {
  const dur = await page.evaluate(() => {
    return new Promise((resolve) => {
      const tbody = document.querySelector("tbody")
      const row = tbody.children[3]
      const removeAnchor = row.querySelector("td:nth-child(3) a")
      const observer = new MutationObserver(() => {
        if (tbody.children.length === 999) {
          const t1 = performance.now()
          observer.disconnect()
          resolve(t1 - t0)
        }
      })
      observer.observe(tbody, { childList: true })
      const t0 = performance.now()
      removeAnchor.click()
    })
  })
  samples.push(dur)
  // Restore 1000 rows for next iter.
  await page.click("#run")
  await page.locator("tbody tr:nth-child(1000)").waitFor()
  await page.waitForTimeout(20)
}

await browser.close()

samples.sort((a, b) => a - b)
const N = samples.length
const sum = samples.reduce((a, b) => a + b, 0)
const mean = sum / N
const median = samples[Math.floor(N / 2)]
const stddev = Math.sqrt(
  samples.reduce((acc, x) => acc + (x - mean) ** 2, 0) / N,
)

console.log(
  `${LABEL} remove (CPU x${CPU_THROTTLE}, ${N} iters): min=${samples[0].toFixed(2)} median=${median.toFixed(2)} mean=${mean.toFixed(2)} max=${samples[N-1].toFixed(2)} stddev=${stddev.toFixed(2)}`,
)
