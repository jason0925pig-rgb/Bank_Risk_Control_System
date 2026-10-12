/* ============================================================================
 * app.js — Deterministic multi-agent risk engine + demo UI orchestration.
 *
 * The four agents below mirror src/engine.py (same rules, same thresholds)
 * so the hosted demo needs zero API keys. The sibling LLM implementation
 * lives in src/agents.py (run `python main.py --live`).
 * ==========================================================================*/
(() => {
"use strict";

/* ── helpers ────────────────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const fmtGBP = (n) => "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtKM = (n) => n >= 1000 ? Math.round(n).toLocaleString() + " km" : (n < 1 ? Math.round(n * 1000) + " m" : n.toFixed(1) + " km");
const toDate = (date, time) => new Date(`${date}T${time.padStart(5, "0")}:00`);

function haversineKm(a, b) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const minutesBetween = (d1, d2) => Math.abs(d1 - d2) / 60000;
const stripBranch = (m) => String(m).split("·")[0].trim().toLowerCase();

/* ── history stats (baseline "what normal looks like") ──────────────────── */
function buildStats(extraTxns = []) {
  const hist = [...HISTORY, ...extraTxns];
  const discretionary = hist.filter((h) => !["Housing", "Education"].includes(h.category));
  const amounts = discretionary.map((h) => h.amount).sort((a, b) => a - b);
  return {
    medianDiscretionary: amounts[Math.floor(amounts.length / 2)],
    maxDiscretionary: amounts[amounts.length - 1],
    knownMerchants: new Set(hist.map((h) => stripBranch(h.merchant))),
    seenCountries: new Set(hist.map((h) => h.country)),
    all: hist,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE RISK ENGINE — four agents, one decision
   Each agent returns { lines: [{text, cls}], out: [[key, value, tone]] }
   ════════════════════════════════════════════════════════════════════════*/
function triageAgent(txn, stats, flags) {
  const lines = [], reasons = [];
  let score = 0;

  lines.push({ text: `Screening ${fmtGBP(txn.amount)} at “${txn.merchant}” (${txn.category}, ${txn.city}, ${txn.country}) against 90 days of history…` });

  // Merchant familiarity
  const known = stats.knownMerchants.has(stripBranch(txn.merchant));
  if (known) { score -= 2; reasons.push("known merchant"); lines.push({ text: `Merchant is familiar — “${stripBranch(txn.merchant)}” appears in historical spending. Mild de-risk (−2).`, cls: "calm" }); }
  else lines.push({ text: `Merchant “${txn.merchant}” has never been paid before. Neutral for new shops, but I’ll carry it forward.` });

  // High-risk category
  const highRisk = HIGH_RISK_CATEGORIES.includes(txn.category);
  if (highRisk) {
    score += 4; reasons.push("high-risk category");
    lines.push({ text: `Category “${txn.category}” is on the high-risk list (money leaving the banking system quickly). +4 suspicion.`, cls: "warn" });
    if (!stats.all.some((h) => h.category === txn.category)) {
      score += 2; reasons.push("first-ever category");
      lines.push({ text: `Cardholder has NEVER transacted in this category in 90 days — first-time FX/remittance is a classic stolen-card move. +2.`, cls: "strong" });
    }
  }

  // Amount vs baseline
  const ratio = txn.amount / stats.medianDiscretionary;
  if (ratio > 25) { score += 3; reasons.push(`${Math.round(ratio)}× typical spend`); lines.push({ text: `Amount is ${Math.round(ratio)}× the median non-recurring spend (${fmtGBP(stats.medianDiscretionary)}) and ${txn.amount > stats.maxDiscretionary ? "exceeds the 90-day max of " + fmtGBP(stats.maxDiscretionary) : "near the 90-day max"}. +3.`, cls: "warn" }); }
  else if (ratio > 8) { score += 2; reasons.push("unusually large"); lines.push({ text: `Amount is ${Math.round(ratio)}× typical daily spend — unusual but not extreme on its own. +2.`, cls: "warn" }); }
  else lines.push({ text: `Amount ${fmtGBP(txn.amount)} sits within normal spending range (median ${fmtGBP(stats.medianDiscretionary)}).` });

  // Country novelty (card-present abroad)
  if (txn.cardPresent && txn.country !== "GB" && !stats.seenCountries.has(txn.country)) {
    score += 3; reasons.push("card-present in never-visited country");
    lines.push({ text: `Physical card use in ${txn.country}, a country with zero prior history — strong stolen-card signal. +3.`, cls: "strong" });
  } else if (txn.country !== "GB" && !stats.seenCountries.has(txn.country)) {
    score += 1; reasons.push("online, never-visited country");
    lines.push({ text: `Online payment in a country never seen before. Mild signal. +1.`, cls: "warn" });
  }

  // Odd hour
  const hour = parseInt(txn.time.slice(0, 2), 10);
  const isDD = txn.method === "Direct debit";
  if (hour < 6 && !isDD) { score += 1; reasons.push("odd hour"); lines.push({ text: `Posted at ${txn.time} — deep-night activity for a non-recurring charge. +1.`, cls: "warn" }); }

  // Velocity
  if (flags.velocity) { score += 2; reasons.push("velocity burst"); lines.push({ text: `Only ${flags.velocityMinutes} min after the previous charge (${flags.prevMerchant}, ${flags.prevCity}) in a different city. +2.`, cls: "warn" }); }

  score = Math.max(0, Math.min(10, Math.round(score)));
  lines.push({ text: `Triage verdict: ${score}/10 ${score >= 7 ? "— highly suspicious, escalate everything" : score >= 4 ? "— borderline, keep digging" : "— looks routine so far"}.` });

  return { score, reasons, lines, out: [["triage_score", `${score}/10`, score >= 7 ? "hot" : score >= 4 ? "" : "good"], ["key_signals", reasons.join(", ") || "none", ""]] };
}

function contextAgent(txn, flags) {
  const lines = [];
  if (!txn.cardPresent) {
    lines.push({ text: `Card-not-present (${txn.method}) — there is no terminal geo to cross-check. Falling back to billing-country consistency: ${txn.country}.` });
    if (flags.countryNovelOnline) lines.push({ text: `Country is novel for online spend; noting it for the judge.`, cls: "warn" });
    lines.push({ text: `No GPS contradiction available — geo evidence is neutral here.` });
    return { flag: false, impossible: false, distanceKm: null, lines, out: [["location_flag", "n/a (CNP)", ""], ["distance", "no terminal geo", ""]] };
  }

  const ping = flags.latestPing;
  lines.push({ text: `Latest phone GPS before the charge: ${ping.t} · ${ping.label} (${ping.lat.toFixed(4)}, ${ping.lng.toFixed(4)}).` });
  const d = haversineKm(ping, txn);
  lines.push({ text: `Terminal coordinates (${txn.lat.toFixed(4)}, ${txn.lng.toFixed(4)}) are ${fmtKM(d)} away from the phone.` });

  let impossible = false, flag = false;
  if (d > 500) {
    impossible = true; flag = true;
    lines.push({ text: `${fmtKM(d)} separation while the card is physically present — that is IMPOSSIBLE TRAVEL. The phone and the card cannot be that far apart. Flagging hard.`, cls: "strong" });
  } else if (d > 100) {
    flag = true;
    lines.push({ text: `Distance exceeds any plausible same-city wander — the cardholder’s phone was nowhere near this terminal. Flagging.`, cls: "warn" });
  } else if (d < 2) {
    lines.push({ text: `Phone is within ${fmtKM(d)} of the terminal — the cardholder is very likely standing right there. Strong legitimacy signal.`, cls: "calm" });
  } else {
    lines.push({ text: `${fmtKM(d)} gap is consistent with normal movement around the city.`, cls: "calm" });
  }
  lines.push({ text: `Context verdict: ${impossible ? "IMPOSSIBLE TRAVEL — the strongest geo evidence there is" : flag ? "location mismatch" : "location consistent"}.` });

  return { flag, impossible, distanceKm: d, lines, out: [
    ["location_flag", String(flag), flag ? "hot" : "good"],
    ["distance", fmtKM(d), impossible ? "hot" : ""],
    ["impossible_travel", String(impossible), impossible ? "hot" : ""],
  ] };
}

function commsAgent(txn, smsPool) {
  const lines = [];
  const txnDate = toDate(txn.date, txn.time);
  const PHISH = /(held|suspend|unpaid|immediately|urgent|verify your|locked|fee required)/i;
  const SUSLINK = /https?:\/\/[^\s]*(-|\.)(info|top|xyz|click|shop)/i;

  const recent = smsPool.filter((s) => {
    const st = new Date(s.t.replace(" ", "T") + ":00");
    return st <= txnDate && minutesBetween(st, txnDate) <= 48 * 60;
  });

  lines.push({ text: `Scanning ${smsPool.length} messages; ${recent.length} fall within the 48 h before this charge…` });

  const phish = recent.find((s) => SUSLINK.test(s.text) || (PHISH.test(s.text) && /\d{1,3}(\.\d{2})?\s?(£|gbp)/i.test(s.text)));
  if (phish) {
    lines.push({ text: `⚠ Suspicious message from ${phish.from} at ${phish.t}: “${phish.text.slice(0, 96)}…”`, cls: "strong" });
    lines.push({ text: `Pattern match: urgency language + payment demand + a non-official domain in the link. This is textbook smishing, landing ${Math.round(minutesBetween(new Date(phish.t.replace(" ", "T") + ":00"), txnDate) / 60)} h before the charge.`, cls: "warn" });
    return { flag: true, phish, lines, out: [["comms_flag", "true", "hot"], ["phishing_link", "detected < 48 h", "hot"]] };
  }

  lines.push({ text: `Recent messages: bank statement notice, a DPD delivery, a library hold — routine, no urgency language, no payment demands to unknown parties.`, cls: "calm" });
  lines.push({ text: `No social-engineering precursor found. Comms evidence is clean (neutral-to-favourable).` });
  return { flag: false, phish: null, lines, out: [["comms_flag", "false", "good"], ["phishing", "none detected", "good"]] };
}

function judgeAgent(txn, stats, flags, t, c, m) {
  const lines = [];
  const factors = [];
  let risk = 5; // neutral floor

  lines.push({ text: `Weighing evidence — triage ${t.score}/10, geo ${c.impossible ? "impossible travel" : c.flag ? "mismatch" : "consistent"}, comms ${m.flag ? "PHISHING LINKED" : "clean"}.` });

  const add = (pts, txt, good = false) => { risk += pts; factors.push({ txt, pts, good }); };

  // Geo evidence
  if (c.impossible) add(40, `Impossible travel: phone vs terminal ${fmtKM(c.distanceKm)} apart`);
  else if (c.flag) add(20, "Location mismatch (card-present, phone elsewhere)");

  // Category evidence
  const highRisk = HIGH_RISK_CATEGORIES.includes(txn.category);
  const firstCat = highRisk && !stats.all.some((h) => h.category === txn.category);
  if (firstCat) add(14, `First-ever ${txn.category} transaction (high-risk category)`);
  else if (highRisk) add(8, `High-risk category (${txn.category})`);

  // Country novelty
  const seenCountry = stats.seenCountries.has(txn.country);
  if (txn.cardPresent && txn.country !== "GB" && !seenCountry) add(10, `Card-present in never-visited country (${txn.country})`);
  else if (!txn.cardPresent && !seenCountry && txn.country !== "GB") add(4, "Online merchant in unseen country");

  // Amount evidence
  const ratio = txn.amount / stats.medianDiscretionary;
  const prevSameMerchant = stats.all.filter((h) => stripBranch(h.merchant) === stripBranch(txn.merchant));
  const matchingInstalment = prevSameMerchant.find((h) => Math.abs(h.amount - txn.amount) / h.amount < 0.05);
  if (ratio > 25 && !matchingInstalment) add(12, `Amount ${Math.round(ratio)}× typical spend`);
  else if (ratio > 8 && !matchingInstalment) add(7, "Unusually large amount");

  // Velocity
  if (flags.velocity) add(8, `Velocity: ${flags.velocityMinutes} min after last charge in ${flags.prevCity}`);

  // Comms evidence
  if (m.flag && !txn.cardPresent && txn.amount <= 5) {
    add(40, "Phishing SMS → online micro-charge within 48 h (card testing)");
  } else if (m.flag) {
    add(8, "Phishing message precedes this charge");
  }

  // Misc
  const hour = parseInt(txn.time.slice(0, 2), 10);
  if (hour < 6 && txn.method !== "Direct debit") add(5, "Deep-night timestamp");
  if (!txn.cardPresent && !stats.knownMerchants.has(stripBranch(txn.merchant))) add(6, "Online, first-time merchant");
  if (txn.cardPresent && c.distanceKm !== null && c.distanceKm < 2) add(-12, "GPS confirms cardholder at terminal", true);
  if (stats.knownMerchants.has(stripBranch(txn.merchant))) add(-10, "Known merchant with prior history", true);
  if (txn.method === "Direct debit" && prevSameMerchant.length >= 2) add(-14, "Recurring direct debit, seen monthly", true);
  if (matchingInstalment) add(-15, `Matches previous payment to this merchant (${fmtGBP(matchingInstalment.amount)})`, true);

  risk = Math.max(3, Math.min(99, Math.round(risk)));

  const action = risk >= 75 ? "DECLINE + FREEZE" : risk >= 55 ? "DECLINE" : "APPROVE";
  lines.push({ text: `Risk score components: ${factors.filter((f) => f.pts > 0).reduce((s, f) => s + f.pts, 0)} pts risk vs ${Math.abs(factors.filter((f) => f.pts < 0).reduce((s, f) => s + f.pts, 0))} pts mitigation → final ${risk}/100.` });
  lines.push({ text: action.startsWith("APPROVE")
    ? `Below the 55 decline threshold — evidence does not support blocking a legitimate customer. Approve.`
    : action === "DECLINE + FREEZE"
      ? `≥ 75: beyond declining, this looks like an active stolen-card attack. Freeze the card NOW and notify the customer.`
      : `≥ 55: decline this charge and flag the account for monitoring.` });

  return { risk, action, factors, lines, out: [
    ["risk_score", `${risk}/100`, risk >= 75 ? "hot" : risk >= 55 ? "" : "good"],
    ["action", action, action === "APPROVE" ? "good" : "hot"],
  ] };
}

/* ── assemble flags shared across agents ────────────────────────────────── */
function buildFlags(txn, sessionTxns) {
  const stats = buildStats(sessionTxns);
  const txnDate = toDate(txn.date, txn.time);

  // latest GPS ping at/before txn time
  const pool = txn.gpsOverride || GPS_PINGS;
  const pings = pool.map((p) => ({ ...p, d: new Date(p.t.replace(" ", "T") + ":00") })).filter((p) => p.d <= txnDate);
  const latestPing = pings.length ? pings[pings.length - 1] : { ...PERSONA.home, t: txn.date + " " + txn.time, label: PERSONA.home.label };

  // velocity vs most recent prior charge
  const prior = stats.all.map((h) => ({ ...h, d: toDate(h.date, h.time) })).filter((h) => h.d < txnDate).sort((a, b) => b.d - a.d);
  const prev = prior[0];
  let velocity = false, velocityMinutes = 0, prevMerchant = "", prevCity = "";
  if (prev) {
    velocityMinutes = Math.round(minutesBetween(prev.d, txnDate));
    if (velocityMinutes < 30 && (prev.city !== txn.city || prev.country !== txn.country)) {
      velocity = true; prevMerchant = prev.merchant; prevCity = prev.city;
    }
  }
  return {
    stats, latestPing, velocity, velocityMinutes, prevMerchant, prevCity,
    countryNovelOnline: txn.country !== "GB" && !stats.seenCountries.has(txn.country),
  };
}

function analyze(txn, sessionTxns, smsPool) {
  const flags = buildFlags(txn, sessionTxns);
  const t = triageAgent(txn, flags.stats, flags);
  const c = contextAgent(txn, flags);
  const m = commsAgent(txn, smsPool);
  const j = judgeAgent(txn, flags.stats, flags, t, c, m);
  return { t, c, m, j, flags };
}

/* ═══════════════════════ UI ══════════════════════════════════════════════*/
const session = { frozen: false, sessionTxns: [], skip: false, busy: false };
const ICONS = { Groceries: "🛒", Coffee: "☕", Dining: "🍜", Delivery: "🛵", Transport: "🚇", Utilities: "⚡", Telecom: "📱", Housing: "🏠", Education: "🎓", Retail: "🛍️", Health: "💊", Entertainment: "🎬", Travel: "🚄", "FX / Remittance": "💱", Crypto: "🪙", Gambling: "🎰", Other: "🧾" };

const txList = $("txList");
const fmtDay = (date) => new Date(date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
function txRow(tx, state = "normal") {
  const icon = ICONS[tx.category] || "🧾";
  const when = `${fmtDay(tx.date)} · ${tx.time}`;
  const div = document.createElement("div");
  div.className = "tx" + (state === "pending" ? " pending" : state === "blocked" ? " blocked" : state === "fresh" ? " approved-fresh" : "");
  div.innerHTML = `
    <span class="tx-ico">${icon}</span>
    <div class="tx-main">
      <b>${tx.merchant}${state === "blocked" ? '<span class="risktag blocked">DECLINED</span>' : state === "fresh" ? '<span class="risktag passed">RISK PASS</span>' : ""}</b>
      <small>${state === "pending" ? '<span class="spin"></span>Risk check in progress…' : `${tx.category} · ${tx.city || tx.country} · ${when}`}</small>
    </div>
    <span class="tx-amt ${state === "blocked" ? "" : "neg"}">${fmtGBP(tx.amount)}</span>`;
  return div;
}

function dayLabel(date) {
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function renderHistory() {
  txList.innerHTML = "";
  const all = [...HISTORY, ...session.sessionTxns].slice().sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  let lastDay = "";
  for (const tx of all) {
    if (tx.date !== lastDay) {
      lastDay = tx.date;
      const h = document.createElement("div");
      h.className = "tx-day"; h.textContent = dayLabel(tx.date);
      txList.appendChild(h);
    }
    txList.appendChild(txRow(tx));
  }
}

function renderChips() {
  const host = $("scenarioChips");
  host.innerHTML = "";
  for (const sc of SCENARIOS) {
    const b = document.createElement("button");
    b.className = "chip";
    b.innerHTML = `${sc.emoji} ${sc.label}`;
    b.title = sc.tagline;
    b.onclick = () => startRun(structuredClone(sc.txn), sc).catch((e) => console.error("[run]", e));
    host.appendChild(b);
  }
}

/* ── monitor rendering ──────────────────────────────────────────────────── */
const AGENTS = ["triage", "context", "comms", "judge"];

function resetMonitor() {
  for (const a of AGENTS) {
    $("ag-" + a).classList.remove("running", "done");
    $("st-" + a).textContent = "queued"; $("st-" + a).className = "ag-status";
    $("ln-" + a).innerHTML = `<div class="aline ph" style="color:#5d6b8f">— waiting for a transaction —</div>`;
    $("out-" + a).innerHTML = ""; $("mt-" + a).textContent = "—";
  }
  document.querySelectorAll(".pnode").forEach((n) => n.classList.remove("active", "done"));
  $("verdictBox").classList.add("hidden");
  $("liveDot").classList.remove("on");
  $("statTokens").textContent = "— tokens"; $("statLatency").textContent = "—";
  $("runId").textContent = "trc_" + Math.random().toString(16).slice(2, 8);
}

function setStatus(agent, s) {
  const el = $("st-" + agent);
  el.textContent = s; el.className = "ag-status " + (s === "running" ? "running" : s === "done" ? "done" : "");
  document.querySelector(`.pnode[data-agent="${agent}"]`)?.classList.toggle("active", s === "running");
  document.querySelector(`.pnode[data-agent="${agent}"]`)?.classList.toggle("done", s === "done");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, session.skip ? 0 : ms));

async function typeLine(agent, line) {
  const host = $("ln-" + agent);
  host.querySelector(".ph")?.remove();
  const div = document.createElement("div");
  div.className = "aline" + (line.cls ? " " + line.cls : "");
  div.innerHTML = `<span class="tick">▸</span><span class="txt"></span>`;
  host.appendChild(div);
  const txt = div.querySelector(".txt");
  txt.classList.add("caret");
  const text = line.text;
  if (session.skip) { txt.textContent = text; }
  else {
    const chunk = Math.max(2, Math.ceil(text.length / 55));
    for (let i = 0; i < text.length; i += chunk) {
      txt.textContent = text.slice(0, i + chunk);
      tokenCount += 1;
      if (i % (chunk * 8) === 0) { $("statTokens").textContent = tokenCount.toLocaleString() + " tokens"; }
      await new Promise((r) => setTimeout(r, 8));
    }
    txt.textContent = text;
  }
  txt.classList.remove("caret");
}

function renderOut(agent, out) {
  const html = out.map(([k, v, tone]) =>
    `<span class="k">${k}</span>: <span class="${tone === "hot" ? "hot" : tone === "good" ? "good" : "v"}">${v}</span>`).join("  ·  ");
  $("out-" + agent).innerHTML = `<div class="outjson">${html}</div>`;
}

/* ── phone interactions ─────────────────────────────────────────────────── */
function push(kind, title, body) {
  const host = $("pushHost");
  const div = document.createElement("div");
  div.className = "push";
  div.innerHTML = `<span class="p-ico ${kind}">${kind === "ok" ? "✅" : "🛑"}</span><div><b>${title}</b><p>${body}</p><small>MERIDIAN · now</small></div>`;
  host.appendChild(div);
  setTimeout(() => div.remove(), 8000);
}

function freezeCard() {
  session.frozen = true;
  $("cardFreeze").classList.remove("hidden");
}
$("btnUnfreeze").onclick = () => {
  session.frozen = false;
  $("cardFreeze").classList.add("hidden");
  push("ok", "Card unfrozen", "Risk checks will run as normal on new payments.");
};

/* ── main run orchestration ─────────────────────────────────────────────── */
let tokenCount = 0;

async function startRun(txn, scenario) {
  if (session.busy) return;
  if (session.frozen) { push("bad", "Card is frozen", "Unfreeze the card first to simulate new payments."); return; }
  session.busy = true; session.skip = false; tokenCount = 0;

  const smsPool = [...BASELINE_SMS, ...(scenario?.injectSms || [])];
  const row = txRow(txn, "pending");
  txList.prepend(document.createElement("div")); txList.firstChild.className = "tx-day"; txList.firstChild.textContent = dayLabel(txn.date);
  txList.prepend(row);
  row.scrollIntoView({ block: "nearest" });

  resetMonitor();
  $("liveDot").classList.add("on");
  const t0 = performance.now();

  const latencyTick = setInterval(() => {
    $("statLatency").textContent = ((performance.now() - t0) / 1000).toFixed(1) + " s";
  }, 100);

  const res = analyze(txn, session.sessionTxns, smsPool);

  await sleep(400);
  for (const [agent, data] of [["triage", res.t], ["context", res.c], ["comms", res.m], ["judge", res.j]]) {
    setStatus(agent, "running");
    const at = performance.now();
    for (const line of data.lines) { await typeLine(agent, line); await sleep(140); }
    renderOut(agent, data.out);
    $("mt-" + agent).textContent = ((performance.now() - at) / 1000).toFixed(1) + "s";
    setStatus(agent, "done");
    $("ag-" + agent).classList.add("done"); $("ag-" + agent).classList.remove("running");
    await sleep(320);
  }

  // verdict
  const j = res.j;
  const vb = $("verdictBox");
  vb.classList.remove("hidden", "approve");
  const approved = j.action === "APPROVE";
  if (approved) vb.classList.add("approve");
  $("vbIcon").textContent = approved ? "✅" : j.action.includes("FREEZE") ? "❄️" : "🛑";
  $("vbTitle").textContent = approved ? "APPROVE" : j.action;
  $("vbSub").textContent = approved
    ? `${txn.merchant} · ${fmtGBP(txn.amount)} — paid out normally`
    : j.action.includes("FREEZE")
      ? `${txn.merchant} · ${fmtGBP(txn.amount)} — declined, card frozen instantly`
      : `${txn.merchant} · ${fmtGBP(txn.amount)} — declined, account flagged`;
  document.querySelector(".pnode.verdict").classList.add("active");
  requestAnimationFrame(() => { $("vbFill").style.width = j.risk + "%"; });
  $("vbScore").textContent = `risk ${j.risk}/100`;
  $("vbFactors").innerHTML = j.factors.map((f) =>
    `<span class="vbf ${f.good ? "good" : ""}">${f.pts > 0 ? "+" : ""}${f.pts} · ${f.txt}</span>`).join("");

  // phone reaction
  row.classList.remove("pending");
  if (approved) {
    row.classList.add("approved-fresh");
    row.querySelector("small").textContent = `${txn.category} · ${txn.city || txn.country} · ${fmtDay(txn.date)} · ${txn.time}`;
    row.querySelector(".tx-main b").insertAdjacentHTML("beforeend", '<span class="risktag passed">RISK PASS</span>');
    session.sessionTxns.push({ ...txn });
    push("ok", "Payment successful", `${fmtGBP(txn.amount)} at ${txn.merchant} was approved.`);
  } else {
    row.classList.add("blocked");
    row.querySelector("small").textContent = `${txn.category} · ${txn.city || txn.country} · risk ${j.risk}/100`;
    row.querySelector(".tx-main b").insertAdjacentHTML("beforeend", '<span class="risktag blocked">DECLINED</span>');
    if (j.action.includes("FREEZE")) {
      freezeCard();
      push("bad", "Payment declined · card frozen", `${fmtGBP(txn.amount)} at ${txn.merchant} was blocked. We froze your card to protect you.`);
    } else {
      push("bad", "Payment declined", `${fmtGBP(txn.amount)} at ${txn.merchant} was blocked by the risk engine.`);
    }
  }

  clearInterval(latencyTick);
  $("statTokens").textContent = tokenCount.toLocaleString() + " tokens";
  $("statLatency").textContent = ((performance.now() - t0) / 1000).toFixed(1) + " s";
  $("liveDot").classList.remove("on");
  session.busy = false;
}

/* ── new-payment form ───────────────────────────────────────────────────── */
const GPS_CHOICES = {
  home: { label: "Home · Bethnal Green E2", lat: 51.5265, lng: -0.0555 },
  ucl: { label: "UCL campus · WC1", lat: 51.5226, lng: -0.1313 },
  central: { label: "Oxford St · Central London", lat: 51.5154, lng: -0.1410 },
};
const COUNTRY_GEO = {
  GB: { lat: 51.52, lng: -0.09 },
  FR: { lat: 48.86, lng: 2.35 },
  NG: { lat: 6.45, lng: 3.40 },
  US: { lat: 40.71, lng: -74.0 },
};

$("btnNewPay").onclick = () => $("payModal").classList.remove("hidden");
$("btnClosePay").onclick = () => $("payModal").classList.add("hidden");
$("btnRunCheck").onclick = () => {
  const f = (id) => $(id).value;
  const cardPresent = ["Contactless", "Chip & PIN"].includes(f("fMethod"));
  const geo = GPS_CHOICES[f("fGps")] || GPS_CHOICES.home;
  const cGeo = COUNTRY_GEO[f("fCountry")] || COUNTRY_HOME_FALLBACK;
  const txn = {
    date: new Date().toISOString().slice(0, 10),
    time: f("fTime") || "12:00",
    merchant: f("fMerchant") || "Unknown merchant",
    category: f("fCategory"),
    amount: parseFloat(f("fAmount")) || 10,
    currency: "GBP",
    city: f("fCity") || "—",
    country: f("fCountry"),
    lat: cardPresent && f("fCountry") === "GB" ? geo.lat : cGeo.lat,
    lng: cardPresent && f("fCountry") === "GB" ? geo.lng : cGeo.lng,
    method: f("fMethod"),
    cardPresent,
    gpsOverride: [{ t: `${new Date().toISOString().slice(0, 10)} ${f("fTime") || "12:00"}`, lat: geo.lat, lng: geo.lng, label: geo.label }],
  };
  $("payModal").classList.add("hidden");
  startRun(txn, null).catch((e) => console.error("[run]", e));
};
const COUNTRY_HOME_FALLBACK = COUNTRY_GEO.GB;

/* ── misc UI ────────────────────────────────────────────────────────────── */
$("btnAbout").onclick = () => $("aboutModal").classList.remove("hidden");
$("btnCloseAbout").onclick = () => $("aboutModal").classList.add("hidden");
$("aboutModal").addEventListener("click", (e) => { if (e.target === $("aboutModal")) $("aboutModal").classList.add("hidden"); });
$("btnSkip").onclick = () => { session.skip = true; };
$("btnReset").onclick = () => { if (!session.busy) resetMonitor(); };

function tickClock() {
  const d = new Date();
  $("clock").textContent = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
setInterval(tickClock, 15000); tickClock();

renderChips();
renderHistory();
resetMonitor();
})();
