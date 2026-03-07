#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

import { CHARTS_DIR, LEGACY_SNAPSHOTS_DIR, OPENCLAW_SNAPSHOTS_DIR } from "./lib/paths.js";
import { BG_COLOR, COLORS, GRID_COLOR, TEXT_COLOR, formatUsd, readJsonFile, timestampFileNow } from "./lib/utils.js";

interface LoadedSnapshot {
  _source: "openclaw" | "legacy";
  _date?: string;
  [key: string]: any;
}

interface ChartRuntimePaths {
  openclawSnapshotsDir?: string;
  legacySnapshotsDir?: string;
  chartsDir?: string;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    const files = (await fs.readdir(dir)).filter((file) => file.endsWith(".json")).sort();
    return files.map((file) => path.join(dir, file));
  } catch {
    return [];
  }
}

export async function loadLatestSnapshot(paths: ChartRuntimePaths = {}): Promise<LoadedSnapshot | null> {
  const openclawFiles = await listJsonFiles(paths.openclawSnapshotsDir || OPENCLAW_SNAPSHOTS_DIR);
  if (openclawFiles.length) {
    return { ...(await readJsonFile(openclawFiles.at(-1)!, {})), _source: "openclaw" };
  }
  const legacyFiles = await listJsonFiles(paths.legacySnapshotsDir || LEGACY_SNAPSHOTS_DIR);
  if (legacyFiles.length) {
    return { ...(await readJsonFile(legacyFiles.at(-1)!, {})), _source: "legacy" };
  }
  return null;
}

export async function loadSnapshots(days = 30, paths: ChartRuntimePaths = {}): Promise<LoadedSnapshot[]> {
  const openclawFiles = await listJsonFiles(paths.openclawSnapshotsDir || OPENCLAW_SNAPSHOTS_DIR);
  if (openclawFiles.length) {
    return Promise.all(
      openclawFiles.slice(-days).map(async (filePath) => ({ ...(await readJsonFile(filePath, {})), _source: "openclaw" as const })),
    );
  }
  const legacyFiles = await listJsonFiles(paths.legacySnapshotsDir || LEGACY_SNAPSHOTS_DIR);
  return Promise.all(
    legacyFiles.slice(-days).map(async (filePath) => ({
      ...(await readJsonFile(filePath, {})),
      _source: "legacy" as const,
      _date: path.basename(filePath, ".json"),
    })),
  );
}

function parseSnapshotTimestamp(snapshot: LoadedSnapshot): Date | null {
  if (snapshot._source === "openclaw") {
    return snapshot.timestamp ? new Date(snapshot.timestamp) : null;
  }
  return snapshot._date ? new Date(`${snapshot._date}T00:00:00Z`) : null;
}

function extractSnapshotTotal(snapshot: LoadedSnapshot): number {
  if (snapshot._source === "openclaw") {
    return Number(snapshot.totals?.combined_usd || 0);
  }
  return Number(snapshot.total_value || 0);
}

function extractSpotComponents(snapshot: LoadedSnapshot): Record<string, number> {
  const components: Record<string, number> = {};
  if (snapshot._source === "openclaw") {
    for (const wallet of snapshot.wallets || []) {
      for (const token of wallet.spot?.tokens || []) {
        const label = token.symbol || "";
        const value = Number(token.value_usd || 0);
        if (label && value > 0) {
          components[label] = (components[label] || 0) + value;
        }
      }
    }
    return components;
  }

  for (const wallet of snapshot.wallets || []) {
    for (const token of wallet.tokens || []) {
      const label = token.symbol || "";
      const value = Number(token.usd_value || 0);
      if (label && value > 0) {
        components[label] = (components[label] || 0) + value;
      }
    }
  }
  return components;
}

function extractDefiComponents(snapshot: LoadedSnapshot): Record<string, number> {
  if (snapshot._source !== "openclaw") {
    return {};
  }
  const components: Record<string, number> = {};
  for (const wallet of snapshot.wallets || []) {
    for (const position of wallet.defi?.positions || []) {
      const label = `${position.protocol || ""}: ${position.type || ""}`.replace(/^: /, "").trim();
      const value = Number(position.value_usd || 0);
      if (label && value > 0) {
        components[label] = (components[label] || 0) + value;
      }
    }
  }
  return components;
}

function extractAllComponents(snapshot: LoadedSnapshot): Record<string, number> {
  const components = extractSpotComponents(snapshot);
  for (const [label, value] of Object.entries(extractDefiComponents(snapshot))) {
    components[label] = (components[label] || 0) + value;
  }
  return components;
}

function svgShell(width: number, height: number, content: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="${BG_COLOR}" />
  ${content}
</svg>
`;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const angleRad = (angleDeg - 90) * (Math.PI / 180);
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

function donutSlicePath(cx: number, cy: number, outer: number, inner: number, startAngle: number, endAngle: number): string {
  const startOuter = polarToCartesian(cx, cy, outer, endAngle);
  const endOuter = polarToCartesian(cx, cy, outer, startAngle);
  const startInner = polarToCartesian(cx, cy, inner, startAngle);
  const endInner = polarToCartesian(cx, cy, inner, endAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outer} ${outer} 0 ${largeArc} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${inner} ${inner} 0 ${largeArc} 1 ${endInner.x} ${endInner.y}`,
    "Z",
  ].join(" ");
}

function buildLinePath(values: number[], x0: number, y0: number, width: number, height: number, minY: number, maxY: number): string {
  return values
    .map((value, index) => {
      const x = x0 + (values.length === 1 ? width / 2 : (index / (values.length - 1)) * width);
      const ratio = maxY === minY ? 0.5 : (value - minY) / (maxY - minY);
      const y = y0 + height - ratio * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildGrid(y0: number, x0: number, width: number, height: number, steps: number): string {
  const lines: string[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const y = y0 + (index / steps) * height;
    lines.push(`<line x1="${x0}" y1="${y}" x2="${x0 + width}" y2="${y}" stroke="${GRID_COLOR}" stroke-width="1" opacity="0.7" />`);
  }
  return lines.join("");
}

function buildYAxisLabels(
  x0: number,
  y0: number,
  height: number,
  steps: number,
  minY: number,
  maxY: number,
  formatter: (value: number) => string,
): string {
  const labels: string[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const ratio = (steps - index) / steps;
    const value = minY + (maxY - minY) * ratio;
    const y = y0 + (index / steps) * height + 5;
    labels.push(
      `<text x="${x0 - 14}" y="${y}" fill="${TEXT_COLOR}" font-size="14" text-anchor="end">${escapeXml(formatter(value))}</text>`,
    );
  }
  return labels.join("");
}

function labelDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });
}

function wrapLabel(label: string, maxLineLength: number): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [label];
  }

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLineLength || !current) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }
  return lines.slice(0, 3);
}

export async function chartPortfolio(paths: ChartRuntimePaths = {}): Promise<string> {
  const snapshot = await loadLatestSnapshot(paths);
  if (!snapshot) {
    throw new Error("No portfolio snapshot found. Run openclaw_portfolio.ts snapshot first.");
  }
  const tokenValues = extractSpotComponents(snapshot);
  const sorted = Object.entries(tokenValues).sort((left, right) => right[1] - left[1]);
  if (!sorted.length) {
    throw new Error("No spot token positions with value found.");
  }

  const total = sorted.reduce((sum, [, value]) => sum + value, 0);
  const labels: Array<[string, number]> = [];
  let other = 0;
  for (const [symbol, value] of sorted) {
    const pct = total ? (value / total) * 100 : 0;
    if (pct < 2 && labels.length >= 8) {
      other += value;
    } else {
      labels.push([symbol, value]);
    }
  }
  if (other > 0) {
    labels.push(["Other", other]);
  }

  const width = 1100;
  const height = 800;
  const cx = 340;
  const cy = 400;
  const outer = 220;
  const inner = 110;

  let startAngle = 0;
  let slices = "";
  let legend = `<text x="60" y="70" fill="${TEXT_COLOR}" font-size="28" font-weight="700">Portfolio Allocation</text>`;
  legend += `<text x="60" y="105" fill="${TEXT_COLOR}" font-size="18">${escapeXml(formatUsd(total))}</text>`;

  labels.forEach(([label, value], index) => {
    const angle = (value / total) * 360;
    const endAngle = startAngle + angle;
    const color = COLORS[index % COLORS.length];
    slices += `<path d="${donutSlicePath(cx, cy, outer, inner, startAngle, endAngle)}" fill="${color}" stroke="${BG_COLOR}" stroke-width="2" />`;

    const legendY = 170 + index * 52;
    const pct = ((value / total) * 100).toFixed(1);
    legend += `<rect x="650" y="${legendY - 16}" width="18" height="18" rx="4" fill="${color}" />`;
    legend += `<text x="680" y="${legendY}" fill="${TEXT_COLOR}" font-size="18">${escapeXml(label)} - ${escapeXml(formatUsd(value))} (${pct}%)</text>`;
    startAngle = endAngle;
  });

  const centerText = [
    `<text x="${cx}" y="${cy - 8}" fill="${TEXT_COLOR}" font-size="20" text-anchor="middle">Spot Total</text>`,
    `<text x="${cx}" y="${cy + 30}" fill="${TEXT_COLOR}" font-size="30" font-weight="700" text-anchor="middle">${escapeXml(formatUsd(total))}</text>`,
  ].join("");

  const svg = svgShell(width, height, `${slices}${centerText}${legend}`);
  const chartsDir = paths.chartsDir || CHARTS_DIR;
  await fs.mkdir(chartsDir, { recursive: true });
  const filePath = path.join(chartsDir, `portfolio_${timestampFileNow()}.svg`);
  await fs.writeFile(filePath, svg, "utf8");
  return filePath;
}

export async function chartPerformance(paths: ChartRuntimePaths = {}): Promise<string> {
  const snapshots = await loadSnapshots(30, paths);
  if (snapshots.length < 2) {
    throw new Error("Need at least 2 snapshots for a performance chart.");
  }

  const series = snapshots
    .map((snapshot) => ({ snapshot, date: parseSnapshotTimestamp(snapshot) }))
    .filter((entry) => entry.date) as Array<{ snapshot: LoadedSnapshot; date: Date }>;
  if (series.length < 2) {
    throw new Error("Not enough valid snapshots.");
  }

  const latestComponents = extractAllComponents(series.at(-1)!.snapshot);
  const topLabels = Object.entries(latestComponents)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([label]) => label);

  const totals = series.map((entry) => extractSnapshotTotal(entry.snapshot));
  const componentSeries = Object.fromEntries(
    topLabels.map((label) => [label, series.map((entry) => extractAllComponents(entry.snapshot)[label] || 0)]),
  ) as Record<string, number[]>;
  const startValue = totals[0];
  const endValue = totals.at(-1)!;
  const changePct = startValue ? ((endValue / startValue) - 1) * 100 : 0;
  const totalColor = endValue >= startValue ? COLORS[0] : COLORS[2];

  const width = 1600;
  const height = 900;
  const top = { x: 90, y: 90, width: 980, height: 320 };
  const bottom = { x: 90, y: 490, width: 980, height: 260 };
  const legend = { x: 1110, y: 130, width: 400 };

  const totalMin = Math.min(...totals) * 0.999;
  const totalMax = Math.max(...totals) * 1.001;
  const componentValues = topLabels.length ? topLabels.flatMap((label) => componentSeries[label]) : [0];
  const componentMin = Math.min(...componentValues) * 0.95;
  const componentMax = Math.max(...componentValues) * 1.05;

  let content = "";
  content += `<text x="${width / 2}" y="52" fill="${TEXT_COLOR}" font-size="34" font-weight="700" text-anchor="middle">Portfolio Growth (${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%)</text>`;
  content += buildGrid(top.y, top.x, top.width, top.height, 5);
  content += buildGrid(bottom.y, bottom.x, bottom.width, bottom.height, 5);
  content += buildYAxisLabels(top.x, top.y, top.height, 5, totalMin, totalMax, formatUsd);
  content += buildYAxisLabels(bottom.x, bottom.y, bottom.height, 5, componentMin, componentMax, formatUsd);
  content += `<rect x="${top.x}" y="${top.y}" width="${top.width}" height="${top.height}" fill="none" stroke="${GRID_COLOR}" stroke-width="1" />`;
  content += `<rect x="${bottom.x}" y="${bottom.y}" width="${bottom.width}" height="${bottom.height}" fill="none" stroke="${GRID_COLOR}" stroke-width="1" />`;
  content += `<rect x="${legend.x}" y="${legend.y - 30}" width="${legend.width}" height="560" rx="18" fill="none" stroke="${GRID_COLOR}" stroke-width="1" />`;
  content += `<path d="${buildLinePath(totals, top.x, top.y, top.width, top.height, totalMin, totalMax)}" fill="none" stroke="${totalColor}" stroke-width="4" />`;
  content += `<text x="${top.x}" y="${top.y - 18}" fill="${TEXT_COLOR}" font-size="18">Total USD</text>`;
  content += `<text x="${bottom.x}" y="${bottom.y - 18}" fill="${TEXT_COLOR}" font-size="18">Top Components</text>`;

  topLabels.forEach((label, index) => {
    content += `<path d="${buildLinePath(componentSeries[label], bottom.x, bottom.y, bottom.width, bottom.height, componentMin, componentMax)}" fill="none" stroke="${COLORS[index + 1]}" stroke-width="3" />`;
  });

  series.forEach((entry, index) => {
    const x = top.x + (index / (series.length - 1)) * top.width;
    const label = labelDate(entry.date);
    content += `<line x1="${x}" y1="${bottom.y + bottom.height}" x2="${x}" y2="${bottom.y + bottom.height + 8}" stroke="${TEXT_COLOR}" />`;
    content += `<text x="${x}" y="${bottom.y + bottom.height + 34}" fill="${TEXT_COLOR}" font-size="16" text-anchor="middle" transform="rotate(25 ${x} ${bottom.y + bottom.height + 34})">${label}</text>`;
  });

  content += `<circle cx="${top.x}" cy="${top.y + top.height - ((startValue - totalMin) / (totalMax - totalMin || 1)) * top.height}" r="4" fill="${totalColor}" />`;
  content += `<circle cx="${top.x + top.width}" cy="${top.y + top.height - ((endValue - totalMin) / (totalMax - totalMin || 1)) * top.height}" r="4" fill="${totalColor}" />`;

  content += `<text x="${legend.x + 24}" y="${legend.y}" fill="${TEXT_COLOR}" font-size="24" font-weight="700">Legend</text>`;
  content += `<rect x="${legend.x + 24}" y="${legend.y + 24}" width="18" height="4" fill="${totalColor}" />`;
  content += `<text x="${legend.x + 54}" y="${legend.y + 30}" fill="${TEXT_COLOR}" font-size="18">Total Portfolio</text>`;
  content += `<text x="${legend.x + legend.width - 24}" y="${legend.y + 30}" fill="${totalColor}" font-size="18" text-anchor="end">${escapeXml(formatUsd(endValue))}</text>`;

  topLabels.forEach((label, index) => {
    const y = legend.y + 84 + index * 108;
    const color = COLORS[index + 1];
    const labelLines = wrapLabel(label, 24);
    content += `<rect x="${legend.x + 24}" y="${y - 10}" width="18" height="4" fill="${color}" />`;
    labelLines.forEach((line, lineIndex) => {
      content += `<text x="${legend.x + 54}" y="${y + lineIndex * 22}" fill="${TEXT_COLOR}" font-size="18">${escapeXml(line)}</text>`;
    });
    content += `<text x="${legend.x + legend.width - 24}" y="${y}" fill="${color}" font-size="17" text-anchor="end">${escapeXml(formatUsd(componentSeries[label].at(-1) || 0))}</text>`;
  });

  const svg = svgShell(width, height, content);
  const chartsDir = paths.chartsDir || CHARTS_DIR;
  await fs.mkdir(chartsDir, { recursive: true });
  const filePath = path.join(chartsDir, `performance_${timestampFileNow()}.svg`);
  await fs.writeFile(filePath, svg, "utf8");
  return filePath;
}

export async function chartApy(paths: ChartRuntimePaths = {}): Promise<string> {
  const snapshot = await loadLatestSnapshot(paths);
  if (!snapshot || snapshot._source !== "openclaw") {
    throw new Error("No OpenClaw snapshot found. Run openclaw_portfolio.ts snapshot first.");
  }

  const apyData = [];
  for (const wallet of snapshot.wallets || []) {
    for (const position of wallet.defi?.positions || []) {
      const apy = Number(position.details?.apy_pct || position.details?.net_apy_pct || 0);
      if (apy) {
        apyData.push([`${position.protocol} ${position.type}`.trim(), apy] as const);
      }
    }
  }
  if (!apyData.length) {
    throw new Error("No positions with APY data found in the latest snapshot.");
  }

  apyData.sort((left, right) => right[1] - left[1]);

  const width = 1200;
  const height = 760;
  const chart = { x: 90, y: 100, width: 1020, height: 380 };
  const maxApy = Math.max(...apyData.map(([, apy]) => apy)) * 1.15;
  const slotWidth = chart.width / apyData.length;
  const barWidth = Math.min(220, Math.max(72, slotWidth * 0.55));

  let content = `<text x="600" y="52" fill="${TEXT_COLOR}" font-size="32" font-weight="700" text-anchor="middle">DeFi Yields</text>`;
  content += buildGrid(chart.y, chart.x, chart.width, chart.height, 5);
  content += `<rect x="${chart.x}" y="${chart.y}" width="${chart.width}" height="${chart.height}" fill="none" stroke="${GRID_COLOR}" stroke-width="1" />`;

  for (let index = 0; index <= 5; index += 1) {
    const value = ((5 - index) / 5) * maxApy;
    const y = chart.y + (index / 5) * chart.height + 6;
    content += `<text x="${chart.x - 14}" y="${y}" fill="${TEXT_COLOR}" font-size="14" text-anchor="end">${value.toFixed(1)}%</text>`;
  }

  apyData.forEach(([label, apy], index) => {
    const slotX = chart.x + index * slotWidth;
    const x = slotX + (slotWidth - barWidth) / 2;
    const h = (apy / (maxApy || 1)) * chart.height;
    const y = chart.y + chart.height - h;
    const color = COLORS[index % COLORS.length];
    content += `<rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="8" fill="${color}" />`;
    content += `<text x="${x + barWidth / 2}" y="${y - 10}" fill="${TEXT_COLOR}" font-size="16" text-anchor="middle">${apy.toFixed(1)}%</text>`;

    const labelLines = wrapLabel(label, apyData.length <= 2 ? 24 : 18);
    labelLines.forEach((line, lineIndex) => {
      content += `<text x="${slotX + slotWidth / 2}" y="${chart.y + chart.height + 34 + lineIndex * 18}" fill="${TEXT_COLOR}" font-size="14" text-anchor="middle">${escapeXml(line)}</text>`;
    });
  });

  content += `<text x="${chart.x}" y="${chart.y - 18}" fill="${TEXT_COLOR}" font-size="18">APY (%)</text>`;

  const svg = svgShell(width, height, content);
  const chartsDir = paths.chartsDir || CHARTS_DIR;
  await fs.mkdir(chartsDir, { recursive: true });
  const filePath = path.join(chartsDir, `apy_${timestampFileNow()}.svg`);
  await fs.writeFile(filePath, svg, "utf8");
  return filePath;
}

async function main(): Promise<void> {
  const chartType = process.argv[2]?.toLowerCase();
  try {
    let output = "";
    if (chartType === "portfolio") {
      output = await chartPortfolio();
    } else if (chartType === "performance") {
      output = await chartPerformance();
    } else if (chartType === "apy") {
      output = await chartApy();
    } else {
      throw new Error("Available chart types: portfolio, performance, apy");
    }
    console.log(`Chart saved: ${output}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("chart_generator.ts")) {
  void main();
}
