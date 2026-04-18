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
| 01_run1k               |        39.20  |       46.30  |     1.18x |          5.00  |         6.60  |      1.32x |        33.30  |       34.10  |     1.02x |
| 02_replace1k           |        44.50  |       49.50  |     1.11x |          8.00  |        11.40  |      1.43x |        35.20  |       36.80  |     1.05x |
| 03_update10th1k_x16    |        29.50  |       38.60  |     1.31x |          2.30  |         6.70  |      2.91x |        22.10  |       27.00  |     1.22x |
| 04_select1k            |        10.80  |       20.10  |     1.86x |          2.00  |         4.10  |      2.05x |         6.20  |       10.90  |     1.76x |
| 05_swap1k              |        32.50  |       41.10  |     1.26x |          1.70  |         4.10  |      2.41x |        25.90  |       31.20  |     1.20x |
| 06_remove-one-1k       |        22.20  |       26.90  |     1.21x |          0.50  |         2.00  |      4.00x |        19.10  |       21.30  |     1.12x |
| 07_create10k           |       413.70  |      415.50  |     1.00x |         55.90  |        73.00  |      1.31x |       342.60  |      335.00  |     0.98x |
| 08_create1k-after1k_x2 |        48.40  |       54.50  |     1.13x |          5.80  |         6.90  |      1.19x |        40.00  |       43.60  |     1.09x |
| 09_clear1k_x8          |        18.00  |       30.30  |     1.68x |         13.80  |        19.10  |      1.38x |         2.20  |        8.30  |     3.77x |

**Geometric mean ratios (Tachys / Inferno):**
- Total: **1.282x**
- Script: 1.832x
- Paint: 1.323x

## Progress

Starting point (prior run): 1.339x geomean total. After this round of optimization (null-children fast-path in `patchComponent` + bulk-clear in `removeOldChildren` + for-in `shallowEqual`): **1.282x**. `06_remove-one-1k` total dropped from ~1.25x to 1.21x, `04_select1k` from 1.81x to 1.86x (within noise). Core script time is still the dominant source of the gap on component-heavy paths like `03_update10th1k` and `06_remove-one-1k`.

## Notes

- These numbers diverge from the in-repo `bench:browser` harness because the official harness measures click-to-paint with CPU throttling; the in-repo harness measures tight render calls without user-interaction overhead.
- `07_create10k` (heavy allocation / layout-bound) is at parity (1.00x) — the diff/pool path is competitive when script is not the bottleneck.
- `09_clear1k_x8` paint (3.77x) is the largest remaining paint gap; script is only 1.38x now thanks to bulk-clear.

## Reproducing

```
# In js-framework-benchmark repo (sibling dir):
cd webdriver-ts
node dist/benchmarkRunner.js --headless \
  --framework keyed/tachys keyed/inferno
```
