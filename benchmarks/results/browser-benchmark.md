# Phasm vs Inferno Browser Benchmark

Date: 2026-04-15T13:54:36.470Z
User Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/147.0.7727.15 Safari/537.36

## Comparison

| Operation | Phasm Median | Inferno Median | Ratio | Phasm Mean | Inferno Mean |
|---|---|---|---|---|---|
| create 1,000 rows | 2.10ms | 2.20ms | 0.95x | 2.68ms | 2.52ms |
| create 10,000 rows | 23.50ms | 22.00ms | 1.07x | 23.61ms | 23.41ms |
| replace all 1,000 rows | 0.40ms | 0.60ms | 0.67x | 0.49ms | 0.66ms |
| update every 10th row (of 1,000) | 0.30ms | 0.50ms | 0.60x | 0.36ms | 0.71ms |
| swap rows (2nd and 999th) | 0.40ms | 0.50ms | 0.80x | 0.43ms | 0.71ms |
| remove row (middle of 1,000) | 0.30ms | 0.50ms | 0.60x | 0.38ms | 0.56ms |
| select row (highlight one) | 0.30ms | 2.30ms | 0.13x | 0.36ms | 2.68ms |
| append 1,000 rows to 1,000 | 2.20ms | 2.60ms | 0.85x | 2.33ms | 2.86ms |

Ratio < 1.0 = Phasm faster, > 1.0 = Inferno faster

## Phasm Detail

| Operation | Median (ms) | Mean (ms) | Min (ms) | Max (ms) |
|---|---|---|---|---|
| create 1,000 rows | 2.10 | 2.68 | 1.80 | 12.40 |
| create 10,000 rows | 23.50 | 23.61 | 20.40 | 32.10 |
| replace all 1,000 rows | 0.40 | 0.49 | 0.20 | 4.80 |
| update every 10th row (of 1,000) | 0.30 | 0.36 | 0.20 | 3.20 |
| swap rows (2nd and 999th) | 0.40 | 0.43 | 0.20 | 2.70 |
| remove row (middle of 1,000) | 0.30 | 0.38 | 0.20 | 3.40 |
| select row (highlight one) | 0.30 | 0.36 | 0.30 | 1.20 |
| append 1,000 rows to 1,000 | 2.20 | 2.33 | 2.00 | 5.20 |

## Inferno Detail

| Operation | Median (ms) | Mean (ms) | Min (ms) | Max (ms) |
|---|---|---|---|---|
| create 1,000 rows | 2.20 | 2.52 | 2.00 | 11.90 |
| create 10,000 rows | 22.00 | 23.41 | 20.80 | 29.00 |
| replace all 1,000 rows | 0.60 | 0.66 | 0.50 | 3.50 |
| update every 10th row (of 1,000) | 0.50 | 0.71 | 0.40 | 5.30 |
| swap rows (2nd and 999th) | 0.50 | 0.71 | 0.40 | 3.70 |
| remove row (middle of 1,000) | 0.50 | 0.56 | 0.40 | 3.40 |
| select row (highlight one) | 2.30 | 2.68 | 2.00 | 6.70 |
| append 1,000 rows to 1,000 | 2.60 | 2.86 | 2.40 | 6.90 |
