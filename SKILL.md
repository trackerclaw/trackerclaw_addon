---
name: trackerclaw-ts
description: Install and use the TypeScript TrackerClaw runtime for wallet portfolio reports, snapshots, history, SVG chart generation, Telegram-ready chart delivery manifests for OpenClaw, offline assets, and wallet management. Use when Codex needs to wire OpenClaw to TrackerClaw for Solana portfolio reports or chart delivery.
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

## Telegram Chart Delivery

Use `scriptsTS/chart_delivery.ts` to generate chart files plus a transport manifest for OpenClaw.

Generate a delivery manifest for Telegram:

```bash
cd {baseDir} && npx tsx scriptsTS/chart_delivery.ts performance
```

Generate SVG-only output when OpenClaw can only attach documents:

```bash
cd {baseDir} && npx tsx scriptsTS/chart_delivery.ts apy --format svg
```

Read the JSON manifest and hand its `telegram` block to OpenClaw:

- `preferred_method`: use `sendPhoto` when a PNG exists, otherwise `sendDocument`
- `preferred_file_path`: upload this file first
- `fallback_method`: use `sendDocument`
- `fallback_file_path`: upload the SVG when photo upload is unavailable
- `caption`: reuse this string as the Telegram caption

Expect this script to create:

- `data/charts/<type>_<timestamp>.svg`
- `data/charts/<type>_<timestamp>.png` unless `--format svg` is used

Use this command shape in OpenClaw tool definitions:

```bash
cd {baseDir} && npx tsx scriptsTS/chart_delivery.ts <portfolio|performance|apy>
```

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
