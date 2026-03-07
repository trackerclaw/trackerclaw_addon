---
name: portfolio-tracker
description: Track Solana spot balances and token-level USD values with the TrackerClaw TypeScript runtime.
---

# Portfolio Tracker

Use this skill when the user asks for a spot-token portfolio view, balances, holdings, or wallet net worth.

## Run

All tracked wallets:

```bash
cd {baseDir}/../.. && npx tsx scriptsTS/portfolio_tracker.ts
```

Options:

- `npx tsx scriptsTS/portfolio_tracker.ts --wallet Main`
- `npx tsx scriptsTS/portfolio_tracker.ts --json`

## Output

- Text mode prints a portfolio summary grouped by wallet
- JSON mode prints the raw snapshot payload
- The script saves a legacy-style spot snapshot to `data/snapshots/`

## Requirements

- `HELIUS_API_KEY` must be set in `.env`
