---
name: portfolio-charts
description: Generate portfolio allocation, performance, and DeFi APY charts with the TrackerClaw TypeScript runtime, including Telegram-ready delivery manifests for OpenClaw. Use when OpenClaw needs current or historical charts that must be sent to Telegram.
---

# Portfolio Charts

Use this skill when the user wants a visual chart of portfolio allocation, performance history, or DeFi yields.

## Run

```bash
cd {baseDir}/../.. && npx tsx scriptsTS/chart_delivery.ts performance
```

Other chart types:

- `npx tsx scriptsTS/chart_delivery.ts portfolio`
- `npx tsx scriptsTS/chart_delivery.ts apy`
- `npx tsx scriptsTS/chart_delivery.ts apy --format svg`

## Prerequisites

- `portfolio`: requires at least one saved snapshot in `data/openclaw_snapshots/` or `data/snapshots/`
- `performance`: requires at least two valid saved snapshots
- `apy`: requires APY-bearing DeFi positions in the latest OpenClaw snapshot

## Output

- Charts are saved to `data/charts/`
- `chart_delivery.ts` writes SVG plus PNG by default
- `chart_delivery.ts` prints a JSON manifest with Telegram upload instructions

## OpenClaw Telegram Behavior

Prefer `chart_delivery.ts` over `chart_generator.ts` for OpenClaw integrations.

OpenClaw should:

1. Run `npx tsx scriptsTS/chart_delivery.ts <portfolio|performance|apy>`.
2. Parse stdout JSON.
3. Read `manifest.telegram.preferred_file_path`, `manifest.telegram.fallback_file_path`, and `manifest.telegram.caption`.
4. Reuse the existing `message.send` tool with `channel: "telegram"`, `message: caption`, and `path: preferred_file_path`.
5. Treat Telegram `message.send` with a non-empty `path` as a media send.
6. Retry with `fallback_file_path` if the first send fails.

Do not claim success solely because `message.send` returned `ok: true`. For this workflow, only report chart delivery success when the chart is visibly delivered in Telegram or the agent has explicit confirmation that the Telegram media send succeeded.

Use `chart_generator.ts` only for local SVG generation when no Telegram delivery is needed.
