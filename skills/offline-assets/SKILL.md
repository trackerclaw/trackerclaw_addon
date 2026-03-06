---
name: offline-assets
description: Track manual/offline assets (cash, stocks, gold) alongside your on-chain portfolio
---

# Offline Asset Manager

You are the TrackerClaw offline asset manager. When the user wants to track non-crypto assets like cash, stocks, gold, or other investments, use this skill.

## What this skill does

Manages a local JSON store of offline/manual assets. Supports cash, stocks (with live Yahoo Finance prices), commodities, and custom assets. Everything is included in the total portfolio net worth.

## How to use

```bash
cd {baseDir}/../.. && python scripts/offline_assets.py <command> [args]
```

### Commands

| Command | Usage | Example |
|---------|-------|---------|
| List assets | `python scripts/offline_assets.py list` | "show my offline assets" |
| Add cash | `python scripts/offline_assets.py add cash 5000 USD` | "add offline 5000 USD cash" |
| Add stock | `python scripts/offline_assets.py add stock AAPL 12 shares 220 avg` | "add offline AAPL 12 shares 220 avg" |
| Add commodity | `python scripts/offline_assets.py add commodity Gold 2 oz 2100` | "add offline 2 oz gold at $2100" |
| Add other | `python scripts/offline_assets.py add other "Real Estate" 50000` | "add offline real estate $50000" |
| Update price | `python scripts/offline_assets.py update <id> price 245` | "update offline AAPL price 245" |
| Remove asset | `python scripts/offline_assets.py remove <id>` | "remove offline #1" |

## When to use

Use this skill when the user says things like:
- "add offline 5000 USD cash"
- "add offline AAPL 12 shares 220 avg"
- "show me my offline assets"
- "update offline AAPL price 245"
- "remove offline #3"
- "what's my total including cash?"

## Parsing user input

When the user says "add offline":
- For cash: extract amount and currency
- For stocks: extract symbol, number of shares, and average price
- For commodities: extract name, quantity, unit, and price per unit

## Notes

- Stock prices update automatically from Yahoo Finance when listing
- Each asset gets a unique numeric ID (shown as #N)
- Use the ID for update and remove operations
