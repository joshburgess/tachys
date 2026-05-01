#!/usr/bin/env node
/**
 * Focused click → row-text-mutated wall-time bench for 03_update10th1k_x16.
 *
 * For each iter (after #run + warmup):
 *   1. Read row[0]'s label text content.
 *   2. performance.now() → t0
 *   3. dispatchEvent(click) on #update.
 *   4. Once row[0]'s label text differs, performance.now() → t1.
 *   5. Record t1 - t0.
 *
 * Krausest's 03_update10th1k_x16 fires #update 16 times. We measure a
 * single click; the harness number is roughly 16x ours minus the
 * harness overhead.
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
  await page.click("#update")
  await page.waitForTimeout(20)
}

const samples = []
for (let i = 0; i < ITERATIONS; i++) {
  const dur = await page.evaluate(() => {
    return new Promise((resolve) => {
      const tbody = document.querySelector("tbody")
      const labelAnchor = tbody.children[0].querySelector("td.col-md-4 a")
      const before = labelAnchor.textContent
      const observer = new MutationObserver(() => {
        if (labelAnchor.textContent !== before) {
          const t1 = performance.now()
          observer.disconnect()
          resolve(t1 - t0)
        }
      })
      observer.observe(labelAnchor, { childList: true, characterData: true, subtree: true })
      const t0 = performance.now()
      document.querySelector("#update").click()
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
const stddev = Math.sqrt(samples.reduce((acc, x) => acc + (x - mean) ** 2, 0) / N)

console.log(
  `${LABEL} update (CPU x${CPU_THROTTLE}, ${N} iters): min=${samples[0].toFixed(2)} median=${median.toFixed(2)} mean=${mean.toFixed(2)} max=${samples[N - 1].toFixed(2)} stddev=${stddev.toFixed(2)}`,
)
