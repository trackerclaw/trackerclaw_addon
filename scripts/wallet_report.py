#!/usr/bin/env python3
"""
Run a combined spot + DeFi report for an arbitrary Solana wallet address.
"""

import argparse
import json

import defi_tracker
import portfolio_tracker


def build_spot_report(address: str) -> tuple[str, float]:
    assets = portfolio_tracker.get_assets_by_owner(address)
    positions = portfolio_tracker.parse_token_positions(assets)
    mints = [position["mint"] for position in positions]
    prices = portfolio_tracker.fetch_prices(mints)

    enriched = []
    total = 0.0
    for position in positions:
        price = prices.get(position["mint"], 0)
        usd_value = position["amount"] * price
        total += usd_value
        enriched.append(
            {
                "symbol": position["symbol"],
                "amount": position["amount"],
                "price": price,
                "usd_value": usd_value,
            }
        )

    enriched.sort(key=lambda item: item["usd_value"], reverse=True)
    priced = [item for item in enriched if item["usd_value"] > 0.01]
    hidden = len(enriched) - len(priced)

    lines = [f"TrackerClaw - Spot Portfolio for {address}", ""]
    for token in priced:
        lines.append(
            f"• {token['symbol']:<10} "
            f"{portfolio_tracker.format_usd(token['usd_value'])} "
            f"({portfolio_tracker.format_amount(token['amount'])} {token['symbol']}) "
            f"@ {portfolio_tracker.format_usd(token['price'])}"
        )
    if hidden > 0:
        lines.append(f"+ {hidden} dust/unpriced tokens hidden")
    lines.append("")
    lines.append(f"Spot Total: {portfolio_tracker.format_usd(total)}")
    return "\n".join(lines), total


def build_defi_report(address: str) -> tuple[str, float]:
    positions = defi_tracker.detect_positions(address)
    if not positions:
        return "No DeFi positions found.", 0.0

    grouped = {}
    total = 0.0
    for position in positions:
        grouped.setdefault(position["protocol"], []).append(position)
        total += float(position.get("usd_value", 0) or 0)

    lines = ["DeFi Positions", ""]
    for protocol, entries in grouped.items():
        protocol_total = sum(float(entry.get("usd_value", 0) or 0) for entry in entries)
        lines.append(f"{protocol} - {defi_tracker.format_usd(protocol_total)}")
        for entry in entries:
            line = f"• {entry.get('type', 'Position')}"
            usd_value = float(entry.get("usd_value", 0) or 0)
            if usd_value > 0:
                line += f" - {defi_tracker.format_usd(usd_value)}"
            lines.append(line)
        lines.append("")
    lines.append(f"DeFi Total: {defi_tracker.format_usd(total)}")
    return "\n".join(lines), total


def main():
    parser = argparse.ArgumentParser(description="Combined wallet report")
    parser.add_argument("address", help="Solana wallet address")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    args = parser.parse_args()

    spot_text, spot_total = build_spot_report(args.address)
    defi_text, defi_total = build_defi_report(args.address)

    if args.json:
        print(
            json.dumps(
                {
                    "address": args.address,
                    "spot_total": spot_total,
                    "defi_total": defi_total,
                    "combined_total": spot_total + defi_total,
                    "spot_report": spot_text,
                    "defi_report": defi_text,
                },
                indent=2,
            )
        )
        return

    print(spot_text)
    print()
    print(defi_text)
    print()
    print(f"Combined Total: {portfolio_tracker.format_usd(spot_total + defi_total)}")


if __name__ == "__main__":
    main()
