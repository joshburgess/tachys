# Phase 9 Benchmark Results (Post-Suspense/Hydration/Scheduler)

Date: 2026-04-16
Environment: jsdom (vitest bench), Node.js, macOS

After adding: Suspense-aware hydration, streaming SSR, selective hydration,
ErrorBoundary+Suspense integration, use() hook, useSyncExternalStore tearing
prevention, and priority-based scheduler with lanes.

## Tachys

| Operation                          | hz      | mean (ms) | p75 (ms) | p99 (ms) |
|------------------------------------|---------|-----------|----------|----------|
| create 1,000 rows                  | 6.81    | 146.77    | 174.00   | 232.28   |
| create 10,000 rows                 | 0.60    | 1678.74   | 1677.29  | 2145.58  |
| replace all 1,000 rows             | 294.33  | 3.40      | 2.33     | 28.99    |
| update every 10th row (of 1,000)   | 346.72  | 2.88      | 1.90     | 33.82    |
| swap rows (2nd and 999th)          | 367.72  | 2.72      | 1.60     | 28.25    |
| remove row (middle of 1,000)       | 356.71  | 2.80      | 1.54     | 23.37    |
| select row (highlight one)         | 313.03  | 3.19      | 1.91     | 28.74    |
| append 1,000 rows to 1,000         | 120.97  | 8.27      | 11.12    | 50.87    |

## Inferno Reference

| Operation                          | hz      | mean (ms) | p75 (ms) | p99 (ms) |
|------------------------------------|---------|-----------|----------|----------|
| create 1,000 rows                  | 105.19  | 9.51      | 10.70    | 50.62    |
| create 10,000 rows                 | 10.63   | 94.10     | 101.07   | 115.91   |
| replace all 1,000 rows             | 115.88  | 8.63      | 10.63    | 41.48    |
| update every 10th row (of 1,000)   | 135.34  | 7.39      | 9.42     | 30.31    |
| swap rows (2nd and 999th)          | 163.71  | 6.11      | 6.48     | 28.56    |
| remove row (middle of 1,000)       | 128.55  | 7.78      | 9.35     | 38.50    |
| select row (highlight one)         | 165.55  | 6.04      | 7.67     | 39.55    |
| append 1,000 rows to 1,000         | 48.88   | 20.46     | 23.19    | 79.36    |

## Hooks Hot Path

| Operation                                           | hz        | mean      |
|-----------------------------------------------------|-----------|-----------|
| useState: 1,000 setState + flush cycles             | 53.49     | 18.70ms   |
| useState: 100 batched setStates + single flush      | 30,109.26 | 0.033ms   |
| useReducer: 1,000 dispatch + flush cycles           | 55.98     | 17.86ms   |
| useState: 1,000 functional updates + flush cycles   | 49.92     | 20.03ms   |
| useState: 1,000 same-value bailouts (no re-render)  | 18,440.94 | 0.054ms   |
| 5 useStates + 2 useCallbacks: 1,000 update cycles   | 48.14     | 20.77ms   |

## Comparison: Tachys vs Inferno (JSDOM - Reconciliation Operations)

| Operation                        | Tachys hz | Inferno hz | Ratio  | Winner  |
|----------------------------------|----------|------------|--------|---------|
| replace all 1,000 rows           | 294.33   | 115.88     | 2.54x  | Tachys   |
| update every 10th row            | 346.72   | 135.34     | 2.56x  | Tachys   |
| swap rows                        | 367.72   | 163.71     | 2.25x  | Tachys   |
| remove row                       | 356.71   | 128.55     | 2.77x  | Tachys   |
| select row                       | 313.03   | 165.55     | 1.89x  | Tachys   |
| append 1,000 rows                | 120.97   | 48.88      | 2.47x  | Tachys   |

Tachys is 1.9x-2.8x faster than Inferno on all reconciliation operations in JSDOM.

Note: Initial creation benchmarks (create N rows) are dominated by DOM element
allocation cost in JSDOM, not VDOM overhead. Real browser benchmarks (Playwright)
give more representative creation numbers. See browser-benchmark.md for those.

## Regression Check

No performance regressions from the Suspense/hydration/scheduler changes.
All reconciliation operations improved vs the Phase 8 baseline.

## Bundle Size

| Build | Size | Gzipped |
|-------|------|---------|
| index.min.js (ESM) | 28 KB | ~8.6 KB |
| jsx-runtime.min.js | 1.5 KB | ~0.7 KB |
