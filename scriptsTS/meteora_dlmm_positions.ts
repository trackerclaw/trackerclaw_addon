#!/usr/bin/env node

import { Connection, PublicKey } from "@solana/web3.js";
import DLMM from "@meteora-ag/dlmm";

export interface MeteoraPosition {
  lb_pair: string;
  account: string;
  mint_x: string;
  mint_y: string;
  decimals_x: number;
  decimals_y: number;
  total_x_amount: number;
  total_y_amount: number;
  fee_x_amount: number;
  fee_y_amount: number;
  lower_bin_id: number;
  upper_bin_id: number;
}

export async function getMeteoraDlmmPositions(
  owner: string,
  rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
): Promise<MeteoraPosition[]> {
  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = new PublicKey(owner);
  const pairMap = await (DLMM as any).getAllLbPairPositionsByUser(connection, wallet);
  const positions: MeteoraPosition[] = [];

  for (const [lbPair, info] of pairMap.entries()) {
    const tokenX = info.tokenX;
    const tokenY = info.tokenY;

    for (const position of info.lbPairPositionsData || []) {
      const data = position.positionData;
      positions.push({
        lb_pair: lbPair,
        account: position.publicKey.toBase58(),
        mint_x: tokenX.publicKey.toBase58(),
        mint_y: tokenY.publicKey.toBase58(),
        decimals_x: tokenX.mint.decimals,
        decimals_y: tokenY.mint.decimals,
        total_x_amount: Number(data.totalXAmount.toString()) / 10 ** tokenX.mint.decimals,
        total_y_amount: Number(data.totalYAmount.toString()) / 10 ** tokenY.mint.decimals,
        fee_x_amount: Number(data.feeX.toString()) / 10 ** tokenX.mint.decimals,
        fee_y_amount: Number(data.feeY.toString()) / 10 ** tokenY.mint.decimals,
        lower_bin_id: data.lowerBinId,
        upper_bin_id: data.upperBinId,
      });
    }
  }

  return positions;
}

async function main(): Promise<void> {
  const owner = process.argv[2];
  const rpcUrl = process.argv[3];
  if (!owner) {
    console.error("Usage: tsx scriptsTS/meteora_dlmm_positions.ts <wallet> [rpc-url]");
    process.exit(1);
  }

  try {
    const positions = await getMeteoraDlmmPositions(owner, rpcUrl);
    process.stdout.write(JSON.stringify(positions));
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("meteora_dlmm_positions.ts")) {
  void main();
}
