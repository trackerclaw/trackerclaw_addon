#!/usr/bin/env node

import fs from "node:fs/promises";

import { loadEnv } from "./lib/env.js";
import { DATA_DIR, DEFI_FILE, VAULTS_FILE } from "./lib/paths.js";
import { formatUsd, postJson, readJsonFile, sleep, writeJsonFile } from "./lib/utils.js";
import { fetchPrices, getAssetsByOwner, KNOWN_TOKENS, SOL_MINT } from "./portfolio_tracker.js";
import { loadWalletsByLabel } from "./wallet_manager.js";
import { getMeteoraDlmmPositions } from "./meteora_dlmm_positions.js";
import type { DefiPosition } from "./lib/types.js";

loadEnv();

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || "";
const JUP_BASIC_API_KEY = process.env.JUP_BASIC_API_KEY || "";
const RPC_URL = HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : "https://api.mainnet-beta.solana.com";
const JUPITER_PORTFOLIO_URL = "https://api.jup.ag/portfolio/v1/positions";
const KAMINO_API = "https://api.kamino.finance";
const METEORA_DLMM_API = "https://dlmm-api.meteora.ag";

const FALLBACK_PROTOCOLS: Record<
  string,
  { name: string; program: string; owner_offset: number; url: string }
> = {
  marginfi: {
    name: "Marginfi",
    program: "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA",
    owner_offset: 8,
    url: "https://app.marginfi.com",
  },
  drift: {
    name: "Drift",
    program: "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH",
    owner_offset: 8,
    url: "https://app.drift.trade",
  },
  solend: {
    name: "Solend",
    program: "So1endDq2YkqhipRh3WViPa8hFvz0XP1SOSrrXCc1fV",
    owner_offset: 8,
    url: "https://solend.fi",
  },
};

const KNOWN_SYMBOLS = {
  ...KNOWN_TOKENS,
  BANKJmvhT8tiJRsBSS1n2HryMBPvT5Ze4HU95DUAmeta: { symbol: "AVICI", decimals: 6 },
  METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL: { symbol: "MET", decimals: 6 },
};

function tokenSymbol(mint: string, assetLookup: Record<string, any> = {}): string {
  if (KNOWN_SYMBOLS[mint]) {
    return KNOWN_SYMBOLS[mint].symbol;
  }
  const item = assetLookup[mint] || {};
  return item?.token_info?.symbol || item?.content?.metadata?.symbol || `${mint.slice(0, 8)}...`;
}

function buildAssetLookup(assets: { items?: any[] }): Record<string, any> {
  const lookup: Record<string, any> = {};
  for (const item of assets.items || []) {
    if (item?.id) {
      lookup[item.id] = item;
    }
  }
  return lookup;
}

export async function detectJupiterPositions(address: string): Promise<DefiPosition[]> {
  if (!JUP_BASIC_API_KEY) {
    return [];
  }

  try {
    const response = await fetch(`${JUPITER_PORTFOLIO_URL}/${address}`, {
      headers: { "x-api-key": JUP_BASIC_API_KEY },
    });
    if (!response.ok) {
      return [];
    }
    const data = (await response.json()) as { elements?: any[] };
    return (data.elements || []).map((element) => {
      const details = element.data || {};
      const refs = details.sourceRefs || [];
      const refAccount = details.ref || refs[0]?.address || "";
      const supplied = Number(details.suppliedValue || 0);
      const borrowed = Number(details.borrowedValue || 0);
      const payload: DefiPosition = {
        protocol: "Jupiter",
        type: element.label || "Position",
        account: refAccount,
        url: details.link || "https://jup.ag/",
        usd_value: Number(element.value || 0),
        details: {
          element_type: element.type || "",
          net_apy_pct: Number(element.netApy || 0) * 100,
        },
      };
      if (supplied) {
        payload.details!.supplied_value = Number(supplied.toFixed(2));
      }
      if (borrowed) {
        payload.details!.borrowed_value = Number(borrowed.toFixed(2));
      }
      return payload;
    });
  } catch {
    return [];
  }
}

async function fetchMeteoraPairName(lbPair: string): Promise<string> {
  try {
    const response = await fetch(`${METEORA_DLMM_API}/pair/${lbPair}`);
    if (!response.ok) {
      return "";
    }
    const data = (await response.json()) as { name?: string };
    return data.name || "";
  } catch {
    return "";
  }
}

export async function detectMeteoraPositions(address: string, assetLookup: Record<string, any> = {}): Promise<DefiPosition[]> {
  try {
    const rawPositions = await getMeteoraDlmmPositions(address, RPC_URL);
    if (!rawPositions.length) {
      return [];
    }

    const mints = [...new Set(rawPositions.flatMap((item) => [item.mint_x, item.mint_y]))];
    const prices = await fetchPrices(mints);
    const positions: DefiPosition[] = [];

    for (const item of rawPositions) {
      const amountX = Number(item.total_x_amount || 0);
      const amountY = Number(item.total_y_amount || 0);
      const feeX = Number(item.fee_x_amount || 0);
      const feeY = Number(item.fee_y_amount || 0);
      const priceX = prices[item.mint_x] || 0;
      const priceY = prices[item.mint_y] || 0;
      const pairName =
        (await fetchMeteoraPairName(item.lb_pair)) ||
        `${tokenSymbol(item.mint_x, assetLookup)}-${tokenSymbol(item.mint_y, assetLookup)}`;

      positions.push({
        protocol: "Meteora",
        type: `DLMM (${pairName})`,
        account: item.account,
        url: `https://app.meteora.ag/dlmm/${item.lb_pair}`,
        usd_value: amountX * priceX + amountY * priceY,
        details: {
          pair: pairName,
          amount_x: Number(amountX.toFixed(6)),
          amount_y: Number(amountY.toFixed(6)),
          symbol_x: tokenSymbol(item.mint_x, assetLookup),
          symbol_y: tokenSymbol(item.mint_y, assetLookup),
          claimable_fees_usd: Number((feeX * priceX + feeY * priceY).toFixed(2)),
          lower_bin_id: item.lower_bin_id,
          upper_bin_id: item.upper_bin_id,
        },
      });
    }

    return positions;
  } catch {
    return [];
  }
}

async function getKvaultMetrics(vaultAddress: string): Promise<any> {
  try {
    const response = await fetch(`${KAMINO_API}/kvaults/vaults/${vaultAddress}/metrics`);
    if (!response.ok) {
      return {};
    }
    return await response.json();
  } catch {
    return {};
  }
}

function makeKaminoVaultPosition(
  name: string,
  vaultAddress: string,
  shares: number,
  usdValue: number,
  apy: number,
  sharePrice: number,
): DefiPosition {
  return {
    protocol: "Kamino",
    type: `Vault (${name})`,
    account: vaultAddress,
    url: "https://app.kamino.finance",
    usd_value: usdValue,
    details: {
      vault: name,
      shares: Number(shares.toFixed(4)),
      share_price: Number(sharePrice.toFixed(6)),
      apy_pct: Number((apy * 100).toFixed(2)),
      usd_value: Number(usdValue.toFixed(2)),
    },
  };
}

async function detectKaminoObligations(address: string): Promise<DefiPosition[]> {
  let markets: any[] = [];
  try {
    const response = await fetch(`${KAMINO_API}/v2/kamino-market`);
    if (!response.ok) {
      return [];
    }
    markets = (await response.json()) as any[];
  } catch {
    return [];
  }

  const positions: DefiPosition[] = [];
  for (const market of markets) {
    const marketKey = market.lendingMarket || "";
    const marketName = market.name || "Unknown";
    try {
      const response = await fetch(`${KAMINO_API}/kamino-market/${marketKey}/users/${address}/obligations`);
      if (!response.ok) {
        continue;
      }
      const obligations = await response.json();
      const entries = Array.isArray(obligations) ? obligations : [obligations];
      for (const entry of entries) {
        const obligationAddress = typeof entry === "string" ? entry : entry?.obligationAddress || "";
        if (!obligationAddress) {
          continue;
        }
        const historyResponse = await fetch(
          `${KAMINO_API}/v2/kamino-market/${marketKey}/obligations/${obligationAddress}/metrics/history`,
        );
        if (!historyResponse.ok) {
          continue;
        }
        const historyPayload = (await historyResponse.json()) as { history?: any[] };
        const latest = historyPayload.history?.at(-1);
        if (!latest) {
          continue;
        }
        const stats = latest.refreshedStats || {};
        const nav = Number(stats.netAccountValue || 0);
        if (nav < 0.01) {
          continue;
        }
        const deposits = Number(stats.userTotalDeposit || 0);
        const borrows = Number(stats.userTotalBorrow || 0);
        const leverage = Number(stats.leverage || 0);
        const strategy = Number(latest.tag || 0) === 1 ? "Multiply" : "Lend";

        positions.push({
          protocol: "Kamino",
          type: `${strategy} (${marketName})`,
          account: obligationAddress,
          url: "https://app.kamino.finance",
          usd_value: nav,
          details: {
            market: marketName,
            strategy,
            net_value: Number(nav.toFixed(2)),
            total_deposits: Number(deposits.toFixed(2)),
            total_borrows: Number(borrows.toFixed(2)),
            leverage: Number(leverage.toFixed(1)),
          },
        });
      }
    } catch {
      continue;
    }
  }
  return positions;
}

export async function detectKaminoPositions(address: string): Promise<DefiPosition[]> {
  const positions: DefiPosition[] = [];

  try {
    const response = await fetch(`${KAMINO_API}/kvaults/users/${address}/positions`);
    if (response.ok) {
      const entries = (await response.json()) as any[];
      for (const vaultPosition of entries) {
        const vaultAddress = vaultPosition.vaultAddress || vaultPosition.address || "";
        const totalShares = Number(vaultPosition.totalShares || 0);
        if (totalShares <= 0) {
          continue;
        }
        const metrics = await getKvaultMetrics(vaultAddress);
        const sharePrice = Number(metrics.sharePrice || 1);
        const tokenPrice = Number(metrics.tokenPrice || 1);
        const apy = Number(metrics.apy || 0);
        const vaultName = vaultPosition.state?.name || "Unknown Vault";
        const usdValue = totalShares * sharePrice * tokenPrice;
        positions.push(makeKaminoVaultPosition(vaultName, vaultAddress, totalShares, usdValue, apy, sharePrice));
      }
    }
  } catch {
    // Fall through to vault config fallback.
  }

  if (!positions.length) {
    const vaultConfigs = await readJsonFile<any[]>(VAULTS_FILE, []);
    for (const vaultConfig of vaultConfigs) {
      const vaultAddress = vaultConfig.vault_address || "";
      const vaultName = vaultConfig.name || "Unknown";
      try {
        const response = await fetch(`${KAMINO_API}/kvaults/users/${address}/positions/${vaultAddress}`);
        if (!response.ok) {
          continue;
        }
        const vaultPosition = await response.json();
        const totalShares = Number(vaultPosition.totalShares || 0);
        if (totalShares <= 0) {
          continue;
        }
        const metrics = await getKvaultMetrics(vaultAddress);
        const sharePrice = Number(metrics.sharePrice || 1);
        const tokenPrice = Number(metrics.tokenPrice || 1);
        const apy = Number(metrics.apy || 0);
        const usdValue = totalShares * sharePrice * tokenPrice;
        positions.push(makeKaminoVaultPosition(vaultName, vaultAddress, totalShares, usdValue, apy, sharePrice));
      } catch {
        continue;
      }
    }
  }

  positions.push(...(await detectKaminoObligations(address)));
  return positions;
}

export function detectNftBackedPositions(assets: { items?: any[] }, protocolFilter?: string): DefiPosition[] {
  if (protocolFilter && !["orca", "raydium"].includes(protocolFilter.toLowerCase())) {
    return [];
  }

  const positions: DefiPosition[] = [];
  for (const item of assets.items || []) {
    const iface = item.interface || "";
    if (!["V1_NFT", "ProgrammableNFT", "MplCoreAsset"].includes(iface)) {
      continue;
    }
    const metadata = item.content?.metadata || {};
    const name = metadata.name || "";
    const symbol = metadata.symbol || "";
    const text = `${name} ${symbol}`.toLowerCase();

    if (text.includes("whirlpool") || (text.includes("orca") && text.includes("position"))) {
      positions.push({
        protocol: "Orca Whirlpool",
        type: `Position NFT (${name || symbol || String(item.id || "").slice(0, 8)})`,
        account: item.id || "",
        url: "https://www.orca.so",
        usd_value: 0,
        details: { discovery: "wallet_nft" },
      });
    } else if (text.includes("raydium") && (text.includes("position") || text.includes("clmm"))) {
      positions.push({
        protocol: "Raydium CLMM",
        type: `Position NFT (${name || symbol || String(item.id || "").slice(0, 8)})`,
        account: item.id || "",
        url: "https://raydium.io",
        usd_value: 0,
        details: { discovery: "wallet_nft" },
      });
    }
  }
  return positions;
}

async function queryProgramAccounts(programId: string, owner: string, offset: number): Promise<any[]> {
  try {
    const response = await postJson<{ result?: any[] }>(RPC_URL, {
      jsonrpc: "2.0",
      id: "scan",
      method: "getProgramAccounts",
      params: [
        programId,
        {
          encoding: "base64",
          filters: [{ memcmp: { offset, bytes: owner } }],
        },
      ],
    });
    return response.result || [];
  } catch {
    return [];
  }
}

export async function detectFallbackProgramPositions(address: string, protocolFilter?: string): Promise<DefiPosition[]> {
  const positions: DefiPosition[] = [];
  for (const [key, info] of Object.entries(FALLBACK_PROTOCOLS)) {
    if (protocolFilter && protocolFilter.toLowerCase() !== key) {
      continue;
    }
    const accounts = await queryProgramAccounts(info.program, address, info.owner_offset);
    for (const account of accounts) {
      positions.push({
        protocol: info.name,
        type: "Program Position",
        account: account.pubkey || "",
        url: info.url,
        usd_value: 0,
      });
    }
    await sleep(300);
  }
  return positions;
}

export async function detectPositions(address: string, protocolFilter?: string): Promise<DefiPosition[]> {
  const assets = await getAssetsByOwner(address);
  const assetLookup = buildAssetLookup(assets);
  const positions: DefiPosition[] = [];

  if (!protocolFilter || protocolFilter.toLowerCase() === "jupiter") {
    positions.push(...(await detectJupiterPositions(address)));
  }
  if (!protocolFilter || ["kamino", "vaults"].includes(protocolFilter.toLowerCase())) {
    positions.push(...(await detectKaminoPositions(address)));
  }
  if (!protocolFilter || protocolFilter.toLowerCase() === "meteora") {
    positions.push(...(await detectMeteoraPositions(address, assetLookup)));
  }
  positions.push(...detectNftBackedPositions(assets, protocolFilter));
  positions.push(...(await detectFallbackProgramPositions(address, protocolFilter)));
  return positions.sort((left, right) => (right.usd_value || 0) - (left.usd_value || 0));
}

export function formatDefiOutput(
  walletData: Array<{ label: string; positions: DefiPosition[] }>,
): string {
  const lines = ["**TrackerClaw - DeFi Positions**", ""];
  let hasAny = false;

  for (const wallet of walletData) {
    if (!wallet.positions.length) {
      if (walletData.length > 1) {
        lines.push(`**${wallet.label}** - No DeFi positions found`);
        lines.push("");
      }
      continue;
    }

    hasAny = true;
    if (walletData.length > 1) {
      lines.push(`**${wallet.label}**`);
    }

    const grouped = new Map<string, DefiPosition[]>();
    for (const position of wallet.positions) {
      const entries = grouped.get(position.protocol) || [];
      entries.push(position);
      grouped.set(position.protocol, entries);
    }

    for (const [protocol, entries] of grouped.entries()) {
      const total = entries.reduce((sum, entry) => sum + Number(entry.usd_value || 0), 0);
      let header = `**${protocol}** (${entries.length} position${entries.length === 1 ? "" : "s"})`;
      if (total > 0) {
        header += ` - ${formatUsd(total)}`;
      }
      lines.push(header);

      for (const position of entries) {
        const usd = Number(position.usd_value || 0);
        let line = `  - ${position.type || "Position"}`;
        if (usd > 0) {
          line += ` - ${formatUsd(usd)}`;
        }
        if (position.account) {
          line += `  \`${position.account.slice(0, 12)}...\``;
        }
        lines.push(line);

        const details = position.details || {};
        if (details.supplied_value) {
          lines.push(`    Supplied: ${formatUsd(Number(details.supplied_value))}`);
        }
        if (details.borrowed_value) {
          lines.push(`    Borrowed: ${formatUsd(Number(details.borrowed_value))}`);
        }
        if (details.net_apy_pct) {
          lines.push(`    Net APY: ${Number(details.net_apy_pct).toFixed(2)}%`);
        }
        if (details.pair) {
          lines.push(`    Pair: ${details.pair}`);
        }
        if (details.amount_x != null && details.amount_y != null) {
          lines.push(
            `    Balances: ${Number(details.amount_x).toFixed(6)} ${details.symbol_x || "X"}, ${Number(details.amount_y).toFixed(6)} ${details.symbol_y || "Y"}`,
          );
        }
        if (details.claimable_fees_usd) {
          lines.push(`    Claimable fees: ${formatUsd(Number(details.claimable_fees_usd))}`);
        }
        if (details.shares) {
          lines.push(`    Shares: ${details.shares}`);
        }
        if (details.apy_pct) {
          lines.push(`    APY: ${Number(details.apy_pct).toFixed(2)}%`);
        }
        if (details.total_deposits) {
          lines.push(`    Deposits: ${formatUsd(Number(details.total_deposits))}`);
        }
        if (details.total_borrows) {
          lines.push(`    Borrows: ${formatUsd(Number(details.total_borrows))}`);
        }
        if (details.leverage) {
          lines.push(`    Leverage: ${details.leverage}x`);
        }
      }

      const url = entries[0]?.url || "";
      if (url) {
        lines.push(`  View: ${url}`);
      }
    }

    lines.push("");
  }

  if (!hasAny) {
    lines.push("No active DeFi positions found.");
    lines.push("Scanned: Jupiter, Kamino, Meteora, Orca, Raydium, Marginfi, Drift, Solend");
  }

  return lines.join("\n");
}

export async function runDefiTracker(walletFilter?: string, protocolFilter?: string, asJson = false): Promise<void> {
  const wallets = await loadWalletsByLabel(walletFilter);
  const walletData: Array<{ label: string; address: string; positions: DefiPosition[] }> = [];

  console.log("Scanning DeFi positions...\n");
  for (const wallet of wallets) {
    console.log(`${wallet.label} (${wallet.address.slice(0, 8)}...)`);
    const positions = await detectPositions(wallet.address, protocolFilter);
    walletData.push({
      label: wallet.label,
      address: wallet.address,
      positions,
    });
  }

  await fs.mkdir(DATA_DIR, { recursive: true });
  await writeJsonFile(DEFI_FILE, walletData);

  if (asJson) {
    console.log(JSON.stringify(walletData, null, 2));
    return;
  }

  console.log();
  console.log(formatDefiOutput(walletData));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let walletFilter: string | undefined;
  let protocolFilter: string | undefined;
  let asJson = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--wallet" || arg === "-w") {
      walletFilter = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--protocol" || arg === "-p") {
      protocolFilter = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--json" || arg === "-j") {
      asJson = true;
    }
  }

  try {
    await runDefiTracker(walletFilter, protocolFilter, asJson);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("defi_tracker.ts")) {
  void main();
}
