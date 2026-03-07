#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

import { DEFAULT_WALLET_FILES, OPENCLAW_SNAPSHOTS_DIR } from "./lib/paths.js";
import { isoNow, readJsonFile, timestampFileNow, writeJsonFile } from "./lib/utils.js";
import { getWalletsPortfolioJson } from "./portfolio_api.js";

export async function loadWalletFile(filePath: string): Promise<string[]> {
  const raw = (await fs.readFile(filePath, "utf8")).trim();
  if (!raw) {
    return [];
  }
  if (filePath.endsWith(".json")) {
    const payload = JSON.parse(raw);
    if (Array.isArray(payload)) {
      return payload
        .map((item) => (typeof item === "string" ? item : item?.address))
        .filter((value): value is string => Boolean(value));
    }
  }
  return raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export async function resolveWallets(options: {
  wallet?: string;
  wallets?: string[];
  walletFile?: string;
}): Promise<string[]> {
  if (options.wallet) {
    return [options.wallet];
  }
  if (options.wallets?.length) {
    return options.wallets;
  }
  if (options.walletFile) {
    return loadWalletFile(options.walletFile);
  }
  for (const candidate of DEFAULT_WALLET_FILES) {
    try {
      await fs.access(candidate);
      const wallets = await loadWalletFile(candidate);
      if (wallets.length) {
        return wallets;
      }
    } catch {
      continue;
    }
  }
  throw new Error("No wallet source found. Pass --wallet, --wallets, or --wallet-file.");
}

export async function buildSnapshot(addresses: string[]): Promise<any> {
  const payload = await getWalletsPortfolioJson(addresses);
  return { ...payload, timestamp: isoNow() };
}

export async function saveSnapshot(payload: unknown, snapshotDir = OPENCLAW_SNAPSHOTS_DIR): Promise<string> {
  await fs.mkdir(snapshotDir, { recursive: true });
  const filePath = path.join(snapshotDir, `${timestampFileNow()}.json`);
  await writeJsonFile(filePath, payload);
  return filePath;
}

export async function loadHistory(days = 30, snapshotDir = OPENCLAW_SNAPSHOTS_DIR): Promise<any[]> {
  try {
    const files = (await fs.readdir(snapshotDir))
      .filter((name) => name.endsWith(".json"))
      .sort()
      .slice(days > 0 ? -days : 0);
    const snapshots = [];
    for (const file of files) {
      snapshots.push(await readJsonFile(path.join(snapshotDir, file), {}));
    }
    return snapshots;
  } catch {
    return [];
  }
}

export async function buildHistoryPayload(days = 30, snapshotDir = OPENCLAW_SNAPSHOTS_DIR): Promise<any> {
  const snapshots = await loadHistory(days, snapshotDir);
  const series = snapshots.map((snapshot) => ({
    timestamp: snapshot.timestamp || "",
    spot_usd: snapshot.totals?.spot_usd || 0,
    defi_usd: snapshot.totals?.defi_usd || 0,
    combined_usd: snapshot.totals?.combined_usd || 0,
    wallet_count: snapshot.wallet_count || snapshot.wallets?.length || 0,
  }));

  let performance = {
    start_combined_usd: 0,
    end_combined_usd: 0,
    change_usd: 0,
    change_pct: 0,
  };
  if (series.length >= 2) {
    const start = Number(series[0].combined_usd || 0);
    const end = Number(series.at(-1)?.combined_usd || 0);
    const change = end - start;
    performance = {
      start_combined_usd: Number(start.toFixed(2)),
      end_combined_usd: Number(end.toFixed(2)),
      change_usd: Number(change.toFixed(2)),
      change_pct: start ? Number(((change / start) * 100).toFixed(2)) : 0,
    };
  }

  return {
    snapshot_count: series.length,
    series,
    performance,
  };
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    console.error("Usage: tsx scriptsTS/openclaw_portfolio.ts report|snapshot|history");
    process.exit(1);
  }

  let wallet: string | undefined;
  let walletFile: string | undefined;
  let wallets: string[] | undefined;
  let days = 30;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--wallet") {
      wallet = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--wallet-file") {
      walletFile = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--wallets") {
      wallets = [];
      for (let cursor = index + 1; cursor < args.length && !args[cursor].startsWith("--"); cursor += 1) {
        wallets.push(args[cursor]);
        index = cursor;
      }
      continue;
    }
    if (arg === "--days") {
      days = Number(args[index + 1] || 30);
      index += 1;
    }
  }

  try {
    if (command === "history") {
      console.log(JSON.stringify(await buildHistoryPayload(days), null, 2));
      return;
    }
    const addresses = await resolveWallets({ wallet, wallets, walletFile });
    const payload = await buildSnapshot(addresses);
    if (command === "report") {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    if (command === "snapshot") {
      const snapshotPath = await saveSnapshot(payload);
      console.log(
        JSON.stringify(
          {
            saved: true,
            snapshot_path: snapshotPath,
            payload,
          },
          null,
          2,
        ),
      );
      return;
    }
    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("openclaw_portfolio.ts")) {
  void main();
}
