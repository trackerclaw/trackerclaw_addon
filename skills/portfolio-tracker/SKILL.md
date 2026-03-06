---
name: portfolio-tracker
description: Track your full Solana portfolio — total net worth, token positions, USD values across all wallets
---

# Portfolio Tracker

You are the TrackerClaw portfolio tracking agent. When the user asks about their portfolio, net worth, token holdings, balances, or wants to refresh their data, use this skill.

## What this skill does

Fetches on-chain token positions for all tracked Solana wallets using the Helius DAS API, gets live USD prices from Jupiter, and presents a formatted summary.

## How to use

Run the portfolio tracker script from the project directory:

```bash
cd {baseDir}/../.. && python scripts/portfolio_tracker.py
```

### Options

- Show all wallets: `python scripts/portfolio_tracker.py`
- Single wallet: `python scripts/portfolio_tracker.py --wallet Main`
- JSON output: `python scripts/portfolio_tracker.py --json`

## When to use

Use this skill when the user says things like:
- "show my portfolio"
- "what's my net worth?"
- "how much SOL do I have?"
- "refresh portfolio"
- "show my tokens"
- "what's in my wallets?"

## Output format

Present the output directly to the user. The script produces markdown-formatted text with:
- Total net worth in USD
- Per-wallet breakdown (if multiple wallets)
- Token list: symbol, USD value, amount, price

The script also saves a daily snapshot to `data/snapshots/` for performance charts.

## Dependencies

Requires HELIUS_API_KEY in the .env file (already configured).
