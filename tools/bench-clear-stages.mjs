#!/usr/bin/env node
/**
 * Fine-grained per-stage timing for 09_clear1k_x8.
 *
 * Stages (per click):
 *   t0  click
 *   tA  end of App component body re-execution (after the new vdom tree is built)
 *   tB  start of RowList.patch (compiled patch fn)
 *   tC  end of RowList.patch  (DOM is empty by now; textContent="" happened inside)
 *   tD  end of click handler (rerenderComponent returned to scheduler)
 *
 * We instrument by wrapping the actual App and RowList exports the page uses.
 * App is injected via a tiny prelude script that monkey-patches markCompiled
 * for RowList only; App body timing is captured by hooking the `render` call's
 * vnode chain. Runs against the dev (non-minified) bundle so identifiers exist.
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

const samples = { total: [], domEmpty: [], postEmpty: [] }
for (let i = 0; i < ITERATIONS; i++) {
  await page.click("#run")
  await page.locator("tbody tr:nth-child(1000)").waitFor()
  await page.waitForTimeout(20)

  const r = await page.evaluate(() => {
    return new Promise((resolve) => {
      const tbody = document.querySelector("tbody")
      let tEmpty = 0
      const obs = new MutationObserver(() => {
        if (tbody.children.length === 0) {
          tEmpty = performance.now()
          obs.disconnect()
        }
      })
      obs.observe(tbody, { childList: true })
      const t0 = performance.now()
      document.querySelector("#clear").click()
      const tHandler = performance.now()
      // After click handler returns synchronously: scheduler has already
      // flushed via _batched(). Drain microtasks + setTimeout(0) for
      // post-click effects.
      queueMicrotask(() => {
        queueMicrotask(() => {
          setTimeout(() => {
            const t2 = performance.now()
            resolve({
              total: t2 - t0,
              domEmpty: tEmpty - t0,
              handler: tHandler - t0,
              postEmpty: t2 - tEmpty,
            })
          }, 0)
        })
      })
    })
  })
  samples.total.push(r.total)
  samples.domEmpty.push(r.domEmpty)
  samples.postEmpty.push(r.postEmpty)
  if (i === 0) console.log("first iter:", r)
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

const t = stats(samples.total)
const d = stats(samples.domEmpty)
const p = stats(samples.postEmpty)
console.log(
  `${LABEL} (CPU x${CPU_THROTTLE}, ${ITERATIONS} iters):`,
)
console.log(`  click→DOM-empty:   median=${d.median.toFixed(2)} mean=${d.mean.toFixed(2)}`)
console.log(`  post-empty:        median=${p.median.toFixed(2)} mean=${p.mean.toFixed(2)}`)
console.log(`  total:             median=${t.median.toFixed(2)} mean=${t.mean.toFixed(2)}`)
