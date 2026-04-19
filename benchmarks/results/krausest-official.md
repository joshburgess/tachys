# Krausest js-framework-benchmark: Tachys vs Inferno

Source: https://github.com/krausest/js-framework-benchmark (official benchmark)

- Runner: puppeteer
- Iterations: 15 runs per benchmark (25 for `04_select1k`), headless Chrome, 4x CPU throttling
- Date: 2026-04-18
- Tachys: v0.0.1 keyed (HEAD `d227067` + same-position middle-walk fast-path)
- Inferno: v8.2.2 keyed

Numbers are **median** durations (ms) as produced by the official harness: total = click-to-paint, script = JS CPU time, paint = layout/style/paint.

| Benchmark              | Inferno total | Tachys total | T/I total | Inferno script | Tachys script | T/I script |
|------------------------|---------------|--------------|-----------|----------------|---------------|------------|
| 01_run1k               |        37.20  |       35.90  |     0.97x |          4.90  |         2.80  |     0.57x |
| 02_replace1k           |        41.70  |       41.00  |     0.98x |          7.70  |         6.70  |     0.87x |
| 03_update10th1k_x16    |        23.80  |       25.10  |     1.05x |          2.00  |         1.60  |     0.80x |
| 04_select1k            |         8.20  |        7.30  |     0.89x |          1.60  |         1.20  |     0.75x |
| 05_swap1k              |        26.30  |       26.90  |     1.02x |          1.40  |         1.70  |     1.21x |
| 06_remove-one-1k       |        19.40  |       19.80  |     1.02x |          0.50  |         0.60  |     1.20x |
| 07_create10k           |       395.50  |      388.30  |     0.98x |         53.60  |        34.40  |     0.64x |
| 08_create1k-after1k_x2 |        45.40  |       45.40  |     1.00x |          5.70  |         2.80  |     0.49x |
| 09_clear1k_x8          |        17.20  |       20.00  |     1.16x |         12.90  |        16.30  |     1.26x |

**Geometric mean ratios (Tachys / Inferno):**
- Total: **1.007x**
- Script: **0.823x**

Tachys is at parity with Inferno on total (click-to-paint) and **wins decisively on script** (JS CPU, ~18% faster geomean). Every VDOM-dominated bench is ahead: `01_run1k` 0.57x, `02_replace1k` 0.87x, `03_update10th1k_x16` 0.80x, `04_select1k` 0.75x, `07_create10k` 0.64x, `08_create1k-after1k_x2` 0.49x. Remaining outliers are `06_remove-one-1k` (script 1.20x on a 0.5ms denominator) and `09_clear1k_x8` (1.26x script, 1.16x total). `05_swap1k` went from 1.54x script regression to 1.21x with the same-position fast-path; total is now at parity (1.02x).

## Progress

Prior runs (all VDOM-style Row): 1.339x geomean total (baseline), 1.282x (`3047eee`), 1.382x (`0d1c5f6`), 1.307x (`7f2a3cc`), 1.251x (`e25c04a`), 1.216x (`007fb97`), 1.310x / script 1.303x (`cc04b7a`, direct `instance` field dropping the WeakMap).

Prior compiled-Row run (`a02d605`, hand-written `markCompiled`): 1.379x total / 1.062x script.
Prior babel-plugin-tachys v1.0 run (`cb70b06`): 1.031x total / 0.912x script.
Prior babel-plugin-tachys v1.1 run (`f1d109c`, parent-deps list): 1.011x total / 0.867x script.
Prior run (`d227067`, dead `byKey` Map removed): 1.011x total / 0.845x script.

This run (same-position fast-path in mixed-middle walk): **1.007x total / 0.823x script**. Script geomean closed another 0.022x. `05_swap1k` script closed 0.33x (the targeted win). `03_update10th1k_x16` script also tightened (0.90x → 0.80x) since update-every-10th is the prototypical "most positions identity-stable" pattern.

## What changed

- The framework entry `main.jsx` now wraps the row list in a compiled `RowList({ data, selectedId })` component emitting `{data.map(d => <Row/>)}`. That exercises the plugin's list-slot path at the 1000-row scale (previously a hand-written for-loop building VDOM skipped the compiled list helpers entirely).
- babel-plugin-tachys v1.1 grew parent-prop capture inside list slots: `<Row selected={d.id === selectedId}/>` compiles to an inline closure over `props.selectedId` alongside hoisted-helper lists that capture nothing.
- `_mountList`/`_patchList` now take an optional `parentDeps` array. Each `ListInstance` caches its source `item`; when parent deps are unchanged and item identity matches, the patch path skips `makeProps` allocation, `_compare`, and the child patch call entirely. On swap this skips ~996 of 998 middle items.
- Pure-clear path in `_patchList` now uses `Range.deleteContents()` instead of N `removeChild` calls (shaves a small amount off 09_clear1k).
- Dropped the `byKey: Map` field from `CompiledListState`. It was written but never read; removing it eliminates 1000 `Map.set` calls per mount and (nextLen - 1) per patch. Positions tracked solely via the `instances` array + `keyToPrevIdx` (built only for the mixed-middle path).
- Same-position fast-path in the mixed-middle walk. Phase A compares `prev[srcIdx].key` to `keyOf(items[srcIdx])` position-by-position; matches patch in place without touching any Map. Only the (usually small) set of mismatched keys gets deferred to phase B, which builds `keyToPrevIdx` solely from prev entries that phase A did not claim. On 1000-row swap this drops the Map from 998 entries to 2.

## Notes

- `04_select1k` is a **win** (0.75x script, 0.89x total) because the parent-deps fast-path lets `RowList.patch` skip 998 of 1000 rows when only `selectedId` flips.
- `05_swap1k` total at parity (1.02x); script still 1.21x because we pay the full LIS + backward walk over 998 middle slots even though phase A of the mixed middle walk now skips Map work for 996 of them. Closing the remaining gap likely requires a specialized "few-swap" fast-path that avoids LIS when mismatches are very sparse.
- `09_clear1k_x8` still regresses (1.16x total, 1.26x script). Range-based clear helped on its own but the parent App's full re-render through VDOM still dominates.
- `07_create10k` total is at parity (0.98x) because paint dominates at 10k rows. The script share is now 0.64x of Inferno's.
- Absolute times vary run-to-run due to host state; compare ratios across runs and A/B on the same session when a change's effect is near the noise floor.
- Next milestones: specialized few-mismatch path in the middle walk (skip LIS when mismatch count is 0 or 1); investigate whether the parent App can reuse its VDOM tree on clear instead of rebuilding; broaden plugin coverage (fragments, spread props).

## Reproducing

```
# In js-framework-benchmark repo (sibling dir):
cd server && ./node_modules/.bin/tsx index.ts &
cd webdriver-ts
node dist/benchmarkRunner.js --headless \
  --framework keyed/tachys keyed/inferno
```
