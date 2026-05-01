#!/usr/bin/env node
// Direct synchronous bench for select_row. Brackets .click() with
// performance.now() reads since flush is sync inside batched event
// handlers; the MutationObserver-based bench mostly measures microtask
// overhead and washes out real patch time differences.

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
  await page.evaluate(
    (idx) => {
      document.querySelector("tbody").children[idx].querySelector("td.col-md-4 a").click()
    },
    (i + 1) * 50,
  )
  await page.waitForTimeout(20)
}

// Many clicks per sample to outrun performance.now() quantization (5μs).
const CLICKS_PER_SAMPLE = Number(process.env.CLICKS_PER_SAMPLE || 20)
const samples = await page.evaluate(
  ({ iters, perSample }) => {
    const out = []
    const tbody = document.querySelector("tbody")
    for (let i = 0; i < iters; i++) {
      const t0 = performance.now()
      for (let j = 0; j < perSample; j++) {
        const idx = ((i * perSample + j) % 19) * 47 + 100
        const row = tbody.children[idx]
        row.querySelector("td.col-md-4 a").click()
      }
      const t1 = performance.now()
      out.push((t1 - t0) / perSample)
    }
    return out
  },
  { iters: ITERATIONS, perSample: CLICKS_PER_SAMPLE },
)

await browser.close()

samples.sort((a, b) => a - b)
const N = samples.length
const sum = samples.reduce((a, b) => a + b, 0)
const mean = sum / N
const median = samples[Math.floor(N / 2)]
const stddev = Math.sqrt(samples.reduce((acc, x) => acc + (x - mean) ** 2, 0) / N)
console.log(
  `${LABEL} select-sync (CPU x${CPU_THROTTLE}, ${N} iters): min=${samples[0].toFixed(3)} median=${median.toFixed(3)} mean=${mean.toFixed(3)} max=${samples[N - 1].toFixed(3)} stddev=${stddev.toFixed(3)}`,
)
