---
name: trackerclaw
description: Install and use this repository as an OpenClaw-compatible portfolio tracker package. Use when an agent needs one root-level instruction file for cloning the repo, installing dependencies, running JSON portfolio scripts, saving JSON snapshots, reading historical performance, and querying wallets from wallet files or direct Solana addresses.
---

# TrackerClaw

Use this repository as a package for an existing OpenClaw claw.

## Install

```bash
git clone <repo-url> TrackerClaw
cd TrackerClaw
pip install -r requirements.txt
npm install
```

Copy `.env.example` to `.env` and set:

```bash
HELIUS_API_KEY=<your-helius-key>
JUP_BASIC_API_KEY=<your-jupiter-api-key>
```

## Primary Agent Entrypoint

Use `scripts/openclaw_portfolio.py` for machine-readable automation.

Current portfolio JSON:

```bash
cd {baseDir} && python scripts/openclaw_portfolio.py report
```

Single arbitrary wallet:

```bash
cd {baseDir} && python scripts/openclaw_portfolio.py report --wallet <solana-address>
```

Multiple arbitrary wallets:

```bash
cd {baseDir} && python scripts/openclaw_portfolio.py report --wallets <addr-1> <addr-2>
```

Custom wallet file:

```bash
cd {baseDir} && python scripts/openclaw_portfolio.py report --wallet-file <path>
```

## Snapshot And History

Save a JSON snapshot:

```bash
cd {baseDir} && python scripts/openclaw_portfolio.py snapshot
```

Read historical performance JSON:

```bash
cd {baseDir} && python scripts/openclaw_portfolio.py history --days 30
```

Snapshots are stored in `data/openclaw_snapshots/`.

## Wallet Sources

The repo can read:

- `data/wallets.json`
- `myWallets.json`
- `myWallets`
- `wallets`
- direct wallet arguments

Wallet files can be:

- JSON array of wallet strings
- JSON array of objects containing `address`
- plain text, one address per line

## Human-Readable Tools

- `python scripts/wallet_report.py <solana-address>`
- `python scripts/portfolio_tracker.py`
- `python scripts/defi_tracker.py`
- `python scripts/chart_generator.py performance`

## Skill Set

Install these skill folders into the OpenClaw workspace when needed:

- `skills/portfolio-json-api`
- `skills/portfolio-tracker`
- `skills/defi-tracker`
- `skills/wallet-manager`
- `skills/offline-assets`
- `skills/portfolio-charts`

Use this root `SKILL.md` as the master install-and-operate guide.
