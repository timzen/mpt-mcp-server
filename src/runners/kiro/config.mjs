/**
 * config.mjs — Configuration loader for the Kiro task runner.
 *
 * Reads from environment variables with sensible defaults.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load Kiro runner configuration from environment variables.
 */
export function loadConfig() {
  const mcpServerDefault = resolve(__dirname, '..', '..', 'index.mjs');

  return {
    daemonUrl: process.env.MPT_DAEMON_URL || 'http://localhost:3100',
    agentId: process.env.MPT_AGENT_ID || 'kiro-agent-1',
    pollInterval: parseInt(process.env.MPT_POLL_INTERVAL || '5', 10),
    workDir: process.env.MPT_WORK_DIR || process.cwd(),
    mcpServerPath: process.env.MPT_MCP_SERVER || mcpServerDefault,
    maxRetries: parseInt(process.env.MPT_MAX_RETRIES || '3', 10),
    kiroBinary: process.env.MPT_KIRO_BIN || 'kiro-cli',
  };
}
