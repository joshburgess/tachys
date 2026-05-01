#!/usr/bin/env node
/**
 * Focused click→DOM-mutated wall-time bench for 05_swap1k.
 *
 * For each iter:
 *   1. Click #run, wait for 1000th row.
 *   2. Read current rows[1] and rows[998] DOM nodes.
 *   3. performance.now() → t0
 *   4. dispatchEvent(click) on #swaprows.
 *   5. Once a MutationObserver sees both rows have moved (their
 *      previous siblings differ), performance.now() → t1.
 *   6. Record t1 - t0.
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
  await page.click("#swaprows")
  await page.waitForTimeout(20)
}

const samples = []
for (let i = 0; i < ITERATIONS; i++) {
  const dur = await page.evaluate(() => {
    return new Promise((resolve) => {
      const tbody = document.querySelector("tbody")
      const rows = tbody.children
      const r1 = rows[1]
      const r998 = rows[998]
      let mutated = 0
      const observer = new MutationObserver((records) => {
        for (const rec of records) {
          for (const n of rec.addedNodes) {
            if (n === r1 || n === r998) mutated++
          }
        }
        if (mutated >= 2) {
          const t1 = performance.now()
          observer.disconnect()
          resolve(t1 - t0)
        }
      })
      observer.observe(tbody, { childList: true })
      const t0 = performance.now()
      document.querySelector("#swaprows").click()
    })
  })
  samples.push(dur)
  // Settle so the next iter starts from a known state.
  await page.waitForTimeout(20)
}

await browser.close()

samples.sort((a, b) => a - b)
const N = samples.length
const sum = samples.reduce((a, b) => a + b, 0)
const mean = sum / N
const median = samples[Math.floor(N / 2)]
const stddev = Math.sqrt(samples.reduce((acc, x) => acc + (x - mean) ** 2, 0) / N)

console.log(
  `${LABEL} swap (CPU x${CPU_THROTTLE}, ${N} iters): min=${samples[0].toFixed(2)} median=${median.toFixed(2)} mean=${mean.toFixed(2)} max=${samples[N - 1].toFixed(2)} stddev=${stddev.toFixed(2)}`,
)
