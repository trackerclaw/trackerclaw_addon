#!/usr/bin/env python3
"""
TrackerClaw — Offline / Manual Asset Manager
Manages non-crypto assets (cash, stocks, gold, etc.) in data/offline.json.

Usage:
    python offline_assets.py list
    python offline_assets.py add cash 5000 USD
    python offline_assets.py add stock AAPL 12 shares 220 avg
    python offline_assets.py update <id> price 245
    python offline_assets.py remove <id>
    python offline_assets.py --json
"""

import json
import os
import sys
import argparse
import time
from datetime import datetime, timezone

import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
OFFLINE_FILE = os.path.join(PROJECT_DIR, "data", "offline.json")

# Yahoo Finance v8 API (public, no key needed)
YAHOO_QUOTE_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1d&interval=1d"


def load_offline() -> list:
    """Load offline assets from JSON file."""
    os.makedirs(os.path.dirname(OFFLINE_FILE), exist_ok=True)
    if os.path.exists(OFFLINE_FILE):
        with open(OFFLINE_FILE, "r") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    return []


def save_offline(assets: list):
    """Save offline assets to JSON file."""
    os.makedirs(os.path.dirname(OFFLINE_FILE), exist_ok=True)
    with open(OFFLINE_FILE, "w") as f:
        json.dump(assets, f, indent=2)


def next_id(assets: list) -> int:
    """Get next available ID."""
    if not assets:
        return 1
    return max(a.get("id", 0) for a in assets) + 1


def fetch_stock_price(symbol: str) -> float:
    """Fetch current stock price from Yahoo Finance."""
    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        info = ticker.fast_info
        return float(info.get("lastPrice", 0) or info.get("last_price", 0))
    except Exception:
        pass

    # Fallback: direct API call
    try:
        url = YAHOO_QUOTE_URL.format(symbol=symbol.upper())
        headers = {"User-Agent": "Mozilla/5.0"}
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            result = data.get("chart", {}).get("result", [])
            if result:
                meta = result[0].get("meta", {})
                return float(meta.get("regularMarketPrice", 0))
    except Exception:
        pass

    return 0.0


def cmd_list(as_json: bool = False):
    """List all offline assets."""
    assets = load_offline()

    if not assets:
        print("No offline assets tracked. Use 'add' to add some.")
        return

    # Update stock prices
    for a in assets:
        if a.get("type") == "stock" and a.get("symbol"):
            print(f"⏳ Fetching price for {a['symbol']}...")
            current = fetch_stock_price(a["symbol"])
            if current > 0:
                a["current_price"] = current
                a["current_value"] = current * a.get("shares", 0)

    save_offline(assets)

    if as_json:
        print(json.dumps(assets, indent=2))
        return

    total = 0.0
    print("**TrackerClaw — Offline Assets**\n")
    for a in assets:
        asset_id = a.get("id", "?")
        atype = a.get("type", "unknown")

        if atype == "cash":
            amount = a.get("amount", 0)
            currency = a.get("currency", "USD")
            total += amount
            print(f"• [#{asset_id}] Cash — {currency} {amount:,.2f}")

        elif atype == "stock":
            symbol = a.get("symbol", "???")
            shares = a.get("shares", 0)
            avg_price = a.get("avg_price", 0)
            current = a.get("current_price", avg_price)
            value = current * shares
            total += value
            pnl = (current - avg_price) * shares if avg_price > 0 else 0
            pnl_pct = ((current / avg_price) - 1) * 100 if avg_price > 0 else 0
            pnl_sign = "+" if pnl >= 0 else ""
            print(f"• [#{asset_id}] {symbol} — {shares} shares @ ${current:,.2f} "
                  f"= ${value:,.2f} ({pnl_sign}${pnl:,.2f} / {pnl_sign}{pnl_pct:.1f}%)")

        elif atype == "commodity":
            name = a.get("name", "Unknown")
            amount = a.get("amount", 0)
            unit = a.get("unit", "units")
            price = a.get("price_per_unit", 0)
            value = amount * price
            total += value
            print(f"• [#{asset_id}] {name} — {amount} {unit} @ ${price:,.2f} = ${value:,.2f}")

        else:
            name = a.get("name", atype)
            value = a.get("value", 0)
            total += value
            print(f"• [#{asset_id}] {name} — ${value:,.2f}")

    print(f"\n**Offline Total: ${total:,.2f}**")


def cmd_add(args: list):
    """Add an offline asset."""
    if len(args) < 3:
        print("Usage:")
        print("  add cash <amount> <currency>")
        print("  add stock <symbol> <shares> shares <avg_price> avg")
        print("  add commodity <name> <amount> <unit> <price_per_unit>")
        print("  add other <name> <value>")
        return

    assets = load_offline()
    asset_type = args[0].lower()
    aid = next_id(assets)

    if asset_type == "cash":
        amount = float(args[1])
        currency = args[2].upper() if len(args) > 2 else "USD"
        asset = {
            "id": aid,
            "type": "cash",
            "amount": amount,
            "currency": currency,
            "added": datetime.now(timezone.utc).isoformat()
        }
        assets.append(asset)
        save_offline(assets)
        print(f"✅ Added cash: {currency} {amount:,.2f} (#{aid})")

    elif asset_type == "stock":
        symbol = args[1].upper()
        shares = float(args[2])
        avg_price = 0.0
        # Parse optional "shares" and "avg" keywords
        remaining = args[3:]
        for i, a in enumerate(remaining):
            if a.lower() == "avg" and i > 0:
                try:
                    avg_price = float(remaining[i - 1])
                except ValueError:
                    pass
            elif a.lower() not in ("shares", "avg"):
                try:
                    avg_price = float(a)
                except ValueError:
                    pass

        # Fetch current price
        current_price = fetch_stock_price(symbol)
        if current_price == 0 and avg_price > 0:
            current_price = avg_price

        asset = {
            "id": aid,
            "type": "stock",
            "symbol": symbol,
            "shares": shares,
            "avg_price": avg_price,
            "current_price": current_price,
            "current_value": current_price * shares,
            "added": datetime.now(timezone.utc).isoformat()
        }
        assets.append(asset)
        save_offline(assets)
        print(f"✅ Added stock: {symbol} × {shares} @ avg ${avg_price:,.2f} "
              f"(current: ${current_price:,.2f}) (#{aid})")

    elif asset_type == "commodity":
        name = args[1]
        amount = float(args[2])
        unit = args[3] if len(args) > 3 else "units"
        price = float(args[4]) if len(args) > 4 else 0.0
        asset = {
            "id": aid,
            "type": "commodity",
            "name": name,
            "amount": amount,
            "unit": unit,
            "price_per_unit": price,
            "added": datetime.now(timezone.utc).isoformat()
        }
        assets.append(asset)
        save_offline(assets)
        print(f"✅ Added commodity: {name} × {amount} {unit} @ ${price:,.2f} (#{aid})")

    elif asset_type == "other":
        name = args[1]
        value = float(args[2]) if len(args) > 2 else 0.0
        asset = {
            "id": aid,
            "type": "other",
            "name": name,
            "value": value,
            "added": datetime.now(timezone.utc).isoformat()
        }
        assets.append(asset)
        save_offline(assets)
        print(f"✅ Added: {name} — ${value:,.2f} (#{aid})")

    else:
        print(f"❌ Unknown asset type: {asset_type}")
        print("Supported types: cash, stock, commodity, other")


def cmd_update(asset_id: str, field: str, value: str):
    """Update an offline asset field."""
    assets = load_offline()
    try:
        aid = int(asset_id)
    except ValueError:
        print(f"❌ Invalid asset ID: {asset_id}")
        return

    found = False
    for a in assets:
        if a.get("id") == aid:
            found = True
            if field.lower() == "price":
                new_price = float(value)
                if a.get("type") == "stock":
                    a["current_price"] = new_price
                    a["current_value"] = new_price * a.get("shares", 0)
                    print(f"✅ Updated #{aid} price to ${new_price:,.2f}")
                elif a.get("type") == "commodity":
                    a["price_per_unit"] = new_price
                    print(f"✅ Updated #{aid} price to ${new_price:,.2f}")
                else:
                    a["value"] = new_price
                    print(f"✅ Updated #{aid} value to ${new_price:,.2f}")
            elif field.lower() == "amount":
                a["amount"] = float(value)
                print(f"✅ Updated #{aid} amount to {value}")
            elif field.lower() == "shares":
                a["shares"] = float(value)
                print(f"✅ Updated #{aid} shares to {value}")
            else:
                a[field] = value
                print(f"✅ Updated #{aid} {field} to {value}")
            a["updated"] = datetime.now(timezone.utc).isoformat()
            break

    if not found:
        print(f"❌ No asset found with ID #{asset_id}")
        return

    save_offline(assets)


def cmd_remove(asset_id: str):
    """Remove an offline asset."""
    assets = load_offline()
    try:
        aid = int(asset_id)
    except ValueError:
        print(f"❌ Invalid asset ID: {asset_id}")
        return

    original_len = len(assets)
    assets = [a for a in assets if a.get("id") != aid]

    if len(assets) == original_len:
        print(f"❌ No asset found with ID #{asset_id}")
        return

    save_offline(assets)
    print(f"✅ Removed asset #{asset_id}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "list":
        as_json = "--json" in sys.argv or "-j" in sys.argv
        cmd_list(as_json=as_json)
    elif command == "add":
        cmd_add(sys.argv[2:])
    elif command == "update":
        if len(sys.argv) < 5:
            print("Usage: python offline_assets.py update <id> <field> <value>")
            sys.exit(1)
        cmd_update(sys.argv[2], sys.argv[3], sys.argv[4])
    elif command == "remove":
        if len(sys.argv) < 3:
            print("Usage: python offline_assets.py remove <id>")
            sys.exit(1)
        cmd_remove(sys.argv[2])
    elif command == "--json" or command == "-j":
        cmd_list(as_json=True)
    else:
        print(f"Unknown command: {command}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
