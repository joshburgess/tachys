#!/usr/bin/env node
/**
 * Focused click → DOM-empty wall-time bench. Bypasses Krausest's
 * trace-tooling harness and Chrome tracing overhead so a clean
 * before/after comparison shows up.
 *
 * For each iter:
 *   1. Click #run, wait for 1000th row.
 *   2. performance.now() → t0
 *   3. dispatchEvent(click) on #clear synchronously.
 *   4. Once tbody has no <tr>, performance.now() → t1.
 *   5. Record t1 - t0.
 *
 * Reports min / median / mean / stddev across iterations. Iteration
 * count, throttle, and warmup are env-tunable.
 */
import pwPkg from "/Users/joshburgess/code/js-framework-benchmark/webdriver-ts/node_modules/playwright/index.js"
const { chromium } = pwPkg

const URL = process.env.BENCH_URL || "http://localhost:8080/frameworks/keyed/tachys/"
const ITERATIONS = Number(process.env.ITERATIONS || 30)
const WARMUP = Number(process.env.WARMUP || 5)
const CPU_THROTTLE = Number(process.env.CPU_THROTTLE || 1)
const LABEL = process.env.LABEL || "clear"
const TARGET = process.env.TARGET || "#clear"
const SETTLE_BEFORE = Number(process.env.SETTLE_BEFORE || 20)

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

if (CPU_THROTTLE > 1) {
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE })
}

await page.goto(URL, { waitUntil: "domcontentloaded" })
await page.locator("#run").waitFor()

for (let i = 0; i < WARMUP; i++) {
  await page.click("#run")
  await page.locator("tbody tr:nth-child(1000)").waitFor()
  await page.click("#clear")
  await page.waitForFunction(() => !document.querySelectorAll("tbody tr").length)
}

const samples = []
for (let i = 0; i < ITERATIONS; i++) {
  await page.click("#run")
  await page.locator("tbody tr:nth-child(1000)").waitFor()

  // Quiet beat so any deferred run-side work finishes.
  await page.waitForTimeout(20)

  const dur = await page.evaluate((sel) => {
    return new Promise((resolve) => {
      const t0 = performance.now()
      const observer = new MutationObserver(() => {
        const tbody = document.querySelector("tbody")
        if (tbody && tbody.children.length === 0) {
          const t1 = performance.now()
          observer.disconnect()
          resolve(t1 - t0)
        }
      })
      observer.observe(document.querySelector("tbody"), { childList: true })
      document.querySelector(sel).click()
    })
  }, TARGET)
  samples.push(dur)
}

await browser.close()

samples.sort((a, b) => a - b)
const N = samples.length
const sum = samples.reduce((a, b) => a + b, 0)
const mean = sum / N
const median = samples[Math.floor(N / 2)]
const stddev = Math.sqrt(samples.reduce((acc, x) => acc + (x - mean) ** 2, 0) / N)
const min = samples[0]
const max = samples[N - 1]

console.log(
  `${LABEL} (CPU x${CPU_THROTTLE}, ${N} iters): min=${min.toFixed(2)} median=${median.toFixed(2)} mean=${mean.toFixed(2)} max=${max.toFixed(2)} stddev=${stddev.toFixed(2)}`,
)
console.log(`  samples: ${samples.map((s) => s.toFixed(1)).join(", ")}`)
