import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildChartDeliveryManifest } from "../scriptsTS/chart_delivery.ts";

async function withChartFixture(
  run: (paths: { openclawSnapshotsDir: string; chartsDir: string }) => Promise<void>,
): Promise<void> {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "trackerclaw-delivery-"));
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

test("buildChartDeliveryManifest renders PNG output and Telegram file hints", async () => {
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

    const manifest = await buildChartDeliveryManifest({
      chartType: "portfolio",
      openclawSnapshotsDir,
      chartsDir,
    });

    assert.equal(manifest.chart_type, "portfolio");
    assert.match(path.basename(manifest.svg_path), /^portfolio_.*\.svg$/);
    assert.match(path.basename(manifest.png_path || ""), /^portfolio_.*\.png$/);
    assert.equal(manifest.telegram.preferred_method, "sendPhoto");
    assert.equal(manifest.telegram.fallback_method, "sendDocument");
    assert.equal(manifest.telegram.fallback_file_path, manifest.svg_path);

    const png = await fs.readFile(manifest.png_path || "");
    assert.deepEqual(Array.from(png.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  });
});

test("buildChartDeliveryManifest can emit SVG-only delivery metadata", async () => {
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

    const manifest = await buildChartDeliveryManifest({
      chartType: "apy",
      openclawSnapshotsDir,
      chartsDir,
      format: "svg",
    });

    assert.equal(manifest.png_path, null);
    assert.equal(manifest.telegram.preferred_method, "sendDocument");
    assert.equal(manifest.telegram.preferred_file_path, manifest.svg_path);
  });
});
