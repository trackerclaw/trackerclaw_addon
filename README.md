# TrackerClaw

TrackerClaw is an open source, local-first portfolio tracker package for existing OpenClaw claws.

It is designed to be cloned as a normal repository, installed locally, and invoked by agents through a small set of scripts and skill files. It is read-only, text-first, and built for private wallet tracking without wallet connection or signing.

## What It Does

- Track spot token balances for Solana wallets
- Track supported DeFi positions
- Return machine-readable JSON for one wallet or many wallets
- Save JSON snapshots for history and performance analysis
- Generate text summaries for agent chat workflows
- Generate charts from saved history
- Work from wallet files or direct wallet arguments

## Main Agent Entry Points

For OpenClaw or any other agent, the primary entrypoint is:

- [scripts/openclaw_portfolio.py](/c:/Users/41766/Documents/antigravity/TrackerClaw/scripts/openclaw_portfolio.py)

It supports:

- `report`
- `snapshot`
- `history`

Lower-level programmatic JSON functions live in:

- [scripts/portfolio_api.py](/c:/Users/41766/Documents/antigravity/TrackerClaw/scripts/portfolio_api.py)

The master agent instructions live in:

- [SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/SKILL.md)

## Install

Clone the repository and install dependencies:

```bash
git clone <repo-url> TrackerClaw
cd TrackerClaw
pip install -r requirements.txt
npm install
```

Create `.env` from `.env.example`:
you will need to register for two API keys from Jupiter and Helius for scripts to work:
```bash
HELIUS_API_KEY=your-helius-api-key
JUP_BASIC_API_KEY=your-jupiter-api-key
```

## Wallet Inputs

TrackerClaw can read wallets from:

- `data/wallets.json`
- `myWallets.json`
- `myWallets`
- `wallets`
- direct CLI arguments

Supported wallet-file formats:

- JSON array of wallet strings
- JSON array of wallet objects with `address`
- plain text file with one wallet per line

Examples:

- [data/wallets.example.json](/c:/Users/41766/Documents/antigravity/TrackerClaw/data/wallets.example.json)
- [wallets.example](/c:/Users/41766/Documents/antigravity/TrackerClaw/wallets.example)

## OpenClaw Usage

Current portfolio JSON using auto-discovered wallet files:

```bash
python scripts/openclaw_portfolio.py report
```

One arbitrary wallet:

```bash
python scripts/openclaw_portfolio.py report --wallet <solana-address>
```

Multiple arbitrary wallets:

```bash
python scripts/openclaw_portfolio.py report --wallets <addr-1> <addr-2> <addr-3>
```

Custom wallet file:

```bash
python scripts/openclaw_portfolio.py report --wallet-file path/to/wallets.json
```

Save a snapshot:

```bash
python scripts/openclaw_portfolio.py snapshot
```

Read history:

```bash
python scripts/openclaw_portfolio.py history --days 30
```

## Programmatic Usage

Import the JSON API directly:

```python
from scripts.portfolio_api import get_wallet_portfolio_json, get_wallets_portfolio_json

one_wallet = get_wallet_portfolio_json("YourSolanaWallet")
many_wallets = get_wallets_portfolio_json([
    "WalletOne",
    "WalletTwo",
])
```

## Human-Readable Scripts

Text report for one wallet:

```bash
python scripts/wallet_report.py <solana-address>
```

Tracked-wallet portfolio summary:

```bash
python scripts/portfolio_tracker.py
```

Tracked-wallet DeFi summary:

```bash
python scripts/defi_tracker.py
```

Charts:

```bash
python scripts/chart_generator.py portfolio
python scripts/chart_generator.py performance
python scripts/chart_generator.py apy
```

## Included Skills

These repo-local skills are intended to be copied or symlinked into an OpenClaw skill workspace:

- [skills/portfolio-json-api/SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/skills/portfolio-json-api/SKILL.md)
- [skills/portfolio-tracker/SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/skills/portfolio-tracker/SKILL.md)
- [skills/defi-tracker/SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/skills/defi-tracker/SKILL.md)
- [skills/wallet-manager/SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/skills/wallet-manager/SKILL.md)
- [skills/offline-assets/SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/skills/offline-assets/SKILL.md)
- [skills/portfolio-charts/SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/skills/portfolio-charts/SKILL.md)

The root [SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/SKILL.md) is the master install and operation guide.

## Repository Layout

Top-level files:

- `README.md`: project overview and install guide
- `SKILL.md`: master OpenClaw integration instructions
- `.env.example`: required environment variables
- `.gitignore`: excludes secrets, local data, and generated outputs
- `requirements.txt`: Python dependencies
- `package.json`: Node dependencies used for Meteora support

Key directories:

- `scripts/`: runnable Python and Node entrypoints
- `skills/`: OpenClaw skill folders
- `data/`: local wallet inputs, config, and generated snapshots

Important script files:

- `scripts/openclaw_portfolio.py`: JSON report, snapshot, and history entrypoint
- `scripts/portfolio_api.py`: importable JSON API for one or many wallets
- `scripts/wallet_report.py`: text portfolio report for arbitrary wallets
- `scripts/portfolio_tracker.py`: tracked-wallet spot portfolio script
- `scripts/defi_tracker.py`: tracked-wallet DeFi tracking script
- `scripts/chart_generator.py`: chart generation from stored data
- `scripts/wallet_manager.py`: wallet file CRUD helpers
- `scripts/offline_assets.py`: offline asset management

## Data And Privacy

TrackerClaw is intended to keep all runtime state local.

Ignored from Git by default:

- `.env`
- wallet input files
- local snapshots
- generated charts
- local DeFi output
- `node_modules`

That keeps API keys, wallet lists, and generated history out of version control by default.

## APIs Used

- Helius DAS API
- Jupiter Price API
- Jupiter Portfolio API
- Kamino API
- Meteora DLMM SDK/API
- Yahoo Finance

## Release Readiness Notes

This repo is now structured for public submission:

- local secrets removed from tracked files
- runtime data removed from tracked files
- example wallet/config files added
- root-level `SKILL.md` added for direct agent access
- redundant planning docs removed

This repo includes the MIT License in [LICENSE](/c:/Users/41766/Documents/antigravity/TrackerClaw/LICENSE).
