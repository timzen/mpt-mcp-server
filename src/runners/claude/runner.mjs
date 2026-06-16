#!/usr/bin/env node
/**
 * runner.mjs — Claude Code task runner entry point.
 *
 * Thin wrapper that creates the Claude adapter and starts the shared
 * runner loop. All lifecycle logic (poll, claim, transition, heartbeat,
 * dismissal) lives in the shared loop.
 *
 * Environment variables:
 *   MPT_DAEMON_URL    - Daemon HTTP endpoint (default: http://localhost:7437)
 *   MPT_AGENT_ID      - This agent's identifier (default: "claude-agent-1")
 *   MPT_POLL_INTERVAL - Seconds between polls when idle (default: 5)
 *   MPT_WORK_DIR      - Working directory for claude sessions (default: cwd)
 *   MPT_MCP_SERVER    - Path to mpt-mcp-server entry (default: auto-detected)
 *   MPT_CLAUDE_BIN    - Path to claude CLI binary (default: claude)
 */

import { runLoop } from '../shared/loop.mjs';
import { createAdapter } from './adapter.mjs';

runLoop(createAdapter()).catch((err) => {
  process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), level: 'error', msg: `Fatal: ${err.message}` }) + '\n');
  process.exit(1);
});
