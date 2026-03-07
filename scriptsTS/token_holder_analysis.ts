#!/usr/bin/env node

import { Connection, ParsedAccountData, PublicKey, SystemProgram, type AccountInfo } from "@solana/web3.js";

import { buildSpotPortfolio, getWalletPortfolioJson } from "./portfolio_api.js";
import { loadEnv, requiredEnv } from "./lib/env.js";
import { roundAmount } from "./lib/utils.js";

loadEnv();

type OwnerType = "wallet" | "program_owned" | "unknown";
type HolderRelevance = "relevant" | "non_relevant";

export interface TokenAccountSnapshot {
  owner: string;
  raw_amount: string;
  decimals: number;
  token_account: string;
}

export interface AggregatedHolderBalance {
  owner: string;
  raw_amount: bigint;
  decimals: number;
  token_amount: string;
  token_account_count: number;
  token_accounts: string[];
}

interface HolderPortfolioSummary {
  portfolio_total_usd: number;
  spot_total_usd: number;
  defi_total_usd: number;
  top_holdings: Array<{
    symbol: string;
    mint: string;
    amount: number;
    value_usd: number;
  }>;
  analysis_error?: string;
}

interface HolderRelevanceSummary {
  relevance: HolderRelevance;
  reason: string;
}

export function formatTokenAmount(rawAmount: bigint, decimals: number): string {
  const sign = rawAmount < 0n ? "-" : "";
  const value = rawAmount < 0n ? -rawAmount : rawAmount;
  if (decimals <= 0) {
    return `${sign}${value.toString()}`;
  }

  const raw = value.toString().padStart(decimals + 1, "0");
  const whole = raw.slice(0, -decimals) || "0";
  const fraction = raw.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

export function aggregateHolderBalances(accounts: TokenAccountSnapshot[]): AggregatedHolderBalance[] {
  const byOwner = new Map<string, { raw_amount: bigint; decimals: number; token_accounts: string[] }>();

  for (const account of accounts) {
    const rawAmount = BigInt(account.raw_amount || "0");
    if (rawAmount <= 0n) {
      continue;
    }

    const existing = byOwner.get(account.owner) || {
      raw_amount: 0n,
      decimals: account.decimals,
      token_accounts: [],
    };
    existing.raw_amount += rawAmount;
    existing.decimals = account.decimals;
    existing.token_accounts.push(account.token_account);
    byOwner.set(account.owner, existing);
  }

  return [...byOwner.entries()]
    .map(([owner, data]) => ({
      owner,
      raw_amount: data.raw_amount,
      decimals: data.decimals,
      token_amount: formatTokenAmount(data.raw_amount, data.decimals),
      token_account_count: data.token_accounts.length,
      token_accounts: data.token_accounts,
    }))
    .sort((left, right) => {
      if (left.raw_amount === right.raw_amount) {
        return left.owner.localeCompare(right.owner);
      }
      return left.raw_amount > right.raw_amount ? -1 : 1;
    });
}

function getConnection(): Connection {
  const apiKey = requiredEnv("HELIUS_API_KEY");
  return new Connection(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, "confirmed");
}

function isParsedAccountData(data: ParsedAccountData | Buffer): data is ParsedAccountData {
  return "parsed" in data;
}

function parseTokenAccountSnapshot(
  account: { pubkey: PublicKey; account: AccountInfo<Buffer | ParsedAccountData> },
): TokenAccountSnapshot | null {
  if (!isParsedAccountData(account.account.data)) {
    return null;
  }

  const parsed = account.account.data.parsed as {
    info?: {
      owner?: string;
      tokenAmount?: {
        amount?: string;
        decimals?: number;
      };
    };
  };
  const owner = parsed.info?.owner;
  const amount = parsed.info?.tokenAmount?.amount;
  const decimals = Number(parsed.info?.tokenAmount?.decimals || 0);
  if (!owner || !amount) {
    return null;
  }

  return {
    owner,
    raw_amount: amount,
    decimals,
    token_account: account.pubkey.toBase58(),
  };
}

function inferOwnerType(accountInfo: AccountInfo<Buffer> | null): OwnerType {
  if (!accountInfo) {
    return "unknown";
  }
  if (!accountInfo.executable && accountInfo.owner.equals(SystemProgram.programId)) {
    return "wallet";
  }
  return "program_owned";
}

export function classifyHolderRelevance(ownerType: OwnerType): HolderRelevanceSummary {
  if (ownerType === "program_owned") {
    return {
      relevance: "non_relevant",
      reason: "Program-owned account. Likely liquidity pool, escrow, vesting, or other contract-controlled balance.",
    };
  }
  if (ownerType === "unknown") {
    return {
      relevance: "non_relevant",
      reason: "Owner account could not be resolved, so this balance should not be treated as a user holder by default.",
    };
  }
  return {
    relevance: "relevant",
    reason: "Wallet-owned account.",
  };
}

function summarizeTopHoldings(
  tokens: Array<{ symbol: string; mint: string; amount: number; value_usd: number }>,
  limit = 3,
): HolderPortfolioSummary["top_holdings"] {
  return tokens
    .filter((token) => token.value_usd > 0.01)
    .sort((left, right) => right.value_usd - left.value_usd)
    .slice(0, limit)
    .map((token) => ({
      symbol: token.symbol,
      mint: token.mint,
      amount: roundAmount(token.amount),
      value_usd: Number(token.value_usd.toFixed(2)),
    }));
}

async function getMintProgramId(connection: Connection, tokenMint: string): Promise<string> {
  const accountInfo = await connection.getParsedAccountInfo(new PublicKey(tokenMint), "confirmed");
  const value = accountInfo.value;
  if (!value) {
    throw new Error(`Mint account not found for ${tokenMint}`);
  }
  return value.owner.toBase58();
}

async function getMintTokenAccounts(connection: Connection, tokenMint: string): Promise<TokenAccountSnapshot[]> {
  const programId = await getMintProgramId(connection, tokenMint);
  const accounts = await connection.getParsedProgramAccounts(new PublicKey(programId), {
    commitment: "confirmed",
    filters: [{ memcmp: { offset: 0, bytes: tokenMint } }],
  });

  return accounts
    .map((account) => parseTokenAccountSnapshot(account))
    .filter((account): account is TokenAccountSnapshot => Boolean(account));
}

async function analyzeHolderPortfolio(address: string): Promise<HolderPortfolioSummary> {
  try {
    const portfolio = await getWalletPortfolioJson(address);
    return {
      portfolio_total_usd: Number(portfolio.totals.combined_usd.toFixed(2)),
      spot_total_usd: Number(portfolio.totals.spot_usd.toFixed(2)),
      defi_total_usd: Number(portfolio.totals.defi_usd.toFixed(2)),
      top_holdings: summarizeTopHoldings(portfolio.spot.tokens),
    };
  } catch (error) {
    const spot = await buildSpotPortfolio(address);
    return {
      portfolio_total_usd: Number(spot.total_usd.toFixed(2)),
      spot_total_usd: Number(spot.total_usd.toFixed(2)),
      defi_total_usd: 0,
      top_holdings: summarizeTopHoldings(spot.tokens),
      analysis_error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function buildTopTokenHoldersReport(tokenMint: string, limit = 10): Promise<{
  token_mint: string;
  token_program: string;
  generated_at: string;
  analyzed_holder_count: number;
  relevant_holder_count: number;
  non_relevant_holder_count: number;
  holders: Array<{
    rank: number;
    owner: string;
    owner_type: OwnerType;
    relevance: HolderRelevance;
    relevance_reason: string;
    token_amount: string;
    token_account_count: number;
    portfolio_total_usd: number;
    spot_total_usd: number;
    defi_total_usd: number;
    top_holdings: HolderPortfolioSummary["top_holdings"];
    analysis_error?: string;
  }>;
}> {
  new PublicKey(tokenMint);

  const connection = getConnection();
  const tokenProgram = await getMintProgramId(connection, tokenMint);
  const aggregatedHolders = aggregateHolderBalances(await getMintTokenAccounts(connection, tokenMint)).slice(0, limit);
  const ownerInfos = await connection.getMultipleAccountsInfo(
    aggregatedHolders.map((holder) => new PublicKey(holder.owner)),
    "confirmed",
  );

  const holders = [];
  for (let index = 0; index < aggregatedHolders.length; index += 1) {
    const holder = aggregatedHolders[index];
    const ownerType = inferOwnerType(ownerInfos[index] || null);
    const relevance = classifyHolderRelevance(ownerType);
    const portfolio = await analyzeHolderPortfolio(holder.owner);
    holders.push({
      rank: index + 1,
      owner: holder.owner,
      owner_type: ownerType,
      relevance: relevance.relevance,
      relevance_reason: relevance.reason,
      token_amount: holder.token_amount,
      token_account_count: holder.token_account_count,
      portfolio_total_usd: portfolio.portfolio_total_usd,
      spot_total_usd: portfolio.spot_total_usd,
      defi_total_usd: portfolio.defi_total_usd,
      top_holdings: portfolio.top_holdings,
      analysis_error: portfolio.analysis_error,
    });
  }

  return {
    token_mint: tokenMint,
    token_program: tokenProgram,
    generated_at: new Date().toISOString(),
    analyzed_holder_count: holders.length,
    relevant_holder_count: holders.filter((holder) => holder.relevance === "relevant").length,
    non_relevant_holder_count: holders.filter((holder) => holder.relevance === "non_relevant").length,
    holders,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const tokenMint = args[0];
  const limitArgIndex = args.indexOf("--limit");
  const limit = limitArgIndex >= 0 ? Number(args[limitArgIndex + 1] || 10) : 10;

  if (!tokenMint) {
    console.error("Usage: tsx scriptsTS/token_holder_analysis.ts <token-mint> [--limit 10]");
    process.exit(1);
  }

  try {
    console.log(JSON.stringify(await buildTopTokenHoldersReport(tokenMint, limit), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("token_holder_analysis.ts")) {
  void main();
}
