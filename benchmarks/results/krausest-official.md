# Krausest js-framework-benchmark: Tachys vs Inferno

Source: https://github.com/krausest/js-framework-benchmark (official benchmark)

- Runner: playwright
- Iterations: 10 runs per benchmark, headless Chrome, 4x CPU throttling
- Date: 2026-04-17
- Tachys: v0.0.1 keyed
- Inferno: v8.2.2 keyed

Each cell shows mean duration (ms) of the **total** script+paint time, measured by the official harness from mousedown to paint.

| Benchmark                 | Tachys mean  | Inferno mean  | Ratio T/I  | Winner  |
|---------------------------|--------------|---------------|------------|---------|
| 01_run1k                  | 48.19 ms     | 37.87 ms      | 1.273      | Inferno |
| 02_replace1k              | 54.16 ms     | 42.30 ms      | 1.280      | Inferno |
| 03_update10th1k_x16       | 39.47 ms     | 31.31 ms      | 1.261      | Inferno |
| 04_select1k               | 20.00 ms     | 11.06 ms      | 1.809      | Inferno |
| 05_swap1k                 | 51.43 ms     | 33.35 ms      | 1.542      | Inferno |
| 06_remove-one-1k          | 28.07 ms     | 22.48 ms      | 1.249      | Inferno |
| 07_create10k              | 401.44 ms    | 385.67 ms     | 1.041      | Inferno |
| 08_create1k-after1k_x2    | 55.12 ms     | 45.79 ms      | 1.204      | Inferno |
| 09_clear1k_x8             | 29.05 ms     | 18.85 ms      | 1.541      | Inferno |

**Geometric mean ratio (Tachys / Inferno): 1.339**

## Notes

- These numbers diverge from the in-repo `bench:browser` harness because the official harness measures click-to-paint with CPU throttling; the in-repo harness measures tight render calls without user-interaction overhead.
- The largest gaps are in `04_select1k` (1.81x) and `05_swap1k`/`09_clear1k_x8` (1.54x). Both are hot paths that touch a small number of DOM nodes, where per-operation overhead dominates.
- `07_create10k` (heavy allocation) is near parity (1.04x) -- suggesting core diff/pool performance is competitive and overhead comes from scheduler/event plumbing.

## Reproducing

```
# In js-framework-benchmark repo (sibling dir):
cd webdriver-ts
node dist/benchmarkRunner.js --headless --runner playwright \
  --framework keyed/tachys keyed/inferno \
  --count 10 --benchmark 01_ 02_ 03_ 04_ 05_ 06_ 07_ 08_ 09_
```
