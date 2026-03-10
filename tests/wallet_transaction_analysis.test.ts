import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeBehavioralPatterns,
  analyzeTradingFrequencyFft,
  analyzeTradingPatterns,
  analyzeSampledPnl,
  buildAiDigest,
  buildGuardrails,
  classifyWalletTransaction,
  toWalletTokenChanges,
  type NormalizedWalletTransaction,
} from "../scriptsTS/wallet_transaction_analysis.ts";

function makeTrade(
  blockTime: number,
  primarySellSymbol: string,
  primaryBuySymbol: string,
  success = true,
): NormalizedWalletTransaction {
  const speculativeSymbol = primaryBuySymbol === "SOL" ? primarySellSymbol : primaryBuySymbol;
  return {
    signature: `${blockTime}-${primarySellSymbol}-${primaryBuySymbol}`,
    block_time: blockTime,
    success,
    fee_sol: 0.000005,
    native_change_sol: primarySellSymbol === "SOL" ? -1 : primaryBuySymbol === "SOL" ? 1 : 0,
    classification: "trade",
    token_changes: BASE_SYMBOLS.has(speculativeSymbol)
      ? []
      : [
          {
            mint: `${speculativeSymbol}-mint`,
            symbol: speculativeSymbol,
            amount_change: primaryBuySymbol === "SOL" ? -100 : 100,
          },
        ],
    trade_legs: [],
    primary_buy_symbol: primaryBuySymbol,
    primary_sell_symbol: primarySellSymbol,
  };
}

const BASE_SYMBOLS = new Set(["SOL", "USDC", "USDT", "USDS", "CASH", "PYUSD"]);

test("toWalletTokenChanges aggregates multiple token accounts by mint", () => {
  const changes = toWalletTokenChanges(
    "wallet-1",
    [
      {
        accountIndex: 3,
        mint: "mint-a",
        owner: "wallet-1",
        uiTokenAmount: { uiAmount: 2, uiAmountString: "2", amount: "2", decimals: 0 },
      },
      {
        accountIndex: 4,
        mint: "mint-a",
        owner: "wallet-1",
        uiTokenAmount: { uiAmount: 3, uiAmountString: "3", amount: "3", decimals: 0 },
      },
    ] as never,
    [
      {
        accountIndex: 3,
        mint: "mint-a",
        owner: "wallet-1",
        uiTokenAmount: { uiAmount: 1, uiAmountString: "1", amount: "1", decimals: 0 },
      },
      {
        accountIndex: 4,
        mint: "mint-a",
        owner: "wallet-1",
        uiTokenAmount: { uiAmount: 5, uiAmountString: "5", amount: "5", decimals: 0 },
      },
    ] as never,
  );

  assert.equal(changes.length, 1);
  assert.equal(changes[0].amount_change, 1);
});

test("classifyWalletTransaction distinguishes trade from transfer", () => {
  assert.equal(
    classifyWalletTransaction(
      [
        { mint: "a", symbol: "A", amount_change: -1 },
        { mint: "b", symbol: "B", amount_change: 2 },
      ],
      0,
    ),
    "trade",
  );
  assert.equal(classifyWalletTransaction([{ mint: "a", symbol: "A", amount_change: 1 }], 0), "transfer");
});

test("analyzeTradingFrequencyFft finds a daily cadence", () => {
  const transactions = new Array(14).fill(null).map((_, index) => makeTrade(1_700_000_000 + index * 24 * 3600, "SOL", "BONK"));
  const result = analyzeTradingFrequencyFft(transactions);

  assert.equal(result.dominant_cycles[0]?.label, "daily");
});

test("buildGuardrails flags dense bot-like samples and disables deep patterns", () => {
  const start = 1_700_000_000;
  const transactions = new Array(180).fill(null).map((_, index) => makeTrade(start + index * 60, "SOL", "BONK"));

  const guardrails = buildGuardrails(transactions, true, false);

  assert.equal(guardrails.suspected_bot_wallet, true);
  assert.equal(guardrails.deep_pattern_analysis_enabled, false);
  assert.match(guardrails.reasons.join(" "), /cap|bot-like|automation/i);
});

test("buildGuardrails does not mark a wallet as bot-like only because the sample was truncated", () => {
  const start = 1_700_000_000;
  const transactions = [makeTrade(start, "SOL", "BONK"), makeTrade(start + 3600, "BONK", "SOL")];

  const guardrails = buildGuardrails(transactions, true, false);

  assert.equal(guardrails.incomplete_history, true);
  assert.equal(guardrails.suspected_bot_wallet, false);
  assert.equal(guardrails.deep_pattern_analysis_enabled, true);
});

test("analyzeTradingPatterns surfaces recurring sell to buy rotations", () => {
  const start = 1_700_000_000;
  const transactions = [
    makeTrade(start, "SOL", "BONK"),
    makeTrade(start + 3600, "SOL", "BONK"),
    makeTrade(start + 7200, "SOL", "BONK"),
    makeTrade(start + 10800, "BONK", "JUP"),
    makeTrade(start + 14400, "SOL", "BONK"),
  ];
  const guardrails = buildGuardrails(transactions, false, true);

  const result = analyzeTradingPatterns(transactions, guardrails);

  assert.equal(result.recurring_rotations[0]?.sold, "SOL");
  assert.equal(result.recurring_rotations[0]?.bought, "BONK");
  assert.equal(result.predictable_next_buys[0]?.from, "BONK");
  assert.equal(result.predictable_next_buys[0]?.to, "BONK");
});

test("analyzeSampledPnl computes realized pnl for direct SOL swaps", () => {
  const transactions: NormalizedWalletTransaction[] = [
    {
      signature: "buy",
      block_time: 1_700_000_000,
      success: true,
      fee_sol: 0.001,
      native_change_sol: -5,
      classification: "trade",
      token_changes: [{ mint: "mint-a", symbol: "TOKEN", amount_change: 100 }],
      trade_legs: [],
      primary_buy_symbol: "TOKEN",
      primary_sell_symbol: "SOL",
    },
    {
      signature: "sell",
      block_time: 1_700_003_600,
      success: true,
      fee_sol: 0.001,
      native_change_sol: 6,
      classification: "trade",
      token_changes: [{ mint: "mint-a", symbol: "TOKEN", amount_change: -100 }],
      trade_legs: [],
      primary_buy_symbol: "SOL",
      primary_sell_symbol: "TOKEN",
    },
  ];

  const result = analyzeSampledPnl(transactions, 100);

  assert.equal(result.closed_round_trips, 1);
  assert.equal(result.realized_pnl_sol, 1);
  assert.equal(result.realized_pnl_usd, 100);
  assert.equal(result.token_summaries[0]?.symbol, "TOKEN");
});

test("analyzeBehavioralPatterns summarizes hourly activity and gaps", () => {
  const transactions = [
    makeTrade(1_700_000_000, "SOL", "BONK"),
    makeTrade(1_700_003_600, "SOL", "BONK"),
    makeTrade(1_700_007_200, "BONK", "JUP", false),
  ];

  const result = analyzeBehavioralPatterns(transactions);

  assert.equal(result.total_transactions, 3);
  assert.equal(result.failed_transactions, 1);
  assert.equal(result.active_days, 2);
  assert.ok(result.average_gap_hours > 0);
  assert.equal(result.top_active_hours_utc.length > 0, true);
});

test("buildAiDigest compresses core signals into a model-friendly summary", () => {
  const transactions = [
    makeTrade(1_700_000_000, "SOL", "BONK"),
    makeTrade(1_700_003_600, "BONK", "SOL"),
    makeTrade(1_700_007_200, "SOL", "BONK"),
    makeTrade(1_700_010_800, "BONK", "SOL"),
  ];
  const behaviouralPatterns = analyzeBehavioralPatterns(transactions);
  const guardrails = buildGuardrails(transactions, true, false);
  const sampledPnl = analyzeSampledPnl(
    [
      {
        signature: "buy",
        block_time: 1_700_000_000,
        success: true,
        fee_sol: 0,
        native_change_sol: -1,
        classification: "trade",
        token_changes: [{ mint: "bonk", symbol: "Bonk (BONK)", amount_change: 100 }],
        trade_legs: [],
        primary_buy_symbol: "Bonk (BONK)",
        primary_sell_symbol: "SOL",
      },
      {
        signature: "sell",
        block_time: 1_700_003_600,
        success: true,
        fee_sol: 0,
        native_change_sol: 1.5,
        classification: "trade",
        token_changes: [{ mint: "bonk", symbol: "Bonk (BONK)", amount_change: -100 }],
        trade_legs: [],
        primary_buy_symbol: "SOL",
        primary_sell_symbol: "Bonk (BONK)",
      },
    ],
    100,
  );
  const tradingPatterns = analyzeTradingPatterns(transactions, guardrails);

  const digest = buildAiDigest({
    maxDays: 30,
    sampledTransactions: transactions.length,
    activityWindows: { last_7d: 4, last_30d: 4, last_90d: 4 },
    guardrails,
    behaviouralPatterns,
    holderAnalysis: {
      style: "high_conviction_concentrated",
      unique_assets_traded: 1,
      currently_visible_holdings: 3,
      top_holding_share: 0.6,
      top_three_share: 0.9,
      top_holdings: [{ symbol: "JitoSOL", value_usd: 1000, weight: 0.6 }],
      net_accumulated_symbols: ["BONK"],
      net_distributed_symbols: [],
    },
    tradePreferences: {
      top_bought_symbols: [{ symbol: "Bonk (BONK)", count: 2 }],
      top_sold_symbols: [{ symbol: "Bonk (BONK)", count: 2 }],
      stablecoin_buy_count: 0,
      stablecoin_sell_count: 0,
      sol_buy_count: 2,
      sol_sell_count: 2,
    },
    sampledPnl,
    tradingPatterns,
    tokenConclusions: [
      {
        mint: "bonk",
        symbol: "BONK",
        name: "Bonk",
        display_name: "Bonk (BONK)",
        trade_count: 4,
        buy_count: 2,
        sell_count: 2,
        last_trade_at: "2023-11-14T23:13:20.000Z",
        realized_pnl_sol: 0.5,
        realized_pnl_usd: 50,
        conclusion: "Bonk (BONK) dominated the sample.",
      },
    ],
  });

  assert.equal(digest.wallet_profile.concentration_level, "high");
  assert.equal(digest.dominant_entities.speculative_focus, "Bonk (BONK)");
  assert.equal(digest.sample_quality.history_capped, true);
  assert.equal(digest.key_takeaways.length > 0, true);
});
