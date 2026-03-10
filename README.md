# TrackerClaw

TrackerClaw is an OpenClaw add-on for Solana wallet intelligence.

It is built for agent workflows first:

- machine-readable JSON
- wallet transaction analysis tuned for low-budget AI models
- portfolio and DeFi summaries
- token holder analysis
- snapshot history
- Telegram-ready chart delivery manifests

The maintained runtime is TypeScript in `scriptsTS/`.

## What This Repo Is

TrackerClaw is not a consumer app or dashboard.

It is a local runtime that OpenClaw can call to answer requests like:

- "analyze this wallet"
- "show me this wallet's portfolio"
- "who are the top holders of this token"
- "generate a portfolio chart"
- "give me a compact JSON summary I can interpret"

The wallet analysis output is designed to help weaker models too. The script emits an `ai_digest` block so an agent can read the high-signal summary first, then fall back to the detailed sections only when needed.

## Core Capabilities

- Portfolio report for one wallet or many wallets
- Spot + DeFi portfolio JSON
- Transaction-based wallet analysis with:
  - behavioral patterns
  - holder profile
  - FFT-style frequency analysis
  - sampled realized PnL
  - token conclusions
  - model-friendly `ai_digest`
- Top token holder analysis with wallet relevance filtering
- Historical snapshots and performance history
- SVG and PNG chart generation
- Telegram-ready chart delivery manifests
- Local wallet list management

## Quick Start

Install dependencies:

```bash
npm install
```

Create `.env` from `.env.example`:

```bash
HELIUS_API_KEY=your-helius-api-key
JUP_BASIC_API_KEY=your-jupiter-api-key
```

## OpenClaw Usage

### 1. Portfolio JSON

Auto-detected wallet file:

```bash
npm run ts:report
```

Single wallet:

```bash
npx tsx scriptsTS/openclaw_portfolio.ts report --wallet <solana-address>
```

Multiple wallets:

```bash
npx tsx scriptsTS/openclaw_portfolio.ts report --wallets <addr-1> <addr-2> <addr-3>
```

### 2. Wallet Analysis JSON

This is the preferred entrypoint for natural-language requests like "analyze this wallet".

```bash
npm run ts:wallet:analysis -- <solana-address> --json --max-transactions 120
```

Optional parameters:

- `--max-transactions <n>`: default `120`
- `--days <n>`: default `90`

Important output blocks:

- `ai_digest`: compact high-signal summary for smaller models
- `sampled_pnl`: realized sample-window PnL
- `trading_patterns`: recurring rotations and predictability
- `token_conclusions`: token-by-token summary
- `summary_conclusions`: already-assembled natural language conclusions

### 3. Token Holder Analysis

```bash
npx tsx scriptsTS/token_holder_analysis.ts <token-mint> --limit 10
```

This classifies holders as:

- `relevant`: wallet-owned holder
- `non_relevant`: program-owned or unresolved holder

Use that distinction when reasoning about whale concentration or real user holder distribution.

### 4. Snapshots And History

Save a snapshot:

```bash
npm run ts:snapshot
```

Read historical performance JSON:

```bash
npm run ts:history -- --days 30
```

Snapshots are stored in `data/openclaw_snapshots/`.

### 5. Charts And Delivery

Generate charts:

```bash
npm run ts:chart:portfolio
npm run ts:chart:performance
npm run ts:chart:apy
```

Generate Telegram-ready delivery manifests:

```bash
npm run ts:deliver:portfolio
npm run ts:deliver:performance
npm run ts:deliver:apy
```

Charts are written to `data/charts/`.

## How OpenClaw Should Use It

For wallet analysis requests:

1. Parse the wallet address from the user request.
2. Run:

```bash
npx tsx scriptsTS/wallet_transaction_analysis.ts <solana-address> --json --max-transactions 120
```

3. Parse stdout as JSON.
4. Read `ai_digest` first.
5. Use `summary_conclusions`, `sampled_pnl`, and `token_conclusions` for the reply.
6. Mention when `guardrails.incomplete_history` is `true`.

For chart delivery:

1. Run `scriptsTS/chart_delivery.ts <portfolio|performance|apy>`.
2. Parse stdout as JSON.
3. Read `manifest.telegram`.
4. Send `preferred_file_path` through OpenClaw's existing `message.send` tool.
5. If that fails, retry with `fallback_file_path`.

This repo is built around reusing OpenClaw's existing Telegram send capability rather than installing a separate adapter.

## Wallet Sources

TrackerClaw can read wallets from:

- `data/wallets.json`
- `myWallets.json`
- `myWallets`
- `wallets`
- direct `--wallet` or `--wallets` arguments

Accepted formats:

- JSON array of wallet strings
- JSON array of objects containing `address`
- plain text, one address per line

## Main Files

- [scriptsTS/openclaw_portfolio.ts](/c:/Users/41766/Documents/antigravity/TrackerClaw/scriptsTS/openclaw_portfolio.ts): report, snapshot, history
- [scriptsTS/portfolio_api.ts](/c:/Users/41766/Documents/antigravity/TrackerClaw/scriptsTS/portfolio_api.ts): wallet portfolio JSON
- [scriptsTS/wallet_transaction_analysis.ts](/c:/Users/41766/Documents/antigravity/TrackerClaw/scriptsTS/wallet_transaction_analysis.ts): transaction-based wallet intelligence
- [scriptsTS/token_holder_analysis.ts](/c:/Users/41766/Documents/antigravity/TrackerClaw/scriptsTS/token_holder_analysis.ts): top holder + wallet relevance analysis
- [scriptsTS/chart_delivery.ts](/c:/Users/41766/Documents/antigravity/TrackerClaw/scriptsTS/chart_delivery.ts): Telegram-ready chart manifest output
- [scriptsTS/wallet_manager.ts](/c:/Users/41766/Documents/antigravity/TrackerClaw/scriptsTS/wallet_manager.ts): tracked wallet management
- [SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/SKILL.md): root OpenClaw install-and-run guide
- [skillsTS/openclaw-portfolio-suite/SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/skillsTS/openclaw-portfolio-suite/SKILL.md): suite skill entrypoint

## Other Commands

```bash
npx tsx scriptsTS/portfolio_tracker.ts
npx tsx scriptsTS/defi_tracker.ts
npx tsx scriptsTS/wallet_report.ts <solana-address>
npx tsx scriptsTS/offline_assets.ts list
npx tsx scriptsTS/wallet_manager.ts list
```

## Development

Run checks:

```bash
npm run typecheck
npm test
```

The TypeScript test suite covers wallet analysis helpers, holder analysis, history handling, and chart generation.

## Skills

OpenClaw-oriented TypeScript skills live in `skillsTS/`:

- [skillsTS/openclaw-portfolio-suite/SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/skillsTS/openclaw-portfolio-suite/SKILL.md)
- [skillsTS/portfolio-json-api/SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/skillsTS/portfolio-json-api/SKILL.md)
- [skillsTS/portfolio-tracker/SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/skillsTS/portfolio-tracker/SKILL.md)
- [skillsTS/defi-tracker/SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/skillsTS/defi-tracker/SKILL.md)
- [skillsTS/wallet-manager/SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/skillsTS/wallet-manager/SKILL.md)
- [skillsTS/offline-assets/SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/skillsTS/offline-assets/SKILL.md)
- [skillsTS/portfolio-charts/SKILL.md](/c:/Users/41766/Documents/antigravity/TrackerClaw/skillsTS/portfolio-charts/SKILL.md)

The maintained path is TypeScript.
