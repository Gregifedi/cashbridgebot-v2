/**
 * core/bot.js
 *
 * All Telegram bot commands using Telegraf.
 * Also wires the bot instance into access.js and notifier.js.
 *
 * Commands:
 *   /start [ref_CODE]   — welcome + handle referral deep link
 *   /subscribe          — payment link with Telegram ID attached
 *   /status             — show subscription status
 *   /history            — last 10 payments
 *   /link [email]       — manually connect email after payment
 *   /affiliate          — get/view referral link + stats
 *   /leaderboard        — top 10 affiliates
 *   /help               — command list
 *
 *   Admin only (OWNER_CHAT_ID):
 *   /stats              — revenue, subscribers, affiliate totals
 *   /highestpayer       — top 5 payers by total spent
 *   /broadcast [msg]    — send message to all active subscribers
 */

const { Telegraf }   = require("telegraf");
const config         = require("../config");
const db             = require("../database/db");
const access         = require("./access");
const notify         = require("./notifier");
const helpers        = require("../utils/helpers");
const logger         = require("../utils/logger");
const { rules }      = require("../utils/rules");

const bot = new Telegraf(config.BOT_TOKEN);

// Wire bot into access + notifier so they can send messages
access.setBot(bot);
notify.setBot(bot);

// ── Middleware: log every command ─────────────────────────────────────────────
bot.use((ctx, next) => {
  if (ctx.message?.text) {
    logger.info(`[CMD] ${ctx.from?.id} → ${ctx.message.text.split(" ")[0]}`);
  }
  return next();
});

// ── /start ────────────────────────────────────────────────────────────────────
bot.start(async (ctx) => {
  const chatId   = String(ctx.from.id);
  const username = ctx.from.username || ctx.from.first_name || "there";
  const param    = ctx.startPayload || "";

  db.upsertUser({ chatId, username });

  if (param.startsWith("ref_")) {
    const code      = param.replace("ref_", "");
    const affiliate = db.getAffiliateByCode(code);
    const rate      = affiliate ? helpers.commissionRate(affiliate.total_referrals) : config.COMMISSION_RATE;

    return ctx.replyWithMarkdown(
      `👋 Welcome, ${username}!\n\n` +
      `You were referred by an affiliate. Subscribe now and they earn ${Math.round(rate * 100)}% monthly commission.\n\n` +
      `💳 *Subscribe to the Prompt Vault — ₦5,000/month:*\n` +
      `https://paystack.shop/pay/cashbridgevault?telegram_id=${chatId}&affiliate_code=${code}\n\n` +
      `After payment, come back and type /status to verify your access.`
    );
  }

  ctx.replyWithMarkdown(
    `🤖 *CashBridgeBot*\n\n` +
    `Welcome, ${username}! I manage access to the Prompt Vault — a private AI prompt library for professionals.\n\n` +
    `*Commands:*\n` +
    `/subscribe — get the payment link\n` +
    `/status — check your subscription\n` +
    `/history — view your payment history\n` +
    `/link email — connect your email after payment\n` +
    `/affiliate — become an affiliate and earn commissions\n` +
    `/leaderboard — see top affiliates\n` +
    `/help — show this menu`
  );
});

// ── /subscribe ────────────────────────────────────────────────────────────────
bot.command("subscribe", async (ctx) => {
  const chatId = String(ctx.from.id);
  db.upsertUser({ chatId, username: ctx.from.username });

  ctx.replyWithMarkdown(
    `💳 *Subscribe to the Prompt Vault*\n\n` +
    `*₦5,000/month* — new prompts every Monday, cancel anytime.\n\n` +
    `👉 [Pay securely via Paystack](https://paystack.shop/pay/cashbridgevault?telegram_id=${chatId})\n\n` +
    `Your Telegram ID \`${chatId}\` is attached to the link.\n` +
    `Access is granted automatically within seconds of payment.`,
    { disable_web_page_preview: true }
  );
});

// ── /status ───────────────────────────────────────────────────────────────────
bot.command("status", async (ctx) => {
  const chatId = String(ctx.from.id);
  const sub    = db.getSubscriptionByChatId(chatId);

  if (!sub) {
    return ctx.replyWithMarkdown(
      `You don't have an active subscription.\n\nType /subscribe to join the Prompt Vault.`
    );
  }

  const icon   = sub.status === "active" ? "✅ Active" : "❌ Inactive";
  const since  = helpers.formatDate(sub.started_at);

  ctx.replyWithMarkdown(
    `📋 *Your Subscription*\n\n` +
    `Status: ${icon}\n` +
    `Plan: ${sub.plan}\n` +
    `Email: ${sub.email}\n` +
    `Member since: ${since}\n\n` +
    `${sub.status === "inactive" ? "Type /subscribe to reactivate." : "Type /history to view payments."}`
  );
});

// ── /history ──────────────────────────────────────────────────────────────────
bot.command("history", async (ctx) => {
  const chatId  = String(ctx.from.id);
  const history = db.getPaymentHistoryByChatId(chatId);

  if (!history.length) {
    return ctx.reply("No payment history found. Type /subscribe to get started.");
  }

  const lines = history.map(h =>
    `• ${helpers.formatDate(h.paid_at)} — ${h.currency} ${helpers.formatAmount(h.amount, h.currency)} (${h.event_type})`
  ).join("\n");

  ctx.replyWithMarkdown(`📜 *Your last ${history.length} transactions:*\n\n${lines}`);
});

// ── /link [email] ─────────────────────────────────────────────────────────────
bot.command("link", async (ctx) => {
  const chatId = String(ctx.from.id);
  const parts  = ctx.message.text.split(" ");
  const email  = parts[1]?.toLowerCase();

  if (!email || !email.includes("@")) {
    return ctx.reply("Usage: /link your@email.com");
  }

  const sub = db.getSubscriptionByEmail(email);

  if (!sub) {
    return ctx.replyWithMarkdown(
      `❌ No payment found for *${email}*.\n\nMake sure you used this email when paying, or type /subscribe to pay now.`
    );
  }

  db.linkEmailToChatId(email, chatId);
  db.upsertUser({ chatId, email });

  if (sub.status === "active") {
    await access.grant(chatId, email);
  } else {
    ctx.replyWithMarkdown(
      `✅ Account linked to \`${email}\`.\n\nYour subscription is currently inactive. Type /subscribe to reactivate.`
    );
  }
});

// ── /affiliate ────────────────────────────────────────────────────────────────
bot.command("affiliate", async (ctx) => {
  const chatId   = String(ctx.from.id);
  const username = ctx.from.username || ctx.from.first_name || "Affiliate";

  let aff = db.getAffiliateByChatId(chatId);
  if (!aff) {
    const code = helpers.generateReferralCode();
    db.upsertAffiliate({ chatId, username, referralCode: code });
    aff = db.getAffiliateByChatId(chatId);
  }

  const rate  = helpers.commissionRate(aff.total_referrals);
  const tier  = helpers.tierLabel(aff.total_referrals);
  const botMe = await bot.telegram.getMe();
  const link  = `https://t.me/${botMe.username}?start=ref_${aff.referral_code}`;

  ctx.replyWithMarkdown(
    `🤝 *Your Affiliate Dashboard*\n\n` +
    `Code: \`${aff.referral_code}\`\n` +
    `Commission: *${Math.round(rate * 100)}%* (${tier})\n` +
    `Total referrals: ${aff.total_referrals}\n` +
    `Total earned: $${helpers.round(aff.total_earned, 2)}\n\n` +
    `*Your referral link:*\n${link}\n\n` +
    `*Commission tiers:*\n` +
    `🥉 1–5 referrals = 30%\n` +
    `🥈 6–15 referrals = 35%\n` +
    `🥇 16+ referrals = 40%\n\n` +
    `Share your link. Every subscriber you bring in pays you ${Math.round(rate * 100)}% monthly for as long as they stay.`,
    { disable_web_page_preview: true }
  );
});

// ── /leaderboard ──────────────────────────────────────────────────────────────
bot.command("leaderboard", async (ctx) => {
  const board = db.getLeaderboard(10);

  if (!board.length) {
    return ctx.reply("No affiliates yet. Be the first — type /affiliate");
  }

  const medals = ["🥇", "🥈", "🥉"];
  const lines  = board.map((a, i) =>
    `${medals[i] || `${i + 1}.`} *${a.username || a.referral_code}* — ${a.total_referrals} referrals · $${helpers.round(a.total_earned, 2)} earned`
  ).join("\n");

  ctx.replyWithMarkdown(
    `🏆 *Affiliate Leaderboard*\n\n${lines}\n\nType /affiliate to see your own stats.`
  );
});

// ── /help ─────────────────────────────────────────────────────────────────────
bot.command("help", (ctx) => {
  ctx.replyWithMarkdown(
    `📖 *CashBridgeBot Commands*\n\n` +
    `/subscribe — payment link\n` +
    `/status — your subscription status\n` +
    `/history — last 10 payments\n` +
    `/link email — connect email to Telegram\n` +
    `/affiliate — get referral link + stats\n` +
    `/leaderboard — top affiliates\n\n` +
    `_Admin only: /stats · /highestpayer · /broadcast_`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN COMMANDS
// ─────────────────────────────────────────────────────────────────────────────

function isAdmin(ctx) {
  return String(ctx.from.id) === config.OWNER_CHAT_ID;
}

bot.command("stats", async (ctx) => {
  if (!isAdmin(ctx)) return;
  const s = db.getStats();

  ctx.replyWithMarkdown(
    `📊 *CashBridge Stats*\n\n` +
    `Active subscribers: *${s.activeCount}*\n` +
    `Total revenue: *$${helpers.round(s.totalRevenue, 2)}*\n` +
    `Today's revenue: *$${helpers.round(s.todayRevenue, 2)}*\n` +
    `Total payments: *${s.paymentCount}*\n` +
    `Affiliates: *${s.affiliateCount}*\n` +
    `Total referrals: *${s.referralCount}*`
  );
});

bot.command("highestpayer", (ctx) => {
  if (!isAdmin(ctx)) return;
  const top = db.getTopPayers(5);

  if (!top.length) return ctx.reply("No payments yet.");

  const lines = top.map((p, i) =>
    `${i + 1}. ${p.email} — $${helpers.round(p.total, 2)} (${p.payments} payments)`
  ).join("\n");

  ctx.replyWithMarkdown(`💰 *Top Payers*\n\n${lines}`);
});

bot.command("broadcast", async (ctx) => {
  if (!isAdmin(ctx)) return;

  const text = ctx.message.text.replace("/broadcast", "").trim();
  if (!text) return ctx.reply("Usage: /broadcast Your message here");

  const subs    = db.getAllActiveSubscriptions();
  const chatIds = subs.map(s => s.chat_id).filter(Boolean);

  const { sent, failed } = await notify.broadcast(chatIds, `📢 ${text}`);
  ctx.reply(`Broadcast done. Sent: ${sent} | Failed: ${failed}`);
});

bot.on("text", (ctx) => {
  const text = ctx.message.text;
  if (rules.isPaymentMessage(text)) {
    const amount = rules.extractAmount(text);
    const sender = rules.extractSender(text);
    if (amount > 0) {
      ctx.replyWithMarkdown(
        `🔔 *Payment alert detected*\n\nAmount: ${amount}\nSender: ${sender}\n\n` +
        `Note: this is a forwarded message, not a verified Paystack payment.\n` +
        `Type /status to check your official subscription.`
      );
    }
  }
});

function scheduleFridayLeaderboard() {
  const now    = new Date();
  const friday = new Date();
  friday.setDate(now.getDate() + ((5 - now.getDay() + 7) % 7 || 7));
  friday.setHours(18, 0, 0, 0);
  const ms = friday - now;

  setTimeout(async () => {
    const board = db.getLeaderboard(3);
    if (board.length) {
      const medals = ["🥇", "🥈", "🥉"];
      const lines  = board.map((a, i) =>
        `${medals[i]} *${a.username || a.referral_code}* — ${a.total_referrals} referrals`
      ).join("\n");

      const allAff  = db.getAllAffiliates();
      const chatIds = allAff.map(a => a.chat_id);
      await notify.broadcast(chatIds,
        `🏆 *Weekly Leaderboard*\n\n${lines}\n\nKeep sharing your link to climb the ranks!`
      );
    }
    scheduleFridayLeaderboard();
  }, ms);
}

scheduleFridayLeaderboard();

module.exports = bot;
