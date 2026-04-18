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
| 01_run1k               |        36.50  |       42.90  |     1.18x |          4.60  |         5.40  |      1.17x |        31.10  |       30.90  |     0.99x |
| 02_replace1k           |        41.10  |       48.20  |     1.17x |          7.60  |         9.90  |      1.30x |        32.50  |       33.50  |     1.03x |
| 03_update10th1k_x16    |        22.50  |       31.30  |     1.39x |          2.10  |         4.00  |      1.90x |        17.30  |       21.20  |     1.23x |
| 04_select1k            |         7.40  |       12.80  |     1.73x |          1.80  |         2.10  |      1.17x |         4.30  |        7.10  |     1.65x |
| 05_swap1k              |        23.60  |       45.80  |     1.94x |          1.50  |         1.90  |      1.27x |        19.60  |       23.10  |     1.18x |
| 06_remove-one-1k       |        17.90  |       20.40  |     1.14x |          0.50  |         0.80  |      1.60x |        15.90  |       17.10  |     1.08x |
| 07_create10k           |       384.70  |      387.00  |     1.01x |         51.40  |        64.70  |      1.26x |       320.70  |      315.70  |     0.98x |
| 08_create1k-after1k_x2 |        43.40  |       50.70  |     1.17x |          5.30  |         6.80  |      1.28x |        36.30  |       37.80  |     1.04x |
| 09_clear1k_x8          |        16.30  |       21.50  |     1.32x |         12.60  |        12.30  |      0.98x |         1.90  |        6.20  |     3.26x |

**Geometric mean ratios (Tachys / Inferno):**
- Total: **1.310x**
- Script: **1.303x**
- Paint: **1.273x**

## Progress

Prior runs: 1.339x geomean total (baseline), 1.282x (`3047eee`), 1.382x (`0d1c5f6`, after round-over-round Inferno host-state shift), 1.307x (`7f2a3cc`), 1.251x (`e25c04a`), 1.216x (`007fb97`, after empty-array sentinels for unused hooks/effects). This round drops the `instanceMap` WeakMap entirely: every component VNode now carries its ComponentInstance directly on a new `instance` field. The memo-bail hot path in `patchComponent` previously did a WeakMap `get` and a WeakMap `set` per component; with 1000 Rows in the bench, that was 2000 WeakMap ops per render. Direct field access is a single hidden-class load, and V8's in-object slot budget on x64 absorbs the 10th field with no layout change.

Same-session A/B to isolate host-state noise: a rebuild with the change off produced geomean script 1.637x; rebuilt with the change on, 1.303x. Script geomean dropped **0.334x** on the same session state. Per-bench highlights at the measurement point: `04_select1k` script 2.00x -> 1.17x, `05_swap1k` script 2.00x -> 1.27x, both the Row-bail-heavy benches. Total fell from 1.354x to 1.310x -- the remaining gap sits in paint (1.273x), which is host/layout dominated and unchanged by this round.

Paint regressed from the previously recorded 1.170x baseline to 1.273x between sessions -- the Inferno side also showed a total shift in the same direction (Inferno absolute paints got slower on `09_clear1k_x8` and `04_select1k`), consistent with host-state drift. The script number is the cleaner round-over-round signal for this change.

## Notes

- These numbers diverge from the in-repo `bench:browser` harness, which measures tight render calls without user-interaction overhead.
- `09_clear1k_x8` script is now 0.98x -- parity with Inferno on the hot-path clear cycle.
- `07_create10k` total (1.01x) and paint (0.98x) remain at parity when the workload is layout-bound.
- The bench entry (`keyed/tachys/src/main.jsx`) uses a custom `memo` comparator on `Row` that only checks `label` and `selected`, mirroring Inferno's `onComponentShouldUpdate` in `keyed/inferno/src/controller.jsx`.
- Absolute times vary run-to-run due to host state; compare ratios across runs for the cleanest signal, and A/B on the same session when a change's effect is near the noise floor.

## Reproducing

```
# In js-framework-benchmark repo (sibling dir):
cd webdriver-ts
node dist/benchmarkRunner.js --headless \
  --framework keyed/tachys keyed/inferno
```
