#!/usr/bin/env python3
"""
TrackerClaw — Wallet Manager
Manages wallet labels + addresses in data/wallets.json.

Usage:
    python wallet_manager.py list
    python wallet_manager.py add <label> <address>
    python wallet_manager.py remove <label>
    python wallet_manager.py rename <old_label> <new_label>
"""

import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
WALLETS_FILE = os.path.join(PROJECT_DIR, "data", "wallets.json")
RAW_WALLETS_FILE = os.path.join(PROJECT_DIR, "wallets")


def load_wallets() -> list:
    """Load wallets from JSON file, seeding from raw wallets file if needed."""
    os.makedirs(os.path.dirname(WALLETS_FILE), exist_ok=True)

    if os.path.exists(WALLETS_FILE):
        with open(WALLETS_FILE, "r") as f:
            return json.load(f)

    # Seed from raw wallets file if wallets.json doesn't exist yet
    wallets = []
    if os.path.exists(RAW_WALLETS_FILE):
        with open(RAW_WALLETS_FILE, "r") as f:
            for i, line in enumerate(f):
                addr = line.strip()
                if addr:
                    wallets.append({
                        "label": f"Wallet{i + 1}" if i > 0 else "Main",
                        "address": addr
                    })
    save_wallets(wallets)
    return wallets


def save_wallets(wallets: list):
    """Save wallets to JSON file."""
    os.makedirs(os.path.dirname(WALLETS_FILE), exist_ok=True)
    with open(WALLETS_FILE, "w") as f:
        json.dump(wallets, f, indent=2)


def cmd_list():
    """List all tracked wallets."""
    wallets = load_wallets()
    if not wallets:
        print("No wallets tracked yet. Use 'add <label> <address>' to add one.")
        return

    print(f"📋 **Tracked Wallets** ({len(wallets)})\n")
    for w in wallets:
        short = w["address"][:6] + "..." + w["address"][-4:]
        print(f"• **{w['label']}** — `{short}` ({w['address']})")


def cmd_add(label: str, address: str):
    """Add a new wallet."""
    wallets = load_wallets()

    # Check for duplicate label
    for w in wallets:
        if w["label"].lower() == label.lower():
            print(f"❌ Wallet with label '{label}' already exists.")
            return

    # Check for duplicate address
    for w in wallets:
        if w["address"] == address:
            print(f"❌ Address already tracked under label '{w['label']}'.")
            return

    # Validate address (basic Solana address check: base58, 32-44 chars)
    if not (32 <= len(address) <= 44):
        print(f"❌ Invalid Solana address (expected 32-44 characters, got {len(address)}).")
        return

    wallets.append({"label": label, "address": address})
    save_wallets(wallets)
    short = address[:6] + "..." + address[-4:]
    print(f"✅ Added wallet **{label}** — `{short}`")


def cmd_remove(label: str):
    """Remove a wallet by label."""
    wallets = load_wallets()
    original_len = len(wallets)
    wallets = [w for w in wallets if w["label"].lower() != label.lower()]

    if len(wallets) == original_len:
        print(f"❌ No wallet found with label '{label}'.")
        return

    save_wallets(wallets)
    print(f"✅ Removed wallet **{label}**")


def cmd_rename(old_label: str, new_label: str):
    """Rename a wallet."""
    wallets = load_wallets()

    # Check new label doesn't conflict
    for w in wallets:
        if w["label"].lower() == new_label.lower():
            print(f"❌ Label '{new_label}' is already in use.")
            return

    found = False
    for w in wallets:
        if w["label"].lower() == old_label.lower():
            w["label"] = new_label
            found = True
            break

    if not found:
        print(f"❌ No wallet found with label '{old_label}'.")
        return

    save_wallets(wallets)
    print(f"✅ Renamed **{old_label}** → **{new_label}**")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "list":
        cmd_list()
    elif command == "add":
        if len(sys.argv) < 4:
            print("Usage: python wallet_manager.py add <label> <address>")
            sys.exit(1)
        cmd_add(sys.argv[2], sys.argv[3])
    elif command == "remove":
        if len(sys.argv) < 3:
            print("Usage: python wallet_manager.py remove <label>")
            sys.exit(1)
        cmd_remove(sys.argv[2])
    elif command == "rename":
        if len(sys.argv) < 4:
            print("Usage: python wallet_manager.py rename <old_label> <new_label>")
            sys.exit(1)
        cmd_rename(sys.argv[2], sys.argv[3])
    else:
        print(f"Unknown command: {command}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
