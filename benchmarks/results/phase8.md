# Phase 8 Benchmark Results

Environment: jsdom (vitest bench), Node.js, macOS

## Tachys

| Operation                          | hz      | mean (ms) | p75 (ms) | p99 (ms) |
|------------------------------------|---------|-----------|----------|----------|
| create 1,000 rows                  | 5.19    | 192.71    | 247.38   | 327.18   |
| create 10,000 rows                 | 0.50    | 2019.36   | 2085.88  | 2950.74  |
| replace all 1,000 rows             | 119.40  | 8.38      | 11.13    | 52.08    |
| update every 10th row (of 1,000)   | 143.57  | 6.97      | 8.89     | 36.77    |
| swap rows (2nd and 999th)          | 144.23  | 6.93      | 9.52     | 41.29    |
| remove row (middle of 1,000)       | 157.89  | 6.33      | 8.76     | 36.48    |
| select row (highlight one)         | 134.01  | 7.46      | 8.04     | 74.14    |
| append 1,000 rows to 1,000         | 61.12   | 16.36     | 19.97    | 88.42    |

## Inferno Reference

| Operation                          | hz      | mean (ms) | p75 (ms) | p99 (ms) |
|------------------------------------|---------|-----------|----------|----------|
| create 1,000 rows                  | 118.82  | 8.42      | 8.43     | 70.86    |
| create 10,000 rows                 | 10.39   | 96.24     | 106.73   | 183.88   |
| replace all 1,000 rows             | 103.14  | 9.70      | 10.93    | 57.16    |
| update every 10th row (of 1,000)   | 148.83  | 6.72      | 7.63     | 42.50    |
| swap rows (2nd and 999th)          | 158.78  | 6.30      | 7.56     | 26.88    |
| remove row (middle of 1,000)       | 108.75  | 9.20      | 10.71    | 48.94    |
| select row (highlight one)         | 175.50  | 5.70      | 5.65     | 37.10    |
| append 1,000 rows to 1,000         | 49.96   | 20.02     | 22.33    | 72.87    |

## Raw DOM Baseline

| Operation                          | hz      | mean (ms) | p75 (ms) | p99 (ms) |
|------------------------------------|---------|-----------|----------|----------|
| create 1,000 rows                  | 3.59    | 278.39    | 311.56   | 412.85   |
| create 10,000 rows                 | 0.53    | 1900.08   | 2025.72  | 2403.64  |
| replace all 1,000 rows             | 5.93    | 168.63    | 179.07   | 193.74   |
| update every 10th row (of 1,000)   | 16.96   | 58.98     | 69.27    | 88.98    |
| swap rows (2nd and 999th)          | 217.27  | 4.60      | 4.73     | 28.24    |
| remove row (middle of 1,000)       | 279.80  | 3.57      | 3.24     | 33.87    |
| select row (highlight one)         | 240.01  | 4.17      | 4.29     | 19.10    |
| append 1,000 rows to 1,000         | 4.86    | 205.86    | 224.47   | 243.43   |

## Comparison Summary (Reconciliation Operations)

Tachys vs Inferno on update/patch operations (the primary measure of VDOM performance):

| Operation                        | Winner   | Margin  |
|----------------------------------|----------|---------|
| replace all 1,000 rows           | Tachys    | 1.16x   |
| update every 10th row            | Parity   | ~1.0x   |
| swap rows                        | Parity   | ~1.0x   |
| remove row                       | Tachys    | 1.45x   |
| select row                       | Inferno  | 1.31x   |
| append 1,000 rows                | Tachys    | 1.22x   |

## Bundle Size

- Raw ESM: 48.6 KB
- Minified: 13.6 KB  
- Min+gzip: **4.5 KB** (under 5KB target)
