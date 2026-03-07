import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildHistoryPayload, loadWalletFile, saveSnapshot } from "../scriptsTS/openclaw_portfolio.ts";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "trackerclaw-openclaw-"));
  try {
    await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("loadWalletFile supports string, object, and line-based wallet files", async () => {
  await withTempDir(async (dir) => {
    const jsonWallets = path.join(dir, "wallets.json");
    const textWallets = path.join(dir, "wallets.txt");

    await fs.writeFile(
      jsonWallets,
      JSON.stringify(["wallet-alpha", { address: "wallet-beta" }, { ignore: "noop" }], null, 2),
      "utf8",
    );
    await fs.writeFile(textWallets, "wallet-gamma\n\nwallet-delta\n", "utf8");

    assert.deepEqual(await loadWalletFile(jsonWallets), ["wallet-alpha", "wallet-beta"]);
    assert.deepEqual(await loadWalletFile(textWallets), ["wallet-gamma", "wallet-delta"]);
  });
});

test("buildHistoryPayload summarizes snapshot totals in file order", async () => {
  await withTempDir(async (dir) => {
    const snapshots = [
      {
        name: "2026-01-01T00-00-00Z.json",
        payload: {
          timestamp: "2026-01-01T00:00:00Z",
          wallet_count: 1,
          wallets: [],
          totals: { spot_usd: 70, defi_usd: 30, combined_usd: 100 },
        },
      },
      {
        name: "2026-01-02T00-00-00Z.json",
        payload: {
          timestamp: "2026-01-02T00:00:00Z",
          wallet_count: 1,
          wallets: [],
          totals: { spot_usd: 80, defi_usd: 40, combined_usd: 120 },
        },
      },
      {
        name: "2026-01-03T00-00-00Z.json",
        payload: {
          timestamp: "2026-01-03T00:00:00Z",
          wallet_count: 1,
          wallets: [],
          totals: { spot_usd: 60, defi_usd: 30, combined_usd: 90 },
        },
      },
    ];

    for (const snapshot of snapshots) {
      await fs.writeFile(path.join(dir, snapshot.name), `${JSON.stringify(snapshot.payload, null, 2)}\n`, "utf8");
    }

    const history = await buildHistoryPayload(30, dir);
    assert.equal(history.snapshot_count, 3);
    assert.deepEqual(
      history.series.map((point: { combined_usd: number }) => point.combined_usd),
      [100, 120, 90],
    );
    assert.deepEqual(history.performance, {
      start_combined_usd: 100,
      end_combined_usd: 90,
      change_usd: -10,
      change_pct: -10,
    });
  });
});

test("saveSnapshot writes JSON into a caller-provided snapshot directory", async () => {
  await withTempDir(async (dir) => {
    const payload = {
      timestamp: "2026-03-06T12:00:00Z",
      wallet_count: 1,
      wallets: [],
      totals: { spot_usd: 1, defi_usd: 2, combined_usd: 3 },
    };

    const filePath = await saveSnapshot(payload, dir);
    assert.match(path.basename(filePath), /\.json$/);

    const stored = JSON.parse(await fs.readFile(filePath, "utf8"));
    assert.deepEqual(stored, payload);
  });
});
