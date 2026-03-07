---
name: portfolio-tracker-ts
description: Track Solana spot portfolio balances with the TrackerClaw TypeScript runtime.
---

# Portfolio Tracker TS

Use this skill for token balances, holdings, and spot portfolio summaries.

## Run

```bash
cd {baseDir}/../.. && npx tsx scriptsTS/portfolio_tracker.ts
```

Options:

- `npx tsx scriptsTS/portfolio_tracker.ts --wallet Main`
- `npx tsx scriptsTS/portfolio_tracker.ts --json`

## Notes

- Text mode prints a user-facing summary
- JSON mode prints the raw snapshot structure
