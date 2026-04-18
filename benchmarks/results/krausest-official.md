# Krausest js-framework-benchmark: Tachys vs Inferno

Source: https://github.com/krausest/js-framework-benchmark (official benchmark)

- Runner: puppeteer
- Iterations: 15 runs per benchmark, headless Chrome, 4x CPU throttling
- Date: 2026-04-18
- Tachys: v0.0.1 keyed
- Inferno: v8.2.2 keyed

Numbers are **median** durations (ms) as produced by the official harness: total = click-to-paint, script = JS CPU time, paint = layout/style/paint.

| Benchmark              | Inferno total | Tachys total | T/I total | Inferno script | Tachys script | T/I script | Inferno paint | Tachys paint | T/I paint |
|------------------------|---------------|--------------|-----------|----------------|---------------|------------|---------------|--------------|-----------|
| 01_run1k               |        37.40  |       43.30  |     1.16x |          4.90  |         6.10  |      1.24x |        31.70  |       31.50  |     0.99x |
| 02_replace1k           |        44.20  |       45.50  |     1.03x |          8.10  |        10.10  |      1.25x |        34.90  |       34.00  |     0.97x |
| 03_update10th1k_x16    |        28.10  |       29.50  |     1.05x |          2.20  |         5.00  |      2.27x |        21.30  |       20.60  |     0.97x |
| 04_select1k            |         9.00  |       15.20  |     1.69x |          1.80  |         3.40  |      1.89x |         5.30  |        7.40  |     1.40x |
| 05_swap1k              |        28.70  |       49.30  |     1.72x |          1.50  |         2.50  |      1.67x |        23.50  |       24.60  |     1.05x |
| 06_remove-one-1k       |        21.50  |       22.70  |     1.06x |          0.50  |         1.50  |      3.00x |        18.80  |       18.60  |     0.99x |
| 07_create10k           |       402.10  |      403.40  |     1.00x |         54.60  |        68.60  |      1.26x |       333.20  |      326.20  |     0.98x |
| 08_create1k-after1k_x2 |        47.70  |       51.50  |     1.08x |          5.90  |         6.60  |      1.12x |        39.60  |       39.70  |     1.00x |
| 09_clear1k_x8          |        17.20  |       24.00  |     1.40x |         13.30  |        15.10  |      1.14x |         2.10  |        6.50  |     3.10x |

**Geometric mean ratios (Tachys / Inferno):**
- Total: **1.216x**
- Script: **1.555x**
- Paint: **1.170x**

## Progress

Prior runs: 1.339x geomean total (baseline), 1.282x (`3047eee`), 1.382x (`0d1c5f6`, after round-over-round Inferno host-state shift), 1.307x (`7f2a3cc`), 1.251x (`e25c04a`, after dropping the per-instance `_rerender` closure). This round lifts the `_hooks` and `_effects` arrays onto shared frozen sentinels. A component that never calls a hook (like `Row` in the bench) now allocates zero arrays at mount; the first hook push checks identity against the sentinel and lifts to a real array if needed. Payoff: 1.251x -> 1.216x geomean total (0.035x improvement, 0.123x cumulative paint + 0.012x script in this round). `02_replace1k` total tightens to 1.03x, `03_update10th1k_x16` to 1.05x, `07_create10k` to exactly 1.00x, and `04_select1k` total drops from 2.06x to 1.69x as paint pressure eases. `05_swap1k` (1.72x) and `09_clear1k_x8` paint (3.10x) are now the dominant holdouts and will be the focus of the next rounds.

Local render-only micro-bench (Playwright, no CPU throttle, no click-to-paint overhead) continues to show Tachys beating Inferno on every individual benchmark; the Krausest gap is dominated by paint (1.170x) and hook/state overhead measured script-side.

## Notes

- These numbers diverge from the in-repo `bench:browser` harness, which measures tight render calls without user-interaction overhead.
- `07_create10k` total (1.00x) and paint (0.98x) are at parity when the workload is layout-bound.
- The bench entry (`keyed/tachys/src/main.jsx`) uses a custom `memo` comparator on `Row` that only checks `label` and `selected`, mirroring Inferno's `onComponentShouldUpdate` in `keyed/inferno/src/controller.jsx`.
- Absolute times vary run-to-run due to host state; compare ratios across runs for the cleanest signal.

## Reproducing

```
# In js-framework-benchmark repo (sibling dir):
cd webdriver-ts
node dist/benchmarkRunner.js --headless \
  --framework keyed/tachys keyed/inferno
```
