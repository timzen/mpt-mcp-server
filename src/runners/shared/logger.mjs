/**
 * logger.mjs — Shared structured JSON logger for all runners.
 *
 * Writes JSON log lines to stderr. Respects MPT_LOG_LEVEL env var.
 * Used by the shared loop and all harness adapters.
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LOG_LEVEL = LEVELS[process.env.MPT_LOG_LEVEL || 'info'] ?? 1;

/**
 * Log a structured JSON message to stderr.
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} message
 * @param {object|null} [data]
 */
export function log(level, message, data = null) {
  if ((LEVELS[level] ?? 1) < LOG_LEVEL) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(data ? { data } : {}),
  };

  process.stderr.write(JSON.stringify(entry) + '\n');
}
