---
name: wallet-manager
description: Add, remove, rename, and list tracked Solana wallets
---

# Wallet Manager

You are the TrackerClaw wallet management agent. When the user wants to manage which wallets are tracked, use this skill.

## What this skill does

Manages the wallet list stored in `data/wallets.json`. Supports add, remove, rename, and list operations.

## How to use

Run the wallet manager script:

```bash
cd {baseDir}/../.. && python scripts/wallet_manager.py <command> [args]
```

### Commands

| Command | Usage | Example |
|---------|-------|---------|
| List wallets | `python scripts/wallet_manager.py list` | "list my wallets" |
| Add wallet | `python scripts/wallet_manager.py add <label> <address>` | "add wallet Main abc123..." |
| Remove wallet | `python scripts/wallet_manager.py remove <label>` | "remove wallet Main" |
| Rename wallet | `python scripts/wallet_manager.py rename <old> <new>` | "rename wallet Main ColdStorage" |

## When to use

Use this skill when the user says things like:
- "add wallet Main abc123..."
- "remove wallet Main"
- "list my wallets"
- "rename wallet Main → ColdStorage"
- "what wallets am I tracking?"
- "track this address: ..."

## Parsing user input

When the user says "add wallet", extract:
1. The **label** (first word after "add wallet")
2. The **address** (Solana base58 address, 32-44 characters)

The label is case-insensitive for matching but stored as provided.

## Important notes

- Wallet addresses are validated (32-44 chars, base58)
- Duplicate labels and addresses are rejected
- Changes are saved immediately to `data/wallets.json`
