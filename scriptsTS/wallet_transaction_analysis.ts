#!/usr/bin/env node

import {
  Connection,
  PublicKey,
  type ConfirmedSignatureInfo,
  type ParsedTransactionWithMeta,
  type TokenBalance,
} from "@solana/web3.js";

import { buildSpotPortfolio } from "./portfolio_api.js";
import { loadEnv, requiredEnv } from "./lib/env.js";
import { formatUsd, postJson, roundAmount, shortAddress, sleep } from "./lib/utils.js";
import { KNOWN_TOKENS, SOL_MINT } from "./portfolio_tracker.js";

loadEnv();

const DEFAULT_MAX_TRANSACTIONS = 400;
const DEFAULT_MAX_DAYS = 90;
const MAX_SIGNATURE_BATCH = 100;
const MAX_FREQUENCY_BINS = 512;
const BOT_TX_PER_DAY_THRESHOLD = 80;
const BOT_MEDIAN_GAP_MINUTES = 5;
const BASE_ASSET_SYMBOLS = new Set(["SOL", "USDC", "USDT", "USDS", "CASH", "PYUSD"]);
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY ?? ""}`;

type TransactionClassification = "trade" | "transfer" | "other";
type TradeDirection = "buy" | "sell";

export interface WalletTokenChange {
  mint: string;
  symbol: string;
  amount_change: number;
}

export interface WalletTradeLeg {
  mint: string;
  symbol: string;
  direction: TradeDirection;
  amount: number;
}

export interface NormalizedWalletTransaction {
  signature: string;
  block_time: number;
  success: boolean;
  fee_sol: number;
  native_change_sol: number;
  classification: TransactionClassification;
  token_changes: WalletTokenChange[];
  trade_legs: WalletTradeLeg[];
  primary_buy_symbol?: string;
  primary_sell_symbol?: string;
}

export interface WalletAnalysisGuardrails {
  sampled_transaction_count: number;
  truncated: boolean;
  incomplete_history: boolean;
  suspected_bot_wallet: boolean;
  deep_pattern_analysis_enabled: boolean;
  reasons: string[];
}

export interface TokenMetadata {
  mint: string;
  symbol: string;
  name?: string;
  display_name: string;
}

interface AiDigestInput {
  maxDays: number;
  sampledTransactions: number;
  activityWindows: ReturnType<typeof analyzeActivityWindows>;
  guardrails: WalletAnalysisGuardrails;
  behaviouralPatterns: ReturnType<typeof analyzeBehavioralPatterns>;
  holderAnalysis: ReturnType<typeof analyzeHolderProfile>;
  tradePreferences: ReturnType<typeof analyzeTradePreferences>;
  sampledPnl: ReturnType<typeof analyzeSampledPnl>;
  tradingPatterns: ReturnType<typeof analyzeTradingPatterns>;
  tokenConclusions: ReturnType<typeof buildTokenConclusions>;
}

function getConnection(): Connection {
  const apiKey = requiredEnv("HELIUS_API_KEY");
  return new Connection(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, "confirmed");
}

async function withRpcRetry<T>(label: string, fn: () => Promise<T>, maxAttempts = 6): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      attempt += 1;
      const message = error instanceof Error ? error.message : String(error);
      const retryable = /429|Too many requests|timed out|503|504|fetch failed/i.test(message);
      if (!retryable || attempt >= maxAttempts) {
        throw new Error(`${label} failed: ${message}`);
      }
      await sleep(500 * 2 ** (attempt - 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function parseUiAmount(balance?: TokenBalance): number {
  if (!balance) {
    return 0;
  }
  const amountString = balance.uiTokenAmount.uiAmountString;
  if (amountString) {
    return Number(amountString);
  }
  return Number(balance.uiTokenAmount.uiAmount || 0);
}

function tokenSymbolForMint(mint: string): string {
  return KNOWN_TOKENS[mint]?.symbol || shortAddress(mint);
}

function buildDisplayName(symbol: string, name?: string): string {
  if (name && symbol && name !== symbol) {
    return `${name} (${symbol})`;
  }
  return symbol || name || "Unknown Token";
}

interface HeliusAssetMetadataResponse {
  result?: {
    id?: string;
    content?: {
      metadata?: {
        name?: string;
        symbol?: string;
      };
    };
    token_info?: {
      symbol?: string;
    };
  };
}

async function fetchMintMetadata(mints: string[]): Promise<Record<string, TokenMetadata>> {
  const uniqueMints = [...new Set(mints)].filter(Boolean);
  const resolved: Record<string, TokenMetadata> = {};

  for (const mint of uniqueMints) {
    if (mint === SOL_MINT) {
      resolved[mint] = {
        mint,
        symbol: "SOL",
        name: "Solana",
        display_name: "SOL",
      };
      continue;
    }

    if (KNOWN_TOKENS[mint]) {
      const symbol = KNOWN_TOKENS[mint].symbol;
      resolved[mint] = {
        mint,
        symbol,
        name: symbol,
        display_name: symbol,
      };
      continue;
    }

    try {
      const response = await withRpcRetry(`getAsset(${mint})`, () =>
        postJson<HeliusAssetMetadataResponse>(HELIUS_RPC_URL, {
          jsonrpc: "2.0",
          id: `asset-${mint}`,
          method: "getAsset",
          params: { id: mint },
        }),
      );
      const symbol = response.result?.token_info?.symbol || response.result?.content?.metadata?.symbol || shortAddress(mint);
      const name = response.result?.content?.metadata?.name;
      resolved[mint] = {
        mint,
        symbol,
        name,
        display_name: buildDisplayName(symbol, name),
      };
    } catch {
      const symbol = shortAddress(mint);
      resolved[mint] = {
        mint,
        symbol,
        display_name: symbol,
      };
    }

    await sleep(120);
  }

  return resolved;
}

function applyTokenMetadata(
  transactions: NormalizedWalletTransaction[],
  metadataByMint: Record<string, TokenMetadata>,
): NormalizedWalletTransaction[] {
  return transactions.map((transaction) => {
    const tokenChanges = transaction.token_changes.map((change) => ({
      ...change,
      symbol: metadataByMint[change.mint]?.display_name || change.symbol,
    }));
    const tradeLegs = transaction.trade_legs.map((leg) => ({
      ...leg,
      symbol: metadataByMint[leg.mint]?.display_name || leg.symbol,
    }));
    const buys = tradeLegs.filter((leg) => leg.direction === "buy");
    const sells = tradeLegs.filter((leg) => leg.direction === "sell");
    return {
      ...transaction,
      token_changes: tokenChanges,
      trade_legs: tradeLegs,
      primary_buy_symbol: buys[0]?.symbol,
      primary_sell_symbol: sells[0]?.symbol,
    };
  });
}

export function toWalletTokenChanges(
  address: string,
  preTokenBalances: TokenBalance[] | null | undefined,
  postTokenBalances: TokenBalance[] | null | undefined,
): WalletTokenChange[] {
  const accounts = new Map<string, { mint: string; pre: number; post: number }>();

  for (const balance of preTokenBalances || []) {
    if (balance.owner !== address) {
      continue;
    }
    const key = `${balance.accountIndex}:${balance.mint}`;
    accounts.set(key, {
      mint: balance.mint,
      pre: parseUiAmount(balance),
      post: accounts.get(key)?.post || 0,
    });
  }

  for (const balance of postTokenBalances || []) {
    if (balance.owner !== address) {
      continue;
    }
    const key = `${balance.accountIndex}:${balance.mint}`;
    accounts.set(key, {
      mint: balance.mint,
      pre: accounts.get(key)?.pre || 0,
      post: parseUiAmount(balance),
    });
  }

  const byMint = new Map<string, number>();
  for (const account of accounts.values()) {
    const delta = account.post - account.pre;
    if (Math.abs(delta) < 1e-9) {
      continue;
    }
    byMint.set(account.mint, (byMint.get(account.mint) || 0) + delta);
  }

  return [...byMint.entries()]
    .map(([mint, amount_change]) => ({
      mint,
      symbol: tokenSymbolForMint(mint),
      amount_change: roundAmount(amount_change),
    }))
    .sort((left, right) => Math.abs(right.amount_change) - Math.abs(left.amount_change));
}

function findWalletAccountIndex(transaction: ParsedTransactionWithMeta, address: string): number {
  const accountKeys = transaction.transaction.message.accountKeys || [];
  return accountKeys.findIndex((entry) => {
    const candidate = entry as PublicKey | { pubkey: PublicKey };
    const key = "pubkey" in (candidate as { pubkey?: PublicKey })
      ? (candidate as { pubkey: PublicKey }).pubkey.toBase58()
      : (candidate as PublicKey).toBase58();
    return key === address;
  });
}

function buildTradeLegs(tokenChanges: WalletTokenChange[], nativeChangeSol: number): WalletTradeLeg[] {
  const legs: WalletTradeLeg[] = tokenChanges.map((change) => ({
    mint: change.mint,
    symbol: change.symbol,
    direction: change.amount_change > 0 ? "buy" : "sell",
    amount: roundAmount(Math.abs(change.amount_change)),
  }));

  if (Math.abs(nativeChangeSol) > 0.001) {
    legs.push({
      mint: SOL_MINT,
      symbol: "SOL",
      direction: nativeChangeSol > 0 ? "buy" : "sell",
      amount: roundAmount(Math.abs(nativeChangeSol)),
    });
  }

  return legs.sort((left, right) => right.amount - left.amount);
}

export function classifyWalletTransaction(tokenChanges: WalletTokenChange[], nativeChangeSol: number): TransactionClassification {
  const hasBuys = tokenChanges.some((change) => change.amount_change > 0);
  const hasSells = tokenChanges.some((change) => change.amount_change < 0);
  const hasMeaningfulNativeMove = Math.abs(nativeChangeSol) > 0.001;

  if ((hasBuys && hasSells) || ((hasBuys || hasSells) && hasMeaningfulNativeMove)) {
    return "trade";
  }
  if (tokenChanges.length || hasMeaningfulNativeMove) {
    return "transfer";
  }
  return "other";
}

export function normalizeWalletTransaction(
  address: string,
  signatureInfo: ConfirmedSignatureInfo,
  transaction: ParsedTransactionWithMeta,
): NormalizedWalletTransaction | null {
  const meta = transaction.meta;
  if (!meta) {
    return null;
  }

  const walletIndex = findWalletAccountIndex(transaction, address);
  const preBalance = walletIndex >= 0 ? Number(meta.preBalances?.[walletIndex] || 0) : 0;
  const postBalance = walletIndex >= 0 ? Number(meta.postBalances?.[walletIndex] || 0) : 0;
  const nativeChangeSol = roundAmount((postBalance - preBalance) / 1e9);
  const tokenChanges = toWalletTokenChanges(address, meta.preTokenBalances, meta.postTokenBalances);
  const classification = classifyWalletTransaction(tokenChanges, nativeChangeSol);
  const tradeLegs = classification === "trade" ? buildTradeLegs(tokenChanges, nativeChangeSol) : [];

  const buys = tradeLegs.filter((leg) => leg.direction === "buy");
  const sells = tradeLegs.filter((leg) => leg.direction === "sell");

  return {
    signature: signatureInfo.signature,
    block_time: signatureInfo.blockTime || 0,
    success: meta.err == null,
    fee_sol: roundAmount(Number(meta.fee || 0) / 1e9),
    native_change_sol: nativeChangeSol,
    classification,
    token_changes: tokenChanges,
    trade_legs: tradeLegs,
    primary_buy_symbol: buys[0]?.symbol,
    primary_sell_symbol: sells[0]?.symbol,
  };
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function standardDeviation(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function topHistogramEntries(histogram: number[], count = 3, labeler?: (index: number) => string): Array<{ label: string; count: number }> {
  return histogram
    .map((value, index) => ({
      label: labeler ? labeler(index) : String(index),
      count: value,
    }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, count);
}

export function analyzeBehavioralPatterns(transactions: NormalizedWalletTransaction[]): {
  total_transactions: number;
  successful_transactions: number;
  failed_transactions: number;
  trade_transactions: number;
  transfer_transactions: number;
  active_days: number;
  first_seen_at?: string;
  last_seen_at?: string;
  average_transactions_per_active_day: number;
  average_gap_hours: number;
  median_gap_minutes: number;
  burstiness: number;
  top_active_hours_utc: Array<{ label: string; count: number }>;
  top_active_weekdays_utc: Array<{ label: string; count: number }>;
} {
  const sorted = [...transactions]
    .filter((transaction) => transaction.block_time > 0)
    .sort((left, right) => left.block_time - right.block_time);

  const hourHistogram = new Array(24).fill(0);
  const weekdayHistogram = new Array(7).fill(0);
  const activeDays = new Set<string>();
  const gapsHours: number[] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const transaction = sorted[index];
    const date = new Date(transaction.block_time * 1000);
    hourHistogram[date.getUTCHours()] += 1;
    weekdayHistogram[date.getUTCDay()] += 1;
    activeDays.add(date.toISOString().slice(0, 10));

    if (index > 0) {
      gapsHours.push((transaction.block_time - sorted[index - 1].block_time) / 3600);
    }
  }

  const meanGapHours = average(gapsHours);
  const stdGapHours = standardDeviation(gapsHours);
  const burstiness = meanGapHours + stdGapHours === 0 ? 0 : (stdGapHours - meanGapHours) / (stdGapHours + meanGapHours);

  return {
    total_transactions: transactions.length,
    successful_transactions: transactions.filter((transaction) => transaction.success).length,
    failed_transactions: transactions.filter((transaction) => !transaction.success).length,
    trade_transactions: transactions.filter((transaction) => transaction.classification === "trade").length,
    transfer_transactions: transactions.filter((transaction) => transaction.classification === "transfer").length,
    active_days: activeDays.size,
    first_seen_at: sorted[0] ? new Date(sorted[0].block_time * 1000).toISOString() : undefined,
    last_seen_at: sorted.at(-1) ? new Date(sorted.at(-1)!.block_time * 1000).toISOString() : undefined,
    average_transactions_per_active_day: roundAmount(transactions.length / Math.max(activeDays.size, 1), 4),
    average_gap_hours: roundAmount(meanGapHours, 4),
    median_gap_minutes: roundAmount(median(gapsHours) * 60, 4),
    burstiness: roundAmount(burstiness, 4),
    top_active_hours_utc: topHistogramEntries(hourHistogram, 3, (hour) => `${hour.toString().padStart(2, "0")}:00`),
    top_active_weekdays_utc: topHistogramEntries(
      weekdayHistogram,
      3,
      (day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day] || String(day),
    ),
  };
}

function buildTimeSeriesBins(timestamps: number[]): { counts: number[]; bin_hours: number } {
  if (timestamps.length < 2) {
    return { counts: timestamps.length ? [timestamps.length] : [], bin_hours: 1 };
  }

  const sorted = [...timestamps].sort((left, right) => left - right);
  const startHour = Math.floor(sorted[0] / 3600);
  const endHour = Math.floor(sorted.at(-1)! / 3600);
  let counts = new Array(endHour - startHour + 1).fill(0);

  for (const timestamp of sorted) {
    counts[Math.floor(timestamp / 3600) - startHour] += 1;
  }

  let binHours = 1;
  if (counts.length > MAX_FREQUENCY_BINS) {
    const factor = Math.ceil(counts.length / MAX_FREQUENCY_BINS);
    const rebinned: number[] = [];
    for (let index = 0; index < counts.length; index += factor) {
      rebinned.push(counts.slice(index, index + factor).reduce((sum, value) => sum + value, 0));
    }
    counts = rebinned;
    binHours = factor;
  }

  return { counts, bin_hours: binHours };
}

function labelPeriodHours(periodHours: number): string {
  if (Math.abs(periodHours - 24) <= 4) {
    return "daily";
  }
  if (Math.abs(periodHours - 168) <= 24) {
    return "weekly";
  }
  if (periodHours < 24) {
    return `${roundAmount(periodHours, 2)}h`;
  }
  return `${roundAmount(periodHours / 24, 2)}d`;
}

export function analyzeTradingFrequencyFft(transactions: NormalizedWalletTransaction[]): {
  bin_hours: number;
  sample_count: number;
  dominant_cycles: Array<{
    period_hours: number;
    label: string;
    strength: number;
  }>;
} {
  const timestamps = transactions.filter((transaction) => transaction.block_time > 0).map((transaction) => transaction.block_time);
  const { counts, bin_hours } = buildTimeSeriesBins(timestamps);

  if (counts.length < 8) {
    return {
      bin_hours,
      sample_count: counts.length,
      dominant_cycles: [],
    };
  }

  const centered = counts.map((value) => value - average(counts));
  const amplitudes: Array<{ period_hours: number; strength: number }> = [];
  for (let k = 1; k <= Math.floor(centered.length / 2); k += 1) {
    let real = 0;
    let imaginary = 0;
    for (let index = 0; index < centered.length; index += 1) {
      const angle = (2 * Math.PI * k * index) / centered.length;
      real += centered[index] * Math.cos(angle);
      imaginary -= centered[index] * Math.sin(angle);
    }
    const strength = Math.sqrt(real ** 2 + imaginary ** 2) / centered.length;
    const periodHours = (centered.length / k) * bin_hours;
    if (periodHours >= bin_hours * 2) {
      amplitudes.push({ period_hours: roundAmount(periodHours, 4), strength: roundAmount(strength, 6) });
    }
  }

  return {
    bin_hours,
    sample_count: counts.length,
    dominant_cycles: amplitudes
      .sort((left, right) => right.strength - left.strength)
      .slice(0, 3)
      .map((entry) => ({
        period_hours: entry.period_hours,
        label: labelPeriodHours(entry.period_hours),
        strength: entry.strength,
      })),
  };
}

function classifyHolderStyle(topShare: number, visibleTokenCount: number): string {
  if (topShare >= 0.65) {
    return "single_asset_concentrated";
  }
  if (topShare >= 0.45) {
    return "high_conviction_concentrated";
  }
  if (visibleTokenCount >= 10) {
    return "diversified_basket";
  }
  return "balanced_core";
}

export function analyzeHolderProfile(
  transactions: NormalizedWalletTransaction[],
  spotPortfolio: Awaited<ReturnType<typeof buildSpotPortfolio>>,
): {
  style: string;
  unique_assets_traded: number;
  currently_visible_holdings: number;
  top_holding_share: number;
  top_three_share: number;
  top_holdings: Array<{ symbol: string; value_usd: number; weight: number }>;
  net_accumulated_symbols: string[];
  net_distributed_symbols: string[];
} {
  const tradedSymbols = new Set<string>();
  const netBySymbol = new Map<string, number>();

  for (const transaction of transactions) {
    for (const change of transaction.token_changes) {
      tradedSymbols.add(change.symbol);
      netBySymbol.set(change.symbol, (netBySymbol.get(change.symbol) || 0) + change.amount_change);
    }
  }

  const visibleTokens = [...spotPortfolio.tokens]
    .filter((token) => token.value_usd > 0.01)
    .sort((left, right) => right.value_usd - left.value_usd);
  const totalVisibleValue = visibleTokens.reduce((sum, token) => sum + token.value_usd, 0);
  const topHoldings = visibleTokens.slice(0, 5).map((token) => ({
    symbol: token.symbol,
    value_usd: token.value_usd,
    weight: totalVisibleValue > 0 ? roundAmount(token.value_usd / totalVisibleValue, 4) : 0,
  }));
  const topHoldingShare = topHoldings[0]?.weight || 0;
  const topThreeShare = roundAmount(topHoldings.slice(0, 3).reduce((sum, token) => sum + token.weight, 0), 4);

  return {
    style: classifyHolderStyle(topHoldingShare, visibleTokens.length),
    unique_assets_traded: tradedSymbols.size,
    currently_visible_holdings: visibleTokens.length,
    top_holding_share: topHoldingShare,
    top_three_share: topThreeShare,
    top_holdings: topHoldings,
    net_accumulated_symbols: [...netBySymbol.entries()]
      .filter(([, value]) => value > 0)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([symbol]) => symbol),
    net_distributed_symbols: [...netBySymbol.entries()]
      .filter(([, value]) => value < 0)
      .sort((left, right) => left[1] - right[1])
      .slice(0, 5)
      .map(([symbol]) => symbol),
  };
}

export function analyzeTradePreferences(transactions: NormalizedWalletTransaction[]): {
  top_bought_symbols: Array<{ symbol: string; count: number }>;
  top_sold_symbols: Array<{ symbol: string; count: number }>;
  stablecoin_buy_count: number;
  stablecoin_sell_count: number;
  sol_buy_count: number;
  sol_sell_count: number;
} {
  const bought = new Map<string, number>();
  const sold = new Map<string, number>();
  let stablecoinBuyCount = 0;
  let stablecoinSellCount = 0;
  let solBuyCount = 0;
  let solSellCount = 0;
  const stableSymbols = new Set(["USDC", "USDT", "USDS", "CASH", "PYUSD"]);

  for (const transaction of transactions) {
    if (transaction.classification !== "trade") {
      continue;
    }
    if (transaction.primary_buy_symbol) {
      bought.set(transaction.primary_buy_symbol, (bought.get(transaction.primary_buy_symbol) || 0) + 1);
      if (stableSymbols.has(transaction.primary_buy_symbol)) {
        stablecoinBuyCount += 1;
      }
      if (transaction.primary_buy_symbol === "SOL") {
        solBuyCount += 1;
      }
    }
    if (transaction.primary_sell_symbol) {
      sold.set(transaction.primary_sell_symbol, (sold.get(transaction.primary_sell_symbol) || 0) + 1);
      if (stableSymbols.has(transaction.primary_sell_symbol)) {
        stablecoinSellCount += 1;
      }
      if (transaction.primary_sell_symbol === "SOL") {
        solSellCount += 1;
      }
    }
  }

  const summarize = (counts: Map<string, number>) =>
    [...counts.entries()]
      .map(([symbol, count]) => ({ symbol, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 8);

  return {
    top_bought_symbols: summarize(bought),
    top_sold_symbols: summarize(sold),
    stablecoin_buy_count: stablecoinBuyCount,
    stablecoin_sell_count: stablecoinSellCount,
    sol_buy_count: solBuyCount,
    sol_sell_count: solSellCount,
  };
}

export function summarizeRecentTrades(transactions: NormalizedWalletTransaction[]): Array<{
  timestamp: string;
  signature: string;
  sold?: string;
  bought?: string;
  classification: TransactionClassification;
  success: boolean;
  fee_sol: number;
  native_change_sol: number;
  token_changes: Array<{ symbol: string; amount_change: number }>;
}> {
  return [...transactions]
    .filter((transaction) => transaction.classification === "trade")
    .sort((left, right) => right.block_time - left.block_time)
    .slice(0, 10)
    .map((transaction) => ({
      timestamp: new Date(transaction.block_time * 1000).toISOString(),
      signature: transaction.signature,
      sold: transaction.primary_sell_symbol,
      bought: transaction.primary_buy_symbol,
      classification: transaction.classification,
      success: transaction.success,
      fee_sol: transaction.fee_sol,
      native_change_sol: transaction.native_change_sol,
      token_changes: transaction.token_changes.slice(0, 5).map((change) => ({
        symbol: change.symbol,
        amount_change: change.amount_change,
      })),
    }));
}

export function analyzeActivityWindows(transactions: NormalizedWalletTransaction[]): {
  last_7d: number;
  last_30d: number;
  last_90d: number;
} {
  const now = Math.floor(Date.now() / 1000);
  const countWithinDays = (days: number) => transactions.filter((transaction) => transaction.block_time >= now - days * 86400).length;
  return {
    last_7d: countWithinDays(7),
    last_30d: countWithinDays(30),
    last_90d: countWithinDays(90),
  };
}

function incrementNestedCounter(store: Map<string, Map<string, number>>, source: string, target: string): void {
  const bucket = store.get(source) || new Map<string, number>();
  bucket.set(target, (bucket.get(target) || 0) + 1);
  store.set(source, bucket);
}

function summarizeTransitions(
  transitions: Map<string, Map<string, number>>,
  minimumSupport = 2,
): Array<{ from: string; to: string; count: number; confidence: number }> {
  const rows: Array<{ from: string; to: string; count: number; confidence: number }> = [];
  for (const [source, targets] of transitions.entries()) {
    const total = [...targets.values()].reduce((sum, value) => sum + value, 0);
    const best = [...targets.entries()].sort((left, right) => right[1] - left[1])[0];
    if (!best || best[1] < minimumSupport) {
      continue;
    }
    rows.push({
      from: source,
      to: best[0],
      count: best[1],
      confidence: roundAmount(best[1] / total, 4),
    });
  }
  return rows.sort((left, right) => right.confidence - left.confidence || right.count - left.count).slice(0, 5);
}

function getPrimaryNonBaseSymbol(transaction: NormalizedWalletTransaction): string | undefined {
  const nonBaseChange = transaction.token_changes.find((change) => !BASE_ASSET_SYMBOLS.has(change.symbol));
  if (nonBaseChange) {
    return nonBaseChange.symbol;
  }
  const nonBaseTradeLeg = transaction.trade_legs.find((leg) => !BASE_ASSET_SYMBOLS.has(leg.symbol));
  return nonBaseTradeLeg?.symbol;
}

export function analyzeTradingPatterns(
  transactions: NormalizedWalletTransaction[],
  guardrails: WalletAnalysisGuardrails,
): {
  analyzed_trade_count: number;
  sample_warning?: string;
  recurring_rotations: Array<{ sold: string; bought: string; count: number }>;
  predictable_next_buys: Array<{ from: string; to: string; count: number; confidence: number }>;
  predictability_score: number;
} {
  const tradeTransactions = transactions.filter(
    (transaction) => transaction.classification === "trade" && transaction.primary_buy_symbol && transaction.primary_sell_symbol,
  );

  if (!guardrails.deep_pattern_analysis_enabled) {
    return {
      analyzed_trade_count: tradeTransactions.length,
      sample_warning: guardrails.reasons.join(" "),
      recurring_rotations: [],
      predictable_next_buys: [],
      predictability_score: 0,
    };
  }

  const sameTradeRotations = new Map<string, number>();
  const nextBuys = new Map<string, Map<string, number>>();

  for (let index = 0; index < tradeTransactions.length; index += 1) {
    const transaction = tradeTransactions[index];
    const rotationKey = `${transaction.primary_sell_symbol}->${transaction.primary_buy_symbol}`;
    sameTradeRotations.set(rotationKey, (sameTradeRotations.get(rotationKey) || 0) + 1);

    if (index > 0) {
      const previous = tradeTransactions[index - 1];
      const previousNonBase = getPrimaryNonBaseSymbol(previous);
      const currentNonBase = getPrimaryNonBaseSymbol(transaction);
      if (previousNonBase && currentNonBase) {
        incrementNestedCounter(nextBuys, previousNonBase, currentNonBase);
      }
    }
  }

  const recurringRotations = [...sameTradeRotations.entries()]
    .map(([pair, count]) => {
      const [sold, bought] = pair.split("->");
      return { sold, bought, count };
    })
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);

  const predictableNextBuys = summarizeTransitions(nextBuys);
  const predictabilityScore =
    predictableNextBuys.length > 0
      ? roundAmount(average(predictableNextBuys.map((entry) => entry.confidence)), 4)
      : 0;

  return {
    analyzed_trade_count: tradeTransactions.length,
    sample_warning: guardrails.incomplete_history ? "Pattern analysis is based on a capped recent sample, not full wallet history." : undefined,
    recurring_rotations: recurringRotations,
    predictable_next_buys: predictableNextBuys,
    predictability_score: predictabilityScore,
  };
}

export function analyzeSampledPnl(
  transactions: NormalizedWalletTransaction[],
  solPriceUsd = 0,
): {
  sol_price_usd: number;
  closed_round_trips: number;
  realized_pnl_sol: number;
  realized_pnl_usd: number;
  token_summaries: Array<{
    symbol: string;
    closed_round_trips: number;
    realized_pnl_sol: number;
    realized_pnl_usd: number;
    open_token_amount: number;
    open_cost_sol: number;
  }>;
} {
  const lots = new Map<string, Array<{ amount: number; cost_sol: number }>>();
  const perToken = new Map<string, { closed_round_trips: number; realized_pnl_sol: number }>();

  const directSwaps = transactions
    .filter(
      (transaction) =>
        transaction.classification === "trade" &&
        transaction.token_changes.length === 1 &&
        Math.abs(transaction.native_change_sol) > 0.001,
    )
    .sort((left, right) => left.block_time - right.block_time);

  for (const transaction of directSwaps) {
    const tokenChange = transaction.token_changes[0];
    const symbol = tokenChange.symbol;
    const queue = lots.get(symbol) || [];
    const stats = perToken.get(symbol) || { closed_round_trips: 0, realized_pnl_sol: 0 };

    if (tokenChange.amount_change > 0 && transaction.native_change_sol < 0) {
      queue.push({
        amount: tokenChange.amount_change,
        cost_sol: Math.abs(transaction.native_change_sol),
      });
      lots.set(symbol, queue);
      perToken.set(symbol, stats);
      continue;
    }

    if (tokenChange.amount_change < 0 && transaction.native_change_sol > 0) {
      let remainingAmount = Math.abs(tokenChange.amount_change);
      let consumedCostSol = 0;
      while (remainingAmount > 1e-9 && queue.length) {
        const lot = queue[0];
        const matchedAmount = Math.min(remainingAmount, lot.amount);
        const matchedCost = lot.cost_sol * (matchedAmount / lot.amount);
        consumedCostSol += matchedCost;
        lot.amount -= matchedAmount;
        lot.cost_sol -= matchedCost;
        remainingAmount -= matchedAmount;
        if (lot.amount <= 1e-9) {
          queue.shift();
        }
      }

      if (consumedCostSol > 0) {
        stats.closed_round_trips += 1;
        stats.realized_pnl_sol += transaction.native_change_sol - consumedCostSol;
      }
      lots.set(symbol, queue);
      perToken.set(symbol, stats);
    }
  }

  const tokenSummaries = [...perToken.entries()]
    .map(([symbol, stats]) => {
      const openLots = lots.get(symbol) || [];
      const openTokenAmount = openLots.reduce((sum, lot) => sum + lot.amount, 0);
      const openCostSol = openLots.reduce((sum, lot) => sum + lot.cost_sol, 0);
      const realizedPnlSol = roundAmount(stats.realized_pnl_sol, 6);
      return {
        symbol,
        closed_round_trips: stats.closed_round_trips,
        realized_pnl_sol: realizedPnlSol,
        realized_pnl_usd: roundAmount(realizedPnlSol * solPriceUsd, 2),
        open_token_amount: roundAmount(openTokenAmount, 6),
        open_cost_sol: roundAmount(openCostSol, 6),
      };
    })
    .sort((left, right) => Math.abs(right.realized_pnl_sol) - Math.abs(left.realized_pnl_sol));

  const realizedPnlSol = tokenSummaries.reduce((sum, entry) => sum + entry.realized_pnl_sol, 0);
  return {
    sol_price_usd: roundAmount(solPriceUsd, 4),
    closed_round_trips: tokenSummaries.reduce((sum, entry) => sum + entry.closed_round_trips, 0),
    realized_pnl_sol: roundAmount(realizedPnlSol, 6),
    realized_pnl_usd: roundAmount(realizedPnlSol * solPriceUsd, 2),
    token_summaries: tokenSummaries,
  };
}

export function buildTokenConclusions(
  transactions: NormalizedWalletTransaction[],
  metadataByMint: Record<string, TokenMetadata>,
  sampledPnl: ReturnType<typeof analyzeSampledPnl>,
): Array<{
  mint: string;
  symbol: string;
  name?: string;
  display_name: string;
  trade_count: number;
  buy_count: number;
  sell_count: number;
  last_trade_at?: string;
  realized_pnl_sol?: number;
  realized_pnl_usd?: number;
  conclusion: string;
}> {
  const byMint = new Map<
    string,
    { trade_count: number; buy_count: number; sell_count: number; last_trade_at?: string; symbol: string }
  >();

  for (const transaction of transactions) {
    if (transaction.classification !== "trade") {
      continue;
    }
    for (const change of transaction.token_changes) {
      if (BASE_ASSET_SYMBOLS.has(change.symbol)) {
        continue;
      }
      const bucket = byMint.get(change.mint) || {
        trade_count: 0,
        buy_count: 0,
        sell_count: 0,
        last_trade_at: undefined,
        symbol: change.symbol,
      };
      bucket.trade_count += 1;
      if (change.amount_change > 0) {
        bucket.buy_count += 1;
      } else if (change.amount_change < 0) {
        bucket.sell_count += 1;
      }
      bucket.last_trade_at = new Date(transaction.block_time * 1000).toISOString();
      byMint.set(change.mint, bucket);
    }
  }

  const pnlBySymbol = new Map(sampledPnl.token_summaries.map((entry) => [entry.symbol, entry]));

  return [...byMint.entries()]
    .map(([mint, stats]) => {
      const metadata = metadataByMint[mint] || {
        mint,
        symbol: stats.symbol,
        display_name: stats.symbol,
      };
      const pnl = pnlBySymbol.get(metadata.display_name);
      const realizedPnlUsd = pnl?.realized_pnl_usd;
      const tone =
        realizedPnlUsd == null
          ? "insufficient sampled PnL history"
          : realizedPnlUsd > 0
            ? `profitable sampled exits of ${formatUsd(realizedPnlUsd)}`
            : realizedPnlUsd < 0
              ? `sampled losses of ${formatUsd(Math.abs(realizedPnlUsd))}`
              : "flat sampled PnL";
      const bias =
        stats.buy_count > stats.sell_count ? "net accumulation bias" : stats.sell_count > stats.buy_count ? "distribution bias" : "balanced entry/exit flow";
      return {
        mint,
        symbol: metadata.symbol,
        name: metadata.name,
        display_name: metadata.display_name,
        trade_count: stats.trade_count,
        buy_count: stats.buy_count,
        sell_count: stats.sell_count,
        last_trade_at: stats.last_trade_at,
        realized_pnl_sol: pnl?.realized_pnl_sol,
        realized_pnl_usd: realizedPnlUsd,
        conclusion: `${metadata.display_name} was traded ${stats.trade_count} times in the sample with ${bias} and ${tone}.`,
      };
    })
    .sort((left, right) => right.trade_count - left.trade_count)
    .slice(0, 8);
}

export function buildWalletConclusions(args: {
  guardrails: WalletAnalysisGuardrails;
  holderAnalysis: ReturnType<typeof analyzeHolderProfile>;
  sampledPnl: ReturnType<typeof analyzeSampledPnl>;
  tradingPatterns: ReturnType<typeof analyzeTradingPatterns>;
  tokenConclusions: ReturnType<typeof buildTokenConclusions>;
}): string[] {
  const lines: string[] = [];
  if (args.guardrails.incomplete_history) {
    lines.push("History is capped, so conclusions reflect a recent sample rather than the wallet's full lifetime.");
  }
  lines.push(
    `Portfolio posture is ${args.holderAnalysis.style} with the top holding at ${(args.holderAnalysis.top_holding_share * 100).toFixed(1)}% and the top 3 holdings at ${(args.holderAnalysis.top_three_share * 100).toFixed(1)}%.`,
  );
  if (args.sampledPnl.closed_round_trips > 0) {
    const sign = args.sampledPnl.realized_pnl_usd >= 0 ? "positive" : "negative";
    lines.push(
      `Sampled realized PnL across ${args.sampledPnl.closed_round_trips} closed round trips is ${sign}: ${formatUsd(args.sampledPnl.realized_pnl_usd)}.`,
    );
  } else {
    lines.push("No closed direct SOL/token round trips were found in the sample, so realized PnL confidence is low.");
  }
  if (args.tradingPatterns.predictable_next_buys.length) {
    const topPattern = args.tradingPatterns.predictable_next_buys[0];
    lines.push(
      `Recent speculative flow is repetitive: after trading ${topPattern.from}, the next non-base asset traded was ${topPattern.to} with ${(topPattern.confidence * 100).toFixed(1)}% confidence in-sample.`,
    );
  }
  if (args.tokenConclusions.length) {
    lines.push(`Most active sampled token: ${args.tokenConclusions[0].conclusion}`);
  }
  return lines;
}

function classifyActivityLevel(avgTxPerDay: number): "low" | "medium" | "high" {
  if (avgTxPerDay >= 25) {
    return "high";
  }
  if (avgTxPerDay >= 8) {
    return "medium";
  }
  return "low";
}

function classifyConcentrationLevel(topHoldingShare: number, topThreeShare: number): "low" | "medium" | "high" {
  if (topHoldingShare >= 0.5 || topThreeShare >= 0.8) {
    return "high";
  }
  if (topHoldingShare >= 0.25 || topThreeShare >= 0.6) {
    return "medium";
  }
  return "low";
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildAiDigest(input: AiDigestInput): {
  sample_quality: {
    tx_sample_size: number;
    max_days: number;
    history_capped: boolean;
    confidence_score: number;
  };
  wallet_profile: {
    activity_level: "low" | "medium" | "high";
    concentration_level: "low" | "medium" | "high";
    style: string;
    bot_like: boolean;
  };
  dominant_entities: {
    portfolio_anchor?: string;
    speculative_focus?: string;
    dominant_pnl_driver?: string;
    largest_loser?: string;
  };
  strategy_signals: {
    repetitive_speculation_score: number;
    profitability_score: number;
    accumulation_bias: string[];
    distribution_bias: string[];
  };
  key_takeaways: string[];
} {
  const portfolioAnchor = input.holderAnalysis.top_holdings[0]?.symbol;
  const speculativeFocus = input.tokenConclusions[0]?.display_name;
  const bestToken = [...input.sampledPnl.token_summaries].sort((left, right) => right.realized_pnl_usd - left.realized_pnl_usd)[0];
  const worstToken = [...input.sampledPnl.token_summaries].sort((left, right) => left.realized_pnl_usd - right.realized_pnl_usd)[0];

  let confidenceScore = 80;
  if (input.guardrails.incomplete_history) {
    confidenceScore -= 20;
  }
  if (input.sampledPnl.closed_round_trips < 3) {
    confidenceScore -= 15;
  }
  if (input.behaviouralPatterns.trade_transactions < 8) {
    confidenceScore -= 10;
  }
  if (input.guardrails.suspected_bot_wallet) {
    confidenceScore -= 15;
  }

  const profitabilityBase =
    input.sampledPnl.closed_round_trips === 0
      ? 50
      : 50 + Math.max(-35, Math.min(35, input.sampledPnl.realized_pnl_usd / 25));

  const keyTakeaways: string[] = [];
  if (input.guardrails.incomplete_history) {
    keyTakeaways.push("Recent-window analysis only because the transaction sample hit the configured cap.");
  }
  keyTakeaways.push(
    `Wallet style is ${input.holderAnalysis.style} with ${Math.round(input.holderAnalysis.top_holding_share * 100)}% in the top holding.`,
  );
  if (input.sampledPnl.closed_round_trips > 0) {
    keyTakeaways.push(
      `Sampled realized PnL is ${formatUsd(input.sampledPnl.realized_pnl_usd)} across ${input.sampledPnl.closed_round_trips} closed round trips.`,
    );
  }
  if (input.tradingPatterns.predictable_next_buys.length > 0) {
    const dominantPattern = input.tradingPatterns.predictable_next_buys[0];
    keyTakeaways.push(
      `Speculative flow is repetitive: ${dominantPattern.from} reappears as the next non-base trade with ${(dominantPattern.confidence * 100).toFixed(1)}% confidence.`,
    );
  }
  if (speculativeFocus) {
    keyTakeaways.push(`Main sampled speculative focus is ${speculativeFocus}.`);
  }

  return {
    sample_quality: {
      tx_sample_size: input.sampledTransactions,
      max_days: input.maxDays,
      history_capped: input.guardrails.incomplete_history,
      confidence_score: clampScore(confidenceScore),
    },
    wallet_profile: {
      activity_level: classifyActivityLevel(input.behaviouralPatterns.average_transactions_per_active_day),
      concentration_level: classifyConcentrationLevel(
        input.holderAnalysis.top_holding_share,
        input.holderAnalysis.top_three_share,
      ),
      style: input.holderAnalysis.style,
      bot_like: input.guardrails.suspected_bot_wallet,
    },
    dominant_entities: {
      portfolio_anchor: portfolioAnchor,
      speculative_focus: speculativeFocus,
      dominant_pnl_driver: bestToken?.realized_pnl_usd > 0 ? bestToken.symbol : undefined,
      largest_loser: worstToken?.realized_pnl_usd < 0 ? worstToken.symbol : undefined,
    },
    strategy_signals: {
      repetitive_speculation_score: clampScore(input.tradingPatterns.predictability_score * 100),
      profitability_score: clampScore(profitabilityBase),
      accumulation_bias: input.holderAnalysis.net_accumulated_symbols.slice(0, 3),
      distribution_bias: input.holderAnalysis.net_distributed_symbols.slice(0, 3),
    },
    key_takeaways: keyTakeaways.slice(0, 5),
  };
}

export function buildGuardrails(
  transactions: NormalizedWalletTransaction[],
  truncated: boolean,
  allowHighFrequency = false,
): WalletAnalysisGuardrails {
  const behavior = analyzeBehavioralPatterns(transactions);
  const reasons: string[] = [];

  if (truncated) {
    reasons.push("Transaction sample hit the configured cap, so the wallet history is incomplete.");
  }
  const botReasons: string[] = [];
  if (behavior.average_transactions_per_active_day >= BOT_TX_PER_DAY_THRESHOLD) {
    botReasons.push(`Average activity is ${behavior.average_transactions_per_active_day} tx/day, which is bot-like.`);
  }
  if (transactions.length >= 150 && behavior.median_gap_minutes > 0 && behavior.median_gap_minutes <= BOT_MEDIAN_GAP_MINUTES) {
    botReasons.push(`Median gap is ${behavior.median_gap_minutes} minutes, which indicates very dense automation.`);
  }

  reasons.push(...botReasons);
  const suspectedBotWallet = botReasons.length > 0;
  return {
    sampled_transaction_count: transactions.length,
    truncated,
    incomplete_history: truncated,
    suspected_bot_wallet: suspectedBotWallet,
    deep_pattern_analysis_enabled: allowHighFrequency || !suspectedBotWallet,
    reasons,
  };
}

async function fetchWalletSignatures(
  connection: Connection,
  address: string,
  maxTransactions: number,
  maxDays: number,
): Promise<{ signatures: ConfirmedSignatureInfo[]; truncated: boolean }> {
  const publicKey = new PublicKey(address);
  const cutoffTimestamp = Math.floor(Date.now() / 1000) - maxDays * 24 * 60 * 60;
  const signatures: ConfirmedSignatureInfo[] = [];
  let before: string | undefined;
  let reachedHistoryLimit = false;

  while (signatures.length < maxTransactions) {
    const batchLimit = Math.min(MAX_SIGNATURE_BATCH, maxTransactions - signatures.length);
    const batch = await withRpcRetry("getSignaturesForAddress", () =>
      connection.getSignaturesForAddress(publicKey, { before, limit: batchLimit }, "confirmed"),
    );
    if (!batch.length) {
      break;
    }

    for (const signature of batch) {
      if (signature.blockTime && signature.blockTime < cutoffTimestamp) {
        reachedHistoryLimit = true;
        break;
      }
      signatures.push(signature);
      if (signatures.length >= maxTransactions) {
        break;
      }
    }

    if (reachedHistoryLimit || batch.length < batchLimit || signatures.length >= maxTransactions) {
      break;
    }

    before = batch.at(-1)?.signature;
    await sleep(100);
  }

  let truncated = signatures.length >= maxTransactions;
  if (truncated && signatures.length) {
    const nextBatch = await withRpcRetry("getSignaturesForAddress(next page)", () =>
      connection.getSignaturesForAddress(publicKey, { before: signatures.at(-1)?.signature, limit: 1 }, "confirmed"),
    );
    truncated = nextBatch.some((signature) => !signature.blockTime || signature.blockTime >= cutoffTimestamp);
  }

  return { signatures, truncated };
}

async function fetchParsedTransactions(
  connection: Connection,
  signatures: ConfirmedSignatureInfo[],
): Promise<Array<{ signatureInfo: ConfirmedSignatureInfo; transaction: ParsedTransactionWithMeta }>> {
  const parsed: Array<{ signatureInfo: ConfirmedSignatureInfo; transaction: ParsedTransactionWithMeta }> = [];

  for (const signatureInfo of signatures) {
    const transaction = await withRpcRetry("getParsedTransaction", () =>
      connection.getParsedTransaction(signatureInfo.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      }),
    );
    if (transaction) {
      parsed.push({ signatureInfo, transaction });
    }
    await sleep(150);
  }

  return parsed;
}

export async function analyzeWalletTransactions(address: string, options?: {
  max_transactions?: number;
  max_days?: number;
  allow_high_frequency?: boolean;
}): Promise<{
  address: string;
  ai_digest: ReturnType<typeof buildAiDigest>;
  sampled_transactions: number;
  max_transactions: number;
  max_days: number;
  activity_windows: ReturnType<typeof analyzeActivityWindows>;
  guardrails: WalletAnalysisGuardrails;
  behavioural_patterns: ReturnType<typeof analyzeBehavioralPatterns>;
  holder_analysis: ReturnType<typeof analyzeHolderProfile>;
  fft_trading_frequency: ReturnType<typeof analyzeTradingFrequencyFft>;
  trade_preferences: ReturnType<typeof analyzeTradePreferences>;
  sampled_pnl: ReturnType<typeof analyzeSampledPnl>;
  trading_patterns: ReturnType<typeof analyzeTradingPatterns>;
  resolved_tokens: TokenMetadata[];
  token_conclusions: ReturnType<typeof buildTokenConclusions>;
  summary_conclusions: string[];
  recent_trades: ReturnType<typeof summarizeRecentTrades>;
}> {
  const maxTransactions = Math.max(25, options?.max_transactions || DEFAULT_MAX_TRANSACTIONS);
  const maxDays = Math.max(1, options?.max_days || DEFAULT_MAX_DAYS);
  const allowHighFrequency = Boolean(options?.allow_high_frequency);

  const connection = getConnection();
  const [{ signatures, truncated }, spotPortfolio] = await Promise.all([
    fetchWalletSignatures(connection, address, maxTransactions, maxDays),
    buildSpotPortfolio(address),
  ]);
  const fetched = await fetchParsedTransactions(connection, signatures);
  const normalized = fetched
    .map(({ signatureInfo, transaction }) => normalizeWalletTransaction(address, signatureInfo, transaction))
    .filter((transaction): transaction is NormalizedWalletTransaction => Boolean(transaction))
    .sort((left, right) => left.block_time - right.block_time);
  const metadataByMint = await fetchMintMetadata(
    normalized.flatMap((transaction) => transaction.token_changes.map((change) => change.mint)),
  );
  const enrichedTransactions = applyTokenMetadata(normalized, metadataByMint);
  const guardrails = buildGuardrails(enrichedTransactions, truncated, allowHighFrequency);
  const solPriceUsd = spotPortfolio.tokens.find((token) => token.symbol === "SOL")?.price_usd || 0;
  const sampledPnl = analyzeSampledPnl(enrichedTransactions, solPriceUsd);
  const tradingPatterns = analyzeTradingPatterns(enrichedTransactions, guardrails);
  const tokenConclusions = buildTokenConclusions(enrichedTransactions, metadataByMint, sampledPnl);
  const holderAnalysis = analyzeHolderProfile(enrichedTransactions, spotPortfolio);
  const activityWindows = analyzeActivityWindows(enrichedTransactions);
  const behaviouralPatterns = analyzeBehavioralPatterns(enrichedTransactions);
  const tradePreferences = analyzeTradePreferences(enrichedTransactions);
  const aiDigest = buildAiDigest({
    maxDays,
    sampledTransactions: enrichedTransactions.length,
    activityWindows,
    guardrails,
    behaviouralPatterns,
    holderAnalysis,
    tradePreferences,
    sampledPnl,
    tradingPatterns,
    tokenConclusions,
  });

  return {
    address,
    ai_digest: aiDigest,
    sampled_transactions: enrichedTransactions.length,
    max_transactions: maxTransactions,
    max_days: maxDays,
    activity_windows: activityWindows,
    guardrails,
    behavioural_patterns: behaviouralPatterns,
    holder_analysis: holderAnalysis,
    fft_trading_frequency: analyzeTradingFrequencyFft(enrichedTransactions),
    trade_preferences: tradePreferences,
    sampled_pnl: sampledPnl,
    trading_patterns: tradingPatterns,
    resolved_tokens: Object.values(metadataByMint),
    token_conclusions: tokenConclusions,
    summary_conclusions: buildWalletConclusions({
      guardrails,
      holderAnalysis,
      sampledPnl,
      tradingPatterns,
      tokenConclusions,
    }),
    recent_trades: summarizeRecentTrades(enrichedTransactions),
  };
}

function renderTextReport(result: Awaited<ReturnType<typeof analyzeWalletTransactions>>): string {
  const lines: string[] = [];
  lines.push(`TrackerClaw - Wallet Transaction Analysis for ${result.address}`);
  lines.push("");
  lines.push(`Sampled transactions: ${result.sampled_transactions} (window ${result.max_days}d, cap ${result.max_transactions})`);
  lines.push(`Guardrails: ${result.guardrails.suspected_bot_wallet ? "bot-like/high-frequency" : "normal"}`);
  if (result.guardrails.reasons.length) {
    lines.push(`Guard reasons: ${result.guardrails.reasons.join(" | ")}`);
  }

  lines.push("");
  lines.push("Behavioural patterns");
  lines.push(`- Trades: ${result.behavioural_patterns.trade_transactions}`);
  lines.push(`- Transfers: ${result.behavioural_patterns.transfer_transactions}`);
  lines.push(`- Active days: ${result.behavioural_patterns.active_days}`);
  lines.push(`- Avg tx/day: ${result.behavioural_patterns.average_transactions_per_active_day}`);
  lines.push(`- Median gap: ${result.behavioural_patterns.median_gap_minutes} min`);
  lines.push(`- Top active hours UTC: ${result.behavioural_patterns.top_active_hours_utc.map((entry) => `${entry.label} (${entry.count})`).join(", ") || "n/a"}`);

  lines.push("");
  lines.push("Holder analysis");
  lines.push(`- Style: ${result.holder_analysis.style}`);
  lines.push(`- Top holding share: ${(result.holder_analysis.top_holding_share * 100).toFixed(2)}%`);
  lines.push(`- Top 3 share: ${(result.holder_analysis.top_three_share * 100).toFixed(2)}%`);
  lines.push(
    `- Top holdings: ${result.holder_analysis.top_holdings.map((holding) => `${holding.symbol} ${formatUsd(holding.value_usd)}`).join(", ") || "n/a"}`,
  );

  lines.push("");
  lines.push("FFT trading frequency");
  lines.push(
    `- Dominant cycles: ${
      result.fft_trading_frequency.dominant_cycles.map((cycle) => `${cycle.label} (${cycle.strength})`).join(", ") || "insufficient data"
    }`,
  );

  lines.push("");
  lines.push("Trading patterns");
  if (!result.guardrails.deep_pattern_analysis_enabled && result.trading_patterns.sample_warning) {
    lines.push(`- Skipped: ${result.trading_patterns.sample_warning}`);
  } else {
    if (result.trading_patterns.sample_warning) {
      lines.push(`- Note: ${result.trading_patterns.sample_warning}`);
    }
    lines.push(
      `- Recurring rotations: ${
        result.trading_patterns.recurring_rotations.map((rotation) => `${rotation.sold}->${rotation.bought} (${rotation.count})`).join(", ") ||
        "n/a"
      }`,
    );
    lines.push(
      `- Predictable next buys: ${
        result.trading_patterns.predictable_next_buys
          .map((entry) => `${entry.from}->${entry.to} (${(entry.confidence * 100).toFixed(0)}%, n=${entry.count})`)
          .join(", ") || "n/a"
      }`,
    );
    lines.push(`- Predictability score: ${result.trading_patterns.predictability_score}`);
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const address = args[0];
  const asJson = args.includes("--json");
  const allowHighFrequency = args.includes("--allow-high-frequency");

  const maxTransactionsIndex = args.indexOf("--max-transactions");
  const maxDaysIndex = args.indexOf("--days");
  const maxTransactions = maxTransactionsIndex >= 0 ? Number(args[maxTransactionsIndex + 1]) : DEFAULT_MAX_TRANSACTIONS;
  const maxDays = maxDaysIndex >= 0 ? Number(args[maxDaysIndex + 1]) : DEFAULT_MAX_DAYS;

  if (!address) {
    console.error(
      "Usage: tsx scriptsTS/wallet_transaction_analysis.ts <solana-address> [--json] [--days 90] [--max-transactions 400] [--allow-high-frequency]",
    );
    process.exit(1);
  }

  try {
    const result = await analyzeWalletTransactions(address, {
      max_transactions: maxTransactions,
      max_days: maxDays,
      allow_high_frequency: allowHighFrequency,
    });

    console.log(asJson ? JSON.stringify(result, null, 2) : renderTextReport(result));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("wallet_transaction_analysis.ts")) {
  void main();
}
