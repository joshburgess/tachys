import * as fs from "node:fs"
import * as http from "node:http"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
/**
 * Playwright-based browser benchmarks.
 *
 * Runs Tachys vs Inferno benchmarks in real Chrome with V8 JIT to measure
 * actual production-like performance.
 *
 * Usage: npx playwright test benchmarks/browser/bench.spec.ts
 */
import { expect, test } from "@playwright/test"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, "../..")

function startServer(): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const mimeTypes: Record<string, string> = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".cjs": "application/javascript",
      ".mjs": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".map": "application/json",
    }

    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, "http://localhost")
      const filePath = path.join(projectRoot, url.pathname)

      if (!fs.existsSync(filePath)) {
        res.writeHead(404)
        res.end("Not found")
        return
      }

      const ext = path.extname(filePath)
      const contentType = mimeTypes[ext] || "application/octet-stream"

      const content = fs.readFileSync(filePath)
      res.writeHead(200, { "Content-Type": contentType })
      res.end(content)
    })

    server.listen(0, () => {
      const addr = server.address()
      const port = typeof addr === "object" && addr !== null ? addr.port : 0
      resolve({ server, port })
    })
  })
}

test("Tachys vs Inferno browser benchmark", async ({ page }) => {
  const { server, port } = await startServer()

  try {
    // Capture console errors for debugging
    const consoleErrors: string[] = []
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text())
      }
    })
    page.on("pageerror", (err) => {
      consoleErrors.push(`Page error: ${err.message}`)
    })

    await page.goto(`http://localhost:${port}/benchmarks/browser/index.html`)

    // Wait for benchmarks to complete (up to 5 minutes)
    const done = await page
      .waitForFunction(
        () => (window as unknown as Record<string, unknown>).__benchmarkDone === true,
        null,
        { timeout: 300_000 },
      )
      .catch(() => null)

    if (!done) {
      const pageText = await page.textContent("body")
      console.error("Console errors:", consoleErrors)
      console.error("Page text:", pageText)
      throw new Error(`Benchmark timed out. Console errors: ${consoleErrors.join("; ")}`)
    }

    interface BenchResult {
      name: string
      median: number
      mean: number
      min: number
      max: number
    }

    interface BenchResults {
      tachys: BenchResult[]
      tachysCompiled: BenchResult[]
      inferno: BenchResult[]
    }

    const results: BenchResults = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__benchmarkResults as BenchResults,
    )

    const userAgent = await page.evaluate(() => navigator.userAgent)

    // Format comparison results
    const lines: string[] = [
      "# Tachys vs Inferno Browser Benchmark",
      "",
      "> **WARNING: this harness produces misleading numbers. Do not cite these results.**",
      ">",
      "> The Inferno setup here is handicapped (no `$HasKeyedChildren` hint, no `onComponentShouldUpdate` memoization hook) and the measurement surface is a raw `patch()` loop, not click-to-paint. For authoritative numbers use the official [Krausest](https://github.com/krausest/js-framework-benchmark) harness — see [`krausest-official.md`](./krausest-official.md).",
      "",
      `Date: ${new Date().toISOString()}`,
      `User Agent: ${userAgent}`,
      "",
      "## Comparison",
      "",
      "Three-way comparison: Tachys with raw `h()`, Tachys with plugin-compiled Row, and Inferno.",
      "",
      "| Operation | h() | compiled | inferno | c/h() | c/inf | h()/inf |",
      "|---|---|---|---|---|---|---|",
    ]

    for (let i = 0; i < results.tachys.length; i++) {
      const b = results.tachys[i]
      const c = results.tachysCompiled[i]
      const inf = results.inferno[i]
      const ratioCompiledVsH = (c.median / b.median).toFixed(2)
      const ratioCompiledVsInf = (c.median / inf.median).toFixed(2)
      const ratioHVsInf = (b.median / inf.median).toFixed(2)
      lines.push(
        `| ${b.name} | ${b.median.toFixed(2)}ms | ${c.median.toFixed(2)}ms | ${inf.median.toFixed(2)}ms | ${ratioCompiledVsH}x | ${ratioCompiledVsInf}x | ${ratioHVsInf}x |`,
      )
    }

    lines.push("")
    lines.push("- `c/h()` < 1.0 = compiled faster than raw `h()`")
    lines.push("- `c/inf` < 1.0 = compiled faster than Inferno")
    lines.push("- `h()/inf` < 1.0 = raw `h()` faster than Inferno")

    lines.push("")
    lines.push("## Tachys Detail (raw h())")
    lines.push("")
    lines.push("| Operation | Median (ms) | Mean (ms) | Min (ms) | Max (ms) |")
    lines.push("|---|---|---|---|---|")

    for (const r of results.tachys) {
      lines.push(
        `| ${r.name} | ${r.median.toFixed(2)} | ${r.mean.toFixed(2)} | ${r.min.toFixed(2)} | ${r.max.toFixed(2)} |`,
      )
    }

    lines.push("")
    lines.push("## Tachys Detail (compiled Row)")
    lines.push("")
    lines.push("| Operation | Median (ms) | Mean (ms) | Min (ms) | Max (ms) |")
    lines.push("|---|---|---|---|---|")

    for (const r of results.tachysCompiled) {
      lines.push(
        `| ${r.name} | ${r.median.toFixed(2)} | ${r.mean.toFixed(2)} | ${r.min.toFixed(2)} | ${r.max.toFixed(2)} |`,
      )
    }

    lines.push("")
    lines.push("## Inferno Detail")
    lines.push("")
    lines.push("| Operation | Median (ms) | Mean (ms) | Min (ms) | Max (ms) |")
    lines.push("|---|---|---|---|---|")

    for (const r of results.inferno) {
      lines.push(
        `| ${r.name} | ${r.median.toFixed(2)} | ${r.mean.toFixed(2)} | ${r.min.toFixed(2)} | ${r.max.toFixed(2)} |`,
      )
    }

    const output = lines.join("\n")
    console.log(`\n${output}\n`)

    // Save to file
    const resultsDir = path.resolve(__dirname, "..", "results")
    fs.mkdirSync(resultsDir, { recursive: true })
    fs.writeFileSync(path.resolve(resultsDir, "browser-benchmark.md"), `${output}\n`)

    // Basic sanity: all results should be present
    expect(results.tachys).toHaveLength(8)
    expect(results.tachysCompiled).toHaveLength(8)
    expect(results.inferno).toHaveLength(8)
    for (const r of results.tachys) {
      expect(r.median).toBeGreaterThan(0)
    }
    for (const r of results.tachysCompiled) {
      expect(r.median).toBeGreaterThan(0)
    }
    for (const r of results.inferno) {
      expect(r.median).toBeGreaterThan(0)
    }
  } finally {
    server.close()
  }
})
