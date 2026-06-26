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
  "FLW_SECRET_KEY",
  "FLW_PUBLIC_KEY",
  "FLW_ENCRYPTION_KEY",
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env variable: ${key}`);
  }
}

module.exports = {
  // Telegram
  BOT_TOKEN:               process.env.BOT_TOKEN,
  OWNER_CHAT_ID:           process.env.OWNER_CHAT_ID,
  VAULT_CHANNEL_ID:        process.env.VAULT_CHANNEL_ID,
  BOT_USERNAME:            process.env.BOT_USERNAME || "",

  // Paystack
  PAYSTACK_SECRET_KEY:     process.env.PAYSTACK_SECRET_KEY,
  PAYSTACK_PUBLIC_KEY:     process.env.PAYSTACK_PUBLIC_KEY || "",
  WEBHOOK_SECRET:          process.env.PAYSTACK_WEBHOOK_SECRET,

  // Flutterwave
  FLW_SECRET_KEY:          process.env.FLW_SECRET_KEY,
  FLW_PUBLIC_KEY:          process.env.FLW_PUBLIC_KEY,
  FLW_ENCRYPTION_KEY:      process.env.FLW_ENCRYPTION_KEY,
  FLW_WEBHOOK_SECRET:      process.env.FLW_WEBHOOK_SECRET || "cashbridge_flw_2024",

  // Bot settings
  PORT:                    process.env.PORT || 3000,
  COMMISSION_RATE:         parseFloat(process.env.COMMISSION_RATE || "0.30"),
  SUBSCRIPTION_PRICE_USD:  parseFloat(process.env.SUBSCRIPTION_PRICE_USD || "10"),
  SUBSCRIPTION_PRICE_NGN:  parseInt(process.env.SUBSCRIPTION_PRICE_NGN || "5000"),
};
