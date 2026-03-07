---
name: offline-assets-ts
description: Manage offline assets with the TrackerClaw TypeScript runtime.
---

# Offline Assets TS

Use this skill for manual holdings such as cash, stocks, commodities, and other non-wallet assets.

## Run

```bash
cd {baseDir}/../.. && npx tsx scriptsTS/offline_assets.ts list
```

Examples:

- `npx tsx scriptsTS/offline_assets.ts add cash 5000 USD`
- `npx tsx scriptsTS/offline_assets.ts add stock AAPL 12 shares 220 avg`
- `npx tsx scriptsTS/offline_assets.ts update 1 price 245`
- `npx tsx scriptsTS/offline_assets.ts remove 1`
