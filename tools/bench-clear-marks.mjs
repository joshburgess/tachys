#!/usr/bin/env node
/**
 * Reads __bench.mark callbacks injected into dist/main.js to break clear's
 * 12.6ms x4 click→DOM-empty into stages.
 *
 * Marks (in order, per click):
 *   click                     synthetic, set right before .click()
 *   rerender:start            top of rerenderComponent for App
 *   rerender:render-done      App body re-execute returned (vdom built)
 *   clear:before-textcontent  inside _patchList, just before parent.textContent=""
 *   clear:after-textcontent   immediately after parent.textContent=""
 *   rerender:patch-done       bridgePatch returned (post-patch)
 */
import pwPkg from "/Users/joshburgess/code/js-framework-benchmark/webdriver-ts/node_modules/playwright/index.js"
const { chromium } = pwPkg

const URL = process.env.BENCH_URL || "http://localhost:8080/frameworks/keyed/tachys/"
const ITERATIONS = Number(process.env.ITERATIONS || 30)
const WARMUP = Number(process.env.WARMUP || 5)
const CPU_THROTTLE = Number(process.env.CPU_THROTTLE || 4)
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

await page.addInitScript(() => {
  window.__bench = {
    samples: [],
    current: null,
    mark(name) {
      if (!this.current) return
      this.current[name] = performance.now()
    },
    begin() {
      this.current = {}
    },
    end() {
      const c = this.current
      this.current = null
      this.samples.push(c)
    },
    take() {
      const s = this.samples
      this.samples = []
      return s
    },
  }
})
await page.reload({ waitUntil: "domcontentloaded" })
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
  await page.waitForTimeout(20)

  const r = await page.evaluate(() => {
    return new Promise((resolve) => {
      const tbody = document.querySelector("tbody")
      window.__bench.begin()
      const obs = new MutationObserver(() => {
        if (tbody.children.length === 0) {
          window.__bench.mark("dom-empty")
          obs.disconnect()
          queueMicrotask(() => {
            queueMicrotask(() => {
              setTimeout(() => {
                window.__bench.mark("post-drain-end")
                window.__bench.end()
                resolve(window.__bench.take()[0])
              }, 0)
            })
          })
        }
      })
      obs.observe(tbody, { childList: true })
      window.__bench.mark("click")
      document.querySelector("#clear").click()
      window.__bench.mark("handler-return")
    })
  })
  samples.push(r)
}

await browser.close()

function diffStats(arr, fromKey, toKey) {
  const xs = arr.map((s) => s[toKey] - s[fromKey]).filter((x) => Number.isFinite(x))
  xs.sort((a, b) => a - b)
  const N = xs.length
  if (N === 0) return null
  const sum = xs.reduce((s, x) => s + x, 0)
  const mean = sum / N
  const median = xs[Math.floor(N / 2)]
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / N)
  return { median, mean, sd, min: xs[0], max: xs[N - 1] }
}

console.log(`${LABEL} (CPU x${CPU_THROTTLE}, ${ITERATIONS} iters)`)
const stages = [
  ["click", "rerender:start", "click → rerender:start (synchronous overhead)"],
  ["rerender:start", "rerender:render-done", "App body re-execute (renderComponent)"],
  ["rerender:render-done", "clear:before-textcontent", "patchVNode descent → before textContent=\"\""],
  ["clear:before-textcontent", "clear:after-textcontent", "textContent=\"\" itself"],
  ["clear:after-textcontent", "rerender:patch-done", "post-textContent in patch path"],
  ["rerender:patch-done", "handler-return", "post-patch bookkeeping (out of rerenderComponent)"],
  ["handler-return", "dom-empty", "handler-return → DOM-observed-empty"],
  ["dom-empty", "post-drain-end", "post-drain (microtask + setTimeout(0))"],
  ["click", "dom-empty", "TOTAL click → DOM-empty"],
  ["click", "post-drain-end", "TOTAL click → post-drain-end"],
]
for (const [from, to, label] of stages) {
  const s = diffStats(samples, from, to)
  if (s)
    console.log(
      `  ${label.padEnd(60)} median=${s.median.toFixed(2).padStart(7)} mean=${s.mean.toFixed(2).padStart(7)} stddev=${s.sd.toFixed(2)}`,
    )
}
