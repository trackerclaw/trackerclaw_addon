---
name: offline-assets
description: Manage manual or offline assets such as cash, stocks, commodities, and custom holdings with the TrackerClaw TypeScript runtime.
---

# Offline Assets

Use this skill when the user wants to track non-wallet assets in `data/offline.json`.

## Run

```bash
cd {baseDir}/../.. && npx tsx scriptsTS/offline_assets.ts list
```

Other commands:

- `npx tsx scriptsTS/offline_assets.ts add cash 5000 USD`
- `npx tsx scriptsTS/offline_assets.ts add stock AAPL 12 shares 220 avg`
- `npx tsx scriptsTS/offline_assets.ts add commodity Gold 2 oz 2100`
- `npx tsx scriptsTS/offline_assets.ts add other "Real Estate" 50000`
- `npx tsx scriptsTS/offline_assets.ts update <id> price 245`
- `npx tsx scriptsTS/offline_assets.ts remove <id>`

## Notes

- Listing assets refreshes stock prices from Yahoo Finance when available
- Each asset has a numeric ID used for update and remove commands
