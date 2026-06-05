/**
 * config.js — Single source of truth for all environment variables.
 * Throws immediately on startup if a required value is missing.
 */

require("dotenv").config();

const required = [
  "BOT_TOKEN",
  "OWNER_CHAT_ID",
  "VAULT_CHANNEL_ID",
  "PAYSTACK_SECRET_KEY",
  "PAYSTACK_WEBHOOK_SECRET",
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`❌ Missing required env variable: ${key}`);
  }
}

module.exports = {
  BOT_TOKEN:               process.env.BOT_TOKEN,
  OWNER_CHAT_ID:           process.env.OWNER_CHAT_ID,
  VAULT_CHANNEL_ID:        process.env.VAULT_CHANNEL_ID,
  PAYSTACK_SECRET_KEY:     process.env.PAYSTACK_SECRET_KEY,
  WEBHOOK_SECRET:          process.env.PAYSTACK_WEBHOOK_SECRET,
  PORT:                    process.env.PORT || 3000,
  BOT_USERNAME:            process.env.BOT_USERNAME || "",  // e.g. cashbridgebot
  COMMISSION_RATE:         parseFloat(process.env.COMMISSION_RATE || "0.30"),
  SUBSCRIPTION_PRICE_USD:  parseFloat(process.env.SUBSCRIPTION_PRICE_USD || "10"),
};
