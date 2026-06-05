/**
 * core/access.js
 *
 * Handles adding and removing users from the private vault channel.
 * Uses one-time invite links so the same link can't be shared.
 */

const config  = require("../config");
const notify  = require("./notifier");
const logger  = require("../utils/logger");

let _bot; // set by bot.js after Telegraf initialises

function setBot(bot) {
  _bot = bot;
}

// ── Grant access ─────────────────────────────────────────────────────────────
async function grant(chatId, email) {
  try {
    // One-time invite link: expires in 24 hours, can only be used once
    const link = await _bot.telegram.createChatInviteLink(config.VAULT_CHANNEL_ID, {
      expire_date:  Math.floor(Date.now() / 1000) + 86400,
      member_limit: 1,
      name:         `Access — ${email}`,
    });

    await _bot.telegram.sendMessage(
      chatId,
      `✅ *Payment confirmed — welcome to the Vault!*\n\n` +
      `Your private access link:\n${link.invite_link}\n\n` +
      `⚠️ This link works *once* and expires in 24 hours.\n` +
      `Join now, then come back here anytime to check /status.\n\n` +
      `New prompts drop every *Monday*. Type /help to see all commands.`,
      { parse_mode: "Markdown" }
    );

    logger.info(`Access granted → ${email} (${chatId})`);
    return true;

  } catch (err) {
    logger.error(`grant() failed for ${email}:`, err.message);
    await notify.admin(`⚠️ Failed to grant access\nEmail: ${email}\nTG: ${chatId}\nError: ${err.message}`);
    return false;
  }
}

// ── Revoke access ─────────────────────────────────────────────────────────────
async function revoke(chatId, email) {
  try {
    // Ban then immediately unban — removes from channel but lets them rejoin later
    await _bot.telegram.banChatMember(config.VAULT_CHANNEL_ID, chatId);
    await _bot.telegram.unbanChatMember(config.VAULT_CHANNEL_ID, chatId, { only_if_banned: true });

    await _bot.telegram.sendMessage(
      chatId,
      `😔 *Your subscription has ended*\n\n` +
      `Your access to the Prompt Vault has been removed.\n\n` +
      `To rejoin, subscribe again at any time:\n` +
      `👉 https://paystack.com/pay/cashbridge-vault?telegram_id=${chatId}\n\n` +
      `Your payment history is still saved — type /history to view it.`,
      { parse_mode: "Markdown", disable_web_page_preview: true }
    );

    logger.info(`Access revoked → ${email} (${chatId})`);
    return true;

  } catch (err) {
    logger.error(`revoke() failed for ${email}:`, err.message);
    await notify.admin(`⚠️ Failed to revoke access\nEmail: ${email}\nTG: ${chatId}\nError: ${err.message}`);
    return false;
  }
}

module.exports = { setBot, grant, revoke };
