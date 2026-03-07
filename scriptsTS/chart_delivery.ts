#!/usr/bin/env node

import path from "node:path";

import sharp from "sharp";

import { chartApy, chartPerformance, chartPortfolio } from "./chart_generator.ts";
import { isoNow } from "./lib/utils.ts";

type ChartType = "portfolio" | "performance" | "apy";
type DeliveryFormat = "svg" | "png" | "both";

interface ChartRuntimePaths {
  openclawSnapshotsDir?: string;
  legacySnapshotsDir?: string;
  chartsDir?: string;
}

interface BuildChartDeliveryOptions extends ChartRuntimePaths {
  chartType: ChartType;
  format?: DeliveryFormat;
  caption?: string;
}

interface ChartDeliveryManifest {
  chart_type: ChartType;
  generated_at: string;
  title: string;
  caption: string;
  svg_path: string;
  png_path: string | null;
  telegram: {
    preferred_method: "sendPhoto" | "sendDocument";
    preferred_file_path: string;
    fallback_method: "sendDocument";
    fallback_file_path: string;
    caption: string;
  };
}

const CHART_HANDLERS: Record<ChartType, (paths: ChartRuntimePaths) => Promise<string>> = {
  portfolio: chartPortfolio,
  performance: chartPerformance,
  apy: chartApy,
};

const CHART_TITLES: Record<ChartType, string> = {
  portfolio: "Portfolio Allocation",
  performance: "Portfolio Performance",
  apy: "DeFi Yields",
};

const CHART_CAPTIONS: Record<ChartType, string> = {
  portfolio: "TrackerClaw portfolio allocation",
  performance: "TrackerClaw portfolio performance",
  apy: "TrackerClaw DeFi yields",
};

async function renderPng(svgPath: string): Promise<string> {
  const pngPath = path.join(path.dirname(svgPath), `${path.basename(svgPath, ".svg")}.png`);
  await sharp(svgPath, { density: 192 }).png().toFile(pngPath);
  return pngPath;
}

export async function buildChartDeliveryManifest(options: BuildChartDeliveryOptions): Promise<ChartDeliveryManifest> {
  const format = options.format || "both";
  const svgPath = await CHART_HANDLERS[options.chartType](options);
  const pngPath = format === "svg" ? null : await renderPng(svgPath);
  const caption = options.caption || CHART_CAPTIONS[options.chartType];

  return {
    chart_type: options.chartType,
    generated_at: isoNow(),
    title: CHART_TITLES[options.chartType],
    caption,
    svg_path: svgPath,
    png_path: pngPath,
    telegram: {
      preferred_method: pngPath ? "sendPhoto" : "sendDocument",
      preferred_file_path: pngPath || svgPath,
      fallback_method: "sendDocument",
      fallback_file_path: svgPath,
      caption,
    },
  };
}

function parseArgs(args: string[]): BuildChartDeliveryOptions {
  const chartType = args[0]?.toLowerCase() as ChartType | undefined;
  if (!chartType || !Object.hasOwn(CHART_HANDLERS, chartType)) {
    throw new Error("Usage: tsx scriptsTS/chart_delivery.ts <portfolio|performance|apy> [--format svg|png|both] [--caption <text>]");
  }

  const options: BuildChartDeliveryOptions = {
    chartType,
    format: "both",
  };

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--format") {
      const format = args[index + 1] as DeliveryFormat | undefined;
      if (!format || !["svg", "png", "both"].includes(format)) {
        throw new Error("Expected --format svg, png, or both.");
      }
      options.format = format;
      index += 1;
      continue;
    }
    if (arg === "--caption") {
      options.caption = args[index + 1] || "";
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function main(): Promise<void> {
  try {
    const manifest = await buildChartDeliveryManifest(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(manifest, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("chart_delivery.ts")) {
  void main();
}
