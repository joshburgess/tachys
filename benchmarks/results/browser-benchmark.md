# Tachys vs Inferno Browser Benchmark

> **WARNING: this harness produces misleading numbers. Do not cite these results.**
>
> The Inferno setup here is handicapped (no `$HasKeyedChildren` hint, no `onComponentShouldUpdate` memoization hook) and the measurement surface is a raw `patch()` loop, not click-to-paint. For authoritative numbers use the official [Krausest](https://github.com/krausest/js-framework-benchmark) harness — see [`krausest-official.md`](./krausest-official.md).

Date: 2026-04-18T11:46:24.226Z
User Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/147.0.7727.15 Safari/537.36

## Comparison

| Operation | Tachys Median | Inferno Median | Ratio | Tachys Mean | Inferno Mean |
|---|---|---|---|---|---|
| create 1,000 rows | 2.00ms | 2.20ms | 0.91x | 2.45ms | 2.47ms |
| create 10,000 rows | 22.10ms | 21.90ms | 1.01x | 22.69ms | 23.36ms |
| replace all 1,000 rows | 0.40ms | 0.60ms | 0.67x | 0.51ms | 0.72ms |
| update every 10th row (of 1,000) | 0.30ms | 0.50ms | 0.60x | 0.38ms | 0.59ms |
| swap rows (2nd and 999th) | 0.40ms | 0.50ms | 0.80x | 0.50ms | 0.64ms |
| remove row (middle of 1,000) | 0.30ms | 0.50ms | 0.60x | 0.36ms | 0.55ms |
| select row (highlight one) | 0.30ms | 2.30ms | 0.13x | 0.40ms | 2.49ms |
| append 1,000 rows to 1,000 | 2.10ms | 2.60ms | 0.81x | 2.31ms | 2.76ms |

Ratio < 1.0 = Tachys faster, > 1.0 = Inferno faster

## Tachys Detail

| Operation | Median (ms) | Mean (ms) | Min (ms) | Max (ms) |
|---|---|---|---|---|
| create 1,000 rows | 2.00 | 2.45 | 1.80 | 9.50 |
| create 10,000 rows | 22.10 | 22.69 | 19.90 | 32.40 |
| replace all 1,000 rows | 0.40 | 0.51 | 0.20 | 4.30 |
| update every 10th row (of 1,000) | 0.30 | 0.38 | 0.20 | 2.80 |
| swap rows (2nd and 999th) | 0.40 | 0.50 | 0.20 | 2.70 |
| remove row (middle of 1,000) | 0.30 | 0.36 | 0.20 | 3.00 |
| select row (highlight one) | 0.30 | 0.40 | 0.20 | 3.10 |
| append 1,000 rows to 1,000 | 2.10 | 2.31 | 1.90 | 5.80 |

## Inferno Detail

| Operation | Median (ms) | Mean (ms) | Min (ms) | Max (ms) |
|---|---|---|---|---|
| create 1,000 rows | 2.20 | 2.47 | 1.90 | 6.00 |
| create 10,000 rows | 21.90 | 23.36 | 20.40 | 28.00 |
| replace all 1,000 rows | 0.60 | 0.72 | 0.40 | 2.90 |
| update every 10th row (of 1,000) | 0.50 | 0.59 | 0.40 | 2.80 |
| swap rows (2nd and 999th) | 0.50 | 0.64 | 0.40 | 4.00 |
| remove row (middle of 1,000) | 0.50 | 0.55 | 0.40 | 2.90 |
| select row (highlight one) | 2.30 | 2.49 | 2.10 | 6.00 |
| append 1,000 rows to 1,000 | 2.60 | 2.76 | 2.20 | 5.70 |
