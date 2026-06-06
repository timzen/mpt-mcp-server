/**
 * logger.mjs — Simple structured logger for the task runner.
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LOG_LEVEL = LEVELS[process.env.MPT_LOG_LEVEL || 'info'] ?? 1;

/**
 * Log a message with level and timestamp.
 */
export function log(level, message, data = null) {
  if ((LEVELS[level] ?? 1) < LOG_LEVEL) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(data ? { data } : {}),
  };

  const stream = level === 'error' ? process.stderr : process.stderr;
  stream.write(JSON.stringify(entry) + '\n');
}
