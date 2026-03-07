---
name: defi-tracker
description: Track Solana DeFi positions with the TrackerClaw TypeScript runtime across supported protocols such as Jupiter, Kamino, and Meteora.
---

# DeFi Tracker

Use this skill when the user asks about lending, borrowing, LP exposure, leverage, APY, or protocol positions.

## Run

All tracked wallets:

```bash
cd {baseDir}/../.. && npx tsx scriptsTS/defi_tracker.ts
```

Options:

- `npx tsx scriptsTS/defi_tracker.ts --wallet Main`
- `npx tsx scriptsTS/defi_tracker.ts --protocol kamino`
- `npx tsx scriptsTS/defi_tracker.ts --json`

## Output

- Text mode prints positions grouped by wallet and protocol
- JSON mode prints the raw position payload
- The script also writes the latest JSON to `data/defi_positions.json`

## Notes

- The TS runtime uses protocol APIs and helper integrations already bundled in the repo
- Supported detection includes Jupiter, Kamino, Meteora, wallet-NFT-backed LP discovery, and fallback program scans
