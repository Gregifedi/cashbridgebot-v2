/**
 * utils/helpers.js
 *
 * Pure utility functions. No side effects. Easy to test.
 */

const crypto = require("crypto");

// ── Rounding ──────────────────────────────────────────────────────────────────
function round(value, decimals = 2) {
  return Math.round(value * 10 ** decimals) / 10 ** decimals;
}

// ── Currency formatting ───────────────────────────────────────────────────────
function formatAmount(amount, currency = "NGN") {
  if (currency === "NGN") return `₦${Number(amount).toLocaleString("en-NG")}`;
  if (currency === "USD") return `$${round(amount, 2).toFixed(2)}`;
  if (currency === "GHS") return `GH₵${round(amount, 2).toFixed(2)}`;
  return `${currency} ${round(amount, 2)}`;
}

// ── Date formatting ───────────────────────────────────────────────────────────
function formatDate(isoString) {
  if (!isoString) return "Unknown";
  return new Date(isoString).toDateString();
}

// ── Commission tiers (mirrors cashbridgebot bot.py reward logic) ──────────────
// 1–5 referrals  = 30%
// 6–15 referrals = 35%
// 16+ referrals  = 40%
function commissionRate(totalReferrals) {
  if (totalReferrals >= 16) return 0.40;
  if (totalReferrals >= 6)  return 0.35;
  return 0.30;
}

function tierLabel(totalReferrals) {
  if (totalReferrals >= 16) return "Gold — 40%";
  if (totalReferrals >= 6)  return "Silver — 35%";
  return "Bronze — 30%";
}

// ── Referral code generation (same logic as cashbridgebot bot.py) ─────────────
function generateReferralCode(length = 6) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

// ── Unique reference check helper ─────────────────────────────────────────────
function generateReference() {
  return `CB-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

module.exports = {
  round,
  formatAmount,
  formatDate,
  commissionRate,
  tierLabel,
  generateReferralCode,
  generateReference,
};
