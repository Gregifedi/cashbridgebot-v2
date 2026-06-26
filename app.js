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
app.use("/webhook/paystack",     express.raw({ type: "application/json" }));
app.use("/webhook/flutterwave",  express.raw({ type: "application/json" }));
app.use(express.json());

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.send("✅ CashBridgeBot is running"));

// ── Paystack webhook route ────────────────────────────────────────────────────
app.use("/webhook/paystack", webhook);

// ── Flutterwave webhook route ─────────────────────────────────────────────────
app.use("/webhook/flutterwave", webhook);

// ── Gumroad ping route ────────────────────────────────────────────────────────
app.post("/gumroad-webhook", async (req, res) => {
  try {
    const data = req.body;
    logger.info(`Gumroad sale: ${data.email} — ${data.product_name}`);

    await bot.telegram.sendMessage(
      "8282975474",
      `💰 New Gumroad sale!\n` +
      `Product: ${data.product_name || "AI Prompt Vault"}\n` +
      `Buyer: ${data.email || "Unknown"}\n` +
      `Amount: $${data.price ? (data.price / 100).toFixed(2) : "5.00"}`
    );

    res.sendStatus(200);
  } catch (err) {
    logger.error("Gumroad webhook error:", err.message);
    res.sendStatus(200);
  }
});

// ── Boot sequence ─────────────────────────────────────────────────────────────
async function start() {
  try {
    await initDb();
    logger.info("Database initialised");

    app.listen(PORT, () => {
      logger.info(`Server listening on port ${PORT}`);
      logger.info(`Paystack webhook    → POST /webhook/paystack`);
      logger.info(`Flutterwave webhook → POST /webhook/flutterwave`);
      logger.info(`Gumroad webhook     → POST /gumroad-webhook`);
    });

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
