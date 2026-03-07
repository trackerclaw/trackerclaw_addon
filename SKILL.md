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
HELIUS_API_KEY=<YOUR_HELIUS_API_KEY>
JUP_BASIC_API_KEY=<YOUR_JUP_BASIC_API_KEY>
```

## Install From Scratch

Use this sequence when OpenClaw is asked to install TrackerClaw from scratch and then use it immediately.

For a reusable prompt template, see `OPENCLAW_INSTALL_MESSAGE.example.txt`.

1. Clone the repo and enter the repo root.
2. Run `npm install`.
3. Create `.env` with:

```bash
HELIUS_API_KEY=<YOUR_HELIUS_API_KEY>
JUP_BASIC_API_KEY=<YOUR_JUP_BASIC_API_KEY>
```

4. Create a wallet file with one of these formats.

Option A, JSON:

```bash
mkdir -p data
cat > data/wallets.json <<'EOF'
[
  "<SOLANA_WALLET_1>",
  "<SOLANA_WALLET_2>"
]
EOF
```

Option B, plain text:

```bash
cat > wallets <<'EOF'
<SOLANA_WALLET_1>
<SOLANA_WALLET_2>
EOF
```

5. Run `npx tsx scriptsTS/openclaw_portfolio.ts report`.
6. Run `npx tsx scriptsTS/openclaw_portfolio.ts snapshot`.
7. Run `npx tsx scriptsTS/chart_delivery.ts portfolio`.
8. If enough snapshots already exist, also run `npx tsx scriptsTS/chart_delivery.ts performance`.
9. Parse the chart manifest and send the preferred chart file to Telegram using the existing `message.send` tool with `path`.
10. If the first media send fails, retry with the fallback chart file path.
11. Reply with a concise summary of what was done and send the portfolio chart to the user.

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

Top token holders with wallet portfolio analysis:

```bash
cd {baseDir} && npx tsx scriptsTS/token_holder_analysis.ts <token-mint> --limit 10
```

This endpoint classifies each holder as either:

- `relevant`: wallet-owned holder
- `non_relevant`: program-owned or unresolved holder, which should be treated as contract-controlled balance such as liquidity pools, vesting wallets, escrows, or locked dev allocations

When analyzing concentration or whale distribution, do not treat `non_relevant` holders as normal user wallets.

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

Persist snapshots over time if OpenClaw needs historical charts. A performance chart requires at least 2 snapshots from different times.

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
- `cd {baseDir} && npx tsx scriptsTS/token_holder_analysis.ts <token-mint> --limit 10`
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

## OpenClaw Routine

Recreate the full chart workflow with this sequence:

1. Install dependencies with `cd {baseDir} && npm install`.
2. Configure `.env` with `HELIUS_API_KEY` and `JUP_BASIC_API_KEY`.
3. Ensure wallet input exists through `data/wallets.json`, `myWallets.json`, `myWallets`, `wallets`, or direct wallet arguments.
4. Use `npx tsx scriptsTS/openclaw_portfolio.ts report` for text or JSON-only portfolio output.
5. Use `npx tsx scriptsTS/openclaw_portfolio.ts snapshot` to save state.
6. Repeat snapshot creation on a schedule or after portfolio checks so history accumulates.
7. Use `npx tsx scriptsTS/chart_delivery.ts portfolio` for current allocation charts.
8. Use `npx tsx scriptsTS/chart_delivery.ts performance` for historical performance charts.
9. Use `npx tsx scriptsTS/chart_delivery.ts apy` for DeFi yield charts.

Run `performance` only when snapshots already exist across time. If there are fewer than 2 snapshots, return the TrackerClaw error directly.

## OpenClaw Telegram Engine Changes

Do not install a new Telegram adapter for this workflow. Reuse OpenClaw's existing `message.send` tool and update its Telegram media-send rule for this workspace.

OpenClaw must:

1. Execute `npx tsx scriptsTS/chart_delivery.ts <portfolio|performance|apy>` from the TrackerClaw repo root.
2. Parse stdout as JSON.
3. Read `manifest.telegram`.
4. Verify `manifest.telegram.preferred_file_path` exists on disk.
5. Send the chart with the existing `message.send` tool using `channel: "telegram"` and `path: manifest.telegram.preferred_file_path`.
6. Treat any Telegram `message.send` call that includes a non-empty `path` as a media send, not a text-only send.
7. If the preferred upload fails, retry with `message.send` using `path: manifest.telegram.fallback_file_path`.
8. Return the exact Telegram or transport error when upload fails.

Assume the returned file path is on the same VPS where OpenClaw runs. Upload it from the filesystem with multipart form-data. Do not treat it as a public URL.

Persist this minimal Telegram behavior in OpenClaw's capability map or workspace instructions:

- `message.send` without `path` -> normal Telegram text send
- `message.send` with local `.png`, `.jpg`, or `.jpeg` `path` -> Telegram media send as photo
- if photo send fails -> retry as document with the fallback path
- `message.send` with non-image `path` -> Telegram document send

Use this exact payload shape for TrackerClaw charts:

```json
{
  "action": "send",
  "channel": "telegram",
  "target": "telegram:<CHAT_ID>",
  "message": "<manifest.telegram.caption>",
  "path": "<manifest.telegram.preferred_file_path>"
}
```

If the first send fails, resend the same payload with `path` replaced by `manifest.telegram.fallback_file_path`.

If OpenClaw seems confused after a reset, restate this rule explicitly: do not install a new adapter, just reuse `message.send` with `path` for Telegram media delivery.

Do not treat `message.send` returning `ok: true` as sufficient proof that the chart reached Telegram. For this repo, report chart-send success only if the chart visibly appears in Telegram or the agent has explicit confirmation that a Telegram media send succeeded rather than a text-only fallback.

When the user asks to install the repo and check `SKILL.md`, follow the install-from-scratch routine in this file without asking for extra design clarification.

## OpenClaw Feedback Loop

After wiring the routine, have OpenClaw report back:

- the exact command it ran
- the JSON manifest or the parse error
- whether the preferred file path existed
- whether it used `sendPhoto` or `sendDocument`
- the exact Telegram or transport error if upload failed
- whether fallback was attempted
- whether the final Telegram message appeared

For normal successful setup runs, prefer a concise user-facing summary instead of raw debug output. Include detailed commands, manifests, and payloads only when something fails or the user explicitly asks for diagnostics.

If the chart does not visibly appear in Telegram, treat the run as failed even if `message.send` returned `ok: true`. In that case, report the issue instead of hallucinating success.

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
