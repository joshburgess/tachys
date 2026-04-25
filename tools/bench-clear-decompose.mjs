#!/usr/bin/env node
/**
 * Decompose click→DOM-empty into:
 *   (a) click → DOM-empty:           wall time the user sees.
 *   (b) DOM-empty → return to event loop: post-clear bookkeeping
 *       (microtasks, useEffect cleanup, scheduler reschedules) that
 *       Krausest's EventDispatch trace counts as script time.
 *
 * For each iter we instrument the page to:
 *   1. t0 = performance.now()
 *   2. fire click on #clear synchronously
 *   3. observer fires when tbody empties: t1 = performance.now()
 *   4. queueMicrotask + setTimeout(0) chain to settle remaining post-
 *      click work, then t2 = performance.now()
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

for (let i = 0; i < WARMUP; i++) {
  await page.click("#run")
  await page.locator("tbody tr:nth-child(1000)").waitFor()
  await page.click("#clear")
  await page.waitForFunction(() => !document.querySelectorAll("tbody tr").length)
}

const samples = { clear: [], post: [] }
for (let i = 0; i < ITERATIONS; i++) {
  await page.click("#run")
  await page.locator("tbody tr:nth-child(1000)").waitFor()
  await page.waitForTimeout(20)

  const { clear, post } = await page.evaluate(() => {
    return new Promise((resolve) => {
      let t0 = 0, t1 = 0
      const tbody = document.querySelector("tbody")
      const observer = new MutationObserver(() => {
        if (tbody.children.length === 0) {
          t1 = performance.now()
          observer.disconnect()
          // Drain microtasks + a setTimeout(0) tick so any post-clear
          // scheduler/useEffect work runs before we stop the clock.
          queueMicrotask(() => {
            queueMicrotask(() => {
              setTimeout(() => {
                const t2 = performance.now()
                resolve({ clear: t1 - t0, post: t2 - t1 })
              }, 0)
            })
          })
        }
      })
      observer.observe(tbody, { childList: true })
      t0 = performance.now()
      document.querySelector("#clear").click()
    })
  })
  samples.clear.push(clear)
  samples.post.push(post)
}

await browser.close()

function stats(arr) {
  const a = [...arr].sort((x, y) => x - y)
  const N = a.length
  const sum = a.reduce((s, x) => s + x, 0)
  const mean = sum / N
  const median = a[Math.floor(N / 2)]
  const sd = Math.sqrt(a.reduce((s, x) => s + (x - mean) ** 2, 0) / N)
  return { min: a[0], max: a[N - 1], median, mean, sd }
}

const c = stats(samples.clear)
const p = stats(samples.post)
console.log(
  `${LABEL} (CPU x${CPU_THROTTLE}, ${ITERATIONS} iters):`,
)
console.log(
  `  click→DOM-empty:   median=${c.median.toFixed(2)} mean=${c.mean.toFixed(2)} stddev=${c.sd.toFixed(2)}`,
)
console.log(
  `  post-empty drain:  median=${p.median.toFixed(2)} mean=${p.mean.toFixed(2)} stddev=${p.sd.toFixed(2)}`,
)
console.log(
  `  combined median:   ${(c.median + p.median).toFixed(2)} ms`,
)
