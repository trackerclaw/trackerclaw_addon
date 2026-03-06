#!/usr/bin/env python3
"""
OpenClaw integration portfolio entrypoint.

Commands:
  report   -> return current portfolio JSON for one wallet, many wallets, or a wallet file
  snapshot -> save the current portfolio JSON to disk
  history  -> return historical performance JSON from saved snapshots
"""

import argparse
import json
import os
from datetime import datetime, timezone

try:
    from .portfolio_api import get_wallets_portfolio_json
except ImportError:  # pragma: no cover
    from portfolio_api import get_wallets_portfolio_json


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
DEFAULT_WALLET_FILES = [
    os.path.join(PROJECT_DIR, "data", "wallets.json"),
    os.path.join(PROJECT_DIR, "myWallets.json"),
    os.path.join(PROJECT_DIR, "myWallets"),
    os.path.join(PROJECT_DIR, "wallets"),
]
SNAPSHOT_DIR = os.path.join(PROJECT_DIR, "data", "openclaw_snapshots")


def load_wallet_file(path: str) -> list[str]:
    with open(path, "r", encoding="utf-8") as handle:
        raw = handle.read().strip()

    if not raw:
        return []

    if path.endswith(".json"):
        data = json.loads(raw)
        if isinstance(data, list):
            wallets = []
            for item in data:
                if isinstance(item, str):
                    wallets.append(item)
                elif isinstance(item, dict) and item.get("address"):
                    wallets.append(item["address"])
            return wallets

    wallets = []
    for line in raw.splitlines():
        value = line.strip()
        if value:
            wallets.append(value)
    return wallets


def resolve_wallets(wallet: str = None, wallets: list[str] = None, wallet_file: str = None) -> list[str]:
    if wallet:
        return [wallet]
    if wallets:
        return wallets
    if wallet_file:
        return load_wallet_file(wallet_file)

    for candidate in DEFAULT_WALLET_FILES:
        if os.path.exists(candidate):
            resolved = load_wallet_file(candidate)
            if resolved:
                return resolved

    raise FileNotFoundError("No wallet source found. Pass --wallet, --wallets, or --wallet-file.")


def build_snapshot(addresses: list[str]) -> dict:
    payload = get_wallets_portfolio_json(addresses)
    payload["timestamp"] = datetime.now(timezone.utc).isoformat()
    return payload


def save_snapshot(payload: dict) -> str:
    os.makedirs(SNAPSHOT_DIR, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    path = os.path.join(SNAPSHOT_DIR, f"{timestamp}.json")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    return path


def load_history(days: int = 30) -> list[dict]:
    if not os.path.exists(SNAPSHOT_DIR):
        return []

    files = sorted(
        os.path.join(SNAPSHOT_DIR, name)
        for name in os.listdir(SNAPSHOT_DIR)
        if name.endswith(".json")
    )
    if days > 0:
        files = files[-days:]

    history = []
    for path in files:
        with open(path, "r", encoding="utf-8") as handle:
            history.append(json.load(handle))
    return history


def build_history_payload(days: int = 30) -> dict:
    snapshots = load_history(days=days)
    series = []
    for snapshot in snapshots:
        totals = snapshot.get("totals", {})
        series.append(
            {
                "timestamp": snapshot.get("timestamp", ""),
                "spot_usd": totals.get("spot_usd", 0),
                "defi_usd": totals.get("defi_usd", 0),
                "combined_usd": totals.get("combined_usd", 0),
                "wallet_count": snapshot.get("wallet_count", len(snapshot.get("wallets", []))),
            }
        )

    performance = {
        "start_combined_usd": 0,
        "end_combined_usd": 0,
        "change_usd": 0,
        "change_pct": 0,
    }
    if len(series) >= 2:
        start = float(series[0]["combined_usd"] or 0)
        end = float(series[-1]["combined_usd"] or 0)
        change = end - start
        performance = {
            "start_combined_usd": round(start, 2),
            "end_combined_usd": round(end, 2),
            "change_usd": round(change, 2),
            "change_pct": round((change / start) * 100, 2) if start else 0,
        }

    return {
        "snapshot_count": len(series),
        "series": series,
        "performance": performance,
    }


def main():
    parser = argparse.ArgumentParser(description="OpenClaw portfolio integration entrypoint")
    subparsers = parser.add_subparsers(dest="command", required=True)

    def add_wallet_args(subparser):
        group = subparser.add_mutually_exclusive_group()
        group.add_argument("--wallet", help="Single Solana wallet address")
        group.add_argument("--wallets", nargs="+", help="Multiple Solana wallet addresses")
        group.add_argument("--wallet-file", help="Path to a wallet file or wallet JSON list")

    report_parser = subparsers.add_parser("report", help="Return current portfolio JSON")
    add_wallet_args(report_parser)

    snapshot_parser = subparsers.add_parser("snapshot", help="Save current portfolio snapshot JSON")
    add_wallet_args(snapshot_parser)

    history_parser = subparsers.add_parser("history", help="Return historical performance JSON")
    history_parser.add_argument("--days", type=int, default=30, help="How many most recent snapshots to read")

    args = parser.parse_args()

    if args.command == "history":
        print(json.dumps(build_history_payload(days=args.days), indent=2))
        return

    addresses = resolve_wallets(wallet=args.wallet, wallets=args.wallets, wallet_file=args.wallet_file)
    payload = build_snapshot(addresses)

    if args.command == "report":
        print(json.dumps(payload, indent=2))
        return

    snapshot_path = save_snapshot(payload)
    response = {
        "saved": True,
        "snapshot_path": snapshot_path,
        "payload": payload,
    }
    print(json.dumps(response, indent=2))


if __name__ == "__main__":
    main()
