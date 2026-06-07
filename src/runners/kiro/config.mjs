/**
 * config.mjs — Configuration loader for the Kiro task runner.
 *
 * Wraps the shared config with Kiro-specific defaults.
 * Retained for backwards compatibility with tests and external imports.
 */

import { loadSharedConfig } from '../shared/config.mjs';

/**
 * Load Kiro runner configuration from environment variables.
 */
export function loadConfig() {
  const shared = loadSharedConfig();

  return {
    ...shared,
    agentId: process.env.MPT_AGENT_ID || 'kiro-agent-1',
    kiroBinary: process.env.MPT_KIRO_BIN || 'kiro-cli',
  };
}
