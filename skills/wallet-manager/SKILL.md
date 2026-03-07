---
name: wallet-manager
description: Add, remove, rename, and list tracked Solana wallets with the TrackerClaw TypeScript runtime.
---

# Wallet Manager

Use this skill when the user wants to manage the tracked wallet list in `data/wallets.json`.

## Run

```bash
cd {baseDir}/../.. && npx tsx scriptsTS/wallet_manager.ts list
```

Other commands:

- `npx tsx scriptsTS/wallet_manager.ts add <label> <address>`
- `npx tsx scriptsTS/wallet_manager.ts remove <label>`
- `npx tsx scriptsTS/wallet_manager.ts rename <old_label> <new_label>`

## Notes

- Wallet labels are matched case-insensitively
- Duplicate labels and duplicate addresses are rejected
- Wallet changes are saved immediately to `data/wallets.json`
