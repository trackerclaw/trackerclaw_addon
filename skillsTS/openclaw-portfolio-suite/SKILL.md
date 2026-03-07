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
HELIUS_API_KEY=<your-helius-key>
JUP_BASIC_API_KEY=<your-jupiter-api-key>
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
- `npx tsx scriptsTS/chart_delivery.ts portfolio`
- `npx tsx scriptsTS/chart_delivery.ts performance`
- `npx tsx scriptsTS/chart_delivery.ts apy`

## Workflow

Follow this routine from the beginning:

1. Install dependencies.
2. Configure `.env`.
3. Ensure wallet input exists.
4. Use `report` for JSON-only output.
5. Use `snapshot` to store state in `data/openclaw_snapshots/`.
6. Repeat snapshot creation on a schedule or after portfolio checks so historical data accumulates.
7. Use `chart_delivery.ts portfolio` for current allocation charts.
8. Use `chart_delivery.ts performance` for historical performance charts.
9. Use `chart_delivery.ts apy` for DeFi yield charts.

Require at least 2 snapshots from different times before using `performance`.

## Telegram Integration

Use `scriptsTS/chart_delivery.ts` as the OpenClaw chart entrypoint. It prints a JSON manifest with a `telegram` block.

OpenClaw must:

1. Run `npx tsx scriptsTS/chart_delivery.ts <portfolio|performance|apy>` from the TrackerClaw repo root.
2. Parse stdout as JSON.
3. Read `manifest.telegram.preferred_method`, `preferred_file_path`, `fallback_method`, `fallback_file_path`, and `caption`.
4. Check that `preferred_file_path` exists on the VPS filesystem.
5. If `preferred_method` is `sendPhoto`, upload `preferred_file_path` as a Telegram photo with `caption`.
6. If the preferred upload fails, log the exact error and upload `fallback_file_path` with `sendDocument`.
7. If `preferred_method` is `sendDocument`, upload `preferred_file_path` directly with `sendDocument`.
8. Surface the exact Telegram or transport error if delivery fails.

Upload files from the local VPS filesystem with multipart form-data. Do not treat the returned path as a public URL.

## Notes

- Snapshots are stored in `data/openclaw_snapshots/`
- Charts and rendered PNG files are written to `data/charts/`
- `scriptsTS/chart_delivery.ts` is the preferred chart entrypoint for OpenClaw because it returns Telegram-ready JSON
- Use the more specific TS skills when the request is limited to JSON API, DeFi, wallets, offline assets, or charts
