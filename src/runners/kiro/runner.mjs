#!/usr/bin/env node
/**
 * runner.mjs — Kiro CLI task runner wrapper.
 *
 * Implements a persistent poll-execute-report loop for Kiro:
 * 1. Polls the daemon for the next task
 * 2. Builds a task prompt
 * 3. Launches `kiro-cli chat --no-interactive --trust-all-tools` with MCP configured
 * 4. Captures output
 * 5. Reports result back to daemon
 *
 * Kiro supports MCP natively, so we register the mpt-mcp-server before
 * launching, similar to the Claude Code runner.
 *
 * Usage:
 *   node src/runners/kiro/runner.mjs
 *
 * Environment variables:
 *   MPT_DAEMON_URL    - Daemon HTTP endpoint (default: http://localhost:3100)
 *   MPT_AGENT_ID      - This agent's identifier (default: "kiro-agent-1")
 *   MPT_POLL_INTERVAL - Seconds between polls when idle (default: 5)
 *   MPT_WORK_DIR      - Working directory for kiro sessions (default: cwd)
 *   MPT_MCP_SERVER    - Path to mpt-mcp-server entry (default: auto-detected)
 *   MPT_KIRO_BIN      - Path to kiro-cli binary (default: kiro-cli)
 */

import { pollForTask } from './poll.mjs';
import { executeTask } from './execute.mjs';
import { reportResult } from './report.mjs';
import { loadConfig } from './config.mjs';
import { log } from './logger.mjs';

async function main() {
  const config = loadConfig();

  log('info', `Kiro runner started — agent="${config.agentId}" daemon="${config.daemonUrl}"`);
  log('info', `Poll interval: ${config.pollInterval}s | Work dir: ${config.workDir}`);

  let running = true;

  process.on('SIGINT', () => {
    log('info', 'Received SIGINT, shutting down...');
    running = false;
  });
  process.on('SIGTERM', () => {
    log('info', 'Received SIGTERM, shutting down...');
    running = false;
  });

  while (running) {
    try {
      const task = await pollForTask(config);

      if (!task) {
        await sleep(config.pollInterval * 1000);
        continue;
      }

      log('info', `Got task: ${task.id} — "${task.title}"`);

      const result = await executeTask(task, config);

      await reportResult(task, result, config);

      log('info', `Task ${task.id} completed — status: ${result.status}`);
    } catch (err) {
      log('error', `Loop error: ${err.message}`);
      await sleep(config.pollInterval * 2000);
    }
  }

  log('info', 'Kiro runner stopped.');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  log('error', `Fatal: ${err.message}`);
  process.exit(1);
});
