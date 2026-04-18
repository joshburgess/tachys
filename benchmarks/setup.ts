/**
 * Benchmark harness for Tachys.
 *
 * Measures execution time over multiple runs, discards warmup iterations,
 * and reports median, mean, p95, and standard deviation.
 */

export interface BenchmarkResult {
  name: string
  median: number
  mean: number
  p95: number
  stdDev: number
  runs: number
  unit: string
}

export interface BenchmarkOptions {
  /** Total number of runs including warmup. Default: 50. */
  runs?: number
  /** Number of initial warmup runs to discard. Default: 5. */
  warmup?: number
  /** Unit label for output. Default: "ms". */
  unit?: string
}

const DEFAULT_RUNS = 50
const DEFAULT_WARMUP = 5

/**
 * Run a synchronous benchmark function multiple times and collect timing stats.
 *
 * @param name - Human-readable name for this benchmark
 * @param fn - The function to benchmark. Receives the iteration index.
 * @param options - Run count, warmup count, and unit configuration
 * @returns Aggregated benchmark results
 */
export function runBenchmark(
  name: string,
  fn: (iteration: number) => void,
  options: BenchmarkOptions = {},
): BenchmarkResult {
  const runs = options.runs ?? DEFAULT_RUNS
  const warmup = options.warmup ?? DEFAULT_WARMUP
  const unit = options.unit ?? "ms"

  const times: number[] = []

  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    fn(i)
    const elapsed = performance.now() - start

    if (i >= warmup) {
      times.push(elapsed)
    }
  }

  times.sort((a, b) => a - b)

  return {
    name,
    median: percentile(times, 0.5),
    mean: mean(times),
    p95: percentile(times, 0.95),
    stdDev: stdDev(times),
    runs: times.length,
    unit,
  }
}

/**
 * Run an async benchmark function multiple times and collect timing stats.
 *
 * @param name - Human-readable name for this benchmark
 * @param fn - The async function to benchmark
 * @param options - Run count, warmup count, and unit configuration
 * @returns Aggregated benchmark results
 */
export async function runBenchmarkAsync(
  name: string,
  fn: (iteration: number) => Promise<void>,
  options: BenchmarkOptions = {},
): Promise<BenchmarkResult> {
  const runs = options.runs ?? DEFAULT_RUNS
  const warmup = options.warmup ?? DEFAULT_WARMUP
  const unit = options.unit ?? "ms"

  const times: number[] = []

  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    await fn(i)
    const elapsed = performance.now() - start

    if (i >= warmup) {
      times.push(elapsed)
    }
  }

  times.sort((a, b) => a - b)

  return {
    name,
    median: percentile(times, 0.5),
    mean: mean(times),
    p95: percentile(times, 0.95),
    stdDev: stdDev(times),
    runs: times.length,
    unit,
  }
}

/**
 * Format a single benchmark result as a table row string.
 */
export function formatResult(result: BenchmarkResult): string {
  const { name, median, mean: m, p95, stdDev: sd, runs, unit } = result
  return [
    `| ${name.padEnd(30)}`,
    `| ${median.toFixed(2).padStart(10)} ${unit}`,
    `| ${m.toFixed(2).padStart(10)} ${unit}`,
    `| ${p95.toFixed(2).padStart(10)} ${unit}`,
    `| ${sd.toFixed(2).padStart(10)} ${unit}`,
    `| ${String(runs).padStart(5)} |`,
  ].join(" ")
}

/**
 * Format a set of benchmark results as a markdown table.
 */
export function formatResultsTable(results: BenchmarkResult[]): string {
  const header = [
    `| ${"Operation".padEnd(30)}`,
    `| ${"Median".padStart(10)}   `,
    `| ${"Mean".padStart(10)}   `,
    `| ${"P95".padStart(10)}   `,
    `| ${"StdDev".padStart(10)}   `,
    `| ${"Runs".padStart(5)} |`,
  ].join(" ")

  const separator = `|${"-".repeat(32)}|${"-".repeat(15)}|${"-".repeat(15)}|${"-".repeat(15)}|${"-".repeat(15)}|${"-".repeat(8)}|`

  const rows = results.map(formatResult)

  return [header, separator, ...rows].join("\n")
}

function mean(values: number[]): number {
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!
  }
  return sum / values.length
}

function percentile(sorted: number[], p: number): number {
  const index = (sorted.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]!
  const weight = index - lower
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight
}

function stdDev(values: number[]): number {
  const m = mean(values)
  let sumSqDiff = 0
  for (let i = 0; i < values.length; i++) {
    const diff = values[i]! - m
    sumSqDiff += diff * diff
  }
  return Math.sqrt(sumSqDiff / values.length)
}
