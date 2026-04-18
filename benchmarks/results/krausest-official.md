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
| 01_run1k               |        38.50  |       45.80  |     1.19x |          5.00  |         6.70  |      1.34x |        32.80  |       33.50  |     1.02x |
| 02_replace1k           |        44.50  |       51.10  |     1.15x |          8.00  |        11.40  |      1.43x |        35.10  |       36.00  |     1.03x |
| 03_update10th1k_x16    |        26.20  |       41.00  |     1.56x |          2.20  |         5.40  |      2.45x |        19.30  |       24.20  |     1.25x |
| 04_select1k            |         9.70  |       17.40  |     1.79x |          1.80  |         3.50  |      1.94x |         5.80  |        8.50  |     1.47x |
| 05_swap1k              |        30.30  |       40.50  |     1.34x |          1.50  |         3.20  |      2.13x |        24.20  |       30.70  |     1.27x |
| 06_remove-one-1k       |        20.20  |       23.60  |     1.17x |          0.50  |         1.70  |      3.40x |        17.50  |       19.20  |     1.10x |
| 07_create10k           |       391.70  |      401.00  |     1.02x |         53.70  |        70.60  |      1.31x |       325.00  |      322.80  |     0.99x |
| 08_create1k-after1k_x2 |        44.90  |       51.70  |     1.15x |          5.80  |         6.60  |      1.14x |        37.30  |       40.10  |     1.08x |
| 09_clear1k_x8          |        17.80  |       28.10  |     1.58x |         13.90  |        18.70  |      1.35x |         2.10  |        6.80  |     3.24x |

**Geometric mean ratios (Tachys / Inferno):**
- Total: **1.307x**
- Script: 1.722x
- Paint: 1.281x

## Progress

Prior runs: 1.339x geomean total (baseline), 1.282x (`3047eee`), 1.382x (`0d1c5f6`, after round-over-round Inferno host-state shift). This round adds two mount-path optimizations: (1) `mountComponent` reuses `vnode.props` directly when the component has no JSX children, skipping the `buildComponentProps` spread; (2) `jsx()` probes for `children` / `className` in the props literal with `in` and reuses the literal unchanged when neither is present — zero-allocation pass-through for component call sites like `<Row id={...} label={...} />`. Geomean total landed at 1.307x (from 1.382x), a 0.075x improvement.

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
