---
name: defi-tracker-ts
description: Track DeFi positions with the TrackerClaw TypeScript runtime.
---

# DeFi Tracker TS

Use this skill for DeFi exposure, lending, borrowing, LP positions, and protocol-level summaries.

## Run

```bash
cd {baseDir}/../.. && npx tsx scriptsTS/defi_tracker.ts
```

Options:

- `npx tsx scriptsTS/defi_tracker.ts --wallet Main`
- `npx tsx scriptsTS/defi_tracker.ts --protocol kamino`
- `npx tsx scriptsTS/defi_tracker.ts --json`

## Notes

- Text mode groups results by wallet and protocol
- JSON mode is suitable for downstream automation
