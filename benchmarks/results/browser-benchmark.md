# Tachys vs Inferno Browser Benchmark

> **WARNING: this harness produces misleading numbers. Do not cite these results.**
>
> The Inferno setup here is handicapped (no `$HasKeyedChildren` hint, no `onComponentShouldUpdate` memoization hook) and the measurement surface is a raw `patch()` loop, not click-to-paint. For authoritative numbers use the official [Krausest](https://github.com/krausest/js-framework-benchmark) harness — see [`krausest-official.md`](./krausest-official.md).

Date: 2026-04-18T03:37:32.005Z
User Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/147.0.7727.15 Safari/537.36

## Comparison

| Operation | Tachys Median | Inferno Median | Ratio | Tachys Mean | Inferno Mean |
|---|---|---|---|---|---|
| create 1,000 rows | 2.00ms | 2.10ms | 0.95x | 2.45ms | 2.39ms |
| create 10,000 rows | 22.20ms | 22.50ms | 0.99x | 21.75ms | 23.67ms |
| replace all 1,000 rows | 0.40ms | 0.60ms | 0.67x | 0.49ms | 0.67ms |
| update every 10th row (of 1,000) | 0.30ms | 0.50ms | 0.60x | 0.36ms | 0.54ms |
| swap rows (2nd and 999th) | 0.40ms | 0.50ms | 0.80x | 0.51ms | 0.57ms |
| remove row (middle of 1,000) | 0.30ms | 0.50ms | 0.60x | 0.41ms | 0.57ms |
| select row (highlight one) | 0.30ms | 2.30ms | 0.13x | 0.39ms | 2.44ms |
| append 1,000 rows to 1,000 | 2.10ms | 2.50ms | 0.84x | 2.29ms | 2.69ms |

Ratio < 1.0 = Tachys faster, > 1.0 = Inferno faster

## Tachys Detail

| Operation | Median (ms) | Mean (ms) | Min (ms) | Max (ms) |
|---|---|---|---|---|
| create 1,000 rows | 2.00 | 2.45 | 1.80 | 11.80 |
| create 10,000 rows | 22.20 | 21.75 | 19.60 | 26.60 |
| replace all 1,000 rows | 0.40 | 0.49 | 0.20 | 3.70 |
| update every 10th row (of 1,000) | 0.30 | 0.36 | 0.20 | 1.50 |
| swap rows (2nd and 999th) | 0.40 | 0.51 | 0.20 | 2.70 |
| remove row (middle of 1,000) | 0.30 | 0.41 | 0.20 | 3.30 |
| select row (highlight one) | 0.30 | 0.39 | 0.20 | 3.00 |
| append 1,000 rows to 1,000 | 2.10 | 2.29 | 1.90 | 6.50 |

## Inferno Detail

| Operation | Median (ms) | Mean (ms) | Min (ms) | Max (ms) |
|---|---|---|---|---|
| create 1,000 rows | 2.10 | 2.39 | 1.90 | 6.10 |
| create 10,000 rows | 22.50 | 23.67 | 21.10 | 29.70 |
| replace all 1,000 rows | 0.60 | 0.67 | 0.50 | 2.80 |
| update every 10th row (of 1,000) | 0.50 | 0.54 | 0.40 | 2.20 |
| swap rows (2nd and 999th) | 0.50 | 0.57 | 0.40 | 2.80 |
| remove row (middle of 1,000) | 0.50 | 0.57 | 0.40 | 2.90 |
| select row (highlight one) | 2.30 | 2.44 | 2.00 | 5.70 |
| append 1,000 rows to 1,000 | 2.50 | 2.69 | 2.30 | 5.40 |
