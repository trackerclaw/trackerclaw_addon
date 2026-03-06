#!/usr/bin/env python3
"""
TrackerClaw — Portfolio Tracker
Fetches on-chain token positions via Helius DAS API and USD prices via Jupiter.

Usage:
    python portfolio_tracker.py                  # all wallets
    python portfolio_tracker.py --wallet Main    # single wallet
    python portfolio_tracker.py --json           # raw JSON output
"""

import json
import os
import sys
import argparse
import time
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
WALLETS_FILE = os.path.join(PROJECT_DIR, "data", "wallets.json")
SNAPSHOTS_DIR = os.path.join(PROJECT_DIR, "data", "snapshots")
ENV_FILE = os.path.join(PROJECT_DIR, ".env")

load_dotenv(ENV_FILE)

HELIUS_API_KEY = os.getenv("HELIUS_API_KEY", "")
HELIUS_RPC_URL = f"https://mainnet.helius-rpc.com/?api-key={HELIUS_API_KEY}"
JUPITER_PRICE_URL = "https://lite-api.jup.ag/price/v3"

# Well-known token mints
SOL_MINT = "So11111111111111111111111111111111111111112"
KNOWN_TOKENS = {
    SOL_MINT: {"symbol": "SOL", "decimals": 9},
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": {"symbol": "USDC", "decimals": 6},
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": {"symbol": "USDT", "decimals": 6},
    "USDSwr9ApdHk5bvJKMjXr7AmQCVmysCrz9p3p4pi5FK": {"symbol": "USDS", "decimals": 6},
    "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": {"symbol": "mSOL", "decimals": 9},
    "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj": {"symbol": "stSOL", "decimals": 9},
    "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn": {"symbol": "JitoSOL", "decimals": 9},
    "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1": {"symbol": "bSOL", "decimals": 9},
    "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": {"symbol": "BONK", "decimals": 5},
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": {"symbol": "JUP", "decimals": 6},
    "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": {"symbol": "WIF", "decimals": 6},
    "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof": {"symbol": "RENDER", "decimals": 8},
    "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3": {"symbol": "PYTH", "decimals": 6},
    "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": {"symbol": "RAY", "decimals": 6},
    "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE": {"symbol": "ORCA", "decimals": 6},
}


def load_wallets(wallet_filter: str = None) -> list:
    """Load wallets from JSON file."""
    if not os.path.exists(WALLETS_FILE):
        print("❌ No wallets.json found. Run wallet_manager.py add first.")
        sys.exit(1)

    with open(WALLETS_FILE, "r") as f:
        wallets = json.load(f)

    if wallet_filter:
        wallets = [w for w in wallets if w["label"].lower() == wallet_filter.lower()]
        if not wallets:
            print(f"❌ No wallet found with label '{wallet_filter}'.")
            sys.exit(1)

    return wallets


def get_assets_by_owner(address: str) -> dict:
    """Call Helius DAS API getAssetsByOwner."""
    if not HELIUS_API_KEY:
        print("❌ HELIUS_API_KEY not set in .env")
        sys.exit(1)

    all_items = []
    page = 1
    native_balance = None

    while True:
        payload = {
            "jsonrpc": "2.0",
            "id": f"trackerclaw-{page}",
            "method": "getAssetsByOwner",
            "params": {
                "ownerAddress": address,
                "page": page,
                "limit": 1000,
                "displayOptions": {
                    "showFungible": True,
                    "showNativeBalance": True
                }
            }
        }

        try:
            resp = requests.post(HELIUS_RPC_URL, json=payload, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except requests.exceptions.RequestException as e:
            print(f"❌ Helius API error: {e}")
            sys.exit(1)

        if "error" in data:
            print(f"❌ Helius API error: {data['error']}")
            sys.exit(1)

        result = data.get("result", {})
        items = result.get("items", [])
        all_items.extend(items)

        if native_balance is None:
            native_balance = result.get("nativeBalance", {})

        # Check if more pages
        if len(items) < 1000:
            break
        page += 1
        time.sleep(0.2)  # rate limiting

    return {"items": all_items, "nativeBalance": native_balance}


def parse_token_positions(assets: dict) -> list:
    """Parse Helius asset response into token positions."""
    positions = []
    native = assets.get("nativeBalance", {})

    # Native SOL balance
    if native:
        lamports = native.get("lamports", 0)
        sol_amount = lamports / 1e9
        if sol_amount > 0.001:  # Filter dust
            positions.append({
                "mint": SOL_MINT,
                "symbol": "SOL",
                "amount": sol_amount,
                "decimals": 9,
                "is_native": True,
                "token_type": "native"
            })

    # SPL tokens (fungible)
    for item in assets.get("items", []):
        interface = item.get("interface", "")
        # Only process fungible tokens
        if interface not in ("FungibleToken", "FungibleAsset"):
            continue

        token_info = item.get("token_info", {})
        mint = item.get("id", "")
        symbol = token_info.get("symbol", "")
        decimals = token_info.get("decimals", 0)
        balance = token_info.get("balance", 0)

        # Use known token info if available
        if mint in KNOWN_TOKENS:
            if not symbol:
                symbol = KNOWN_TOKENS[mint]["symbol"]
            if not decimals:
                decimals = KNOWN_TOKENS[mint]["decimals"]

        # Calculate real amount
        amount = balance / (10 ** decimals) if decimals > 0 else balance

        if amount < 0.0001:  # Filter dust
            continue

        # Fallback symbol from content metadata
        if not symbol:
            content = item.get("content", {})
            metadata = content.get("metadata", {})
            symbol = metadata.get("symbol", mint[:8] + "...")

        positions.append({
            "mint": mint,
            "symbol": symbol,
            "amount": amount,
            "decimals": decimals,
            "is_native": False,
            "token_type": "spl"
        })

    return positions


def fetch_prices(mints: list) -> dict:
    """Fetch USD prices from Jupiter Price API v3 (lite)."""
    if not mints:
        return {}

    prices = {}
    # Use smaller batches — each mint is ~44 chars, and GET URL has length limits
    batch_size = 30
    for i in range(0, len(mints), batch_size):
        batch = mints[i:i + batch_size]
        ids_str = ",".join(batch)
        try:
            resp = requests.get(
                JUPITER_PRICE_URL,
                params={"ids": ids_str},
                timeout=15
            )
            resp.raise_for_status()
            # v3 returns {mint: {usdPrice: X, ...}} directly (no "data" wrapper)
            data = resp.json()
            for mint, info in data.items():
                if not isinstance(info, dict):
                    continue
                price = info.get("usdPrice")
                if price is not None:
                    prices[mint] = float(price)
        except requests.exceptions.RequestException as e:
            print(f"⚠️  Jupiter price API warning: {e}")
        time.sleep(0.2)

    return prices


def save_snapshot(portfolio_data: dict):
    """Save a daily snapshot for performance charts."""
    os.makedirs(SNAPSHOTS_DIR, exist_ok=True)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    snapshot_file = os.path.join(SNAPSHOTS_DIR, f"{today}.json")
    with open(snapshot_file, "w") as f:
        json.dump(portfolio_data, f, indent=2)


def format_usd(amount: float) -> str:
    """Format a number as USD."""
    if amount >= 1_000_000:
        return f"${amount:,.0f}"
    elif amount >= 1000:
        return f"${amount:,.2f}"
    elif amount >= 1:
        return f"${amount:.2f}"
    else:
        return f"${amount:.4f}"


def format_amount(amount: float) -> str:
    """Format a token amount."""
    if amount >= 1_000_000:
        return f"{amount:,.0f}"
    elif amount >= 1:
        return f"{amount:,.4f}"
    else:
        return f"{amount:.6f}"


def format_portfolio(wallet_data: list, total_value: float) -> str:
    """Format portfolio data as markdown text."""
    lines = []
    lines.append(f"**TrackerClaw** • {format_usd(total_value)}")
    wallet_labels = [wd["label"] for wd in wallet_data]
    lines.append(f"Wallets: {', '.join(wallet_labels)}")
    lines.append("")

    for wd in wallet_data:
        if len(wallet_data) > 1:
            lines.append(f"**{wd['label']}** — {format_usd(wd['total_value'])}")

        lines.append("**Tokens:**")
        # Sort by USD value descending
        tokens = sorted(wd["tokens"], key=lambda t: t.get("usd_value", 0), reverse=True)

        # Separate priced vs unpriced tokens
        priced = [t for t in tokens if t.get("usd_value", 0) > 0.01]
        unpriced = [t for t in tokens if t.get("usd_value", 0) <= 0.01]

        for t in priced:
            usd = t.get("usd_value", 0)
            price = t.get("price", 0)
            amount = t["amount"]
            symbol = t["symbol"]
            line = f"• {symbol:<10} {format_usd(usd)} ({format_amount(amount)} {symbol})"
            if price:
                line += f" @ {format_usd(price)}"
            lines.append(line)

        if unpriced:
            lines.append(f"_+ {len(unpriced)} dust/unpriced tokens hidden_")

        lines.append("")

    lines.append(f"**Total: {format_usd(total_value)}**")
    return "\n".join(lines)


def run_portfolio(wallet_filter: str = None, as_json: bool = False):
    """Main portfolio tracking logic."""
    wallets = load_wallets(wallet_filter)
    wallet_data = []
    all_mints = set()
    total_value = 0.0

    # Phase 1: Fetch all assets
    print("⏳ Fetching on-chain data...")
    wallet_positions = {}
    for w in wallets:
        print(f"  → {w['label']} ({w['address'][:8]}...)")
        assets = get_assets_by_owner(w["address"])
        positions = parse_token_positions(assets)
        wallet_positions[w["label"]] = positions
        for p in positions:
            all_mints.add(p["mint"])

    # Phase 2: Fetch prices
    print("⏳ Fetching prices...")
    prices = fetch_prices(list(all_mints))

    # Phase 3: Build portfolio
    for w in wallets:
        positions = wallet_positions[w["label"]]
        wallet_total = 0.0
        enriched_tokens = []

        for p in positions:
            price = prices.get(p["mint"], 0)
            usd_value = p["amount"] * price
            wallet_total += usd_value
            enriched_tokens.append({
                "symbol": p["symbol"],
                "mint": p["mint"],
                "amount": p["amount"],
                "price": price,
                "usd_value": usd_value,
                "token_type": p["token_type"]
            })

        total_value += wallet_total
        wallet_data.append({
            "label": w["label"],
            "address": w["address"],
            "total_value": wallet_total,
            "tokens": enriched_tokens
        })

    # Save snapshot
    snapshot = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_value": total_value,
        "wallets": wallet_data
    }
    save_snapshot(snapshot)

    if as_json:
        print(json.dumps(snapshot, indent=2))
    else:
        print()
        print(format_portfolio(wallet_data, total_value))


def main():
    parser = argparse.ArgumentParser(description="TrackerClaw — Portfolio Tracker")
    parser.add_argument("--wallet", "-w", help="Filter by wallet label")
    parser.add_argument("--json", "-j", action="store_true", help="Output raw JSON")
    args = parser.parse_args()
    run_portfolio(wallet_filter=args.wallet, as_json=args.json)


if __name__ == "__main__":
    main()
