/**
 * CashBridgeBot — app.js
 * Entry point. Starts the Express server and registers all routes.
 */

require("dotenv").config();
const express    = require("express");
const { initDb } = require("./database/db");
const webhook    = require("./core/handler");
const bot        = require("./core/bot");
const logger     = require("./utils/logger");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Raw body MUST come before json() for HMAC verification ──────────────────
app.use("/webhook/paystack", express.raw({ type: "application/json" }));
app.use(express.json());

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.send("✅ CashBridgeBot is running"));

// ── Paystack webhook route ────────────────────────────────────────────────────
app.use("/webhook/paystack", webhook);

// ── Boot sequence ─────────────────────────────────────────────────────────────
async function start() {
  try {
    await initDb();
    logger.info("Database initialised");

    app.listen(PORT, () => {
      logger.info(`Server listening on port ${PORT}`);
      logger.info(`Paystack webhook → POST /webhook/paystack`);
    });

    // Start Telegram bot polling
    bot.launch();
    logger.info("Telegram bot polling started");

  } catch (err) {
    logger.error("Boot failed:", err.message);
    process.exit(1);
  }
}

start();

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.once("SIGINT",  () => { bot.stop("SIGINT");  process.exit(0); });
process.once("SIGTERM", () => { bot.stop("SIGTERM"); process.exit(0); });
