#!/usr/bin/env node

import fs from "node:fs/promises";

import { DATA_DIR, RAW_WALLETS_FILE, WALLETS_FILE } from "./lib/paths.js";
import { readJsonFile, shortAddress, writeJsonFile } from "./lib/utils.js";
import type { WalletRecord } from "./lib/types.js";

export async function loadWallets(): Promise<WalletRecord[]> {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(WALLETS_FILE);
    return await readJsonFile<WalletRecord[]>(WALLETS_FILE, []);
  } catch {
    const wallets: WalletRecord[] = [];
    try {
      const raw = await fs.readFile(RAW_WALLETS_FILE, "utf8");
      raw.split(/\r?\n/).forEach((line, index) => {
        const address = line.trim();
        if (!address) {
          return;
        }
        wallets.push({
          label: index === 0 ? "Main" : `Wallet${index + 1}`,
          address,
        });
      });
    } catch {
      return [];
    }

    await saveWallets(wallets);
    return wallets;
  }
}

export async function saveWallets(wallets: WalletRecord[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await writeJsonFile(WALLETS_FILE, wallets);
}

export async function loadWalletsByLabel(walletFilter?: string): Promise<WalletRecord[]> {
  const wallets = await loadWallets();
  if (!walletFilter) {
    return wallets;
  }
  const filtered = wallets.filter((wallet) => wallet.label.toLowerCase() === walletFilter.toLowerCase());
  if (!filtered.length) {
    throw new Error(`No wallet found with label '${walletFilter}'.`);
  }
  return filtered;
}

export async function cmdList(): Promise<void> {
  const wallets = await loadWallets();
  if (!wallets.length) {
    console.log("No wallets tracked yet. Use 'add <label> <address>' to add one.");
    return;
  }

  console.log(`Tracked Wallets (${wallets.length})\n`);
  for (const wallet of wallets) {
    console.log(`- ${wallet.label} - ${shortAddress(wallet.address)} (${wallet.address})`);
  }
}

export async function cmdAdd(label: string, address: string): Promise<void> {
  const wallets = await loadWallets();

  if (wallets.some((wallet) => wallet.label.toLowerCase() === label.toLowerCase())) {
    throw new Error(`Wallet with label '${label}' already exists.`);
  }
  if (wallets.some((wallet) => wallet.address === address)) {
    const existing = wallets.find((wallet) => wallet.address === address);
    throw new Error(`Address already tracked under label '${existing?.label}'.`);
  }
  if (address.length < 32 || address.length > 44) {
    throw new Error(`Invalid Solana address length: ${address.length}.`);
  }

  wallets.push({ label, address });
  await saveWallets(wallets);
  console.log(`Added wallet ${label} - ${shortAddress(address)}`);
}

export async function cmdRemove(label: string): Promise<void> {
  const wallets = await loadWallets();
  const filtered = wallets.filter((wallet) => wallet.label.toLowerCase() !== label.toLowerCase());
  if (filtered.length === wallets.length) {
    throw new Error(`No wallet found with label '${label}'.`);
  }
  await saveWallets(filtered);
  console.log(`Removed wallet ${label}`);
}

export async function cmdRename(oldLabel: string, newLabel: string): Promise<void> {
  const wallets = await loadWallets();
  if (wallets.some((wallet) => wallet.label.toLowerCase() === newLabel.toLowerCase())) {
    throw new Error(`Label '${newLabel}' is already in use.`);
  }

  let found = false;
  for (const wallet of wallets) {
    if (wallet.label.toLowerCase() === oldLabel.toLowerCase()) {
      wallet.label = newLabel;
      found = true;
      break;
    }
  }
  if (!found) {
    throw new Error(`No wallet found with label '${oldLabel}'.`);
  }

  await saveWallets(wallets);
  console.log(`Renamed ${oldLabel} -> ${newLabel}`);
}

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;
  if (!command) {
    console.error("Usage: tsx scriptsTS/wallet_manager.ts list|add|remove|rename");
    process.exit(1);
  }

  try {
    if (command === "list") {
      await cmdList();
      return;
    }
    if (command === "add") {
      if (args.length < 2) {
        throw new Error("Usage: add <label> <address>");
      }
      await cmdAdd(args[0], args[1]);
      return;
    }
    if (command === "remove") {
      if (!args[0]) {
        throw new Error("Usage: remove <label>");
      }
      await cmdRemove(args[0]);
      return;
    }
    if (command === "rename") {
      if (args.length < 2) {
        throw new Error("Usage: rename <old_label> <new_label>");
      }
      await cmdRename(args[0], args[1]);
      return;
    }

    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("wallet_manager.ts")) {
  void main();
}
