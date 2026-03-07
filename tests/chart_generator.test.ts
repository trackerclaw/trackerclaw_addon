import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { chartApy, chartPerformance, chartPortfolio } from "../scriptsTS/chart_generator.ts";

async function withChartFixture(
  run: (paths: { openclawSnapshotsDir: string; chartsDir: string }) => Promise<void>,
): Promise<void> {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "trackerclaw-charts-"));
  const openclawSnapshotsDir = path.join(rootDir, "openclaw_snapshots");
  const chartsDir = path.join(rootDir, "charts");

  await fs.mkdir(openclawSnapshotsDir, { recursive: true });
  await fs.mkdir(chartsDir, { recursive: true });

  try {
    await run({ openclawSnapshotsDir, chartsDir });
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
}

test("chartPortfolio renders a portfolio allocation SVG from OpenClaw snapshots", async () => {
  await withChartFixture(async ({ openclawSnapshotsDir, chartsDir }) => {
    await fs.writeFile(
      path.join(openclawSnapshotsDir, "2026-03-01T00-00-00Z.json"),
      `${JSON.stringify(
        {
          timestamp: "2026-03-01T00:00:00Z",
          wallets: [
            {
              spot: {
                tokens: [
                  { symbol: "SOL", value_usd: 700 },
                  { symbol: "JUP", value_usd: 300 },
                ],
              },
              defi: { positions: [] },
            },
          ],
          totals: { combined_usd: 1000 },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const output = await chartPortfolio({ openclawSnapshotsDir, chartsDir });
    const svg = await fs.readFile(output, "utf8");

    assert.match(path.basename(output), /^portfolio_.*\.svg$/);
    assert.match(svg, /Portfolio Allocation/);
    assert.match(svg, /SOL/);
    assert.match(svg, /JUP/);
  });
});

test("chartPerformance renders a growth SVG from snapshot history", async () => {
  await withChartFixture(async ({ openclawSnapshotsDir, chartsDir }) => {
    const snapshots = [
      {
        name: "2026-03-01T00-00-00Z.json",
        payload: {
          timestamp: "2026-03-01T00:00:00Z",
          wallets: [
            {
              spot: { tokens: [{ symbol: "SOL", value_usd: 700 }] },
              defi: { positions: [{ protocol: "Kamino", type: "Vault", value_usd: 100 }] },
            },
          ],
          totals: { combined_usd: 800 },
        },
      },
      {
        name: "2026-03-02T00-00-00Z.json",
        payload: {
          timestamp: "2026-03-02T00:00:00Z",
          wallets: [
            {
              spot: { tokens: [{ symbol: "SOL", value_usd: 820 }] },
              defi: { positions: [{ protocol: "Kamino", type: "Vault", value_usd: 130 }] },
            },
          ],
          totals: { combined_usd: 950 },
        },
      },
    ];

    for (const snapshot of snapshots) {
      await fs.writeFile(
        path.join(openclawSnapshotsDir, snapshot.name),
        `${JSON.stringify(snapshot.payload, null, 2)}\n`,
        "utf8",
      );
    }

    const output = await chartPerformance({ openclawSnapshotsDir, chartsDir });
    const svg = await fs.readFile(output, "utf8");

    assert.match(path.basename(output), /^performance_.*\.svg$/);
    assert.match(svg, /Portfolio Growth/);
    assert.match(svg, /Top Components/);
    assert.match(svg, /Kamino: Vault/);
  });
});

test("chartApy renders a DeFi yield SVG when APY data exists", async () => {
  await withChartFixture(async ({ openclawSnapshotsDir, chartsDir }) => {
    await fs.writeFile(
      path.join(openclawSnapshotsDir, "2026-03-01T00-00-00Z.json"),
      `${JSON.stringify(
        {
          timestamp: "2026-03-01T00:00:00Z",
          wallets: [
            {
              spot: { tokens: [] },
              defi: {
                positions: [
                  {
                    protocol: "Kamino",
                    type: "Vault",
                    value_usd: 500,
                    details: { apy_pct: 7.5 },
                  },
                ],
              },
            },
          ],
          totals: { combined_usd: 500 },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const output = await chartApy({ openclawSnapshotsDir, chartsDir });
    const svg = await fs.readFile(output, "utf8");

    assert.match(path.basename(output), /^apy_.*\.svg$/);
    assert.match(svg, /DeFi Yields/);
    assert.match(svg, /Kamino Vault/);
    assert.match(svg, /7.5%/);
  });
});
