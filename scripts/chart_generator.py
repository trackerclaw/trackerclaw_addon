#!/usr/bin/env python3
"""
TrackerClaw - Chart Generator

Usage:
    python chart_generator.py portfolio     # pie chart of latest spot allocation
    python chart_generator.py performance   # total growth + top 3 component lines
    python chart_generator.py apy           # DeFi APY bar chart
"""

import glob
import json
import os
import sys
from datetime import datetime, timezone

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
LEGACY_SNAPSHOTS_DIR = os.path.join(PROJECT_DIR, "data", "snapshots")
OPENCLAW_SNAPSHOTS_DIR = os.path.join(PROJECT_DIR, "data", "openclaw_snapshots")
CHARTS_DIR = os.path.join(PROJECT_DIR, "data", "charts")

COLORS = [
    "#00D4AA",
    "#7C5CFC",
    "#FF6B6B",
    "#4ECDC4",
    "#FFE66D",
    "#95E1D3",
    "#F38181",
    "#AA96DA",
    "#FCBAD3",
    "#A8E6CF",
]

BG_COLOR = "#0D1117"
TEXT_COLOR = "#C9D1D9"
GRID_COLOR = "#21262D"


def setup_style():
    plt.rcParams.update(
        {
            "figure.facecolor": BG_COLOR,
            "axes.facecolor": BG_COLOR,
            "axes.edgecolor": GRID_COLOR,
            "axes.labelcolor": TEXT_COLOR,
            "text.color": TEXT_COLOR,
            "xtick.color": TEXT_COLOR,
            "ytick.color": TEXT_COLOR,
            "grid.color": GRID_COLOR,
            "grid.alpha": 0.25,
            "font.family": "sans-serif",
            "font.size": 11,
            "axes.titlesize": 14,
            "figure.titlesize": 16,
        }
    )


def _load_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def load_latest_snapshot() -> dict | None:
    openclaw_files = sorted(glob.glob(os.path.join(OPENCLAW_SNAPSHOTS_DIR, "*.json")))
    if openclaw_files:
        return _load_json(openclaw_files[-1])

    legacy_files = sorted(glob.glob(os.path.join(LEGACY_SNAPSHOTS_DIR, "*.json")))
    if legacy_files:
        return _load_json(legacy_files[-1])

    return None


def load_openclaw_snapshots(days: int = 30) -> list[dict]:
    if not os.path.exists(OPENCLAW_SNAPSHOTS_DIR):
        return []

    files = sorted(glob.glob(os.path.join(OPENCLAW_SNAPSHOTS_DIR, "*.json")))
    files = files[-days:]

    snapshots = []
    for path in files:
        snapshot = _load_json(path)
        snapshot["_source"] = "openclaw"
        snapshots.append(snapshot)
    return snapshots


def load_legacy_snapshots(days: int = 30) -> list[dict]:
    if not os.path.exists(LEGACY_SNAPSHOTS_DIR):
        return []

    files = sorted(glob.glob(os.path.join(LEGACY_SNAPSHOTS_DIR, "*.json")))
    files = files[-days:]

    snapshots = []
    for path in files:
        snapshot = _load_json(path)
        snapshot["_source"] = "legacy"
        snapshot["_date"] = os.path.basename(path).replace(".json", "")
        snapshots.append(snapshot)
    return snapshots


def load_snapshots(days: int = 30) -> list[dict]:
    snapshots = load_openclaw_snapshots(days=days)
    if snapshots:
        return snapshots
    return load_legacy_snapshots(days=days)


def parse_snapshot_timestamp(snapshot: dict) -> datetime | None:
    if snapshot.get("_source") == "openclaw":
        timestamp = snapshot.get("timestamp")
        if not timestamp:
            return None
        return datetime.fromisoformat(timestamp.replace("Z", "+00:00"))

    snapshot_date = snapshot.get("_date")
    if not snapshot_date:
        return None
    return datetime.strptime(snapshot_date, "%Y-%m-%d")


def extract_snapshot_total(snapshot: dict) -> float:
    if snapshot.get("_source") == "openclaw":
        return float((snapshot.get("totals") or {}).get("combined_usd", 0) or 0)
    return float(snapshot.get("total_value", 0) or 0)


def extract_spot_components(snapshot: dict) -> dict[str, float]:
    components = {}

    if snapshot.get("_source") == "openclaw":
        for wallet in snapshot.get("wallets", []):
            for token in (wallet.get("spot") or {}).get("tokens", []):
                label = token.get("symbol", "")
                value = float(token.get("value_usd", 0) or 0)
                if label and value > 0:
                    components[label] = components.get(label, 0) + value
        return components

    for wallet in snapshot.get("wallets", []):
        for token in wallet.get("tokens", []):
            label = token.get("symbol", "")
            value = float(token.get("usd_value", 0) or 0)
            if label and value > 0:
                components[label] = components.get(label, 0) + value
    return components


def extract_defi_components(snapshot: dict) -> dict[str, float]:
    if snapshot.get("_source") != "openclaw":
        return {}

    components = {}
    for wallet in snapshot.get("wallets", []):
        for position in (wallet.get("defi") or {}).get("positions", []):
            protocol = position.get("protocol", "")
            position_type = position.get("type", "")
            label = f"{protocol}: {position_type}".strip(": ")
            value = float(position.get("value_usd", 0) or 0)
            if label and value > 0:
                components[label] = components.get(label, 0) + value
    return components


def extract_all_components(snapshot: dict) -> dict[str, float]:
    components = extract_spot_components(snapshot)
    for label, value in extract_defi_components(snapshot).items():
        components[label] = components.get(label, 0) + value
    return components


def chart_portfolio():
    setup_style()
    snapshot = load_latest_snapshot()
    if not snapshot:
        print("No portfolio snapshot found. Run openclaw_portfolio.py snapshot first.")
        sys.exit(1)

    token_values = extract_spot_components(snapshot)
    if not token_values:
        print("No spot token positions with value found.")
        sys.exit(1)

    sorted_tokens = sorted(token_values.items(), key=lambda item: item[1], reverse=True)
    total = sum(value for _, value in sorted_tokens)
    labels = []
    values = []
    other = 0.0

    for symbol, value in sorted_tokens:
        pct = (value / total) * 100 if total else 0
        if pct < 2.0 and len(labels) >= 8:
            other += value
        else:
            labels.append(f"{symbol}\n${value:,.0f}")
            values.append(value)

    if other > 0:
        labels.append(f"Other\n${other:,.0f}")
        values.append(other)

    fig, ax = plt.subplots(figsize=(10, 8))
    wedges, texts, autotexts = ax.pie(
        values,
        labels=labels,
        colors=COLORS[:len(values)],
        autopct=lambda pct: f"{pct:.1f}%" if pct > 3 else "",
        startangle=90,
        pctdistance=0.75,
        wedgeprops={"width": 0.5, "edgecolor": BG_COLOR, "linewidth": 2},
    )

    for text in texts:
        text.set_fontsize(9)
    for autotext in autotexts:
        autotext.set_fontsize(8)
        autotext.set_color(TEXT_COLOR)

    ax.set_title(f"Portfolio Allocation - ${total:,.2f}", fontweight="bold", pad=20)

    os.makedirs(CHARTS_DIR, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = os.path.join(CHARTS_DIR, f"portfolio_{timestamp}.png")
    plt.savefig(path, dpi=150, bbox_inches="tight", facecolor=BG_COLOR)
    plt.close()

    print(f"Chart saved: {path}")
    return path


def chart_performance():
    setup_style()

    snapshots = load_snapshots(days=30)
    if len(snapshots) < 2:
        print("Need at least 2 snapshots for a performance chart.")
        print("Tip: Run openclaw_portfolio.py snapshot multiple times to build history.")
        sys.exit(1)

    latest_components = extract_all_components(snapshots[-1])
    top_labels = [label for label, _ in sorted(latest_components.items(), key=lambda item: item[1], reverse=True)[:3]]

    dates = []
    totals = []
    component_series = {label: [] for label in top_labels}

    for snapshot in snapshots:
        parsed = parse_snapshot_timestamp(snapshot)
        if not parsed:
            continue

        dates.append(parsed)
        totals.append(extract_snapshot_total(snapshot))

        components = extract_all_components(snapshot)
        for label in top_labels:
            component_series[label].append(components.get(label, 0))

    if len(dates) < 2:
        print("Not enough valid snapshots.")
        sys.exit(1)

    start_value = totals[0]
    end_value = totals[-1]
    change = end_value - start_value
    change_pct = ((end_value / start_value) - 1) * 100 if start_value else 0
    change_sign = "+" if change >= 0 else ""
    total_color = "#00D4AA" if change >= 0 else "#FF6B6B"

    fig, (ax_total, ax_components) = plt.subplots(
        2,
        1,
        figsize=(13, 9),
        sharex=True,
        gridspec_kw={"height_ratios": [2, 1.4], "hspace": 0.08},
    )

    ax_total.fill_between(dates, totals, alpha=0.12, color=total_color)
    ax_total.plot(
        dates,
        totals,
        color=total_color,
        linewidth=3,
        marker="o",
        markersize=5,
        label="Total Portfolio",
    )

    for index, label in enumerate(top_labels):
        color = COLORS[(index + 1) % len(COLORS)]
        ax_components.plot(
            dates,
            component_series[label],
            color=color,
        linewidth=2,
            marker="o",
            markersize=4,
            linestyle="-",
            label=label,
        )

    ax_total.set_title(
        f"Portfolio Growth ({change_sign}{change_pct:.1f}%)",
        fontweight="bold",
        pad=15,
    )
    ax_total.set_ylabel("Total USD")
    ax_total.grid(True, alpha=0.2)
    ax_components.set_ylabel("Component USD")
    ax_components.set_xlabel("Snapshot Date")
    ax_components.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
    ax_components.grid(True, alpha=0.2)
    plt.xticks(rotation=35)

    ax_total.annotate(
        f"${start_value:,.0f}",
        (dates[0], totals[0]),
        textcoords="offset points",
        xytext=(0, 12),
        fontsize=9,
        color=TEXT_COLOR,
        ha="center",
    )
    ax_total.annotate(
        f"${end_value:,.0f}",
        (dates[-1], totals[-1]),
        textcoords="offset points",
        xytext=(0, 12),
        fontsize=9,
        color=total_color,
        ha="center",
        fontweight="bold",
    )

    for index, label in enumerate(top_labels):
        final_value = component_series[label][-1]
        ax_components.annotate(
            f"${final_value:,.0f}",
            (dates[-1], final_value),
            textcoords="offset points",
            xytext=(8, 0),
            fontsize=8,
            color=COLORS[(index + 1) % len(COLORS)],
            va="center",
        )

    total_legend = ax_total.legend(loc="upper left", frameon=False)
    component_legend = ax_components.legend(loc="upper left", frameon=False)
    for text in total_legend.get_texts():
        text.set_color(TEXT_COLOR)
    for text in component_legend.get_texts():
        text.set_color(TEXT_COLOR)

    os.makedirs(CHARTS_DIR, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = os.path.join(CHARTS_DIR, f"performance_{timestamp}.png")
    plt.savefig(path, dpi=150, bbox_inches="tight", facecolor=BG_COLOR)
    plt.close()

    print(f"Chart saved: {path}")
    return path


def chart_apy():
    setup_style()

    snapshot = load_latest_snapshot()
    if not snapshot or snapshot.get("_source") != "openclaw":
        print("No OpenClaw snapshot found. Run openclaw_portfolio.py snapshot first.")
        sys.exit(1)

    positions = []
    for wallet in snapshot.get("wallets", []):
        positions.extend((wallet.get("defi") or {}).get("positions", []))

    apy_data = []
    for position in positions:
        details = position.get("details") or {}
        apy = details.get("apy_pct") or details.get("net_apy_pct")
        if apy:
            apy_data.append((f"{position.get('protocol', '')} {position.get('type', '')}".strip(), float(apy)))

    if not apy_data:
        print("No positions with APY data found in the latest snapshot.")
        sys.exit(1)

    labels, apys = zip(*apy_data)
    fig, ax = plt.subplots(figsize=(10, 6))
    bars = ax.bar(range(len(labels)), apys, color=COLORS[:len(apys)], edgecolor=BG_COLOR, linewidth=1)

    for bar, apy in zip(bars, apys):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + 0.2,
            f"{apy:.1f}%",
            ha="center",
            fontsize=9,
            color=TEXT_COLOR,
        )

    ax.set_title("DeFi Yields", fontweight="bold", pad=15)
    ax.set_ylabel("APY (%)")
    ax.set_xticks(range(len(labels)))
    ax.set_xticklabels(labels, rotation=45, ha="right", fontsize=9)
    ax.grid(True, axis="y", alpha=0.2)

    os.makedirs(CHARTS_DIR, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = os.path.join(CHARTS_DIR, f"apy_{timestamp}.png")
    plt.savefig(path, dpi=150, bbox_inches="tight", facecolor=BG_COLOR)
    plt.close()

    print(f"Chart saved: {path}")
    return path


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    chart_type = sys.argv[1].lower()
    if chart_type == "portfolio":
        chart_portfolio()
    elif chart_type == "performance":
        chart_performance()
    elif chart_type == "apy":
        chart_apy()
    else:
        print(f"Unknown chart type: {chart_type}")
        print("Available: portfolio, performance, apy")
        sys.exit(1)


if __name__ == "__main__":
    main()
