"""
engine.py — Deterministic multi-agent risk engine.

This is the exact rule set replayed by the web demo (assets/app.js):
same four agents, same weights, same thresholds. It needs zero API keys,
which makes it both (a) the interactive demo and (b) the regression
baseline the LLM agents in agents.py are compared against.

Agents
──────
1. Triage   — cheap screening vs 90-day history      → suspicion 0-10
2. Context  — phone GPS trail vs terminal geo         → impossible travel
3. Comms    — SMS/email scan for social engineering   → phishing link
4. Judge    — weighs all evidence                     → risk 0-100, verdict

Verdict thresholds: < 55 approve · >= 55 decline · >= 75 decline + freeze.
"""
from __future__ import annotations

import json
import math
import re
from datetime import datetime
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "persona.json"
HIGH_RISK_CATEGORIES = ["FX / Remittance", "Crypto", "Gambling"]


# ── shared helpers ──────────────────────────────────────────────────────────
def load_persona() -> dict:
    with open(DATA_PATH, encoding="utf-8") as f:
        return json.load(f)


def haversine_km(a: dict, b: dict) -> float:
    r = 6371.0
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    dp, dl = math.radians(b["lat"] - a["lat"]), math.radians(b["lng"] - a["lng"])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def _to_dt(date: str, time: str) -> datetime:
    return datetime.strptime(f"{date} {time}", "%Y-%m-%d %H:%M")


def _strip_branch(merchant: str) -> str:
    return merchant.split("·")[0].strip().lower()


def build_stats(history: list[dict], extra: list[dict] | None = None) -> dict:
    """Baseline 'what normal looks like' for this cardholder."""
    all_tx = [*history, *(extra or [])]
    discretionary = [t for t in all_tx if t["category"] not in ("Housing", "Education")]
    amounts = sorted(t["amount"] for t in discretionary)
    return {
        "all": all_tx,
        "median_discretionary": amounts[len(amounts) // 2],
        "max_discretionary": amounts[-1],
        "known_merchants": {_strip_branch(t["merchant"]) for t in all_tx},
        "seen_countries": {t["country"] for t in all_tx},
    }


def build_flags(txn: dict, persona: dict, extra_txns: list[dict]) -> dict:
    stats = build_stats(persona["history"], extra_txns)
    txn_dt = _to_dt(txn["date"], txn["time"])

    pings = [p for p in txn.get("gps_override") or persona["gps_pings"]
             if datetime.strptime(p["t"], "%Y-%m-%d %H:%M") <= txn_dt]
    latest_ping = pings[-1] if pings else {
        **persona["home"], "t": f"{txn['date']} {txn['time']}", "label": persona["home"]["label"],
    }

    prior = sorted(
        (t for t in stats["all"] if _to_dt(t["date"], t["time"]) < txn_dt),
        key=lambda t: _to_dt(t["date"], t["time"]), reverse=True,
    )
    velocity = velocity_minutes = 0
    prev_merchant = prev_city = ""
    if prior:
        p = prior[0]
        velocity_minutes = int((_to_dt(p["date"], p["time"]) - txn_dt).__abs__().total_seconds() // 60)
        if velocity_minutes < 30 and (p["city"] != txn["city"] or p["country"] != txn["country"]):
            velocity = 1
            prev_merchant, prev_city = p["merchant"], p["city"]

    return {
        "stats": stats,
        "latest_ping": latest_ping,
        "velocity": velocity,
        "velocity_minutes": velocity_minutes,
        "prev_merchant": prev_merchant,
        "prev_city": prev_city,
    }


# ── Agent 1: Triage ─────────────────────────────────────────────────────────
def triage_agent(txn: dict, flags: dict) -> dict:
    stats = flags["stats"]
    thinking: list[str] = []
    reasons: list[str] = []
    score = 0.0

    thinking.append(
        f"Screening £{txn['amount']:.2f} at '{txn['merchant']}' "
        f"({txn['category']}, {txn['city']}, {txn['country']}) against 90 days of history"
    )

    known = _strip_branch(txn["merchant"]) in stats["known_merchants"]
    if known:
        score -= 2
        reasons.append("known merchant")
        thinking.append("Merchant appears in historical spending — mild de-risk (-2).")
    else:
        thinking.append("First-ever payment to this merchant; carrying forward as neutral.")

    if txn["category"] in HIGH_RISK_CATEGORIES:
        score += 4
        reasons.append("high-risk category")
        thinking.append(f"Category '{txn['category']}' is high-risk (money leaves the banking system fast): +4.")
        if not any(t["category"] == txn["category"] for t in stats["all"]):
            score += 2
            reasons.append("first-ever category")
            thinking.append("Cardholder has NEVER transacted in this category in 90 days: +2.")

    ratio = txn["amount"] / stats["median_discretionary"]
    if ratio > 25:
        score += 3
        reasons.append(f"{round(ratio)}x typical spend")
        thinking.append(
            f"Amount is {round(ratio)}x the median non-recurring spend "
            f"(£{stats['median_discretionary']:.2f}): +3."
        )
    elif ratio > 8:
        score += 2
        reasons.append("unusually large")
        thinking.append(f"Amount is {round(ratio)}x typical daily spend: +2.")

    hour = int(txn["time"][:2])
    is_dd = txn["method"] == "Direct debit"
    if txn.get("card_present") and txn["country"] != "GB" and txn["country"] not in stats["seen_countries"]:
        score += 3
        reasons.append("card-present in never-visited country")
        thinking.append(f"Physical card use in {txn['country']}, zero prior history there: +3.")
    elif not txn.get("card_present") and txn["country"] not in stats["seen_countries"] and txn["country"] != "GB":
        score += 1
        thinking.append("Online payment in a never-seen country: +1.")

    if hour < 6 and not is_dd:
        score += 1
        reasons.append("odd hour")
        thinking.append(f"Posted at {txn['time']} — deep-night, non-recurring: +1.")

    if flags["velocity"]:
        score += 2
        reasons.append("velocity burst")
        thinking.append(
            f"Only {flags['velocity_minutes']} min after the previous charge "
            f"({flags['prev_merchant']}, {flags['prev_city']}) in a different city: +2."
        )

    score = max(0, min(10, round(score)))
    thinking.append(f"Triage verdict: {score}/10.")

    return {"agent": "triage", "score": score, "reasons": reasons, "thinking": thinking}


# ── Agent 2: Context (GPS cross-check) ──────────────────────────────────────
def context_agent(txn: dict, flags: dict) -> dict:
    thinking: list[str] = []
    if not txn.get("card_present"):
        thinking.append(
            f"Card-not-present ({txn['method']}) — no terminal geo to cross-check; "
            "geo evidence is neutral."
        )
        return {"agent": "context", "flag": False, "impossible": False, "distance_km": None, "thinking": thinking}

    ping = flags["latest_ping"]
    thinking.append(f"Latest phone GPS before the charge: {ping['t']} · {ping['label']}.")
    d = haversine_km(ping, txn)
    thinking.append(f"Terminal is {d:,.0f} km from the phone.")

    impossible = flag = False
    if d > 500:
        impossible = flag = True
        thinking.append(
            f"{d:,.0f} km separation with the card physically present — IMPOSSIBLE TRAVEL."
        )
    elif d > 100:
        flag = True
        thinking.append("Phone was nowhere near this terminal — location mismatch.")
    elif d < 2:
        thinking.append(f"Phone within {d * 1000:.0f} m of the terminal — cardholder is right there.")
    else:
        thinking.append(f"{d:.1f} km gap is consistent with normal city movement.")

    return {"agent": "context", "flag": flag, "impossible": impossible, "distance_km": round(d), "thinking": thinking}


# ── Agent 3: Communication (phishing / social engineering) ──────────────────
_PHISH_WORDS = re.compile(r"(held|suspend|unpaid|immediately|urgent|verify your|locked|fee required)", re.I)
_SUSPICIOUS_LINK = re.compile(r"https?://\S*(-|\.)(info|top|xyz|click|shop)", re.I)
_MONEY = re.compile(r"\d{1,3}(\.\d{2})?\s?(£|gbp)", re.I)


def comms_agent(txn: dict, persona: dict, extra_sms: list[dict] | None = None) -> dict:
    thinking: list[str] = []
    txn_dt = _to_dt(txn["date"], txn["time"])
    pool = [*persona.get("sms", []), *(extra_sms or [])]
    recent = [
        s for s in pool
        if datetime.strptime(s["t"], "%Y-%m-%d %H:%M") <= txn_dt
        and abs((datetime.strptime(s["t"], "%Y-%m-%d %H:%M") - txn_dt).total_seconds()) <= 48 * 3600
    ]
    thinking.append(f"Scanning {len(pool)} messages; {len(recent)} within the 48 h before the charge.")

    phish = next(
        (s for s in recent
         if _SUSPICIOUS_LINK.search(s["text"]) or (_PHISH_WORDS.search(s["text"]) and _MONEY.search(s["text"]))),
        None,
    )
    if phish:
        gap_h = abs((txn_dt - datetime.strptime(phish["t"], "%Y-%m-%d %H:%M")).total_seconds()) / 3600
        thinking.append(
            f"Suspicious message from {phish['from']} ({phish['t']}), "
            f"{gap_h:.0f} h before the charge: urgency + payment demand + non-official link."
        )
        return {"agent": "comms", "flag": True, "phishing_from": phish["from"], "thinking": thinking}

    thinking.append("No social-engineering precursor found — comms evidence clean.")
    return {"agent": "comms", "flag": False, "phishing_from": None, "thinking": thinking}


# ── Agent 4: Judge ──────────────────────────────────────────────────────────
def judge_agent(txn: dict, flags: dict, t: dict, c: dict, m: dict) -> dict:
    stats = flags["stats"]
    thinking: list[str] = []
    factors: list[dict] = []
    risk = 5.0

    def add(pts: float, txt: str) -> None:
        nonlocal risk
        risk += pts
        factors.append({"points": pts, "factor": txt})

    geo_state = "impossible travel" if c["impossible"] else "mismatch" if c["flag"] else "consistent"
    thinking.append(f"Evidence in: triage {t['score']}/10, geo {geo_state}, comms {'PHISHING' if m['flag'] else 'clean'}.")

    if c["impossible"]:
        add(40, f"Impossible travel: phone vs terminal {c['distance_km']:,} km apart")
    elif c["flag"]:
        add(20, "Location mismatch (card-present, phone elsewhere)")

    high_risk = txn["category"] in HIGH_RISK_CATEGORIES
    first_cat = high_risk and not any(x["category"] == txn["category"] for x in stats["all"])
    if first_cat:
        add(14, f"First-ever {txn['category']} transaction (high-risk category)")
    elif high_risk:
        add(8, f"High-risk category ({txn['category']})")

    seen_country = txn["country"] in stats["seen_countries"]
    if txn.get("card_present") and txn["country"] != "GB" and not seen_country:
        add(10, f"Card-present in never-visited country ({txn['country']})")
    elif not txn.get("card_present") and not seen_country and txn["country"] != "GB":
        add(4, "Online merchant in unseen country")

    ratio = txn["amount"] / stats["median_discretionary"]
    prev_same = [x for x in stats["all"] if _strip_branch(x["merchant"]) == _strip_branch(txn["merchant"])]
    matching = next((x for x in prev_same if abs(x["amount"] - txn["amount"]) / x["amount"] < 0.05), None)
    if ratio > 25 and not matching:
        add(12, f"Amount {round(ratio)}x typical spend")
    elif ratio > 8 and not matching:
        add(7, "Unusually large amount")

    if flags["velocity"]:
        add(8, f"Velocity: {flags['velocity_minutes']} min after last charge in {flags['prev_city']}")

    if m["flag"] and not txn.get("card_present") and txn["amount"] <= 5:
        add(40, "Phishing SMS -> online micro-charge within 48 h (card testing)")
    elif m["flag"]:
        add(8, "Phishing message precedes this charge")

    hour = int(txn["time"][:2])
    if hour < 6 and txn["method"] != "Direct debit":
        add(5, "Deep-night timestamp")
    if not txn.get("card_present") and _strip_branch(txn["merchant"]) not in stats["known_merchants"]:
        add(6, "Online, first-time merchant")
    if txn.get("card_present") and c["distance_km"] is not None and c["distance_km"] < 2:
        add(-12, "GPS confirms cardholder at terminal")
    if _strip_branch(txn["merchant"]) in stats["known_merchants"]:
        add(-10, "Known merchant with prior history")
    if txn["method"] == "Direct debit" and len(prev_same) >= 2:
        add(-14, "Recurring direct debit, seen monthly")
    if matching:
        add(-15, f"Matches previous payment to this merchant (£{matching['amount']:.2f})")

    risk = max(3, min(99, round(risk)))
    action = "DECLINE + FREEZE" if risk >= 75 else "DECLINE" if risk >= 55 else "APPROVE"
    thinking.append(f"Risk score: {risk}/100 → {action}.")

    return {
        "agent": "judge",
        "risk": risk,
        "action": action,
        "factors": factors,
        "thinking": thinking,
    }


# ── Pipeline ────────────────────────────────────────────────────────────────
def analyze(txn: dict, persona: dict, extra_txns: list[dict] | None = None,
            extra_sms: list[dict] | None = None) -> dict:
    flags = build_flags(txn, persona, extra_txns or [])
    t = triage_agent(txn, flags)
    c = context_agent(txn, flags)
    m = comms_agent(txn, persona, extra_sms)
    j = judge_agent(txn, flags, t, c, m)
    return {"triage": t, "context": c, "comms": m, "judge": j}
