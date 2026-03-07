#!/usr/bin/env node

import { detectPositions } from "./defi_tracker.js";
import { fetchPrices, getAssetsByOwner, parseTokenPositions } from "./portfolio_tracker.js";
import { roundAmount } from "./lib/utils.js";
import type { WalletPortfolioJson, DefiPosition } from "./lib/types.js";

export async function buildSpotPortfolio(address: string): Promise<WalletPortfolioJson["spot"]> {
  const assets = await getAssetsByOwner(address);
  const positions = parseTokenPositions(assets);
  const prices = await fetchPrices(positions.map((position) => position.mint));

  const tokens = positions
    .map((position) => {
      const price = Number(prices[position.mint] || 0);
      const valueUsd = position.amount * price;
      return {
        symbol: position.symbol,
        mint: position.mint,
        amount: roundAmount(position.amount),
        price_usd: roundAmount(price),
        value_usd: Number(valueUsd.toFixed(2)),
        token_type: position.token_type,
      };
    })
    .sort((left, right) => right.value_usd - left.value_usd);

  const totalUsd = tokens.reduce((sum, token) => sum + token.value_usd, 0);
  const visibleTokens = tokens.filter((token) => token.value_usd > 0.01);

  return {
    total_usd: Number(totalUsd.toFixed(2)),
    token_count: tokens.length,
    visible_token_count: visibleTokens.length,
    hidden_token_count: tokens.length - visibleTokens.length,
    tokens,
  };
}

export async function buildDefiPortfolio(address: string): Promise<WalletPortfolioJson["defi"]> {
  const positions = await detectPositions(address);
  positions.sort((left, right) => Number(right.usd_value || 0) - Number(left.usd_value || 0));

  const normalized: DefiPosition[] = [];
  const protocolMap = new Map<string, { protocol: string; total_usd: number; positions: DefiPosition[] }>();
  let totalUsd = 0;

  for (const position of positions) {
    const usdValue = Number(position.usd_value || 0);
    totalUsd += usdValue;
    const normalizedPosition: DefiPosition = {
      protocol: position.protocol || "",
      type: position.type || "",
      account: position.account || "",
      url: position.url || "",
      value_usd: Number(usdValue.toFixed(2)),
      details: position.details || {},
    };
    normalized.push(normalizedPosition);

    const bucket =
      protocolMap.get(normalizedPosition.protocol) ||
      { protocol: normalizedPosition.protocol, total_usd: 0, positions: [] };
    bucket.total_usd += usdValue;
    bucket.positions.push(normalizedPosition);
    protocolMap.set(normalizedPosition.protocol, bucket);
  }

  const protocols = [...protocolMap.values()]
    .map((protocol) => ({ ...protocol, total_usd: Number(protocol.total_usd.toFixed(2)) }))
    .sort((left, right) => right.total_usd - left.total_usd);

  return {
    total_usd: Number(totalUsd.toFixed(2)),
    protocol_count: protocols.length,
    position_count: normalized.length,
    protocols,
    positions: normalized,
  };
}

export async function getWalletPortfolioJson(address: string): Promise<WalletPortfolioJson> {
  const spot = await buildSpotPortfolio(address);
  const defi = await buildDefiPortfolio(address);
  return {
    address,
    spot,
    defi,
    totals: {
      spot_usd: spot.total_usd,
      defi_usd: defi.total_usd,
      combined_usd: Number((spot.total_usd + defi.total_usd).toFixed(2)),
    },
  };
}

export async function getWalletsPortfolioJson(addresses: string[]): Promise<{
  wallet_count: number;
  wallets: WalletPortfolioJson[];
  totals: { spot_usd: number; defi_usd: number; combined_usd: number };
}> {
  const wallets = [];
  for (const address of addresses) {
    wallets.push(await getWalletPortfolioJson(address));
  }
  const spotTotal = wallets.reduce((sum, wallet) => sum + wallet.totals.spot_usd, 0);
  const defiTotal = wallets.reduce((sum, wallet) => sum + wallet.totals.defi_usd, 0);
  return {
    wallet_count: wallets.length,
    wallets,
    totals: {
      spot_usd: Number(spotTotal.toFixed(2)),
      defi_usd: Number(defiTotal.toFixed(2)),
      combined_usd: Number((spotTotal + defiTotal).toFixed(2)),
    },
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let wallet: string | undefined;
  let wallets: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--wallet") {
      wallet = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--wallets") {
      wallets = args.slice(index + 1);
      break;
    }
  }

  try {
    const payload = wallet
      ? await getWalletPortfolioJson(wallet)
      : await getWalletsPortfolioJson(wallets);
    console.log(JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("portfolio_api.ts")) {
  void main();
}
