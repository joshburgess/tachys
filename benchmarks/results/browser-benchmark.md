# Tachys vs Inferno Browser Benchmark

> **WARNING: this harness produces misleading numbers. Do not cite these results.**
>
> The Inferno setup here is handicapped (no `$HasKeyedChildren` hint, no `onComponentShouldUpdate` memoization hook) and the measurement surface is a raw `patch()` loop, not click-to-paint. For authoritative numbers use the official [Krausest](https://github.com/krausest/js-framework-benchmark) harness — see [`krausest-official.md`](./krausest-official.md).

Date: 2026-04-19T00:50:05.716Z
User Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/147.0.7727.15 Safari/537.36

## Comparison

Three-way comparison: Tachys with raw `h()`, Tachys with `babel-plugin-tachys` output (compiled Row + compiled keyed list), and Inferno.

| Operation | h() | compiled | inferno | c/h() | c/inf | h()/inf |
|---|---|---|---|---|---|---|
| create 1,000 rows | 2.00ms | 1.50ms | 2.00ms | 0.75x | 0.75x | 1.00x |
| create 10,000 rows | 22.00ms | 15.20ms | 20.40ms | 0.69x | 0.75x | 1.08x |
| replace all 1,000 rows | 0.30ms | 0.10ms | 0.50ms | 0.33x | 0.20x | 0.60x |
| update every 10th row (of 1,000) | 0.30ms | 0.10ms | 0.50ms | 0.33x | 0.20x | 0.60x |
| swap rows (2nd and 999th) | 0.30ms | 0.70ms | 0.50ms | 2.33x | 1.40x | 0.60x |
| remove row (middle of 1,000) | 0.30ms | 0.10ms | 0.50ms | 0.33x | 0.20x | 0.60x |
| select row (highlight one) | 0.30ms | 0.10ms | 2.20ms | 0.33x | 0.05x | 0.14x |
| append 1,000 rows to 1,000 | 2.00ms | 1.60ms | 2.40ms | 0.80x | 0.67x | 0.83x |

- `c/h()` < 1.0 = compiled faster than raw `h()`
- `c/inf` < 1.0 = compiled faster than Inferno
- `h()/inf` < 1.0 = raw `h()` faster than Inferno

## Tachys Detail (raw h())

| Operation | Median (ms) | Mean (ms) | Min (ms) | Max (ms) |
|---|---|---|---|---|
| create 1,000 rows | 2.00 | 2.15 | 1.80 | 5.30 |
| create 10,000 rows | 22.00 | 22.01 | 19.00 | 29.90 |
| replace all 1,000 rows | 0.30 | 0.49 | 0.20 | 4.90 |
| update every 10th row (of 1,000) | 0.30 | 0.37 | 0.10 | 4.00 |
| swap rows (2nd and 999th) | 0.30 | 0.25 | 0.10 | 0.40 |
| remove row (middle of 1,000) | 0.30 | 0.27 | 0.20 | 0.60 |
| select row (highlight one) | 0.30 | 0.39 | 0.20 | 3.30 |
| append 1,000 rows to 1,000 | 2.00 | 2.25 | 1.80 | 4.90 |

## Tachys Detail (compiled Row + list)

| Operation | Median (ms) | Mean (ms) | Min (ms) | Max (ms) |
|---|---|---|---|---|
| create 1,000 rows | 1.50 | 1.63 | 1.20 | 6.50 |
| create 10,000 rows | 15.20 | 16.19 | 14.70 | 23.30 |
| replace all 1,000 rows | 0.10 | 0.21 | 0.00 | 4.20 |
| update every 10th row (of 1,000) | 0.10 | 0.09 | 0.00 | 0.30 |
| swap rows (2nd and 999th) | 0.70 | 0.70 | 0.60 | 0.80 |
| remove row (middle of 1,000) | 0.10 | 0.27 | 0.00 | 8.70 |
| select row (highlight one) | 0.10 | 0.08 | 0.00 | 0.20 |
| append 1,000 rows to 1,000 | 1.60 | 1.84 | 1.30 | 9.60 |

## Inferno Detail

| Operation | Median (ms) | Mean (ms) | Min (ms) | Max (ms) |
|---|---|---|---|---|
| create 1,000 rows | 2.00 | 2.48 | 1.80 | 14.20 |
| create 10,000 rows | 20.40 | 21.69 | 20.00 | 26.60 |
| replace all 1,000 rows | 0.50 | 0.71 | 0.40 | 5.10 |
| update every 10th row (of 1,000) | 0.50 | 0.52 | 0.40 | 2.80 |
| swap rows (2nd and 999th) | 0.50 | 0.54 | 0.40 | 2.60 |
| remove row (middle of 1,000) | 0.50 | 0.50 | 0.30 | 2.40 |
| select row (highlight one) | 2.20 | 2.32 | 2.00 | 5.90 |
| append 1,000 rows to 1,000 | 2.40 | 2.69 | 2.20 | 6.30 |
