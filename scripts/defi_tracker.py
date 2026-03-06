#!/usr/bin/env python3
"""
TrackerClaw - DeFi Position Tracker

Uses protocol-native APIs where available:
- Jupiter Portfolio API for Jupiter Lend/Perps-style positions
- Kamino REST API for Earn/Lend/Multiply
- Meteora DLMM SDK for exact concentrated-liquidity balances

Fallback discovery remains for some on-chain programs, and NFT-backed Orca /
Raydium positions are discovered from wallet assets instead of incorrect owner
offset scans.
"""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import requests

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
WALLETS_FILE = os.path.join(PROJECT_DIR, "data", "wallets.json")
VAULTS_FILE = os.path.join(PROJECT_DIR, "data", "vaults.json")
DEFI_FILE = os.path.join(PROJECT_DIR, "data", "defi_positions.json")
ENV_FILE = os.path.join(PROJECT_DIR, ".env")
METEORA_HELPER = os.path.join(SCRIPT_DIR, "meteora_dlmm_positions.js")


def load_env(path: str):
    if load_dotenv:
        load_dotenv(path)
        return

    if not os.path.exists(path):
        return

    for raw_line in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'").strip('"'))


load_env(ENV_FILE)

HELIUS_API_KEY = os.getenv("HELIUS_API_KEY", "")
JUP_BASIC_API_KEY = os.getenv("JUP_BASIC_API_KEY", "")
HELIUS_RPC_URL = f"https://mainnet.helius-rpc.com/?api-key={HELIUS_API_KEY}"
JUPITER_PRICE_URL = "https://lite-api.jup.ag/price/v3"
JUPITER_PORTFOLIO_URL = "https://api.jup.ag/portfolio/v1/positions"
KAMINO_API = "https://api.kamino.finance"
METEORA_DLMM_API = "https://dlmm-api.meteora.ag"
SOL_MINT = "So11111111111111111111111111111111111111112"

KNOWN_TOKENS = {
    SOL_MINT: {"symbol": "SOL", "decimals": 9},
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": {"symbol": "USDC", "decimals": 6},
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": {"symbol": "USDT", "decimals": 6},
    "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn": {"symbol": "JitoSOL", "decimals": 9},
    "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v": {"symbol": "JupSOL", "decimals": 9},
    "BANKJmvhT8tiJRsBSS1n2HryMBPvT5Ze4HU95DUAmeta": {"symbol": "AVICI", "decimals": 6},
    "METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL": {"symbol": "MET", "decimals": 6},
}

FALLBACK_PROTOCOLS = {
    "marginfi": {
        "name": "Marginfi",
        "program": "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA",
        "owner_offset": 8,
        "url": "https://app.marginfi.com",
    },
    "drift": {
        "name": "Drift",
        "program": "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH",
        "owner_offset": 8,
        "url": "https://app.drift.trade",
    },
    "solend": {
        "name": "Solend",
        "program": "So1endDq2YkqhipRh3WViPa8hFvz0XP1SOSrrXCc1fV",
        "owner_offset": 8,
        "url": "https://solend.fi",
    },
}


def load_wallets(wallet_filter: str = None) -> list:
    if not os.path.exists(WALLETS_FILE):
        print("No wallets.json found. Run wallet_manager.py add first.")
        sys.exit(1)

    with open(WALLETS_FILE, "r", encoding="utf-8") as handle:
        wallets = json.load(handle)

    if wallet_filter:
        wallets = [w for w in wallets if w["label"].lower() == wallet_filter.lower()]
        if not wallets:
            print(f"No wallet found with label '{wallet_filter}'.")
            sys.exit(1)

    return wallets


def format_usd(amount) -> str:
    try:
        amount = float(amount)
    except Exception:
        return "$0.00"

    if amount >= 1000:
        return f"${amount:,.2f}"
    if amount >= 1:
        return f"${amount:.2f}"
    if amount > 0:
        return f"${amount:.4f}"
    return "$0.00"


def fetch_prices(mints: list) -> dict:
    if not mints:
        return {}

    prices = {}
    batch_size = 30
    for index in range(0, len(mints), batch_size):
        batch = mints[index:index + batch_size]
        try:
            response = requests.get(
                JUPITER_PRICE_URL,
                params={"ids": ",".join(batch)},
                timeout=15,
            )
            response.raise_for_status()
            for mint, info in response.json().items():
                if isinstance(info, dict) and info.get("usdPrice") is not None:
                    prices[mint] = float(info["usdPrice"])
        except requests.exceptions.RequestException:
            pass
        time.sleep(0.2)

    return prices


def get_assets_by_owner(address: str) -> dict:
    if not HELIUS_API_KEY:
        return {"items": []}

    all_items = []
    page = 1

    while True:
        payload = {
            "jsonrpc": "2.0",
            "id": f"defi-{page}",
            "method": "getAssetsByOwner",
            "params": {
                "ownerAddress": address,
                "page": page,
                "limit": 1000,
                "displayOptions": {
                    "showFungible": True,
                    "showNativeBalance": False,
                },
            },
        }
        try:
            response = requests.post(HELIUS_RPC_URL, json=payload, timeout=30)
            response.raise_for_status()
            result = response.json().get("result", {})
        except requests.exceptions.RequestException:
            break

        items = result.get("items", [])
        all_items.extend(items)
        if len(items) < 1000:
            break
        page += 1
        time.sleep(0.2)

    return {"items": all_items}


def query_program_accounts(program_id: str, owner: str, offset: int) -> list:
    try:
        response = requests.post(
            HELIUS_RPC_URL,
            json={
                "jsonrpc": "2.0",
                "id": "scan",
                "method": "getProgramAccounts",
                "params": [
                    program_id,
                    {
                        "encoding": "base64",
                        "filters": [{"memcmp": {"offset": offset, "bytes": owner}}],
                    },
                ],
            },
            timeout=30,
        )
        response.raise_for_status()
        return response.json().get("result", [])
    except requests.exceptions.RequestException:
        return []


def token_symbol(mint: str, asset_lookup: dict = None) -> str:
    if mint in KNOWN_TOKENS:
        return KNOWN_TOKENS[mint]["symbol"]

    asset_lookup = asset_lookup or {}
    item = asset_lookup.get(mint, {})
    metadata = ((item.get("content") or {}).get("metadata") or {})
    token_info = item.get("token_info") or {}
    return token_info.get("symbol") or metadata.get("symbol") or mint[:8] + "..."


def build_asset_lookup(assets: dict) -> dict:
    lookup = {}
    for item in assets.get("items", []):
        lookup[item.get("id", "")] = item
    return lookup


def detect_jupiter_positions(address: str) -> list:
    if not JUP_BASIC_API_KEY:
        print("  -> Jupiter: skipped (JUP_BASIC_API_KEY missing)")
        return []

    print("  -> Jupiter...")
    try:
        response = requests.get(
            f"{JUPITER_PORTFOLIO_URL}/{address}",
            headers={"x-api-key": JUP_BASIC_API_KEY},
            timeout=20,
        )
        response.raise_for_status()
        data = response.json()
    except requests.exceptions.RequestException:
        print("    - Jupiter API unavailable")
        return []

    positions = []
    for element in data.get("elements", []):
        value = float(element.get("value") or 0)
        details = element.get("data") or {}
        refs = details.get("sourceRefs") or []
        ref_account = details.get("ref") or (refs[0]["address"] if refs else "")
        label = element.get("label") or "Position"
        url = details.get("link") or "https://jup.ag/"
        position = {
            "protocol": "Jupiter",
            "type": label,
            "account": ref_account,
            "url": url,
            "usd_value": value,
            "details": {
                "element_type": element.get("type", ""),
                "net_apy_pct": round(float(element.get("netApy", 0)) * 100, 2),
            },
        }

        supplied = float((details.get("suppliedValue") or 0))
        borrowed = float((details.get("borrowedValue") or 0))
        if supplied:
            position["details"]["supplied_value"] = round(supplied, 2)
        if borrowed:
            position["details"]["borrowed_value"] = round(borrowed, 2)
        positions.append(position)

    if positions:
        total = sum(item["usd_value"] for item in positions)
        print(f"    OK {len(positions)} position(s) - {format_usd(total)}")
    else:
        print("    - No Jupiter positions")

    return positions


def fetch_meteora_pair_name(lb_pair: str) -> str:
    try:
        response = requests.get(f"{METEORA_DLMM_API}/pair/{lb_pair}", timeout=15)
        if response.status_code == 200:
            return response.json().get("name", "")
    except requests.exceptions.RequestException:
        pass
    return ""


def detect_meteora_positions(address: str, asset_lookup: dict = None) -> list:
    print("  -> Meteora...")
    if not os.path.exists(METEORA_HELPER):
        print("    - Meteora helper missing")
        return []

    rpc_url = HELIUS_RPC_URL if HELIUS_API_KEY else "https://api.mainnet-beta.solana.com"
    env = os.environ.copy()
    user_node_modules = os.path.join(os.path.expanduser("~"), "node_modules")
    local_node_modules = os.path.join(PROJECT_DIR, "node_modules")
    node_path_parts = [path for path in [local_node_modules, user_node_modules, env.get("NODE_PATH", "")] if path]
    env["NODE_PATH"] = os.pathsep.join(node_path_parts)

    try:
        result = subprocess.run(
            ["node", METEORA_HELPER, address, rpc_url],
            cwd=PROJECT_DIR,
            env=env,
            capture_output=True,
            text=True,
            check=True,
        )
        raw_positions = json.loads(result.stdout or "[]")
    except (subprocess.CalledProcessError, FileNotFoundError, json.JSONDecodeError):
        print("    - Meteora SDK lookup failed")
        return []

    if not raw_positions:
        print("    - No Meteora positions")
        return []

    mints = set()
    for item in raw_positions:
        mints.add(item["mint_x"])
        mints.add(item["mint_y"])
    prices = fetch_prices(sorted(mints))

    positions = []
    total = 0.0
    for item in raw_positions:
        mint_x = item["mint_x"]
        mint_y = item["mint_y"]
        amount_x = float(item.get("total_x_amount", 0))
        amount_y = float(item.get("total_y_amount", 0))
        fee_x = float(item.get("fee_x_amount", 0))
        fee_y = float(item.get("fee_y_amount", 0))
        price_x = prices.get(mint_x, 0)
        price_y = prices.get(mint_y, 0)

        base_value = amount_x * price_x + amount_y * price_y
        fee_value = fee_x * price_x + fee_y * price_y
        total += base_value

        pair_name = fetch_meteora_pair_name(item["lb_pair"])
        if not pair_name:
            pair_name = f"{token_symbol(mint_x, asset_lookup)}-{token_symbol(mint_y, asset_lookup)}"

        positions.append({
            "protocol": "Meteora",
            "type": f"DLMM ({pair_name})",
            "account": item["account"],
            "url": f"https://app.meteora.ag/dlmm/{item['lb_pair']}",
            "usd_value": base_value,
            "details": {
                "pair": pair_name,
                "amount_x": round(amount_x, 6),
                "amount_y": round(amount_y, 6),
                "symbol_x": token_symbol(mint_x, asset_lookup),
                "symbol_y": token_symbol(mint_y, asset_lookup),
                "claimable_fees_usd": round(fee_value, 2),
                "lower_bin_id": item.get("lower_bin_id"),
                "upper_bin_id": item.get("upper_bin_id"),
            },
        })

    print(f"    OK {len(positions)} position(s) - {format_usd(total)}")
    return positions


def _get_kvault_metrics(vault_addr: str) -> dict:
    try:
        response = requests.get(f"{KAMINO_API}/kvaults/vaults/{vault_addr}/metrics", timeout=10)
        if response.status_code == 200:
            return response.json()
    except requests.exceptions.RequestException:
        pass
    return {}


def _make_kamino_position(name, vault_addr, shares, usd_value, apy, share_price):
    return {
        "protocol": "Kamino",
        "type": f"Vault ({name})",
        "account": vault_addr,
        "url": "https://app.kamino.finance",
        "usd_value": usd_value,
        "details": {
            "vault": name,
            "shares": round(shares, 4),
            "share_price": round(share_price, 6),
            "apy_pct": round(apy * 100, 2),
            "usd_value": round(usd_value, 2),
        },
    }


def _detect_kamino_obligations(address: str) -> list:
    positions = []
    try:
        markets = requests.get(f"{KAMINO_API}/v2/kamino-market", timeout=10).json()
    except requests.exceptions.RequestException:
        print("    - Could not fetch Kamino markets")
        return []

    for market in markets:
        market_key = market.get("lendingMarket", "")
        market_name = market.get("name", "Unknown")
        try:
            response = requests.get(
                f"{KAMINO_API}/kamino-market/{market_key}/users/{address}/obligations",
                timeout=10,
            )
        except requests.exceptions.RequestException:
            continue

        if response.status_code != 200:
            continue

        obligations = response.json()
        for item in obligations if isinstance(obligations, list) else [obligations]:
            obligation_address = item if isinstance(item, str) else item.get("obligationAddress", "")
            if not obligation_address:
                continue

            try:
                history_response = requests.get(
                    f"{KAMINO_API}/v2/kamino-market/{market_key}/obligations/{obligation_address}/metrics/history",
                    timeout=15,
                )
            except requests.exceptions.RequestException:
                continue

            if history_response.status_code != 200:
                continue

            history = history_response.json().get("history", [])
            if not history:
                continue

            latest = history[-1]
            stats = latest.get("refreshedStats", {})
            nav = float(stats.get("netAccountValue", 0))
            deposits = float(stats.get("userTotalDeposit", 0))
            borrows = float(stats.get("userTotalBorrow", 0))
            leverage = float(stats.get("leverage", 0))
            tag = latest.get("tag", 0)

            if nav < 0.01:
                continue

            strategy = "Multiply" if tag == 1 else "Lend"
            positions.append({
                "protocol": "Kamino",
                "type": f"{strategy} ({market_name})",
                "account": obligation_address,
                "url": "https://app.kamino.finance",
                "usd_value": nav,
                "details": {
                    "market": market_name,
                    "strategy": strategy,
                    "net_value": round(nav, 2),
                    "total_deposits": round(deposits, 2),
                    "total_borrows": round(borrows, 2),
                    "leverage": round(leverage, 1),
                },
            })

    return positions


def detect_kamino_positions(address: str) -> list:
    print("  -> Kamino...")
    positions = []

    try:
        response = requests.get(f"{KAMINO_API}/kvaults/users/{address}/positions", timeout=15)
        if response.status_code == 200:
            for vault_position in response.json():
                vault_addr = vault_position.get("vaultAddress", vault_position.get("address", ""))
                total_shares = float(vault_position.get("totalShares", 0))
                if total_shares <= 0:
                    continue

                metrics = _get_kvault_metrics(vault_addr)
                share_price = float(metrics.get("sharePrice", 1))
                token_price = float(metrics.get("tokenPrice", 1))
                apy = float(metrics.get("apy", 0))
                state = vault_position.get("state", {})
                vault_name = state.get("name", "Unknown Vault")
                usd_value = total_shares * share_price * token_price
                positions.append(
                    _make_kamino_position(vault_name, vault_addr, total_shares, usd_value, apy, share_price)
                )
    except requests.exceptions.RequestException:
        pass

    if not positions and os.path.exists(VAULTS_FILE):
        with open(VAULTS_FILE, "r", encoding="utf-8") as handle:
            for vault_cfg in json.load(handle):
                vault_addr = vault_cfg.get("vault_address", "")
                vault_name = vault_cfg.get("name", "Unknown")
                try:
                    response = requests.get(
                        f"{KAMINO_API}/kvaults/users/{address}/positions/{vault_addr}",
                        timeout=15,
                    )
                except requests.exceptions.RequestException:
                    continue

                if response.status_code != 200:
                    continue

                vault_position = response.json()
                total_shares = float(vault_position.get("totalShares", 0))
                if total_shares <= 0:
                    continue

                metrics = _get_kvault_metrics(vault_addr)
                share_price = float(metrics.get("sharePrice", 1))
                token_price = float(metrics.get("tokenPrice", 1))
                apy = float(metrics.get("apy", 0))
                usd_value = total_shares * share_price * token_price
                positions.append(
                    _make_kamino_position(vault_name, vault_addr, total_shares, usd_value, apy, share_price)
                )

    positions.extend(_detect_kamino_obligations(address))

    if positions:
        total = sum(item["usd_value"] for item in positions)
        print(f"    OK {len(positions)} position(s) - {format_usd(total)}")
    else:
        print("    - No Kamino positions")

    return positions


def detect_nft_backed_positions(assets: dict, protocol_filter: str = None) -> list:
    if protocol_filter and protocol_filter.lower() not in ("orca", "raydium"):
        return []

    positions = []
    for item in assets.get("items", []):
        interface = item.get("interface", "")
        if interface not in ("V1_NFT", "ProgrammableNFT", "MplCoreAsset"):
            continue

        metadata = ((item.get("content") or {}).get("metadata") or {})
        name = metadata.get("name", "")
        symbol = metadata.get("symbol", "")
        text = f"{name} {symbol}".lower()

        if "whirlpool" in text or ("orca" in text and "position" in text):
            positions.append({
                "protocol": "Orca Whirlpool",
                "type": f"Position NFT ({name or symbol or item.get('id', '')[:8]})",
                "account": item.get("id", ""),
                "url": "https://www.orca.so",
                "usd_value": 0,
                "details": {"discovery": "wallet_nft"},
            })
        elif "raydium" in text and ("position" in text or "clmm" in text):
            positions.append({
                "protocol": "Raydium CLMM",
                "type": f"Position NFT ({name or symbol or item.get('id', '')[:8]})",
                "account": item.get("id", ""),
                "url": "https://raydium.io",
                "usd_value": 0,
                "details": {"discovery": "wallet_nft"},
            })

    return positions


def detect_fallback_program_positions(address: str, protocol_filter: str = None) -> list:
    positions = []
    filtered = {
        key: info
        for key, info in FALLBACK_PROTOCOLS.items()
        if not protocol_filter or protocol_filter.lower() == key
    }

    for key, info in filtered.items():
        print(f"  -> {info['name']}...")
        accounts = query_program_accounts(info["program"], address, info["owner_offset"])
        if not accounts:
            print("    - No positions")
            continue

        print(f"    OK {len(accounts)} position(s)")
        for account in accounts:
            positions.append({
                "protocol": info["name"],
                "type": "Program Position",
                "account": account.get("pubkey", ""),
                "url": info["url"],
                "usd_value": 0,
            })
        time.sleep(0.3)

    return positions


def detect_positions(address: str, protocol_filter: str = None) -> list:
    positions = []
    assets = get_assets_by_owner(address)
    asset_lookup = build_asset_lookup(assets)

    if not protocol_filter or protocol_filter.lower() == "jupiter":
        positions.extend(detect_jupiter_positions(address))

    if not protocol_filter or protocol_filter.lower() in ("kamino", "vaults"):
        positions.extend(detect_kamino_positions(address))

    if not protocol_filter or protocol_filter.lower() == "meteora":
        positions.extend(detect_meteora_positions(address, asset_lookup))

    positions.extend(detect_nft_backed_positions(assets, protocol_filter))
    positions.extend(detect_fallback_program_positions(address, protocol_filter))
    return positions


def format_defi_output(wallet_data: list) -> str:
    lines = ["**TrackerClaw - DeFi Positions**", ""]
    has_any = False

    for wallet in wallet_data:
        positions = wallet["positions"]
        if not positions:
            if len(wallet_data) > 1:
                lines.append(f"**{wallet['label']}** - No DeFi positions found")
                lines.append("")
            continue

        has_any = True
        if len(wallet_data) > 1:
            lines.append(f"**{wallet['label']}**")

        grouped = {}
        for position in positions:
            grouped.setdefault(position["protocol"], []).append(position)

        for protocol, entries in grouped.items():
            total = sum(float(entry.get("usd_value", 0) or 0) for entry in entries)
            header = f"**{protocol}** ({len(entries)} position{'s' if len(entries) != 1 else ''})"
            if total > 0:
                header += f" - {format_usd(total)}"
            lines.append(header)

            for position in entries:
                account = position.get("account", "")[:12]
                usd = float(position.get("usd_value", 0) or 0)
                line = f"  - {position.get('type', 'Position')}"
                if usd > 0:
                    line += f" - {format_usd(usd)}"
                if account:
                    line += f"  `{account}...`"
                lines.append(line)

                details = position.get("details", {})
                if details.get("supplied_value"):
                    lines.append(f"    Supplied: {format_usd(details['supplied_value'])}")
                if details.get("borrowed_value"):
                    lines.append(f"    Borrowed: {format_usd(details['borrowed_value'])}")
                if details.get("net_apy_pct"):
                    lines.append(f"    Net APY: {details['net_apy_pct']:.2f}%")
                if details.get("pair"):
                    lines.append(f"    Pair: {details['pair']}")
                if details.get("amount_x") is not None and details.get("amount_y") is not None:
                    lines.append(
                        f"    Balances: {details['amount_x']:.6f} {details.get('symbol_x', 'X')}, "
                        f"{details['amount_y']:.6f} {details.get('symbol_y', 'Y')}"
                    )
                if details.get("claimable_fees_usd"):
                    lines.append(f"    Claimable fees: {format_usd(details['claimable_fees_usd'])}")
                if details.get("shares"):
                    lines.append(f"    Shares: {details['shares']}")
                if details.get("apy_pct"):
                    lines.append(f"    APY: {details['apy_pct']:.2f}%")
                if details.get("total_deposits"):
                    lines.append(f"    Deposits: {format_usd(details['total_deposits'])}")
                if details.get("total_borrows"):
                    lines.append(f"    Borrows: {format_usd(details['total_borrows'])}")
                if details.get("leverage"):
                    lines.append(f"    Leverage: {details['leverage']}x")

            url = entries[0].get("url", "")
            if url:
                lines.append(f"  View: {url}")

        lines.append("")

    if not has_any:
        lines.append("No active DeFi positions found.")
        lines.append("Scanned: Jupiter, Kamino, Meteora, Orca, Raydium, Marginfi, Drift, Solend")

    return "\n".join(lines)


def run_defi_tracker(wallet_filter=None, protocol_filter=None, as_json=False):
    wallets = load_wallets(wallet_filter)
    wallet_data = []

    print("Scanning DeFi positions...\n")
    for wallet in wallets:
        print(f"{wallet['label']} ({wallet['address'][:8]}...)")
        positions = detect_positions(wallet["address"], protocol_filter)
        wallet_data.append({
            "label": wallet["label"],
            "address": wallet["address"],
            "positions": positions,
        })

    os.makedirs(os.path.dirname(DEFI_FILE), exist_ok=True)
    with open(DEFI_FILE, "w", encoding="utf-8") as handle:
        json.dump(wallet_data, handle, indent=2)

    if as_json:
        print(json.dumps(wallet_data, indent=2))
    else:
        print()
        print(format_defi_output(wallet_data))


def main():
    parser = argparse.ArgumentParser(description="TrackerClaw - DeFi Tracker")
    parser.add_argument("--wallet", "-w", help="Filter by wallet label")
    parser.add_argument(
        "--protocol",
        "-p",
        help="Filter: jupiter, kamino, meteora, orca, raydium, marginfi, drift, solend",
    )
    parser.add_argument("--json", "-j", action="store_true", help="Output raw JSON")
    args = parser.parse_args()
    run_defi_tracker(wallet_filter=args.wallet, protocol_filter=args.protocol, as_json=args.json)


if __name__ == "__main__":
    main()
