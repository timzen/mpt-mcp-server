#!/usr/bin/env node
/**
 * runner.mjs — Claude Code task runner wrapper.
 *
 * Implements a persistent poll-execute-report loop:
 * 1. Polls the daemon for the next task
 * 2. Writes a task prompt
 * 3. Launches `claude` CLI in print mode with MCP server configured
 * 4. Captures output
 * 5. Reports result back to daemon
 *
 * This bridges the gap that Claude Code lacks: a persistent task loop.
 *
 * Usage:
 *   node src/runner/runner.mjs [options]
 *
 * Environment variables:
 *   MPT_DAEMON_URL    - Daemon HTTP endpoint (default: http://localhost:3100)
 *   MPT_AGENT_ID      - This agent's identifier (default: "claude-agent-1")
 *   MPT_POLL_INTERVAL - Seconds between polls when idle (default: 5)
 *   MPT_WORK_DIR      - Working directory for claude sessions (default: cwd)
 *   MPT_MCP_SERVER    - Path to mpt-mcp-server entry (default: auto-detected)
 */

import { pollForTask } from './poll.mjs';
import { executeTask } from './execute.mjs';
import { reportResult } from './report.mjs';
import { loadConfig } from './config.mjs';
import { log } from './logger.mjs';

async function main() {
  const config = loadConfig();

  log('info', `Runner started — agent="${config.agentId}" daemon="${config.daemonUrl}"`);
  log('info', `Poll interval: ${config.pollInterval}s | Work dir: ${config.workDir}`);

  let running = true;

  // Graceful shutdown
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
      // 1. Poll for next task
      const task = await pollForTask(config);

      if (!task) {
        // No task available, wait and retry
        await sleep(config.pollInterval * 1000);
        continue;
      }

      log('info', `Got task: ${task.id} — "${task.title}"`);

      // 2. Execute the task via claude CLI
      const result = await executeTask(task, config);

      // 3. Report the result back to daemon
      await reportResult(task, result, config);

      log('info', `Task ${task.id} completed — status: ${result.status}`);
    } catch (err) {
      log('error', `Loop error: ${err.message}`);
      // Back off on errors
      await sleep(config.pollInterval * 2000);
    }
  }

  log('info', 'Runner stopped.');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  log('error', `Fatal: ${err.message}`);
  process.exit(1);
});
