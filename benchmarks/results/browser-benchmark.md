# Tachys vs Inferno Browser Benchmark

> **WARNING: this harness produces misleading numbers. Do not cite these results.**
>
> The Inferno setup here is handicapped (no `$HasKeyedChildren` hint, no `onComponentShouldUpdate` memoization hook) and the measurement surface is a raw `patch()` loop, not click-to-paint. For authoritative numbers use the official [Krausest](https://github.com/krausest/js-framework-benchmark) harness — see [`krausest-official.md`](./krausest-official.md).

Date: 2026-04-19T01:02:08.801Z
User Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/147.0.7727.15 Safari/537.36

## Comparison

Three-way comparison: Tachys with raw `h()`, Tachys with `babel-plugin-tachys` output (compiled Row + compiled keyed list), and Inferno.

| Operation | h() | compiled | inferno | c/h() | c/inf | h()/inf |
|---|---|---|---|---|---|---|
| create 1,000 rows | 2.00ms | 1.50ms | 2.00ms | 0.75x | 0.75x | 1.00x |
| create 10,000 rows | 22.50ms | 15.50ms | 21.50ms | 0.69x | 0.72x | 1.05x |
| replace all 1,000 rows | 0.40ms | 0.10ms | 0.60ms | 0.25x | 0.17x | 0.67x |
| update every 10th row (of 1,000) | 0.30ms | 0.10ms | 0.50ms | 0.33x | 0.20x | 0.60x |
| swap rows (2nd and 999th) | 0.30ms | 0.10ms | 0.50ms | 0.33x | 0.20x | 0.60x |
| remove row (middle of 1,000) | 0.20ms | 0.00ms | 0.50ms | 0.00x | 0.00x | 0.40x |
| select row (highlight one) | 0.30ms | 0.10ms | 2.20ms | 0.33x | 0.05x | 0.14x |
| append 1,000 rows to 1,000 | 2.10ms | 1.50ms | 2.50ms | 0.71x | 0.60x | 0.84x |

- `c/h()` < 1.0 = compiled faster than raw `h()`
- `c/inf` < 1.0 = compiled faster than Inferno
- `h()/inf` < 1.0 = raw `h()` faster than Inferno

## Tachys Detail (raw h())

| Operation | Median (ms) | Mean (ms) | Min (ms) | Max (ms) |
|---|---|---|---|---|
| create 1,000 rows | 2.00 | 2.19 | 1.70 | 4.30 |
| create 10,000 rows | 22.50 | 22.34 | 18.90 | 28.20 |
| replace all 1,000 rows | 0.40 | 0.43 | 0.20 | 2.60 |
| update every 10th row (of 1,000) | 0.30 | 0.27 | 0.10 | 0.40 |
| swap rows (2nd and 999th) | 0.30 | 0.44 | 0.20 | 4.50 |
| remove row (middle of 1,000) | 0.20 | 0.30 | 0.10 | 2.70 |
| select row (highlight one) | 0.30 | 0.47 | 0.20 | 2.60 |
| append 1,000 rows to 1,000 | 2.10 | 2.29 | 1.70 | 4.90 |

## Tachys Detail (compiled Row + list)

| Operation | Median (ms) | Mean (ms) | Min (ms) | Max (ms) |
|---|---|---|---|---|
| create 1,000 rows | 1.50 | 1.48 | 1.30 | 2.40 |
| create 10,000 rows | 15.50 | 16.83 | 14.20 | 24.40 |
| replace all 1,000 rows | 0.10 | 0.12 | 0.00 | 0.40 |
| update every 10th row (of 1,000) | 0.10 | 0.06 | 0.00 | 0.30 |
| swap rows (2nd and 999th) | 0.10 | 0.21 | 0.00 | 5.00 |
| remove row (middle of 1,000) | 0.00 | 0.03 | 0.00 | 0.10 |
| select row (highlight one) | 0.10 | 0.06 | 0.00 | 0.20 |
| append 1,000 rows to 1,000 | 1.50 | 1.53 | 1.30 | 2.20 |

## Inferno Detail

| Operation | Median (ms) | Mean (ms) | Min (ms) | Max (ms) |
|---|---|---|---|---|
| create 1,000 rows | 2.00 | 2.35 | 1.80 | 7.00 |
| create 10,000 rows | 21.50 | 22.75 | 20.10 | 30.90 |
| replace all 1,000 rows | 0.60 | 0.69 | 0.40 | 3.10 |
| update every 10th row (of 1,000) | 0.50 | 0.54 | 0.40 | 3.00 |
| swap rows (2nd and 999th) | 0.50 | 0.54 | 0.40 | 2.60 |
| remove row (middle of 1,000) | 0.50 | 0.53 | 0.40 | 4.50 |
| select row (highlight one) | 2.20 | 2.24 | 2.00 | 3.20 |
| append 1,000 rows to 1,000 | 2.50 | 2.66 | 2.20 | 5.30 |
