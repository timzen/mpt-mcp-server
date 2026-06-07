/**
 * config.mjs — Configuration loader for the Claude Code task runner.
 *
 * Wraps the shared config with Claude-specific defaults.
 * Retained for backwards compatibility with tests and external imports.
 */

import { loadSharedConfig } from '../shared/config.mjs';

/**
 * Load runner configuration from environment variables.
 */
export function loadConfig() {
  const shared = loadSharedConfig();

  return {
    ...shared,
    agentId: process.env.MPT_AGENT_ID || 'claude-agent-1',
    claudeBinary: process.env.MPT_CLAUDE_BIN || 'claude',
  };
}
