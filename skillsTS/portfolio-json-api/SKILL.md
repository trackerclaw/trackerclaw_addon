---
name: portfolio-json-api-ts
description: Return machine-readable wallet portfolio JSON with the TrackerClaw TypeScript runtime.
---

# Portfolio JSON API TS

Use this skill when an agent needs raw JSON output for one wallet or many wallets.

## Run

```bash
cd {baseDir}/../.. && npx tsx scriptsTS/portfolio_api.ts --wallet <solana-address>
```

For multiple wallets:

```bash
cd {baseDir}/../.. && npx tsx scriptsTS/portfolio_api.ts --wallets <addr-1> <addr-2>
```

## Notes

- The script prints JSON only
- It accepts arbitrary wallet addresses directly
