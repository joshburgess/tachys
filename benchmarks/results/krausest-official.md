# Krausest js-framework-benchmark: Tachys vs Inferno

Source: https://github.com/krausest/js-framework-benchmark (official benchmark)

- Runner: puppeteer
- Iterations: 15 runs per benchmark (25 for `04_select1k`), headless Chrome, 4x CPU throttling
- Date: 2026-04-18
- Tachys: v0.0.1 keyed (HEAD `cb70b06`, babel-plugin-tachys v1.0)
- Inferno: v8.2.2 keyed

Numbers are **median** durations (ms) as produced by the official harness: total = click-to-paint, script = JS CPU time, paint = layout/style/paint.

| Benchmark              | Inferno total | Tachys total | T/I total | Inferno script | Tachys script | T/I script |
|------------------------|---------------|--------------|-----------|----------------|---------------|------------|
| 01_run1k               |        35.50  |       34.60  |     0.97x |          4.50  |         2.80  |     0.62x |
| 02_replace1k           |        39.90  |       41.00  |     1.03x |          7.40  |         7.60  |     1.03x |
| 03_update10th1k_x16    |        19.70  |       19.90  |     1.01x |          1.80  |         1.70  |     0.94x |
| 04_select1k            |         6.40  |        8.80  |     1.38x |          1.60  |         2.30  |     1.44x |
| 05_swap1k              |        24.20  |       22.80  |     0.94x |          1.50  |         1.40  |     0.93x |
| 06_remove-one-1k       |        16.70  |       17.10  |     1.02x |          0.50  |         0.60  |     1.20x |
| 07_create10k           |       372.80  |      367.30  |     0.99x |         50.50  |        34.30  |     0.68x |
| 08_create1k-after1k_x2 |        44.00  |       41.80  |     0.95x |          5.40  |         3.40  |     0.63x |
| 09_clear1k_x8          |        16.40  |       17.10  |     1.04x |         12.70  |        13.30  |     1.05x |

**Geometric mean ratios (Tachys / Inferno):**
- Total: **1.031x**
- Script: **0.912x**

Tachys is at parity with Inferno on total (click-to-paint) and **beats Inferno on script** (JS CPU) across the geometric mean. Compiled-Row script wins carry through: `01_run1k` 0.62x, `07_create10k` 0.68x, `08_create1k-after1k_x2` 0.63x. The remaining script regressions are `04_select1k` (1.44x) and `06_remove-one-1k` (1.20x), both small-denominator benches where the click-to-selection path allocates more than Inferno's direct `linkEvent` dispatch.

## Progress

Prior runs (all VDOM-style Row): 1.339x geomean total (baseline), 1.282x (`3047eee`), 1.382x (`0d1c5f6`), 1.307x (`7f2a3cc`), 1.251x (`e25c04a`), 1.216x (`007fb97`), 1.310x / script 1.303x (`cc04b7a`, direct `instance` field dropping the WeakMap).

Prior compiled-Row run (`a02d605`, hand-written `markCompiled`): 1.379x total / 1.062x script.

This run (`cb70b06`, babel-plugin-tachys v1.0 emits the compiled form automatically): **1.031x total / 0.912x script**. Total geomean closed 0.348x against the prior compiled run, script geomean closed another 0.150x and crossed parity.

The plugin at this milestone covers:
- Host elements, text slots, event slots, attribute slots (including template-literal and literal-expression attrs).
- Nested compiled components and `{arr.map(item => <Row/>)}` keyed lists (LIS-based reorder, 84bdf7c).
- `{cond && <A/>}` conditional children (d4773d7).
- `{cond ? <A/> : <B/>}` ternary children (cb70b06).

The benchmark's `Row` is what exercises the plugin on the hot path; `Header` / `App` remain regular VDOM components because they're stateful (hooks) and not per-frame. LIS / cond / alt don't activate in this bench's App-level list yet (it uses a raw for-loop, not `.map()`), so the current numbers under-represent the list-diff and conditional-child work.

## Notes

- `04_select1k` (1.44x script) is the remaining outlier. Inferno selects in 1.6ms script; we're at 2.3ms. Event delegation through `e.target.closest()` + full re-render is heavier than Inferno's targeted linkEvent approach on this bench.
- `07_create10k` total is at parity (0.99x) because paint dominates at 10k rows. The script share dropped to 0.68x of Inferno's.
- Absolute times vary run-to-run due to host state; compare ratios across runs and A/B on the same session when a change's effect is near the noise floor.
- Next milestones: reduce `04_select1k` / `06_remove-one-1k` script by tightening the event-to-state path; extend App-level list compilation by rewriting the framework's `rows[i] = <Row/>` loop into `{data.map(d => <Row/>)}` so the LIS reorder path actually runs under this benchmark.

## Reproducing

```
# In js-framework-benchmark repo (sibling dir):
cd server && ./node_modules/.bin/tsx index.ts &
cd webdriver-ts
node dist/benchmarkRunner.js --headless \
  --framework keyed/tachys keyed/inferno
```
