# Phasm vs Inferno Browser Benchmark

Date: 2026-04-17T00:55:28.644Z
User Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/147.0.7727.15 Safari/537.36

## Comparison

| Operation | Phasm Median | Inferno Median | Ratio | Phasm Mean | Inferno Mean |
|---|---|---|---|---|---|
| create 1,000 rows | 2.00ms | 2.10ms | 0.95x | 2.58ms | 2.22ms |
| create 10,000 rows | 21.70ms | 23.40ms | 0.93x | 22.25ms | 23.63ms |
| replace all 1,000 rows | 0.30ms | 0.60ms | 0.50x | 0.49ms | 0.69ms |
| update every 10th row (of 1,000) | 0.30ms | 0.50ms | 0.60x | 0.40ms | 0.56ms |
| swap rows (2nd and 999th) | 0.30ms | 0.50ms | 0.60x | 0.37ms | 0.66ms |
| remove row (middle of 1,000) | 0.30ms | 0.50ms | 0.60x | 0.33ms | 0.58ms |
| select row (highlight one) | 0.40ms | 2.20ms | 0.18x | 0.42ms | 2.26ms |
| append 1,000 rows to 1,000 | 2.10ms | 2.50ms | 0.84x | 2.29ms | 2.66ms |

Ratio < 1.0 = Phasm faster, > 1.0 = Inferno faster

## Phasm Detail

| Operation | Median (ms) | Mean (ms) | Min (ms) | Max (ms) |
|---|---|---|---|---|
| create 1,000 rows | 2.00 | 2.58 | 1.70 | 18.80 |
| create 10,000 rows | 21.70 | 22.25 | 19.50 | 28.90 |
| replace all 1,000 rows | 0.30 | 0.49 | 0.20 | 3.90 |
| update every 10th row (of 1,000) | 0.30 | 0.40 | 0.20 | 2.50 |
| swap rows (2nd and 999th) | 0.30 | 0.37 | 0.30 | 2.00 |
| remove row (middle of 1,000) | 0.30 | 0.33 | 0.10 | 2.30 |
| select row (highlight one) | 0.40 | 0.42 | 0.30 | 2.80 |
| append 1,000 rows to 1,000 | 2.10 | 2.29 | 1.90 | 4.50 |

## Inferno Detail

| Operation | Median (ms) | Mean (ms) | Min (ms) | Max (ms) |
|---|---|---|---|---|
| create 1,000 rows | 2.10 | 2.22 | 1.90 | 5.30 |
| create 10,000 rows | 23.40 | 23.63 | 19.70 | 31.90 |
| replace all 1,000 rows | 0.60 | 0.69 | 0.40 | 3.10 |
| update every 10th row (of 1,000) | 0.50 | 0.56 | 0.40 | 2.40 |
| swap rows (2nd and 999th) | 0.50 | 0.66 | 0.40 | 4.60 |
| remove row (middle of 1,000) | 0.50 | 0.58 | 0.40 | 3.10 |
| select row (highlight one) | 2.20 | 2.26 | 2.00 | 3.50 |
| append 1,000 rows to 1,000 | 2.50 | 2.66 | 2.30 | 5.80 |
