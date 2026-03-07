---
name: trackerclaw-ts
description: Install and use the TypeScript TrackerClaw runtime for wallet portfolio reports, snapshots, history, charts, offline assets, and wallet management.
---

# TrackerClaw TS

Use this repository as a TypeScript package for OpenClaw-compatible portfolio tracking.

## Install

```bash
cd {baseDir} && npm install
```

Copy `.env.example` to `.env` and set:

```bash
HELIUS_API_KEY=<your-helius-key>
JUP_BASIC_API_KEY=<your-jupiter-api-key>
```

## Primary Agent Entrypoint

Use `scriptsTS/openclaw_portfolio.ts` for machine-readable automation.

Current portfolio JSON:

```bash
cd {baseDir} && npx tsx scriptsTS/openclaw_portfolio.ts report
```

Single arbitrary wallet:

```bash
cd {baseDir} && npx tsx scriptsTS/openclaw_portfolio.ts report --wallet <solana-address>
```

Multiple arbitrary wallets:

```bash
cd {baseDir} && npx tsx scriptsTS/openclaw_portfolio.ts report --wallets <addr-1> <addr-2>
```

Custom wallet file:

```bash
cd {baseDir} && npx tsx scriptsTS/openclaw_portfolio.ts report --wallet-file <path>
```

## Snapshot And History

Save a JSON snapshot:

```bash
cd {baseDir} && npx tsx scriptsTS/openclaw_portfolio.ts snapshot
```

Read historical performance JSON:

```bash
cd {baseDir} && npx tsx scriptsTS/openclaw_portfolio.ts history --days 30
```

Snapshots are stored in `data/openclaw_snapshots/`.

## Wallet Sources

The runtime can read:

- `data/wallets.json`
- `myWallets.json`
- `myWallets`
- `wallets`
- direct wallet arguments

Wallet files can be:

- JSON array of wallet strings
- JSON array of objects containing `address`
- plain text, one address per line

## Other TS Tools

- `cd {baseDir} && npx tsx scriptsTS/portfolio_api.ts --wallet <solana-address>`
- `cd {baseDir} && npx tsx scriptsTS/portfolio_tracker.ts`
- `cd {baseDir} && npx tsx scriptsTS/defi_tracker.ts`
- `cd {baseDir} && npx tsx scriptsTS/wallet_report.ts <solana-address>`
- `cd {baseDir} && npx tsx scriptsTS/wallet_manager.ts list`
- `cd {baseDir} && npx tsx scriptsTS/offline_assets.ts list`
- `cd {baseDir} && npx tsx scriptsTS/chart_generator.ts performance`

Charts are generated as SVG files in `data/charts/`.

## Skill Set

Install these TypeScript skill folders into the OpenClaw workspace when needed:

- `skillsTS/openclaw-portfolio-suite`
- `skillsTS/portfolio-json-api`
- `skillsTS/portfolio-tracker`
- `skillsTS/defi-tracker`
- `skillsTS/wallet-manager`
- `skillsTS/offline-assets`
- `skillsTS/portfolio-charts`

Use this root `SKILL.md` as the master TypeScript install-and-operate guide.
