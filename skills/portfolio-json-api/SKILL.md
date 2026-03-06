---
name: portfolio-json-api
description: Return machine-readable Solana portfolio JSON for arbitrary wallet addresses. Use when an agent such as OpenClaw needs a deterministic JSON response for one wallet or a list of wallets, including spot token balances, DeFi positions, and combined USD totals.
---

# Portfolio JSON API

Run the JSON API script for arbitrary Solana addresses.

## Use

For one wallet:

```bash
cd {baseDir}/../.. && python scripts/portfolio_api.py --wallet <solana-address>
```

For multiple wallets:

```bash
cd {baseDir}/../.. && python scripts/portfolio_api.py --wallets <addr-1> <addr-2> <addr-3>
```

## Output

The script prints JSON only.

Single-wallet output shape:

```json
{
  "address": "...",
  "spot": {
    "total_usd": 0,
    "token_count": 0,
    "visible_token_count": 0,
    "hidden_token_count": 0,
    "tokens": []
  },
  "defi": {
    "total_usd": 0,
    "protocol_count": 0,
    "position_count": 0,
    "protocols": [],
    "positions": []
  },
  "totals": {
    "spot_usd": 0,
    "defi_usd": 0,
    "combined_usd": 0
  }
}
```

Multi-wallet output shape:

```json
{
  "wallet_count": 0,
  "wallets": [],
  "totals": {
    "spot_usd": 0,
    "defi_usd": 0,
    "combined_usd": 0
  }
}
```

## Notes

- Accept arbitrary wallet addresses directly. Do not require entries in `data/wallets.json`.
- Use this skill when a downstream agent or automation needs structured JSON instead of markdown text.
- Present the JSON output directly or parse it for follow-up automation.
