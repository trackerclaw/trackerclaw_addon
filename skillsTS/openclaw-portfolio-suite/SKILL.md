---
name: trackerclaw-ts
description: Install and use the main TrackerClaw TypeScript runtime for reports, snapshots, history, chart delivery, and OpenClaw Telegram integration. Use when OpenClaw needs a full end-to-end TrackerClaw workflow including current charts, historical charts, and Telegram file uploads.
---

# TrackerClaw TS

Use this as the root TypeScript skill for OpenClaw or any other agent integrating the repo.

## Install

```bash
cd {baseDir}/../.. && npm install
```

Copy `.env.example` to `.env` and set:

```bash
HELIUS_API_KEY=<YOUR_HELIUS_API_KEY>
JUP_BASIC_API_KEY=<YOUR_JUP_BASIC_API_KEY>
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
- `npx tsx scriptsTS/wallet_transaction_analysis.ts <solana-address> --json --max-transactions 120`
- `npx tsx scriptsTS/chart_delivery.ts portfolio`
- `npx tsx scriptsTS/chart_delivery.ts performance`
- `npx tsx scriptsTS/chart_delivery.ts apy`

For requests like "analyze this wallet", "analyze this wallet's transactions", or "wallet behavior analysis", prefer:

```bash
cd {baseDir}/../.. && npx tsx scriptsTS/wallet_transaction_analysis.ts <solana-address> --json --max-transactions 120
```

Optional parameters:

- `--max-transactions <n>` with default `120`
- `--days <n>` with default `90`

Interpretation order for lower-budget OpenClaw agents:

1. Read `ai_digest` first.
2. Then read `summary_conclusions`.
3. Use `sampled_pnl`, `trading_patterns`, and `token_conclusions` only when more detail is needed.
4. If `guardrails.incomplete_history` is `true`, mention that the analysis is based on a capped sample.

## Workflow

Follow this routine from the beginning:

1. Install dependencies.
2. Configure `.env` with placeholder values:

```bash
HELIUS_API_KEY=<YOUR_HELIUS_API_KEY>
JUP_BASIC_API_KEY=<YOUR_JUP_BASIC_API_KEY>
```

3. Ensure wallet input exists. Preferred starter formats:

JSON:

```bash
mkdir -p data
cat > data/wallets.json <<'EOF'
[
  "<SOLANA_WALLET_1>",
  "<SOLANA_WALLET_2>"
]
EOF
```

Plain text:

```bash
cat > wallets <<'EOF'
<SOLANA_WALLET_1>
<SOLANA_WALLET_2>
EOF
```

4. Use `report` for JSON-only output.
5. Use `snapshot` to store state in `data/openclaw_snapshots/`.
6. Repeat snapshot creation on a schedule or after portfolio checks so historical data accumulates.
7. Use `chart_delivery.ts portfolio` for current allocation charts.
8. Use `chart_delivery.ts performance` for historical performance charts.
9. Use `chart_delivery.ts apy` for DeFi yield charts.
10. After a successful run, summarize the steps concisely and send the portfolio chart to the user.

Require at least 2 snapshots from different times before using `performance`.

## Telegram Integration

Use `scriptsTS/chart_delivery.ts` as the OpenClaw chart entrypoint. It prints a JSON manifest with a `telegram` block.

OpenClaw must:

1. Run `npx tsx scriptsTS/chart_delivery.ts <portfolio|performance|apy>` from the TrackerClaw repo root.
2. Parse stdout as JSON.
3. Read `manifest.telegram.preferred_method`, `preferred_file_path`, `fallback_method`, `fallback_file_path`, and `caption`.
4. Check that `preferred_file_path` exists on the VPS filesystem.
5. Reuse the existing OpenClaw `message.send` tool instead of installing a new Telegram adapter.
6. Call `message.send` with `channel: "telegram"`, `message: caption`, and `path: preferred_file_path`.
7. Treat any Telegram `message.send` call with a non-empty `path` as a media send.
8. If the preferred upload fails, retry with `path: fallback_file_path`.
9. Surface the exact Telegram or transport error if delivery fails.

Upload files from the local VPS filesystem with multipart form-data. Do not treat the returned path as a public URL.

Persist this OpenClaw rule for the workspace:

- `message.send` without `path` -> normal text send
- `message.send` with image `path` -> Telegram photo send
- failed image send -> retry with fallback path as document send

When the user says to install the repo and check `SKILL.md`, execute this workflow directly from the skill without requiring additional setup instructions.

## Notes

- Snapshots are stored in `data/openclaw_snapshots/`
- Charts and rendered PNG files are written to `data/charts/`
- `scriptsTS/chart_delivery.ts` is the preferred chart entrypoint for OpenClaw because it returns Telegram-ready JSON
- Use the more specific TS skills when the request is limited to JSON API, DeFi, wallets, offline assets, or charts
