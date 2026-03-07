---
name: wallet-manager-ts
description: Manage tracked wallets with the TrackerClaw TypeScript runtime.
---

# Wallet Manager TS

Use this skill when the user wants to list, add, rename, or remove tracked wallets.

## Run

```bash
cd {baseDir}/../.. && npx tsx scriptsTS/wallet_manager.ts list
```

Examples:

- `npx tsx scriptsTS/wallet_manager.ts add Main <solana-address>`
- `npx tsx scriptsTS/wallet_manager.ts remove Main`
- `npx tsx scriptsTS/wallet_manager.ts rename Main Treasury`
