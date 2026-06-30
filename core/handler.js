/**
 * core/handler.js
 * Handles webhooks from both Paystack and Flutterwave
 */

const crypto  = require("crypto");
const express = require("express");
const router  = express.Router();
const config  = require("../config");
const db      = require("../database/db");
const access  = require("./access");
const notify  = require("./notifier");
const logger  = require("../utils/logger");
const helpers = require("../utils/helpers");

// ── Paystack signature verification ──────────────────────────────────────────
function verifyPaystackSignature(rawBody, signatureHeader) {
  const hash = crypto
    .createHmac("sha512", config.WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return hash === signatureHeader;
}

// ── Flutterwave signature verification ───────────────────────────────────────
function verifyFlutterwaveSignature(signatureHeader) {
  return signatureHeader === config.FLW_WEBHOOK_SECRET;
}

// ── Shared payment processor ──────────────────────────────────────────────────
async function processSuccessfulPayment({ email, amount, currency, reference, chatId, affiliateCode, plan }) {
  if (chatId) db.upsertUser({ chatId, email });

  db.savePayment({ chatId, email, amount, currency, reference, eventType: "charge.success", affiliateCode });
  db.upsertSubscription({ chatId, email, plan: plan || "monthly", paystackRef: reference, affiliateCode });

  if (affiliateCode) {
    const affiliate = db.getAffiliateByCode(affiliateCode);
    if (affiliate) {
      const rate       = helpers.commissionRate(affiliate.total_referrals);
      const commission = helpers.round(amount * rate, 2);
      db.recordReferral({ affiliateCode, referredEmail: email, commission });
      logger.info(`Affiliate ${affiliateCode} earns ${currency} ${commission}`);
    }
  }

  if (chatId) {
    await access.grant(chatId, email);
  } else {
    await notify.admin(
      `New payment but no Telegram ID\nEmail: ${email}\nAmount: ${currency} ${helpers.formatAmount(amount, currency)}\nAsk them to type /link ${email}`
    );
  }

  await notify.admin(
    `New subscriber\nEmail: ${email}\nAmount: ${helpers.formatAmount(amount, currency)}\nAffiliate: ${affiliateCode || "direct"}\nRef: ${reference}`
  );
}

// ── PAYSTACK webhook ──────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const signature = req.headers["x-paystack-signature"];

  if (!verifyPaystackSignature(req.body, signature)) {
    logger.warn("Rejected Paystack webhook — invalid signature");
    return res.status(401).json({ error: "Invalid signature" });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch (e) {
    logger.error("Paystack webhook JSON parse error:", e.message);
    return res.status(400).json({ error: "Bad JSON" });
  }

  const { event: eventType, data } = event;

  logger.info(`[PAYSTACK] ${eventType}`);

  const email    = data?.customer?.email?.toLowerCase();
  const amount   = (data?.amount || 0) / 100;
  const currency = data?.currency || "NGN";
  const reference = data?.reference;
  const metadata  = data?.metadata || {};

  const customFields     = metadata?.custom_fields || [];
  const telegramField    = customFields.find(f =>
    f.variable_name === "telegram_id" ||
    f.display_name  === "telegram_id" ||
    f.display_name  === "Telegram ID"
  );
  const chatId = String(
    telegramField?.value || metadata?.telegram_id ||
    db.getUserByEmail(email)?.chat_id || ""
  ) || null;

  const affiliateCode = metadata?.affiliate_code ||
    customFields.find(f => f.variable_name === "affiliate_code")?.value || null;

  res.status(200).json({ received: true });

  try {
    switch (eventType) {
      case "charge.success":
        await processSuccessfulPayment({
          email, amount, currency, reference, chatId, affiliateCode,
          plan: data?.plan?.name || "monthly"
        });
        break;

      case "subscription.disable":
      case "invoice.payment_failed":
        db.savePayment({ chatId, email, amount: 0, currency, reference, eventType, affiliateCode: null });
        db.deactivateSubscription(email);
        if (chatId) await access.revoke(chatId, email);
        await notify.admin(`Subscription ended\nEmail: ${email}\nEvent: ${eventType}`);
        break;

      case "subscription.create":
        await notify.admin(`Recurring subscription started\nEmail: ${email}\nPlan: ${data?.plan?.name || "unknown"}`);
        break;

      default:
        logger.info(`Unhandled Paystack event: ${eventType}`);
    }
  } catch (err) {
    logger.error(`Paystack error processing ${eventType}:`, err.message);
    await notify.admin(`Error processing ${eventType} for ${email}: ${err.message}`);
  }
});

// ── FLUTTERWAVE webhook ───────────────────────────────────────────────────────
router.post("/flutterwave", async (req, res) => {
  const signature = req.headers["verif-hash"];

  if (!verifyFlutterwaveSignature(signature)) {
    logger.warn("Rejected Flutterwave webhook — invalid signature");
    return res.status(401).json({ error: "Invalid signature" });
  }

  const payload = req.body;
  logger.info(`[FLUTTERWAVE] ${payload?.event}`);

  res.status(200).json({ received: true });

  try {
    if (payload?.event === "charge.completed" && payload?.data?.status === "successful") {
      const data      = payload.data;
      const email     = data?.customer?.email?.toLowerCase();
      const amount    = data?.amount || 0;
      const currency  = data?.currency || "NGN";
      const reference = data?.tx_ref || data?.flw_ref;
      const meta      = data?.meta || {};

      const chatId        = meta?.telegram_id ? String(meta.telegram_id) : db.getUserByEmail(email)?.chat_id || null;
      const affiliateCode = meta?.affiliate_code || null;

      await processSuccessfulPayment({
        email, amount, currency, reference, chatId, affiliateCode,
        plan: "monthly"
      });
    }
  } catch (err) {
    logger.error("Flutterwave webhook error:", err.message);
    await notify.admin(`Flutterwave error: ${err.message}`);
  }
});

module.exports = router;
