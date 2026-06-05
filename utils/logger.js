/**
 * utils/logger.js
 *
 * Simple structured logger. Timestamps every line.
 * In production, swap console calls for winston or pino if needed.
 */

function timestamp() {
  return new Date().toISOString();
}

const logger = {
  info:  (...args) => console.log( `[${timestamp()}] INFO `, ...args),
  warn:  (...args) => console.warn(`[${timestamp()}] WARN `, ...args),
  error: (...args) => console.error(`[${timestamp()}] ERROR`, ...args),
  debug: (...args) => {
    if (process.env.DEBUG) console.log(`[${timestamp()}] DEBUG`, ...args);
  },
};

module.exports = logger;
