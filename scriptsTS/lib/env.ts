import fs from "node:fs";
import dotenv from "dotenv";

import { ENV_FILE } from "./paths.js";

let loaded = false;

export function loadEnv(): void {
  if (loaded) {
    return;
  }

  if (fs.existsSync(ENV_FILE)) {
    dotenv.config({ path: ENV_FILE });
  }
  loaded = true;
}

export function requiredEnv(name: string): string {
  loadEnv();
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set in .env`);
  }
  return value;
}
