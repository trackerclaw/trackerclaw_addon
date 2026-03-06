#!/usr/bin/env python3
"""
Programmatic JSON API for arbitrary Solana wallet portfolio reports.
"""

import argparse
import contextlib
import io
import json

try:
    from . import defi_tracker, portfolio_tracker
except ImportError:  # pragma: no cover
    import defi_tracker
    import portfolio_tracker


def _round_amount(value, digits=12):
    return round(float(value), digits)


def build_spot_portfolio(address: str) -> dict:
    assets = portfolio_tracker.get_assets_by_owner(address)
    positions = portfolio_tracker.parse_token_positions(assets)
    prices = portfolio_tracker.fetch_prices([position["mint"] for position in positions])

    tokens = []
    total_usd = 0.0
    for position in positions:
        price = float(prices.get(position["mint"], 0) or 0)
        usd_value = float(position["amount"]) * price
        total_usd += usd_value
        tokens.append(
            {
                "symbol": position["symbol"],
                "mint": position["mint"],
                "amount": _round_amount(position["amount"]),
                "price_usd": _round_amount(price),
                "value_usd": round(usd_value, 2),
                "token_type": position.get("token_type", ""),
            }
        )

    tokens.sort(key=lambda item: item["value_usd"], reverse=True)
    visible_tokens = [token for token in tokens if token["value_usd"] > 0.01]

    return {
        "total_usd": round(total_usd, 2),
        "token_count": len(tokens),
        "visible_token_count": len(visible_tokens),
        "hidden_token_count": len(tokens) - len(visible_tokens),
        "tokens": tokens,
    }


def build_defi_portfolio(address: str) -> dict:
    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        positions = defi_tracker.detect_positions(address)
    positions.sort(key=lambda item: float(item.get("usd_value", 0) or 0), reverse=True)

    total_usd = 0.0
    protocols = {}
    normalized_positions = []
    for position in positions:
        usd_value = float(position.get("usd_value", 0) or 0)
        total_usd += usd_value

        normalized = {
            "protocol": position.get("protocol", ""),
            "type": position.get("type", ""),
            "account": position.get("account", ""),
            "url": position.get("url", ""),
            "value_usd": round(usd_value, 2),
            "details": position.get("details", {}),
        }
        normalized_positions.append(normalized)

        protocol_name = normalized["protocol"]
        protocol_bucket = protocols.setdefault(
            protocol_name,
            {
                "protocol": protocol_name,
                "total_usd": 0.0,
                "positions": [],
            },
        )
        protocol_bucket["total_usd"] += usd_value
        protocol_bucket["positions"].append(normalized)

    grouped_protocols = list(protocols.values())
    grouped_protocols.sort(key=lambda item: item["total_usd"], reverse=True)
    for protocol in grouped_protocols:
        protocol["total_usd"] = round(protocol["total_usd"], 2)

    return {
        "total_usd": round(total_usd, 2),
        "protocol_count": len(grouped_protocols),
        "position_count": len(normalized_positions),
        "protocols": grouped_protocols,
        "positions": normalized_positions,
    }


def get_wallet_portfolio_json(address: str) -> dict:
    """
    Return machine-readable spot + DeFi portfolio JSON for one Solana wallet.
    """
    spot = build_spot_portfolio(address)
    defi = build_defi_portfolio(address)
    return {
        "address": address,
        "spot": spot,
        "defi": defi,
        "totals": {
            "spot_usd": spot["total_usd"],
            "defi_usd": defi["total_usd"],
            "combined_usd": round(spot["total_usd"] + defi["total_usd"], 2),
        },
    }


def get_wallets_portfolio_json(addresses: list[str]) -> dict:
    """
    Return machine-readable combined portfolio JSON for multiple Solana wallets.
    """
    wallets = [get_wallet_portfolio_json(address) for address in addresses]
    spot_total = sum(wallet["totals"]["spot_usd"] for wallet in wallets)
    defi_total = sum(wallet["totals"]["defi_usd"] for wallet in wallets)

    return {
        "wallet_count": len(wallets),
        "wallets": wallets,
        "totals": {
            "spot_usd": round(spot_total, 2),
            "defi_usd": round(defi_total, 2),
            "combined_usd": round(spot_total + defi_total, 2),
        },
    }


def main():
    parser = argparse.ArgumentParser(description="Programmatic Solana portfolio JSON API")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--wallet", help="Single Solana wallet address")
    group.add_argument("--wallets", nargs="+", help="One or more Solana wallet addresses")
    args = parser.parse_args()

    if args.wallet:
        payload = get_wallet_portfolio_json(args.wallet)
    else:
        payload = get_wallets_portfolio_json(args.wallets)

    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
