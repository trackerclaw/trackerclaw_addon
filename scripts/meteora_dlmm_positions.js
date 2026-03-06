#!/usr/bin/env node

const { Connection, PublicKey } = require("@solana/web3.js");
const DLMM = require("@meteora-ag/dlmm");

async function main() {
  const owner = process.argv[2];
  const rpcUrl =
    process.argv[3] ||
    process.env.SOLANA_RPC_URL ||
    "https://api.mainnet-beta.solana.com";

  if (!owner) {
    console.error("Usage: node scripts/meteora_dlmm_positions.js <wallet> [rpc-url]");
    process.exit(1);
  }

  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = new PublicKey(owner);
  const pairMap = await DLMM.getAllLbPairPositionsByUser(connection, wallet);
  const positions = [];

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
        upper_bin_id: data.upperBinId
      });
    }
  }

  process.stdout.write(JSON.stringify(positions));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
