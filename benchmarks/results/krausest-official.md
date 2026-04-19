# Krausest js-framework-benchmark: Tachys vs Inferno

Source: https://github.com/krausest/js-framework-benchmark (official benchmark)

- Runner: puppeteer
- Iterations: 15 runs per benchmark (25 for `04_select1k`), headless Chrome, 4x CPU throttling
- Date: 2026-04-18
- Tachys: v0.0.1 keyed (HEAD `e62250b` + parent-deps list optimization, babel-plugin-tachys v1.1)
- Inferno: v8.2.2 keyed

Numbers are **median** durations (ms) as produced by the official harness: total = click-to-paint, script = JS CPU time, paint = layout/style/paint.

| Benchmark              | Inferno total | Tachys total | T/I total | Inferno script | Tachys script | T/I script |
|------------------------|---------------|--------------|-----------|----------------|---------------|------------|
| 01_run1k               |        37.40  |       35.60  |     0.95x |          4.90  |         2.90  |     0.59x |
| 02_replace1k           |        41.60  |       40.50  |     0.97x |          7.80  |         6.50  |     0.83x |
| 03_update10th1k_x16    |        23.70  |       26.30  |     1.11x |          2.10  |         2.00  |     0.95x |
| 04_select1k            |         8.70  |        7.10  |     0.82x |          1.70  |         1.30  |     0.77x |
| 05_swap1k              |        24.30  |       26.30  |     1.08x |          1.50  |         2.30  |     1.53x |
| 06_remove-one-1k       |        18.20  |       18.80  |     1.03x |          0.50  |         0.60  |     1.20x |
| 07_create10k           |       390.80  |      387.40  |     0.99x |         53.00  |        35.20  |     0.66x |
| 08_create1k-after1k_x2 |        45.60  |       44.60  |     0.98x |          5.80  |         2.90  |     0.50x |
| 09_clear1k_x8          |        17.00  |       20.70  |     1.22x |         13.30  |        16.80  |     1.26x |

**Geometric mean ratios (Tachys / Inferno):**
- Total: **1.011x**
- Script: **0.867x**

Tachys is at parity with Inferno on total (click-to-paint) and **wins decisively on script** (JS CPU). Every VDOM-dominated bench is ahead: `01_run1k` 0.59x, `02_replace1k` 0.83x, `04_select1k` 0.77x, `07_create10k` 0.66x, `08_create1k-after1k_x2` 0.50x. Remaining outliers are `05_swap1k` (script 1.53x, total 1.08x), `06_remove-one-1k` (script 1.20x on a 0.5ms denominator), and `09_clear1k_x8` (1.26x script, 1.22x total).

## Progress

Prior runs (all VDOM-style Row): 1.339x geomean total (baseline), 1.282x (`3047eee`), 1.382x (`0d1c5f6`), 1.307x (`7f2a3cc`), 1.251x (`e25c04a`), 1.216x (`007fb97`), 1.310x / script 1.303x (`cc04b7a`, direct `instance` field dropping the WeakMap).

Prior compiled-Row run (`a02d605`, hand-written `markCompiled`): 1.379x total / 1.062x script.
Prior babel-plugin-tachys v1.0 run (`cb70b06`): 1.031x total / 0.912x script.

This run (babel-plugin-tachys v1.1 with parent-deps-tracking list slots + compiled `RowList` wrapper): **1.011x total / 0.867x script**. Total geomean closed another 0.020x, script geomean closed 0.045x and widens Tachys' lead on JS CPU.

## What changed

- The framework entry `main.jsx` now wraps the row list in a compiled `RowList({ data, selectedId })` component emitting `{data.map(d => <Row/>)}`. That exercises the plugin's list-slot path at the 1000-row scale (previously a hand-written for-loop building VDOM skipped the compiled list helpers entirely).
- babel-plugin-tachys v1.1 grew parent-prop capture inside list slots: `<Row selected={d.id === selectedId}/>` compiles to an inline closure over `props.selectedId` alongside hoisted-helper lists that capture nothing.
- `_mountList`/`_patchList` now take an optional `parentDeps` array. Each `ListInstance` caches its source `item`; when parent deps are unchanged and item identity matches, the patch path skips `makeProps` allocation, `_compare`, and the child patch call entirely. On swap this skips ~996 of 998 middle items.
- Pure-clear path in `_patchList` now uses `Range.deleteContents()` instead of N `removeChild` calls (shaves a small amount off 09_clear1k).

## Notes

- `04_select1k` is now a **win** (0.77x script, 0.82x total) because the parent-deps fast-path lets `RowList.patch` skip 998 of 1000 rows when only `selectedId` flips.
- `05_swap1k` is the remaining script outlier (1.53x). Prefix/suffix trim leaves 998 middle items to walk, even though only 2 actually move. LIS + identity fast-path skip the per-item `makeProps`/`_compare` calls but we still pay Map build + Map lookup + LIS walk for the 998 untouched keys. Inferno's keyed-diff is lighter here.
- `09_clear1k_x8` still regresses (1.26x total, 1.22x script). Range-based clear helped on its own but the parent App's full re-render through VDOM still dominates.
- `07_create10k` total is at parity (0.99x) because paint dominates at 10k rows. The script share is now 0.66x of Inferno's.
- Absolute times vary run-to-run due to host state; compare ratios across runs and A/B on the same session when a change's effect is near the noise floor.
- Next milestones: tighten the 05_swap1k middle walk (skip Map build when every middle key already lives in `prev.byKey`); investigate whether the parent App can reuse its VDOM tree on clear instead of rebuilding.

## Reproducing

```
# In js-framework-benchmark repo (sibling dir):
cd server && ./node_modules/.bin/tsx index.ts &
cd webdriver-ts
node dist/benchmarkRunner.js --headless \
  --framework keyed/tachys keyed/inferno
```
