import fs from "node:fs/promises";

export const COLORS = [
  "#00D4AA",
  "#7C5CFC",
  "#FF6B6B",
  "#4ECDC4",
  "#FFE66D",
  "#95E1D3",
  "#F38181",
  "#AA96DA",
  "#FCBAD3",
  "#A8E6CF",
];

export const BG_COLOR = "#0D1117";
export const TEXT_COLOR = "#C9D1D9";
export const GRID_COLOR = "#21262D";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(filePath: string, payload: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    return "$0.00";
  }
  if (amount >= 1_000_000) {
    return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  if (amount >= 1000) {
    return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (amount >= 1) {
    return `$${amount.toFixed(2)}`;
  }
  return `$${amount.toFixed(4)}`;
}

export function formatAmount(amount: number): string {
  if (amount >= 1_000_000) {
    return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  if (amount >= 1) {
    return amount.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }
  return amount.toFixed(6);
}

export function shortAddress(address: string): string {
  if (address.length <= 12) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function roundAmount(value: number, digits = 12): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

export async function postJson<T>(url: string, body: unknown, init?: RequestInit): Promise<T> {
  return fetchJson<T>(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
    body: JSON.stringify(body),
    ...init,
  });
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function timestampFileNow(): string {
  return new Date().toISOString().replace(/:/g, "-").replace(/\.\d+Z$/, "Z");
}

export function ensureArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value == null) {
    return [];
  }
  return [value];
}
