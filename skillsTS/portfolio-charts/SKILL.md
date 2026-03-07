---
name: portfolio-charts-ts
description: Generate SVG portfolio charts with the TrackerClaw TypeScript runtime.
---

# Portfolio Charts TS

Use this skill to generate portfolio allocation, performance, and APY charts from saved snapshot data.

## Run

```bash
cd {baseDir}/../.. && npx tsx scriptsTS/chart_generator.ts performance
```

Other chart types:

- `npx tsx scriptsTS/chart_generator.ts portfolio`
- `npx tsx scriptsTS/chart_generator.ts apy`

## Output

- Charts are written to `data/charts/`
- The runtime currently produces SVG images
