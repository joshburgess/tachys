# Tachys vs Inferno Browser Benchmark

> **WARNING: this harness produces misleading numbers. Do not cite these results.**
>
> The Inferno setup here is handicapped (no `$HasKeyedChildren` hint, no `onComponentShouldUpdate` memoization hook) and the measurement surface is a raw `patch()` loop, not click-to-paint. For authoritative numbers use the official [Krausest](https://github.com/krausest/js-framework-benchmark) harness — see [`krausest-official.md`](./krausest-official.md).

Date: 2026-04-19T00:38:08.718Z
User Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/147.0.7727.15 Safari/537.36

## Comparison

Three-way comparison: Tachys with raw `h()`, Tachys with plugin-compiled Row, and Inferno.

| Operation | h() | compiled | inferno | c/h() | c/inf | h()/inf |
|---|---|---|---|---|---|---|
| create 1,000 rows | 2.00ms | 1.60ms | 2.10ms | 0.80x | 0.76x | 0.95x |
| create 10,000 rows | 21.80ms | 15.70ms | 24.60ms | 0.72x | 0.64x | 0.89x |
| replace all 1,000 rows | 0.40ms | 0.10ms | 0.50ms | 0.25x | 0.20x | 0.80x |
| update every 10th row (of 1,000) | 0.30ms | 0.10ms | 0.50ms | 0.33x | 0.20x | 0.60x |
| swap rows (2nd and 999th) | 0.30ms | 0.10ms | 0.50ms | 0.33x | 0.20x | 0.60x |
| remove row (middle of 1,000) | 0.30ms | 0.10ms | 0.50ms | 0.33x | 0.20x | 0.60x |
| select row (highlight one) | 0.30ms | 0.10ms | 2.20ms | 0.33x | 0.05x | 0.14x |
| append 1,000 rows to 1,000 | 2.00ms | 1.60ms | 2.40ms | 0.80x | 0.67x | 0.83x |

- `c/h()` < 1.0 = compiled faster than raw `h()`
- `c/inf` < 1.0 = compiled faster than Inferno
- `h()/inf` < 1.0 = raw `h()` faster than Inferno

## Tachys Detail (raw h())

| Operation | Median (ms) | Mean (ms) | Min (ms) | Max (ms) |
|---|---|---|---|---|
| create 1,000 rows | 2.00 | 2.40 | 1.80 | 11.90 |
| create 10,000 rows | 21.80 | 22.05 | 19.60 | 29.30 |
| replace all 1,000 rows | 0.40 | 0.51 | 0.20 | 4.20 |
| update every 10th row (of 1,000) | 0.30 | 0.43 | 0.20 | 2.90 |
| swap rows (2nd and 999th) | 0.30 | 0.38 | 0.10 | 3.30 |
| remove row (middle of 1,000) | 0.30 | 0.39 | 0.20 | 3.20 |
| select row (highlight one) | 0.30 | 0.40 | 0.20 | 3.80 |
| append 1,000 rows to 1,000 | 2.00 | 2.22 | 1.90 | 4.70 |

## Tachys Detail (compiled Row)

| Operation | Median (ms) | Mean (ms) | Min (ms) | Max (ms) |
|---|---|---|---|---|
| create 1,000 rows | 1.60 | 1.65 | 1.40 | 5.40 |
| create 10,000 rows | 15.70 | 16.50 | 15.20 | 23.80 |
| replace all 1,000 rows | 0.10 | 0.22 | 0.00 | 3.80 |
| update every 10th row (of 1,000) | 0.10 | 0.16 | 0.00 | 3.60 |
| swap rows (2nd and 999th) | 0.10 | 0.21 | 0.00 | 3.30 |
| remove row (middle of 1,000) | 0.10 | 0.08 | 0.00 | 0.20 |
| select row (highlight one) | 0.10 | 0.09 | 0.00 | 0.30 |
| append 1,000 rows to 1,000 | 1.60 | 1.82 | 1.30 | 5.10 |

## Inferno Detail

| Operation | Median (ms) | Mean (ms) | Min (ms) | Max (ms) |
|---|---|---|---|---|
| create 1,000 rows | 2.10 | 2.21 | 1.90 | 5.50 |
| create 10,000 rows | 24.60 | 23.47 | 19.70 | 28.30 |
| replace all 1,000 rows | 0.50 | 0.72 | 0.50 | 3.80 |
| update every 10th row (of 1,000) | 0.50 | 0.52 | 0.40 | 2.60 |
| swap rows (2nd and 999th) | 0.50 | 0.55 | 0.40 | 2.70 |
| remove row (middle of 1,000) | 0.50 | 0.53 | 0.30 | 3.70 |
| select row (highlight one) | 2.20 | 2.30 | 2.00 | 5.50 |
| append 1,000 rows to 1,000 | 2.40 | 2.76 | 2.20 | 7.50 |
