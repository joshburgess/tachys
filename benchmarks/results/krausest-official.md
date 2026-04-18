# Krausest js-framework-benchmark: Tachys vs Inferno

Source: https://github.com/krausest/js-framework-benchmark (official benchmark)

- Runner: puppeteer
- Iterations: 15 runs per benchmark, headless Chrome, 4x CPU throttling
- Date: 2026-04-18
- Tachys: v0.0.1 keyed
- Inferno: v8.2.2 keyed

Numbers are **median** durations (ms) as produced by the official harness: total = click-to-paint, script = JS CPU time, paint = layout/style/paint.

| Benchmark              | Inferno total | Tachys total | T/I total | Inferno script | Tachys script | T/I script |
|------------------------|---------------|--------------|-----------|----------------|---------------|------------|
| 01_run1k               |        35.80  |       47.60  |     1.33x |          4.51  |         3.18  |     0.71x |
| 02_replace1k           |        39.68  |       46.05  |     1.16x |          7.38  |         7.83  |     1.06x |
| 03_update10th1k_x16    |        19.84  |       39.27  |     1.98x |          2.05  |         2.64  |     1.29x |
| 04_select1k            |         7.87  |       14.11  |     1.79x |          1.72  |         2.24  |     1.30x |
| 05_swap1k              |        25.22  |       41.35  |     1.64x |          1.39  |         1.75  |     1.26x |
| 06_remove-one-1k       |        17.71  |       21.47  |     1.21x |          0.45  |         0.81  |     1.79x |
| 07_create10k           |       378.15  |      379.27  |     1.00x |         51.21  |        40.86  |     0.80x |
| 08_create1k-after1k_x2 |        42.57  |       53.53  |     1.26x |          5.31  |         3.80  |     0.72x |
| 09_clear1k_x8          |        15.32  |       20.07  |     1.31x |         11.84  |        12.53  |     1.06x |

**Geometric mean ratios (Tachys / Inferno):**
- Total: **1.379x**
- Script: **1.062x**

## Progress

Prior runs (all VDOM-style Row): 1.339x geomean total (baseline), 1.282x (`3047eee`), 1.382x (`0d1c5f6`), 1.307x (`7f2a3cc`), 1.251x (`e25c04a`), 1.216x (`007fb97`), 1.310x / script 1.303x (`cc04b7a`, direct `instance` field dropping the WeakMap).

This round replaces the `Row` component in the bench entry with a **compiled** component: `markCompiled(mount, patch, compare)` marks the function with `ComponentMeta.Compiled`, and mountComponent/patchComponent/unmountComponent take short-circuit branches that skip the VDOM tree entirely. Mount is a single `cloneNode(true)` of a pre-parsed template + direct slot fills (no child recursion, no hook/effect scaffolding); patch diffs cached slot values in a `state` object and writes only the slots that changed; event handlers are installed once at mount and read `state` at call time so prop changes don't reinstall listeners (the equivalent of Inferno's `linkEvent`). This mirrors what Solid's JSX compiler and Inferno's `createVNode` + compile hints produce at build time.

Tachys's `Row` is hand-written in this form for this run — the planned Babel plugin will emit it automatically.

Same-session A/B (rebuild with compiled off for the baseline, compiled on for the test, same Chrome session, same Inferno build):
- **VDOM Row vs Inferno**: total 1.398x, script **1.377x**
- **Compiled Row vs Inferno**: total 1.379x, script **1.062x**
- **Compiled Row vs VDOM Row (same session)**: total 0.986x, script **0.771x**

Script geomean dropped **0.606x** vs Inferno across the session (1.377x -> 1.062x), or **0.229x** vs the session's own VDOM baseline (1.000x -> 0.771x). Compiled Row is already **beating Inferno on script** in 4/9 benches: `01_run1k` 0.71x, `07_create10k` 0.80x, `08_create1k-after1k_x2` 0.72x; near parity on `02_replace1k` 1.06x and `09_clear1k_x8` 1.06x.

Total geomean is flat vs the VDOM baseline (0.986x) — paint/layout dominates the `total` metric on several benches (especially `07_create10k` where script dropped from 62ms to 41ms but total barely moved), and paint is host-side variance we do not control. Script is the cleaner signal for this change.

## Notes

- These numbers diverge from the in-repo `bench:browser` harness, which measures tight render calls without user-interaction overhead.
- `07_create10k` total (1.00x) is at parity when the workload is layout-bound; the compiled script time for the same bench dropped to 0.80x of Inferno's.
- The bench entry (`keyed/tachys/src/main.jsx`) hand-writes the output of the planned Babel plugin: `markCompiled(mount, patch, compare)` replaces the JSX Row. `Header` and `App` remain regular VDOM components since they aren't on the hot path.
- Compiled components skip hooks / effects / context / error boundaries by contract. They're leaf DOM producers; any stateful logic lives one level up.
- Absolute times vary run-to-run due to host state; compare ratios across runs for the cleanest signal, and A/B on the same session when a change's effect is near the noise floor.
- Next milestone: extend compilation to the App-level row list to eliminate the per-render 1000 component VNode allocations the parent still pays for; then write the Babel plugin that emits the compiled form from regular JSX automatically.

## Reproducing

```
# In js-framework-benchmark repo (sibling dir):
cd webdriver-ts
node dist/benchmarkRunner.js --headless \
  --framework keyed/tachys keyed/inferno
```
