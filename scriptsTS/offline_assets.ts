#!/usr/bin/env node

import fs from "node:fs/promises";

import { DATA_DIR, OFFLINE_FILE } from "./lib/paths.js";
import { isoNow, writeJsonFile } from "./lib/utils.js";

const YAHOO_QUOTE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

interface OfflineAsset {
  id: number;
  type: string;
  amount?: number;
  currency?: string;
  symbol?: string;
  shares?: number;
  avg_price?: number;
  current_price?: number;
  current_value?: number;
  name?: string;
  unit?: string;
  price_per_unit?: number;
  value?: number;
  added?: string;
  updated?: string;
}

export async function loadOffline(): Promise<OfflineAsset[]> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(OFFLINE_FILE, "utf8");
    const payload = JSON.parse(raw);
    return Array.isArray(payload) ? payload : [];
  } catch {
    return [];
  }
}

export async function saveOffline(assets: OfflineAsset[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await writeJsonFile(OFFLINE_FILE, assets);
}

function nextId(assets: OfflineAsset[]): number {
  return assets.length ? Math.max(...assets.map((asset) => asset.id || 0)) + 1 : 1;
}

export async function fetchStockPrice(symbol: string): Promise<number> {
  try {
    const url = new URL(`${YAHOO_QUOTE_URL}/${symbol.toUpperCase()}`);
    url.searchParams.set("range", "1d");
    url.searchParams.set("interval", "1d");
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0" },
    });
    if (!response.ok) {
      return 0;
    }
    const data = (await response.json()) as any;
    return Number(data.chart?.result?.[0]?.meta?.regularMarketPrice || 0);
  } catch {
    return 0;
  }
}

export async function cmdList(asJson = false): Promise<void> {
  const assets = await loadOffline();
  if (!assets.length) {
    console.log("No offline assets tracked. Use 'add' to add some.");
    return;
  }

  for (const asset of assets) {
    if (asset.type === "stock" && asset.symbol) {
      const current = await fetchStockPrice(asset.symbol);
      if (current > 0) {
        asset.current_price = current;
        asset.current_value = current * Number(asset.shares || 0);
      }
    }
  }
  await saveOffline(assets);

  if (asJson) {
    console.log(JSON.stringify(assets, null, 2));
    return;
  }

  let total = 0;
  console.log("**TrackerClaw — Offline Assets**\n");
  for (const asset of assets) {
    if (asset.type === "cash") {
      total += Number(asset.amount || 0);
      console.log(`• [#${asset.id}] Cash — ${asset.currency || "USD"} ${Number(asset.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      continue;
    }
    if (asset.type === "stock") {
      const shares = Number(asset.shares || 0);
      const avgPrice = Number(asset.avg_price || 0);
      const current = Number(asset.current_price || avgPrice);
      const value = current * shares;
      total += value;
      const pnl = avgPrice > 0 ? (current - avgPrice) * shares : 0;
      const pnlPct = avgPrice > 0 ? ((current / avgPrice) - 1) * 100 : 0;
      const sign = pnl >= 0 ? "+" : "";
      console.log(
        `• [#${asset.id}] ${asset.symbol} — ${shares} shares @ $${current.toFixed(2)} = $${value.toFixed(2)} (${sign}$${pnl.toFixed(2)} / ${sign}${pnlPct.toFixed(1)}%)`,
      );
      continue;
    }
    if (asset.type === "commodity") {
      const amount = Number(asset.amount || 0);
      const price = Number(asset.price_per_unit || 0);
      const value = amount * price;
      total += value;
      console.log(`• [#${asset.id}] ${asset.name} — ${amount} ${asset.unit || "units"} @ $${price.toFixed(2)} = $${value.toFixed(2)}`);
      continue;
    }
    const value = Number(asset.value || 0);
    total += value;
    console.log(`• [#${asset.id}] ${asset.name || asset.type} — $${value.toFixed(2)}`);
  }

  console.log(`\n**Offline Total: $${total.toFixed(2)}**`);
}

export async function cmdAdd(args: string[]): Promise<void> {
  const assets = await loadOffline();
  const assetType = (args[0] || "").toLowerCase();
  const id = nextId(assets);

  if (assetType === "cash") {
    const amount = Number(args[1] || 0);
    const currency = (args[2] || "USD").toUpperCase();
    assets.push({ id, type: "cash", amount, currency, added: isoNow() });
    await saveOffline(assets);
    console.log(`Added cash: ${currency} ${amount.toFixed(2)} (#${id})`);
    return;
  }

  if (assetType === "stock") {
    const symbol = (args[1] || "").toUpperCase();
    const shares = Number(args[2] || 0);
    const avgPrice = Number(args.find((value, index) => args[index + 1]?.toLowerCase() === "avg") || 0) || Number(args[4] || 0);
    const currentPrice = (await fetchStockPrice(symbol)) || avgPrice;
    assets.push({
      id,
      type: "stock",
      symbol,
      shares,
      avg_price: avgPrice,
      current_price: currentPrice,
      current_value: currentPrice * shares,
      added: isoNow(),
    });
    await saveOffline(assets);
    console.log(`Added stock: ${symbol} x ${shares} @ avg $${avgPrice.toFixed(2)} (current: $${currentPrice.toFixed(2)}) (#${id})`);
    return;
  }

  if (assetType === "commodity") {
    const name = args[1];
    const amount = Number(args[2] || 0);
    const unit = args[3] || "units";
    const price = Number(args[4] || 0);
    assets.push({
      id,
      type: "commodity",
      name,
      amount,
      unit,
      price_per_unit: price,
      added: isoNow(),
    });
    await saveOffline(assets);
    console.log(`Added commodity: ${name} x ${amount} ${unit} @ $${price.toFixed(2)} (#${id})`);
    return;
  }

  if (assetType === "other") {
    const name = args[1];
    const value = Number(args[2] || 0);
    assets.push({
      id,
      type: "other",
      name,
      value,
      added: isoNow(),
    });
    await saveOffline(assets);
    console.log(`Added: ${name} — $${value.toFixed(2)} (#${id})`);
    return;
  }

  throw new Error(`Unknown asset type: ${assetType}`);
}

export async function cmdUpdate(assetId: string, field: string, value: string): Promise<void> {
  const assets = await loadOffline();
  const id = Number(assetId);
  const asset = assets.find((entry) => entry.id === id);
  if (!asset) {
    throw new Error(`No asset found with ID #${assetId}`);
  }

  if (field.toLowerCase() === "price") {
    const price = Number(value);
    if (asset.type === "stock") {
      asset.current_price = price;
      asset.current_value = price * Number(asset.shares || 0);
    } else if (asset.type === "commodity") {
      asset.price_per_unit = price;
    } else {
      asset.value = price;
    }
  } else if (field.toLowerCase() === "amount") {
    asset.amount = Number(value);
  } else if (field.toLowerCase() === "shares") {
    asset.shares = Number(value);
  } else {
    (asset as unknown as Record<string, unknown>)[field] = value;
  }
  asset.updated = isoNow();
  await saveOffline(assets);
  console.log(`Updated #${assetId} ${field} to ${value}`);
}

export async function cmdRemove(assetId: string): Promise<void> {
  const assets = await loadOffline();
  const id = Number(assetId);
  const filtered = assets.filter((asset) => asset.id !== id);
  if (filtered.length === assets.length) {
    throw new Error(`No asset found with ID #${assetId}`);
  }
  await saveOffline(filtered);
  console.log(`Removed asset #${assetId}`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === "list") {
      await cmdList(args.includes("--json") || args.includes("-j"));
      return;
    }
    if (command === "add") {
      await cmdAdd(args);
      return;
    }
    if (command === "update") {
      if (args.length < 3) {
        throw new Error("Usage: update <id> <field> <value>");
      }
      await cmdUpdate(args[0], args[1], args[2]);
      return;
    }
    if (command === "remove") {
      if (!args[0]) {
        throw new Error("Usage: remove <id>");
      }
      await cmdRemove(args[0]);
      return;
    }
    if (command === "--json" || command === "-j") {
      await cmdList(true);
      return;
    }
    throw new Error("Usage: tsx scriptsTS/offline_assets.ts list|add|update|remove");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("offline_assets.ts")) {
  void main();
}
