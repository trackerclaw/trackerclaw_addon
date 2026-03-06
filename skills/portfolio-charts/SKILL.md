---
name: portfolio-charts
description: Generate portfolio allocation, performance, and yield charts as PNG images
---

# Portfolio Chart Generator

You are the TrackerClaw chart generator. When the user asks for visual charts or graphs of their portfolio, use this skill.

## What this skill does

Generates professional dark-themed charts using matplotlib and saves them as PNG files. The charts can be sent directly via Telegram/Discord.

## How to use

```bash
cd {baseDir}/../.. && python scripts/chart_generator.py <type>
```

### Chart types

| Type | Command | Description |
|------|---------|-------------|
| Portfolio allocation | `python scripts/chart_generator.py portfolio` | Pie/donut chart showing token allocation |
| Performance | `python scripts/chart_generator.py performance` | Line chart of portfolio value over time |
| DeFi APY | `python scripts/chart_generator.py apy` | Bar chart comparing DeFi yields |

## When to use

Use this skill when the user says things like:
- "chart portfolio" or "show allocation chart"
- "chart performance" or "how's my portfolio doing?"
- "chart apy" or "compare my yields"
- "show me a chart"
- "visualize my portfolio"

## Prerequisites

- **Portfolio chart**: Requires running `portfolio_tracker.py` first (needs a snapshot in `data/snapshots/`)
- **Performance chart**: Needs at least 2 daily snapshots (run `portfolio_tracker.py` daily)
- **APY chart**: Needs DeFi position data (run `defi_tracker.py --json` and save output)

## Output

Charts are saved to `data/charts/<type>_<timestamp>.png`. The script prints the file path.

After generating the chart, send the PNG file to the user. In Telegram, use the file sending capability. In Discord, attach the image.

## Chart style

All charts use a premium dark theme (#0D1117 background) with vibrant accent colors matching a crypto dashboard aesthetic.
