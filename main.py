"""
main.py — CLI entry point.

Run the deterministic engine (default, zero keys needed):

    python main.py --list
    python main.py --scenario stolen_wallet
    python main.py --all

Run the live LLM agents (needs .env, traced in Langfuse):

    python main.py --scenario stolen_wallet --live
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from datetime import datetime
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))

from src.engine import analyze, build_flags, load_persona  # noqa: E402

SCENARIO_DIR = Path(__file__).resolve().parent / "scenarios"
BORDER = "─" * 74


def load_scenario(sid: str) -> dict:
    path = SCENARIO_DIR / f"{sid}.json"
    if not path.exists():
        available = ", ".join(p.stem for p in SCENARIO_DIR.glob("*.json"))
        raise SystemExit(f"Unknown scenario '{sid}'. Available: {available}")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def print_trace(txn: dict, result: dict) -> None:
    print(BORDER)
    print(f"TRANSACTION  {txn['merchant']}  ·  £{txn['amount']:.2f}")
    print(f"             {txn['date']} {txn['time']} · {txn['city']}, {txn['country']} · {txn['method']}")
    print(BORDER)
    names = {"triage": "AGENT 1 · TRIAGE (cheap screening)",
             "context": "AGENT 2 · CONTEXT (GPS cross-check)",
             "comms": "AGENT 3 · COMMUNICATION (phishing scan)",
             "judge": "AGENT 4 · JUDGE (binding verdict)"}
    for key in ("triage", "context", "comms", "judge"):
        block = result[key]
        print(f"\n{names[key]}")
        for line in block["thinking"]:
            print(f"  ▸ {line}")
        extras = []
        if key == "triage":
            extras = [f"score = {block['score']}/10"]
        elif key == "context":
            extras = [f"location_flag = {block['flag']}", f"impossible_travel = {block['impossible']}"]
        elif key == "comms":
            extras = [f"comms_flag = {block['flag']}"]
        elif key == "judge":
            extras = [f"risk = {block['risk']}/100"]
            extras += [f"{'+' if f['points'] > 0 else ''}{f['points']} {f['factor']}" for f in block["factors"]]
        for e in extras:
            print(f"  · {e}")

    j = result["judge"]
    print("\n" + BORDER)
    icon = {"APPROVE": "✅", "DECLINE": "🛑", "DECLINE + FREEZE": "❄️"}[j["action"]]
    print(f"{icon} DECISION: {j['action']}   (risk {j['risk']}/100)")
    print(BORDER)


def run_engine(scenario: dict, persona: dict) -> dict:
    txn = dict(scenario["txn"])
    if scenario.get("gps_override"):
        txn["gps_override"] = scenario["gps_override"]
    result = analyze(txn, persona, extra_sms=scenario.get("inject_sms") or [])
    print_trace(txn, result)
    return result


def run_live(scenario: dict, persona: dict) -> dict:
    from src.agents import run_live as live_agents
    from src.utils import live_env_ready
    if not live_env_ready():
        raise SystemExit("Live mode needs OPENROUTER_API_KEY / OPENROUTER_BASE_URL in .env (see .env.example).")

    txn = dict(scenario["txn"])
    flags = build_flags(txn, persona, [])
    recent = [
        s for s in [*persona["sms"], *(scenario.get("inject_sms") or [])]
        if datetime.strptime(s["t"], "%Y-%m-%d %H:%M") <= datetime.strptime(f"{txn['date']} {txn['time']}", "%Y-%m-%d %H:%M")
    ]
    trace_id = uuid.uuid4().hex
    print(f"[live] trace_id={trace_id}  (find it in your Langfuse dashboard)")
    result = live_agents(txn, persona, flags["stats"], flags["latest_ping"], recent, trace_id)
    print_trace(txn, result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Bank Risk Control System — multi-agent card fraud detection")
    parser.add_argument("--scenario", help="scenario id, e.g. stolen_wallet")
    parser.add_argument("--all", action="store_true", help="run every scenario")
    parser.add_argument("--list", action="store_true", help="list scenarios")
    parser.add_argument("--live", action="store_true", help="use live LLM agents instead of the deterministic engine")
    args = parser.parse_args()

    if args.list or (not args.scenario and not args.all):
        print("Scenarios:")
        for p in sorted(SCENARIO_DIR.glob("*.json")):
            with open(p, encoding="utf-8") as f:
                meta = json.load(f)
            print(f"  {meta['id']:20s} {meta['label']}")
        print("\nRun one:  python main.py --scenario stolen_wallet")
        return

    persona = load_persona()
    scenarios = (
        sorted(SCENARIO_DIR.glob("*.json")) if args.all
        else [SCENARIO_DIR / f"{args.scenario}.json"]
    )
    summary = []
    for path in scenarios:
        with open(path, encoding="utf-8") as f:
            scenario = json.load(f)
        print(f"\n{'█' * 74}\n█ SCENARIO · {scenario['label']}\n{'█' * 74}")
        result = run_live(scenario, persona) if args.live else run_engine(scenario, persona)
        summary.append((scenario["id"], result["judge"]["action"], result["judge"]["risk"]))

    if len(summary) > 1:
        print("\nSUMMARY")
        for sid, action, risk in summary:
            print(f"  {sid:20s} {action:16s} risk={risk}")


if __name__ == "__main__":
    main()
