# TrackerClaw

TrackerClaw is a local-first Solana portfolio and DeFi tracker. The primary runtime is now TypeScript under `scriptsTS/`, with repo-local TypeScript skills under `skillsTS/`.

## What It Does

- Track Solana spot balances across one wallet or many wallets
- Detect supported DeFi positions
- Return machine-readable JSON for agent workflows
- Save portfolio snapshots for history and performance analysis
- Generate SVG charts from saved snapshots
- Manage tracked wallets and offline assets locally

## Primary TS Entrypoints

- [scriptsTS/openclaw_portfolio.ts](/c:/Users/41766/Documents/antigravity/TrackerClaw/scriptsTS/openclaw_portfolio.ts): report, snapshot, history
- [scriptsTS/portfolio_api.ts](/c:/Users/41766/Documents/antigravity/TrackerClaw/scriptsTS/portfolio_api.ts): programmatic JSON API
- [scriptsTS/chart_generator.ts](/c:/Users/41766/Documents/antigravity/TrackerClaw/scriptsTS/chart_generator.ts): SVG chart generation
- [skillsTS/openclaw-portfolio-suite/SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/skillsTS/openclaw-portfolio-suite/SKILL.md): TS skill entrypoint
- [SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/SKILL.md): root install-and-run guide

## Install

```bash
npm install
```

Create `.env` from `.env.example`:

```bash
HELIUS_API_KEY=your-helius-api-key
JUP_BASIC_API_KEY=your-jupiter-api-key
```

## OpenClaw TS Usage

Current portfolio JSON using auto-discovered wallet files:

```bash
npm run ts:report
```

One arbitrary wallet:

```bash
npx tsx scriptsTS/openclaw_portfolio.ts report --wallet <solana-address>
```

Multiple arbitrary wallets:

```bash
npx tsx scriptsTS/openclaw_portfolio.ts report --wallets <addr-1> <addr-2> <addr-3>
```

Custom wallet file:

```bash
npx tsx scriptsTS/openclaw_portfolio.ts report --wallet-file path/to/wallets.json
```

Save a snapshot:

```bash
npm run ts:snapshot
```

Read history:

```bash
npm run ts:history -- --days 30
```

## Other TS Scripts

Spot tracker:

```bash
npx tsx scriptsTS/portfolio_tracker.ts
```

DeFi tracker:

```bash
npx tsx scriptsTS/defi_tracker.ts
```

Wallet report:

```bash
npx tsx scriptsTS/wallet_report.ts <solana-address>
```

Offline assets:

```bash
npx tsx scriptsTS/offline_assets.ts list
```

Wallet manager:

```bash
npx tsx scriptsTS/wallet_manager.ts list
```

Charts:

```bash
npm run ts:chart:portfolio
npm run ts:chart:performance
npm run ts:chart:apy
```

The charting runtime writes SVG files to `data/charts/`. This replaces the old matplotlib-based Python chart output.

## Skills

TypeScript-focused skills live in `skillsTS/`:

- [skillsTS/openclaw-portfolio-suite/SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/skillsTS/openclaw-portfolio-suite/SKILL.md)
- [skillsTS/portfolio-json-api/SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/skillsTS/portfolio-json-api/SKILL.md)
- [skillsTS/portfolio-tracker/SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/skillsTS/portfolio-tracker/SKILL.md)
- [skillsTS/defi-tracker/SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/skillsTS/defi-tracker/SKILL.md)
- [skillsTS/wallet-manager/SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/skillsTS/wallet-manager/SKILL.md)
- [skillsTS/offline-assets/SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/skillsTS/offline-assets/SKILL.md)
- [skillsTS/portfolio-charts/SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/skillsTS/portfolio-charts/SKILL.md)

Legacy Python scripts remain in `scripts/` for reference during the migration, but the maintained runtime is the TypeScript path in `scriptsTS/`.

## Tests

Run the local TS checks:

```bash
npm run typecheck
npm test
```

The test suite covers JS/TS snapshot history handling and SVG chart generation from sample OpenClaw snapshots.
