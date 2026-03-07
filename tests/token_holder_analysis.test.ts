import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateHolderBalances,
  classifyHolderRelevance,
  formatTokenAmount,
} from "../scriptsTS/token_holder_analysis.ts";

test("formatTokenAmount trims trailing zeros without losing precision", () => {
  assert.equal(formatTokenAmount(123456789n, 6), "123.456789");
  assert.equal(formatTokenAmount(123000000n, 6), "123");
  assert.equal(formatTokenAmount(42n, 0), "42");
});

test("aggregateHolderBalances groups token accounts by owner and sorts descending", () => {
  const holders = aggregateHolderBalances([
    {
      owner: "owner-b",
      raw_amount: "1000",
      decimals: 2,
      token_account: "token-account-1",
    },
    {
      owner: "owner-a",
      raw_amount: "2500",
      decimals: 2,
      token_account: "token-account-2",
    },
    {
      owner: "owner-b",
      raw_amount: "1250",
      decimals: 2,
      token_account: "token-account-3",
    },
    {
      owner: "owner-c",
      raw_amount: "0",
      decimals: 2,
      token_account: "token-account-4",
    },
  ]);

  assert.equal(holders.length, 2);
  assert.deepEqual(
    holders.map((holder) => ({
      owner: holder.owner,
      token_amount: holder.token_amount,
      token_account_count: holder.token_account_count,
    })),
    [
      { owner: "owner-a", token_amount: "25", token_account_count: 1 },
      { owner: "owner-b", token_amount: "22.5", token_account_count: 2 },
    ],
  );
});

test("classifyHolderRelevance flags non-wallet owners as non relevant", () => {
  assert.deepEqual(classifyHolderRelevance("wallet"), {
    relevance: "relevant",
    reason: "Wallet-owned account.",
  });
  assert.equal(classifyHolderRelevance("program_owned").relevance, "non_relevant");
  assert.equal(classifyHolderRelevance("unknown").relevance, "non_relevant");
});
