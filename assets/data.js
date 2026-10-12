/* ============================================================================
 * data.js — Synthetic persona & transaction history for the live demo.
 *
 * ALL DATA IS FABRICATED. "Jason Li" is a fictional computer-science student
 * from Shenzhen studying in London. The 90-day spending history, GPS pings,
 * SMS messages and scenario transactions below were authored specifically for
 * this demo (see README "Data provenance").
 * ==========================================================================*/

// ── Persona ────────────────────────────────────────────────────────────────
const PERSONA = {
  name: "Jason Li",
  age: 24,
  origin: "Shenzhen, China",
  role: "MSc Computer Science student",
  university: "University College London",
  address: "Flat 12, Brunswick House, Bethnal Green, London E2",
  card: {
    issuer: "Meridian Bank",
    product: "Global Credit Card",
    last4: "4821",
    currency: "GBP",
    limit: 5000,
    issued: "Shenzhen, China",
  },
  // Home anchor used by the Context agent for distance calculations.
  home: { label: "Bethnal Green, London E2", lat: 51.5265, lng: -0.0555 },
};

// Most recent GPS pings from Jason's phone (used by the Context agent).
const GPS_PINGS = [
  { t: "2026-10-12 08:41", lat: 51.5265, lng: -0.0555, label: "Home · Bethnal Green E2" },
  { t: "2026-10-12 09:02", lat: 51.5226, lng: -0.1313, label: "UCL · Malet Place, WC1" },
  { t: "2026-10-12 17:48", lat: 51.5226, lng: -0.1313, label: "UCL · Malet Place, WC1" },
  { t: "2026-10-12 19:36", lat: 51.5202, lng: -0.0525, label: "Tesco · Bethnal Green" },
  { t: "2026-10-12 20:58", lat: 51.5265, lng: -0.0555, label: "Home · Bethnal Green E2" },
  { t: "2026-10-12 21:02", lat: 51.5265, lng: -0.0555, label: "Home · Bethnal Green E2" },
];

// Recent benign SMS messages on Jason's phone (baseline for the Comms agent).
const BASELINE_SMS = [
  { t: "2026-10-07 09:15", from: "Vodafone UK", text: "Your October bill is ready in the My Vodafone app. Nothing to pay by direct debit change." },
  { t: "2026-10-08 14:02", from: "UCL Library", text: "Item on hold for you: 'Designing Data-Intensive Applications'. Collect within 3 days." },
  { t: "2026-10-10 10:31", from: "Meridian Bank", text: "Your September credit card statement is now available in the Meridian app." },
  { t: "2026-10-11 16:47", from: "DPD UK", text: "Your parcel from Waterstones will arrive today between 16:00-17:00. Track: dpd.co.uk/track/8fj29s" },
];

// ── 90-day transaction history (all synthetic) ─────────────────────────────
// amount in GBP. method: Contactless | Chip & PIN | Online | Direct debit
const HISTORY = [
  // ── Rent & tuition (large, expected) ──
  { date: "2026-08-31", time: "06:00", merchant: "Brunswick House Lettings", category: "Housing",   amount: 1150.00, city: "London",  country: "GB", method: "Direct debit", note: "Monthly rent" },
  { date: "2026-09-01", time: "06:00", merchant: "Better Gym Bethnal Green", category: "Health",    amount: 25.00,   city: "London",  country: "GB", method: "Direct debit", note: "Gym membership" },
  { date: "2026-09-20", time: "14:22", merchant: "UCL · Tuition Payment",    category: "Education", amount: 3900.00, city: "London",  country: "GB", method: "Online",       note: "Tuition instalment 1 of 3" },
  { date: "2026-10-01", time: "06:00", merchant: "Brunswick House Lettings", category: "Housing",   amount: 1150.00, city: "London",  country: "GB", method: "Direct debit", note: "Monthly rent" },
  { date: "2026-10-01", time: "06:00", merchant: "Better Gym Bethnal Green", category: "Health",    amount: 25.00,   city: "London",  country: "GB", method: "Direct debit", note: "Gym membership" },

  // ── Utilities & telecom ──
  { date: "2026-08-20", time: "09:12", merchant: "Thames Water", category: "Utilities", amount: 27.40, city: "London", country: "GB", method: "Direct debit" },
  { date: "2026-09-03", time: "06:00", merchant: "Octopus Energy", category: "Utilities", amount: 61.20, city: "London", country: "GB", method: "Direct debit" },
  { date: "2026-09-05", time: "09:00", merchant: "Thames Water", category: "Utilities", amount: 25.10, city: "London", country: "GB", method: "Direct debit" },
  { date: "2026-09-28", time: "06:00", merchant: "Vodafone UK", category: "Telecom", amount: 12.00, city: "London", country: "GB", method: "Direct debit" },
  { date: "2026-10-03", time: "06:00", merchant: "Octopus Energy", category: "Utilities", amount: 58.40, city: "London", country: "GB", method: "Direct debit" },
  { date: "2026-10-05", time: "09:00", merchant: "Thames Water", category: "Utilities", amount: 24.60, city: "London", country: "GB", method: "Direct debit" },

  // ── Subscriptions ──
  { date: "2026-09-15", time: "06:00", merchant: "Spotify UK", category: "Entertainment", amount: 11.99, city: "London", country: "GB", method: "Direct debit" },
  { date: "2026-09-27", time: "06:00", merchant: "Netflix.com", category: "Entertainment", amount: 10.99, city: "London", country: "GB", method: "Direct debit" },

  // ── Groceries ──
  { date: "2026-08-22", time: "11:20", merchant: "Tesco · Bethnal Green", category: "Groceries", amount: 38.72, city: "London", country: "GB", method: "Chip & PIN" },
  { date: "2026-08-25", time: "18:05", merchant: "M&S Food · Whitechapel", category: "Groceries", amount: 11.99, city: "London", country: "GB", method: "Contactless" },
  { date: "2026-08-29", time: "17:45", merchant: "Tesco · Bethnal Green", category: "Groceries", amount: 22.15, city: "London", country: "GB", method: "Contactless" },
  { date: "2026-09-05", time: "11:03", merchant: "Tesco · Bethnal Green", category: "Groceries", amount: 41.60, city: "London", country: "GB", method: "Chip & PIN" },
  { date: "2026-09-08", time: "19:40", merchant: "Sainsbury's Local · Whitechapel", category: "Groceries", amount: 14.20, city: "London", country: "GB", method: "Contactless" },
  { date: "2026-09-12", time: "18:20", merchant: "Tesco · Bethnal Green", category: "Groceries", amount: 19.84, city: "London", country: "GB", method: "Contactless" },
  { date: "2026-09-14", time: "12:10", merchant: "See Woo Chinese Supermarket", category: "Groceries", amount: 47.65, city: "London", country: "GB", method: "Chip & PIN" },
  { date: "2026-09-19", time: "11:41", merchant: "Tesco · Bethnal Green", category: "Groceries", amount: 36.29, city: "London", country: "GB", method: "Chip & PIN" },
  { date: "2026-09-26", time: "16:58", merchant: "Tesco · Bethnal Green", category: "Groceries", amount: 28.07, city: "London", country: "GB", method: "Contactless" },
  { date: "2026-10-03", time: "11:15", merchant: "Tesco · Bethnal Green", category: "Groceries", amount: 33.44, city: "London", country: "GB", method: "Chip & PIN" },
  { date: "2026-10-04", time: "13:22", merchant: "See Woo Chinese Supermarket", category: "Groceries", amount: 52.30, city: "London", country: "GB", method: "Chip & PIN" },
  { date: "2026-10-10", time: "17:32", merchant: "Tesco · Bethnal Green", category: "Groceries", amount: 26.91, city: "London", country: "GB", method: "Contactless" },
  { date: "2026-10-12", time: "20:53", merchant: "Tesco Express · Bethnal Green", category: "Groceries", amount: 9.35, city: "London", country: "GB", method: "Contactless" },

  // ── Coffee & dining ──
  { date: "2026-08-21", time: "08:55", merchant: "Costa Coffee · UCL", category: "Coffee", amount: 3.45, city: "London", country: "GB", method: "Contactless" },
  { date: "2026-09-10", time: "09:10", merchant: "Costa Coffee · UCL", category: "Coffee", amount: 2.95, city: "London", country: "GB", method: "Contactless" },
  { date: "2026-09-23", time: "15:48", merchant: "Costa Coffee · E2", category: "Coffee", amount: 4.10, city: "London", country: "GB", method: "Contactless" },
  { date: "2026-10-06", time: "08:47", merchant: "Costa Coffee · UCL", category: "Coffee", amount: 3.20, city: "London", country: "GB", method: "Contactless" },
  { date: "2026-10-09", time: "12:31", merchant: "Pret A Manger · Warren St", category: "Dining", amount: 5.85, city: "London", country: "GB", method: "Contactless" },
  { date: "2026-09-11", time: "20:15", merchant: "Deliveroo · Wasabi Oi", category: "Delivery", amount: 18.50, city: "London", country: "GB", method: "Online" },
  { date: "2026-09-30", time: "21:02", merchant: "Uber Eats · Banh Mi House", category: "Delivery", amount: 22.40, city: "London", country: "GB", method: "Online" },
  { date: "2026-10-07", time: "19:38", merchant: "Deliveroo · Franco Manca", category: "Delivery", amount: 16.80, city: "London", country: "GB", method: "Online" },

  // ── Transport ──
  { date: "2026-08-18", time: "09:05", merchant: "TfL Travel Charge", category: "Transport", amount: 2.80, city: "London", country: "GB", method: "Contactless" },
  { date: "2026-08-24", time: "18:22", merchant: "TfL Travel Charge", category: "Transport", amount: 5.60, city: "London", country: "GB", method: "Contactless" },
  { date: "2026-09-02", time: "08:58", merchant: "TfL Travel Charge", category: "Transport", amount: 2.80, city: "London", country: "GB", method: "Contactless" },
  { date: "2026-09-16", time: "17:44", merchant: "TfL Travel Charge", category: "Transport", amount: 7.20, city: "London", country: "GB", method: "Contactless" },
  { date: "2026-09-29", time: "09:12", merchant: "TfL Travel Charge", category: "Transport", amount: 2.80, city: "London", country: "GB", method: "Contactless" },
  { date: "2026-10-04", time: "11:20", merchant: "TfL Travel Charge", category: "Transport", amount: 5.60, city: "London", country: "GB", method: "Contactless" },
  { date: "2026-10-11", time: "19:35", merchant: "TfL Travel Charge", category: "Transport", amount: 4.50, city: "London", country: "GB", method: "Contactless" },

  // ── Retail & other ──
  { date: "2026-09-06", time: "16:12", merchant: "Amazon UK Marketplace", category: "Retail", amount: 79.99, city: "London", country: "GB", method: "Online", note: "Mechanical keyboard" },
  { date: "2026-09-09", time: "13:30", merchant: "Boots · Whitechapel", category: "Health", amount: 18.74, city: "London", country: "GB", method: "Contactless" },
  { date: "2026-09-17", time: "15:05", merchant: "Waterstones · Gower St", category: "Retail", amount: 32.40, city: "London", country: "GB", method: "Chip & PIN" },
  { date: "2026-10-02", time: "10:41", merchant: "Boots · Whitechapel", category: "Health", amount: 8.99, city: "London", country: "GB", method: "Contactless" },
  { date: "2026-10-09", time: "22:18", merchant: "Amazon UK Marketplace", category: "Retail", amount: 23.50, city: "London", country: "GB", method: "Online", note: "Course books" },

  // ── Paris weekend (abroad but GPS-consistent — good history texture) ──
  { date: "2026-09-25", time: "07:12", merchant: "Eurostar · St Pancras", category: "Travel", amount: 78.00, city: "London", country: "GB", method: "Online", note: "Weekend trip" },
  { date: "2026-09-26", time: "13:05", merchant: "Pret A Manger · Paris Marais", category: "Coffee", amount: 7.40, city: "Paris", country: "FR", method: "Contactless" },
  { date: "2026-09-26", time: "18:40", merchant: "Carrefour · Paris Rivoli", category: "Groceries", amount: 15.30, city: "Paris", country: "FR", method: "Contactless" },
];

// ── Preset scenarios ────────────────────────────────────────────────────────
// Each scenario is one incoming transaction, optionally with extra SMS
// messages "received" shortly before it, and optional GPS overrides (for
// replay-style scenarios such as the Paris weekend).
const SCENARIOS = [
  {
    id: "stolen_wallet",
    emoji: "🚨",
    label: "Stolen wallet · Lagos FX bureau",
    tagline: "The flagship case — based on a real incident",
    txn: {
      date: "2026-10-12", time: "21:04",
      merchant: "Golden Gateway FX Bureau",
      category: "FX / Remittance",
      amount: 850.00, currency: "GBP",
      detail: "Buy 1,680,000 NGN · cash pickup",
      city: "Lagos", country: "NG",
      lat: 6.4531, lng: 3.3958,
      method: "Chip & PIN", cardPresent: true,
    },
    injectSms: [],
  },
  {
    id: "tesco_grocery",
    emoji: "🛒",
    label: "Tesco weekly groceries",
    tagline: "Everyday spend — should sail through",
    txn: {
      date: "2026-10-13", time: "18:30",
      merchant: "Tesco · Bethnal Green",
      category: "Groceries",
      amount: 34.87, currency: "GBP",
      city: "London", country: "GB",
      lat: 51.5202, lng: -0.0525,
      method: "Contactless", cardPresent: true,
    },
    injectSms: [],
  },
  {
    id: "octopus_dd",
    emoji: "🔥",
    label: "Octopus Energy direct debit",
    tagline: "Recurring bill — known merchant pattern",
    txn: {
      date: "2026-10-13", time: "06:00",
      merchant: "Octopus Energy",
      category: "Utilities",
      amount: 59.80, currency: "GBP",
      city: "London", country: "GB",
      method: "Direct debit", cardPresent: false,
    },
    injectSms: [],
  },
  {
    id: "phishing_cardtest",
    emoji: "🎣",
    label: "Phishing SMS → card test",
    tagline: "Social engineering caught by the Comms agent",
    txn: {
      date: "2026-10-14", time: "02:13",
      merchant: "UK-Parcel-Customs.Fee Pay",
      category: "Other",
      amount: 1.99, currency: "GBP",
      city: "—", country: "GB",
      method: "Online", cardPresent: false,
    },
    injectSms: [
      { t: "2026-10-13 23:40", from: "+44 7700 900512", text: "EVRI: Your parcel HLTD. Unpaid customs fee £1.99. Pay now to reschedule: https://evri-fee-pay-secure.info/x" },
    ],
  },
  {
    id: "tuition_2nd",
    emoji: "🎓",
    label: "Tuition instalment £3,900",
    tagline: "Big amount ≠ fraud when the pattern matches",
    txn: {
      date: "2026-10-15", time: "10:00",
      merchant: "UCL · Tuition Payment",
      category: "Education",
      amount: 3900.00, currency: "GBP",
      city: "London", country: "GB",
      lat: 51.5226, lng: -0.1313,
      method: "Online", cardPresent: false,
    },
    injectSms: [],
  },
  {
    id: "paris_replay",
    emoji: "🇫🇷",
    label: "Paris weekend · in-person (replay)",
    tagline: "Abroad but GPS-consistent — no false positive",
    txn: {
      date: "2026-09-26", time: "13:05",
      merchant: "Pret A Manger · Paris Marais",
      category: "Coffee",
      amount: 6.20, currency: "GBP",
      city: "Paris", country: "FR",
      lat: 48.8614, lng: 2.3558,
      method: "Contactless", cardPresent: true,
    },
    injectSms: [],
    gpsOverride: [
      { t: "2026-09-26 08:05", lat: 51.5308, lng: -0.1241, label: "St Pancras International" },
      { t: "2026-09-26 11:20", lat: 50.6292, lng: 3.0573,  label: "Eurostar · near Lille" },
      { t: "2026-09-26 12:58", lat: 48.8809, lng: 2.3655,  label: "Paris Gare du Nord" },
      { t: "2026-09-26 13:03", lat: 48.8614, lng: 2.3558,  label: "Le Marais · Paris" },
    ],
  },
];

// Merchant categories the risk engine treats as inherently high-risk.
const HIGH_RISK_CATEGORIES = ["FX / Remittance", "Crypto", "Gambling"];
