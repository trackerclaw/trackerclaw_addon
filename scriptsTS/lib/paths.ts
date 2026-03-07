import path from "node:path";

const currentDir = __dirname;

export const SCRIPTS_TS_DIR = path.resolve(currentDir, "..");
export const PROJECT_DIR = path.resolve(SCRIPTS_TS_DIR, "..");
export const DATA_DIR = path.join(PROJECT_DIR, "data");
export const ENV_FILE = path.join(PROJECT_DIR, ".env");
export const WALLETS_FILE = path.join(DATA_DIR, "wallets.json");
export const RAW_WALLETS_FILE = path.join(PROJECT_DIR, "wallets");
export const OFFLINE_FILE = path.join(DATA_DIR, "offline.json");
export const VAULTS_FILE = path.join(DATA_DIR, "vaults.json");
export const DEFI_FILE = path.join(DATA_DIR, "defi_positions.json");
export const LEGACY_SNAPSHOTS_DIR = path.join(DATA_DIR, "snapshots");
export const OPENCLAW_SNAPSHOTS_DIR = path.join(DATA_DIR, "openclaw_snapshots");
export const CHARTS_DIR = path.join(DATA_DIR, "charts");
export const DEFAULT_WALLET_FILES = [
  path.join(DATA_DIR, "wallets.json"),
  path.join(PROJECT_DIR, "myWallets.json"),
  path.join(PROJECT_DIR, "myWallets"),
  path.join(PROJECT_DIR, "wallets"),
];
