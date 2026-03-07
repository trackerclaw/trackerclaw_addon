---
name: portfolio-json-api
description: Return machine-readable Solana portfolio JSON with the TrackerClaw TypeScript runtime for one wallet or many wallets.
---

# Portfolio JSON API

Use this skill when an agent needs structured JSON instead of formatted text.

## Run

Single wallet:

```bash
cd {baseDir}/../.. && npx tsx scriptsTS/portfolio_api.ts --wallet <solana-address>
```

Multiple wallets:

```bash
cd {baseDir}/../.. && npx tsx scriptsTS/portfolio_api.ts --wallets <addr-1> <addr-2> <addr-3>
```

## Output

The script prints JSON only.

- Single-wallet output includes `address`, `spot`, `defi`, and `totals`
- Multi-wallet output includes `wallet_count`, `wallets`, and combined `totals`

## Notes

- Accept arbitrary wallet addresses directly; `data/wallets.json` is not required
- Use this skill for downstream automation, snapshots, or follow-up parsing
