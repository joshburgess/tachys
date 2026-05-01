#!/usr/bin/env node
/**
 * Focused click → 10000th row mounted wall-time bench for 07_create-many.
 *
 * For each iter (after #clear settle):
 *   1. performance.now() → t0
 *   2. dispatchEvent(click) on #runlots.
 *   3. Once tbody has 10000 children, performance.now() → t1.
 *   4. Record t1 - t0.
 *
 * Each iter starts from an empty tbody (we click #clear between iters).
 */
import pwPkg from "/Users/joshburgess/code/js-framework-benchmark/webdriver-ts/node_modules/playwright/index.js"
const { chromium } = pwPkg

const URL = process.env.BENCH_URL || "http://localhost:8080/frameworks/keyed/tachys/"
const ITERATIONS = Number(process.env.ITERATIONS || 15)
const WARMUP = Number(process.env.WARMUP || 2)
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

for (let i = 0; i < WARMUP; i++) {
  await page.click("#runlots")
  await page.locator("tbody tr:nth-child(10000)").waitFor()
  await page.click("#clear")
  await page.waitForFunction(() => !document.querySelectorAll("tbody tr").length)
}

const samples = []
for (let i = 0; i < ITERATIONS; i++) {
  const dur = await page.evaluate(() => {
    return new Promise((resolve) => {
      const tbody = document.querySelector("tbody")
      const observer = new MutationObserver(() => {
        if (tbody.children.length === 10000) {
          const t1 = performance.now()
          observer.disconnect()
          resolve(t1 - t0)
        }
      })
      observer.observe(tbody, { childList: true })
      const t0 = performance.now()
      document.querySelector("#runlots").click()
    })
  })
  samples.push(dur)
  await page.click("#clear")
  await page.waitForFunction(() => !document.querySelectorAll("tbody tr").length)
  await page.waitForTimeout(50)
}

await browser.close()

samples.sort((a, b) => a - b)
const N = samples.length
const sum = samples.reduce((a, b) => a + b, 0)
const mean = sum / N
const median = samples[Math.floor(N / 2)]
const stddev = Math.sqrt(samples.reduce((acc, x) => acc + (x - mean) ** 2, 0) / N)

console.log(
  `${LABEL} runlots (CPU x${CPU_THROTTLE}, ${N} iters): min=${samples[0].toFixed(2)} median=${median.toFixed(2)} mean=${mean.toFixed(2)} max=${samples[N - 1].toFixed(2)} stddev=${stddev.toFixed(2)}`,
)
