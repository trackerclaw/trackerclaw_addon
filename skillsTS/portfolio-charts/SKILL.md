---
name: portfolio-charts-ts
description: Generate portfolio allocation, performance, and APY charts with the TrackerClaw TypeScript runtime, including Telegram-ready delivery manifests for OpenClaw. Use when OpenClaw needs current or historical charts that must be sent to Telegram.
---

# Portfolio Charts TS

Use this skill to generate portfolio allocation, performance, and APY charts from saved snapshot data.

## Run

```bash
cd {baseDir}/../.. && npx tsx scriptsTS/chart_delivery.ts performance
```

Other chart types:

- `npx tsx scriptsTS/chart_delivery.ts portfolio`
- `npx tsx scriptsTS/chart_delivery.ts apy`
- `npx tsx scriptsTS/chart_delivery.ts apy --format svg`

## Historical Charts

Save snapshots first:

```bash
cd {baseDir}/../.. && npx tsx scriptsTS/openclaw_portfolio.ts snapshot
```

Repeat snapshot creation over time so `performance` has historical data. Require at least 2 snapshots from different times before generating a performance chart.

## Output

- Charts are written to `data/charts/`
- `chart_delivery.ts` writes SVG plus PNG by default
- `chart_delivery.ts` prints a JSON manifest with Telegram upload instructions

## OpenClaw Telegram Behavior

Prefer `chart_delivery.ts` over `chart_generator.ts` for OpenClaw integrations.

OpenClaw should:

1. Run `npx tsx scriptsTS/chart_delivery.ts <portfolio|performance|apy>`.
2. Parse stdout JSON.
3. Read the `telegram` block.
4. Upload `preferred_file_path` with `sendPhoto` when requested.
5. Fallback to `sendDocument` with `fallback_file_path` if photo upload fails.

Use `chart_generator.ts` only for local SVG generation when no Telegram delivery is needed.
