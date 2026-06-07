/**
 * config.mjs — Shared configuration loader for all runners.
 *
 * Loads common environment variables used by every harness runner.
 * Each harness adapter adds its own specific config (binary path, etc.).
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load shared runner configuration from environment variables.
 * @returns {object} Common runner config
 */
export function loadSharedConfig() {
  const mcpServerDefault = resolve(__dirname, '..', '..', 'index.mjs');

  return {
    daemonUrl: process.env.MPT_DAEMON_URL || 'http://localhost:7437',
    agentId: process.env.MPT_AGENT_ID || `agent-${process.pid}`,
    pollInterval: parseInt(process.env.MPT_POLL_INTERVAL || '5', 10),
    workDir: process.env.MPT_WORK_DIR || process.cwd(),
    mcpServerPath: process.env.MPT_MCP_SERVER || mcpServerDefault,
    maxRetries: parseInt(process.env.MPT_MAX_RETRIES || '3', 10),
    role: process.env.MPT_ROLE || 'teammate',
  };
}
