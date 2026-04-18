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
| 01_run1k               |        36.30  |       43.20  |     1.19x |          4.50  |         5.80  |      1.29x |        31.00  |       31.50  |     1.02x |
| 02_replace1k           |        40.00  |       46.70  |     1.17x |          7.40  |        10.30  |      1.39x |        32.00  |       33.50  |     1.05x |
| 03_update10th1k_x16    |        20.80  |       25.90  |     1.25x |          2.00  |         4.50  |      2.25x |        15.60  |       18.70  |     1.20x |
| 04_select1k            |         7.10  |       15.90  |     2.24x |          1.60  |         3.20  |      2.00x |         4.30  |        8.20  |     1.91x |
| 05_swap1k              |        23.90  |       45.70  |     1.91x |          1.30  |         2.80  |      2.15x |        19.40  |       23.30  |     1.20x |
| 06_remove-one-1k       |        17.40  |       22.30  |     1.28x |          0.50  |         1.60  |      3.20x |        15.30  |       18.40  |     1.20x |
| 07_create10k           |       382.20  |      387.70  |     1.01x |         50.90  |        69.00  |      1.36x |       318.50  |      311.20  |     0.98x |
| 08_create1k-after1k_x2 |        43.30  |       51.30  |     1.18x |          5.40  |         6.20  |      1.15x |        36.30  |       39.20  |     1.08x |
| 09_clear1k_x8          |        15.60  |       25.10  |     1.61x |         12.00  |        16.50  |      1.38x |         2.00  |        5.50  |     2.75x |

**Geometric mean ratios (Tachys / Inferno):**
- Total: **1.382x**
- Script: 1.701x
- Paint: 1.294x

## Progress

Prior runs: 1.339x geomean total (baseline), 1.282x after the first round of optimizations (`3047eee`). This round inlines the memo-compare read and short-circuits the context check in `patchComponent`, saving two function calls per bail on the hot memo-reuse path. Geomean script improved from ~1.81x to 1.70x; total landed at 1.382x. (Between rounds, host state changes shifted Inferno's own absolute times by up to 40%, so round-over-round ratio deltas include noise: compare script numbers for the cleanest signal.)

The `04_select1k` paint (1.91x) is the largest individual paint gap and `06_remove-one-1k` script (3.20x) the largest individual script gap. `09_clear1k_x8` paint (2.75x) remains elevated despite the earlier bulk-clear optimization (single `textContent = ""` vs N `removeChild()` calls).

## Notes

- These numbers diverge from the in-repo `bench:browser` harness, which measures tight render calls without user-interaction overhead.
- `07_create10k` paint (0.98x) is faster than Inferno when the workload is layout-bound.
- The bench entry (`keyed/tachys/src/main.jsx`) uses a custom `memo` comparator on `Row` that only checks `label` and `selected`, mirroring Inferno's `onComponentShouldUpdate` in `keyed/inferno/src/controller.jsx`.

## Reproducing

```
# In js-framework-benchmark repo (sibling dir):
cd webdriver-ts
node dist/benchmarkRunner.js --headless \
  --framework keyed/tachys keyed/inferno
```
