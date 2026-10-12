"""
agents.py — Live LLM implementation of the four risk-control agents.

Mirrors src/engine.py, but every decision is made by an LLM call:

    Triage   (cheap model)  → suspicion 0-10
    Context  (mid model)    → GPS vs terminal verdict
    Comms    (mid model)    → phishing / social-engineering verdict
    Judge    (strong model) → binding APPROVE / DECLINE / DECLINE+FREEZE

All calls go through one Langfuse-wrapped client (utils.get_client), so a
whole run can be inspected as a single trace in the Langfuse dashboard.
"""
from __future__ import annotations

import json
import re

from src.utils import get_client, get_model

SYSTEM = "You are an agent inside a bank's real-time card-risk engine. Answer ONLY with valid JSON."


def _ask(prompt: str, tier: str, trace_id: str, name: str) -> dict:
    client = get_client()
    resp = client.chat.completions.create(
        model=get_model(tier),
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": prompt},
        ],
        temperature=0.1,
        name=name,
        trace_id=trace_id,
    )
    text = resp.choices[0].message.content.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    return json.loads(text)


def _baseline_summary(stats: dict) -> str:
    return (
        f"median non-recurring spend £{stats['median_discretionary']:.2f}; "
        f"max discretionary £{stats['max_discretionary']:.2f}; "
        f"known merchants: {', '.join(sorted(stats['known_merchants'])[:12])}; "
        f"countries seen: {', '.join(sorted(stats['seen_countries']))}"
    )


def triage_agent(txn: dict, stats: dict, trace_id: str) -> dict:
    prompt = f"""Score this card transaction for fraud suspicion.

TRANSACTION: {json.dumps(txn)}
CARDHOLDER BASELINE (90 days): {_baseline_summary(stats)}

Rules of thumb:
- High-risk categories (FX/remittance, crypto, gambling) with no prior history are suspicious.
- Amounts far above the median, card-present in never-visited countries, deep-night
  timestamps and rapid sequences of charges all add suspicion.
- Known merchants and recurring direct debits reduce suspicion.

Return JSON: {{"triage_score": <0-10>, "reasons": ["..."], "thinking": "one short paragraph"}}"""
    out = _ask(prompt, "triage", trace_id, "triage")
    out["agent"] = "triage"
    return out


def context_agent(txn: dict, ping: dict, trace_id: str) -> dict:
    prompt = f"""Cross-check the cardholder's phone GPS with a card transaction.

LATEST GPS PING BEFORE THE CHARGE: {json.dumps(ping)}
TRANSACTION: {json.dumps({k: txn[k] for k in ('merchant', 'city', 'country', 'lat', 'lng', 'time', 'card_present', 'method') if k in txn})}

>100 km gap while the card is physically present is a location mismatch;
>500 km is impossible travel — the strongest geo evidence there is.

Return JSON: {{"location_flag": true/false, "impossible_travel": true/false, "note": "<max 2 sentences>", "thinking": "one short paragraph"}}"""
    out = _ask(prompt, "analysis", trace_id, "context")
    out["agent"] = "context"
    return out


def comms_agent(txn: dict, recent_sms: list[dict], trace_id: str) -> dict:
    prompt = f"""Look for social engineering that preceded this transaction.

TRANSACTION: {json.dumps({k: txn[k] for k in ('merchant', 'amount', 'time', 'card_present') if k in txn})}
RECENT SMS (48 h before): {json.dumps(recent_sms)}

Strong evidence: urgency language + payment demands + typosquatted or
non-official domains, landing shortly before the charge. Generic spam,
delivery notices or bank statement alerts are NOT evidence.

Return JSON: {{"comms_flag": true/false, "note": "<max 2 sentences>", "thinking": "one short paragraph"}}"""
    out = _ask(prompt, "analysis", trace_id, "comms")
    out["agent"] = "comms"
    return out


def judge_agent(txn: dict, evidence: dict, trace_id: str) -> dict:
    prompt = f"""You are the senior judge of a bank risk engine. Make the FINAL, binding call.

TRANSACTION: {json.dumps(txn)}
EVIDENCE FROM THE OTHER AGENTS: {json.dumps(evidence)}

Scoring: weigh the evidence to a risk score 0-100, where
< 55 = approve, >= 55 = decline, >= 75 = decline AND freeze the card.
Impossible travel (phone thousands of km from a physically-present card) is
near-conclusive. Big amounts that exactly match an expected instalment to a
known payee are NOT fraud. Do not block legitimate customers on weak signals.

Return JSON: {{"risk_score": <0-100>, "action": "APPROVE" | "DECLINE" | "DECLINE + FREEZE", "factors": [{"points": <int>, "factor": "..."}], "thinking": "one short paragraph"}}"""
    out = _ask(prompt, "judge", trace_id, "judge")
    out["agent"] = "judge"
    return out


def run_live(txn: dict, persona: dict, stats: dict, ping: dict,
             recent_sms: list[dict], trace_id: str) -> dict:
    """Run all four agents in sequence and return the full evidence bundle."""
    t = triage_agent(txn, stats, trace_id)
    c = context_agent(txn, ping, trace_id)
    m = comms_agent(txn, recent_sms, trace_id)
    evidence = {
        "triage": {"score": t.get("triage_score"), "reasons": t.get("reasons")},
        "context": {"flag": c.get("location_flag"), "impossible": c.get("impossible_travel"), "note": c.get("note")},
        "comms": {"flag": m.get("comms_flag"), "note": m.get("note")},
    }
    j = judge_agent(txn, evidence, trace_id)
    return {"triage": t, "context": c, "comms": m, "judge": j}
