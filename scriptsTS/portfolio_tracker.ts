#!/usr/bin/env node

import fs from "node:fs/promises";

import { loadEnv, requiredEnv } from "./lib/env.js";
import { LEGACY_SNAPSHOTS_DIR } from "./lib/paths.js";
import { postJson, sleep, formatUsd, formatAmount, isoNow, writeJsonFile } from "./lib/utils.js";
import { loadWalletsByLabel } from "./wallet_manager.js";
import type { TokenPosition } from "./lib/types.js";

loadEnv();

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY ?? ""}`;
const JUPITER_PRICE_URL = "https://lite-api.jup.ag/price/v3";

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  [SOL_MINT]: { symbol: "SOL", decimals: 9 },
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": { symbol: "USDC", decimals: 6 },
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": { symbol: "USDT", decimals: 6 },
  "USDSwr9ApdHk5bvJKMjXr7AmQCVmysCrz9p3p4pi5FK": { symbol: "USDS", decimals: 6 },
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": { symbol: "mSOL", decimals: 9 },
  "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj": { symbol: "stSOL", decimals: 9 },
  "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn": { symbol: "JitoSOL", decimals: 9 },
  "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1": { symbol: "bSOL", decimals: 9 },
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": { symbol: "BONK", decimals: 5 },
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": { symbol: "JUP", decimals: 6 },
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": { symbol: "WIF", decimals: 6 },
  "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof": { symbol: "RENDER", decimals: 8 },
  "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3": { symbol: "PYTH", decimals: 6 },
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": { symbol: "RAY", decimals: 6 },
  "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE": { symbol: "ORCA", decimals: 6 },
};

interface HeliusAssetItem {
  id?: string;
  interface?: string;
  token_info?: {
    symbol?: string;
    decimals?: number;
    balance?: number;
  };
  content?: {
    metadata?: {
      symbol?: string;
    };
  };
}

interface HeliusAssetsResponse {
  items: HeliusAssetItem[];
  nativeBalance?: {
    lamports?: number;
  };
}

export async function getAssetsByOwner(address: string): Promise<HeliusAssetsResponse> {
  requiredEnv("HELIUS_API_KEY");

  const allItems: HeliusAssetItem[] = [];
  let nativeBalance: { lamports?: number } | undefined;
  let page = 1;

  while (true) {
    const payload = {
      jsonrpc: "2.0",
      id: `trackerclaw-${page}`,
      method: "getAssetsByOwner",
      params: {
        ownerAddress: address,
        page,
        limit: 1000,
        displayOptions: {
          showFungible: true,
          showNativeBalance: true,
        },
      },
    };

    const response = await postJson<{ result?: HeliusAssetsResponse; error?: unknown }>(HELIUS_RPC_URL, payload);
    if (response.error) {
      throw new Error(`Helius API error: ${JSON.stringify(response.error)}`);
    }

    const result = response.result || { items: [] };
    allItems.push(...(result.items || []));
    if (!nativeBalance) {
      nativeBalance = result.nativeBalance;
    }
    if ((result.items || []).length < 1000) {
      break;
    }
    page += 1;
    await sleep(200);
  }

  return { items: allItems, nativeBalance };
}

export function parseTokenPositions(assets: HeliusAssetsResponse): TokenPosition[] {
  const positions: TokenPosition[] = [];
  const lamports = assets.nativeBalance?.lamports || 0;
  const solAmount = lamports / 1e9;
  if (solAmount > 0.001) {
    positions.push({
      mint: SOL_MINT,
      symbol: "SOL",
      amount: solAmount,
      decimals: 9,
      is_native: true,
      token_type: "native",
    });
  }

  for (const item of assets.items || []) {
    if (!["FungibleToken", "FungibleAsset"].includes(item.interface || "")) {
      continue;
    }
    const mint = item.id || "";
    const tokenInfo = item.token_info || {};
    let symbol = tokenInfo.symbol || "";
    let decimals = tokenInfo.decimals || 0;
    const balance = tokenInfo.balance || 0;

    if (KNOWN_TOKENS[mint]) {
      symbol ||= KNOWN_TOKENS[mint].symbol;
      decimals ||= KNOWN_TOKENS[mint].decimals;
    }

    const amount = decimals > 0 ? balance / 10 ** decimals : balance;
    if (amount < 0.0001) {
      continue;
    }
    if (!symbol) {
      symbol = item.content?.metadata?.symbol || `${mint.slice(0, 8)}...`;
    }
    positions.push({
      mint,
      symbol,
      amount,
      decimals,
      is_native: false,
      token_type: "spl",
    });
  }

  return positions;
}

export async function fetchPrices(mints: string[]): Promise<Record<string, number>> {
  if (!mints.length) {
    return {};
  }

  const prices: Record<string, number> = {};
  const uniqueMints = [...new Set(mints)];
  for (let index = 0; index < uniqueMints.length; index += 30) {
    const batch = uniqueMints.slice(index, index + 30);
    try {
      const url = new URL(JUPITER_PRICE_URL);
      url.searchParams.set("ids", batch.join(","));
      const payload = (await (await fetch(url)).json()) as Record<string, { usdPrice?: number }>;
      for (const [mint, info] of Object.entries(payload)) {
        if (typeof info?.usdPrice === "number") {
          prices[mint] = info.usdPrice;
        }
      }
    } catch {
      // Keep partial pricing if one batch fails.
    }
    await sleep(200);
  }

  return prices;
}

export async function saveSnapshot(portfolioData: unknown): Promise<void> {
  await fs.mkdir(LEGACY_SNAPSHOTS_DIR, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  await writeJsonFile(`${LEGACY_SNAPSHOTS_DIR}/${today}.json`, portfolioData);
}

export function formatPortfolio(
  walletData: Array<{ label: string; total_value: number; tokens: Array<{ symbol: string; amount: number; price: number; usd_value: number }> }>,
  totalValue: number,
): string {
  const lines: string[] = [];
  lines.push(`**TrackerClaw** • ${formatUsd(totalValue)}`);
  lines.push(`Wallets: ${walletData.map((wallet) => wallet.label).join(", ")}`);
  lines.push("");

  for (const wallet of walletData) {
    if (walletData.length > 1) {
      lines.push(`**${wallet.label}** — ${formatUsd(wallet.total_value)}`);
    }
    lines.push("**Tokens:**");
    const tokens = [...wallet.tokens].sort((left, right) => right.usd_value - left.usd_value);
    const priced = tokens.filter((token) => token.usd_value > 0.01);
    const unpriced = tokens.filter((token) => token.usd_value <= 0.01);

    for (const token of priced) {
      let line = `• ${token.symbol.padEnd(10)} ${formatUsd(token.usd_value)} (${formatAmount(token.amount)} ${token.symbol})`;
      if (token.price) {
        line += ` @ ${formatUsd(token.price)}`;
      }
      lines.push(line);
    }
    if (unpriced.length) {
      lines.push(`_+ ${unpriced.length} dust/unpriced tokens hidden_`);
    }
    lines.push("");
  }

  lines.push(`**Total: ${formatUsd(totalValue)}**`);
  return lines.join("\n");
}

export async function runPortfolio(walletFilter?: string, asJson = false): Promise<void> {
  const wallets = await loadWalletsByLabel(walletFilter);
  if (!wallets.length) {
    throw new Error("No wallets.json found. Run wallet_manager.ts add first.");
  }

  const walletPositions: Record<string, TokenPosition[]> = {};
  const allMints = new Set<string>();
  let totalValue = 0;

  console.log("Fetching on-chain data...");
  for (const wallet of wallets) {
    console.log(`  -> ${wallet.label} (${wallet.address.slice(0, 8)}...)`);
    const assets = await getAssetsByOwner(wallet.address);
    const positions = parseTokenPositions(assets);
    walletPositions[wallet.label] = positions;
    positions.forEach((position) => allMints.add(position.mint));
  }

  console.log("Fetching prices...");
  const prices = await fetchPrices([...allMints]);
  const walletData = wallets.map((wallet) => {
    const positions = walletPositions[wallet.label] || [];
    let walletTotal = 0;
    const tokens = positions.map((position) => {
      const price = prices[position.mint] || 0;
      const usdValue = position.amount * price;
      walletTotal += usdValue;
      return {
        symbol: position.symbol,
        mint: position.mint,
        amount: position.amount,
        price,
        usd_value: usdValue,
        token_type: position.token_type,
      };
    });
    totalValue += walletTotal;
    return {
      label: wallet.label,
      address: wallet.address,
      total_value: walletTotal,
      tokens,
    };
  });

  const snapshot = {
    timestamp: isoNow(),
    total_value: totalValue,
    wallets: walletData,
  };
  await saveSnapshot(snapshot);

  if (asJson) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  console.log();
  console.log(formatPortfolio(walletData, totalValue));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let walletFilter: string | undefined;
  let asJson = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--wallet" || arg === "-w") {
      walletFilter = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--json" || arg === "-j") {
      asJson = true;
    }
  }

  try {
    await runPortfolio(walletFilter, asJson);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("portfolio_tracker.ts")) {
  void main();
}
