---
name: portfolio-charts
description: Generate portfolio allocation, performance, and DeFi APY SVG charts with the TrackerClaw TypeScript runtime.
---

# Portfolio Charts

Use this skill when the user wants a visual chart of portfolio allocation, performance history, or DeFi yields.

## Run

Performance:

```bash
cd {baseDir}/../.. && npx tsx scriptsTS/chart_generator.ts performance
```

Other chart types:

- `npx tsx scriptsTS/chart_generator.ts portfolio`
- `npx tsx scriptsTS/chart_generator.ts apy`

## Prerequisites

- `portfolio`: requires at least one saved snapshot in `data/openclaw_snapshots/` or `data/snapshots/`
- `performance`: requires at least two valid saved snapshots
- `apy`: requires APY-bearing DeFi positions in the latest OpenClaw snapshot

## Output

- Charts are saved to `data/charts/<type>_<timestamp>.svg`
- Return the saved file path to the user and reference the generated image directly
