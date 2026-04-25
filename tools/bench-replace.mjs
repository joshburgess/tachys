#!/usr/bin/env node
/**
 * Focused click → rows-replaced wall-time bench for 02_replace1k.
 *
 * For each iter (after initial #run + warmup):
 *   1. Capture row[0]'s DOM node.
 *   2. performance.now() → t0
 *   3. dispatchEvent(click) on #run.
 *   4. Observe tbody for row[0]'s removal AND child count back to 1000,
 *      performance.now() → t1.
 *   5. Record t1 - t0.
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
  await page.click("#run")
  await page.waitForTimeout(40)
}

const samples = []
for (let i = 0; i < ITERATIONS; i++) {
  const dur = await page.evaluate(() => {
    return new Promise((resolve) => {
      const tbody = document.querySelector("tbody")
      const oldFirst = tbody.children[0]
      let firstGone = false
      const observer = new MutationObserver(() => {
        if (!firstGone && !oldFirst.isConnected) firstGone = true
        if (firstGone && tbody.children.length === 1000) {
          const t1 = performance.now()
          observer.disconnect()
          resolve(t1 - t0)
        }
      })
      observer.observe(tbody, { childList: true })
      const t0 = performance.now()
      document.querySelector("#run").click()
    })
  })
  samples.push(dur)
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
  `${LABEL} replace (CPU x${CPU_THROTTLE}, ${N} iters): min=${samples[0].toFixed(2)} median=${median.toFixed(2)} mean=${mean.toFixed(2)} max=${samples[N-1].toFixed(2)} stddev=${stddev.toFixed(2)}`,
)
