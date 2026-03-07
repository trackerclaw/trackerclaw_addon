---
name: trackerclaw-ts
description: Install and use the main TrackerClaw TypeScript runtime for reports, snapshots, history, and charting.
---

# TrackerClaw TS

Use this as the root TypeScript skill for OpenClaw or any other agent integrating the repo.

## Install

```bash
cd {baseDir}/../.. && npm install
```

## Main Entrypoint

Current report:

```bash
cd {baseDir}/../.. && npx tsx scriptsTS/openclaw_portfolio.ts report
```

Other commands:

- `npx tsx scriptsTS/openclaw_portfolio.ts snapshot`
- `npx tsx scriptsTS/openclaw_portfolio.ts history --days 30`
- `npx tsx scriptsTS/openclaw_portfolio.ts report --wallet <solana-address>`
- `npx tsx scriptsTS/openclaw_portfolio.ts report --wallet-file <path>`

## Notes

- Snapshots are stored in `data/openclaw_snapshots/`
- Charts are generated through `scriptsTS/chart_generator.ts`
- Use the more specific TS skills when the user’s request is limited to JSON API, DeFi, wallets, offline assets, or charts
