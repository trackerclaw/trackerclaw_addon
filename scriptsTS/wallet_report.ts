#!/usr/bin/env node

import { detectPositions } from "./defi_tracker.js";
import { fetchPrices, getAssetsByOwner, parseTokenPositions } from "./portfolio_tracker.js";
import { formatAmount, formatUsd } from "./lib/utils.js";

export async function buildSpotReport(address: string): Promise<{ text: string; total: number }> {
  const assets = await getAssetsByOwner(address);
  const positions = parseTokenPositions(assets);
  const prices = await fetchPrices(positions.map((position) => position.mint));
  const enriched = positions
    .map((position) => {
      const price = Number(prices[position.mint] || 0);
      const usdValue = position.amount * price;
      return {
        symbol: position.symbol,
        amount: position.amount,
        price,
        usd_value: usdValue,
      };
    })
    .sort((left, right) => right.usd_value - left.usd_value);

  const priced = enriched.filter((token) => token.usd_value > 0.01);
  const hidden = enriched.length - priced.length;
  const total = enriched.reduce((sum, token) => sum + token.usd_value, 0);

  const lines = [`TrackerClaw - Spot Portfolio for ${address}`, ""];
  for (const token of priced) {
    lines.push(
      `• ${token.symbol.padEnd(10)} ${formatUsd(token.usd_value)} (${formatAmount(token.amount)} ${token.symbol}) @ ${formatUsd(token.price)}`,
    );
  }
  if (hidden > 0) {
    lines.push(`+ ${hidden} dust/unpriced tokens hidden`);
  }
  lines.push("");
  lines.push(`Spot Total: ${formatUsd(total)}`);
  return { text: lines.join("\n"), total };
}

export async function buildDefiReport(address: string): Promise<{ text: string; total: number }> {
  const positions = await detectPositions(address);
  if (!positions.length) {
    return { text: "No DeFi positions found.", total: 0 };
  }

  const grouped = new Map<string, typeof positions>();
  let total = 0;
  for (const position of positions) {
    total += Number(position.usd_value || 0);
    const entries = grouped.get(position.protocol) || [];
    entries.push(position);
    grouped.set(position.protocol, entries);
  }

  const lines = ["DeFi Positions", ""];
  for (const [protocol, entries] of grouped.entries()) {
    const protocolTotal = entries.reduce((sum, entry) => sum + Number(entry.usd_value || 0), 0);
    lines.push(`${protocol} - ${formatUsd(protocolTotal)}`);
    for (const entry of entries) {
      let line = `• ${entry.type || "Position"}`;
      if (entry.usd_value) {
        line += ` - ${formatUsd(Number(entry.usd_value))}`;
      }
      lines.push(line);
    }
    lines.push("");
  }
  lines.push(`DeFi Total: ${formatUsd(total)}`);
  return { text: lines.join("\n"), total };
}

async function main(): Promise<void> {
  const address = process.argv[2];
  const asJson = process.argv.includes("--json");
  if (!address) {
    console.error("Usage: tsx scriptsTS/wallet_report.ts <solana-address> [--json]");
    process.exit(1);
  }

  try {
    const spot = await buildSpotReport(address);
    const defi = await buildDefiReport(address);
    if (asJson) {
      console.log(
        JSON.stringify(
          {
            address,
            spot_total: spot.total,
            defi_total: defi.total,
            combined_total: spot.total + defi.total,
            spot_report: spot.text,
            defi_report: defi.text,
          },
          null,
          2,
        ),
      );
      return;
    }
    console.log(spot.text);
    console.log();
    console.log(defi.text);
    console.log();
    console.log(`Combined Total: ${formatUsd(spot.total + defi.total)}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("wallet_report.ts")) {
  void main();
}
