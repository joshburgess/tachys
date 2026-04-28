#!/usr/bin/env node
// Compare the DOM produced by tachys vs inferno after run-1k. Dumps the
// outerHTML of the first row plus aggregate counts so we can see whether
// tachys is generating a meaningfully different tree.

import pwPkg from "/Users/joshburgess/code/js-framework-benchmark/webdriver-ts/node_modules/playwright/index.js"
const { chromium } = pwPkg

async function inspect(name, url) {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: "domcontentloaded" })
  await page.locator("#run").waitFor()
  await page.click("#run")
  await page.locator("tbody tr:nth-child(1000)").waitFor()

  const data = await page.evaluate(() => {
    const tbody = document.querySelector("tbody")
    const firstRow = tbody.children[0]
    const totalNodes = (() => {
      let n = 0
      const walk = (el) => {
        n++
        for (const c of el.childNodes) walk(c)
      }
      walk(tbody)
      return n
    })()
    const elementCount = tbody.querySelectorAll("*").length
    const textNodes = (() => {
      let n = 0
      const w = document.createTreeWalker(tbody, NodeFilter.SHOW_TEXT)
      while (w.nextNode()) n++
      return n
    })()
    return {
      firstRowHTML: firstRow.outerHTML,
      totalNodes,
      elementCount,
      textNodes,
      tbodyAttrs: [...tbody.attributes].map((a) => `${a.name}="${a.value}"`),
    }
  })

  console.log(`=== ${name} ===`)
  console.log("firstRow:", data.firstRowHTML)
  console.log(
    "elements:",
    data.elementCount,
    "textNodes:",
    data.textNodes,
    "totalNodes:",
    data.totalNodes,
  )
  console.log("tbody attrs:", data.tbodyAttrs)
  await browser.close()
}

await inspect("tachys", "http://localhost:8080/frameworks/keyed/tachys/")
await inspect("inferno", "http://localhost:8080/frameworks/keyed/inferno/")
