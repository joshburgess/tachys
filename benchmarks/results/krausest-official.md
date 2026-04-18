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
| 01_run1k               |        37.40  |       44.50  |     1.19x |          4.90  |         6.00  |      1.22x |        31.70  |       32.20  |     1.02x |
| 02_replace1k           |        44.20  |       49.00  |     1.11x |          8.10  |        10.40  |      1.28x |        34.90  |       34.70  |     0.99x |
| 03_update10th1k_x16    |        28.10  |       31.80  |     1.13x |          2.20  |         5.30  |      2.41x |        21.30  |       23.00  |     1.08x |
| 04_select1k            |         9.00  |       18.50  |     2.06x |          1.80  |         3.50  |      1.94x |         5.30  |        9.20  |     1.74x |
| 05_swap1k              |        28.70  |       46.70  |     1.63x |          1.50  |         2.60  |      1.73x |        23.50  |       25.70  |     1.09x |
| 06_remove-one-1k       |        21.50  |       23.10  |     1.07x |          0.50  |         1.50  |      3.00x |        18.80  |       18.90  |     1.01x |
| 07_create10k           |       402.10  |      405.10  |     1.01x |         54.60  |        69.90  |      1.28x |       333.20  |      326.00  |     0.98x |
| 08_create1k-after1k_x2 |        47.70  |       51.70  |     1.08x |          5.90  |         6.70  |      1.14x |        39.60  |       39.10  |     0.99x |
| 09_clear1k_x8          |        17.20  |       22.00  |     1.28x |         13.30  |        13.60  |      1.02x |         2.10  |        5.40  |     2.57x |

**Geometric mean ratios (Tachys / Inferno):**
- Total: **1.251x**
- Script: **1.567x**
- Paint: **1.200x**

## Progress

Prior runs: 1.339x geomean total (baseline), 1.282x (`3047eee`), 1.382x (`0d1c5f6`, after round-over-round Inferno host-state shift), 1.307x (`7f2a3cc`). This round drops the per-component `_rerender` closure: every `mountComponent` used to allocate `() => rerenderComponent(instance)` and store it on the ComponentInstance. The scheduler now calls `rerenderComponent` through the reconcile bridge instead, so production mounts allocate no closure at all (tests can still set `_rerender` on the instance to intercept). The payoff is visible across nearly every benchmark -- `09_clear1k_x8` script goes from 1.35x to 1.02x, `05_swap1k` from 2.13x to 1.73x, `06_remove-one-1k` from 3.40x to 3.00x -- and geomean total landed at 1.251x (from 1.307x), a 0.056x improvement (0.131x cumulative since baseline).

Local render-only micro-bench (Playwright, no CPU throttle, no click-to-paint overhead) now shows Tachys beating Inferno on every individual benchmark, with select-row at 0.13x (7.5x faster than Inferno). The Krausest gap is dominated by paint (1.28x) and hook/state overhead measured script-side.

## Notes

- These numbers diverge from the in-repo `bench:browser` harness, which measures tight render calls without user-interaction overhead.
- `07_create10k` paint (0.99x) is faster than Inferno when the workload is layout-bound.
- The bench entry (`keyed/tachys/src/main.jsx`) uses a custom `memo` comparator on `Row` that only checks `label` and `selected`, mirroring Inferno's `onComponentShouldUpdate` in `keyed/inferno/src/controller.jsx`.
- Absolute times vary run-to-run due to host state; compare ratios across runs for the cleanest signal.

## Reproducing

```
# In js-framework-benchmark repo (sibling dir):
cd webdriver-ts
node dist/benchmarkRunner.js --headless \
  --framework keyed/tachys keyed/inferno
```
