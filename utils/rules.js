/**
 * utils/rules.js
 *
 * Ported from your original cashbridgebot core/rules.py.
 * Detects payment-like text messages and extracts amounts/senders.
 * Used as a secondary/fallback input channel (forwarded bank SMS alerts).
 */

const PAYMENT_KEYWORDS = ["credit", "alert", "received", "payment", "deposit"];

function isPaymentMessage(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return PAYMENT_KEYWORDS.some(kw => lower.includes(kw));
}

function extractAmount(text) {
  if (!text) return 0;
  // Matches: 5000 | 5,000 | 5000.00 | 5,000.00
  const match = text.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/);
  if (match) return parseFloat(match[1].replace(/,/g, ""));
  return 0;
}

function extractSender(text) {
  if (!text) return "Unknown";
  const match = text.match(/from\s+([A-Za-z ]+)/i);
  if (match) return match[1].trim();
  return "Unknown";
}

module.exports = {
  rules: { isPaymentMessage, extractAmount, extractSender },
};
