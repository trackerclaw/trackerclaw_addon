---
name: defi-tracker
description: Track DeFi positions across Jupiter Lend, Kamino, and Marginfi on Solana
---

# DeFi Position Tracker

You are the TrackerClaw DeFi tracking agent. When the user asks about their DeFi positions, lending, borrowing, yields, or liquidation risk, use this skill.

## What this skill does

Scans wallet transaction history via Helius to detect DeFi protocol interactions, then queries protocol APIs (Kamino, Marginfi) for current positions including supplied/borrowed amounts, APY, and health factors.

## How to use

```bash
cd {baseDir}/../.. && python scripts/defi_tracker.py
```

### Options

- All wallets, all protocols: `python scripts/defi_tracker.py`
- Single wallet: `python scripts/defi_tracker.py --wallet Main`
- Single protocol: `python scripts/defi_tracker.py --protocol kamino`
- JSON output: `python scripts/defi_tracker.py --json`

### Supported protocols
- `jupiter-lend` — Jupiter Lend (supply/borrow)
- `kamino` — Kamino Earn + Kamino Lend
- `marginfi` — Marginfi v2

## When to use

Use this skill when the user says things like:
- "show my DeFi positions"
- "what am I lending?"
- "any liquidation risk?"
- "what's my yield?"
- "show my Kamino positions"
- "what's my total yield this week?"
- "am I borrowing anything?"

## Output format

Shows per-protocol positions with:
- Protocol name and position type (Supply/Borrow)
- Asset and USD value
- APY percentage
- Health factor (for lending positions)
