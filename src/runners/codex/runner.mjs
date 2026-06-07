#!/usr/bin/env node
/**
 * runner.mjs — Codex CLI task runner entry point.
 *
 * Thin wrapper that creates the Codex adapter and starts the shared
 * runner loop. All lifecycle logic lives in the shared loop.
 *
 * Codex doesn't support MCP, so no team tools are available during
 * execution. Context is provided entirely via the prompt. This is
 * a known harness limitation.
 *
 * Environment variables:
 *   MPT_DAEMON_URL    - Daemon HTTP endpoint (default: http://localhost:7437)
 *   MPT_AGENT_ID      - This agent's identifier (default: "codex-agent-1")
 *   MPT_POLL_INTERVAL - Seconds between polls when idle (default: 5)
 *   MPT_WORK_DIR      - Working directory for codex sessions (default: cwd)
 *   MPT_CODEX_BIN     - Path to codex CLI binary (default: codex)
 */

import { runLoop } from '../shared/loop.mjs';
import { createAdapter } from './adapter.mjs';

runLoop(createAdapter()).catch((err) => {
  process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), level: 'error', msg: `Fatal: ${err.message}` }) + '\n');
  process.exit(1);
});
