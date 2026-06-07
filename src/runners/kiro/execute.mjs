/**
 * execute.mjs — Legacy Kiro execute module (DEPRECATED).
 *
 * Retained for backwards compatibility with existing tests.
 * New code should use the Kiro adapter (adapter.mjs) which is
 * invoked by the shared runner loop.
 */

import { spawn, execFileSync } from 'node:child_process';
import { log } from '../shared/logger.mjs';

const MCP_SERVER_NAME = 'mpt';

/**
 * Execute a task phase using kiro-cli.
 * @param {object} task - Task object (with _prompt field for pre-built prompt)
 * @param {object} config - Runner configuration
 * @returns {{status: string, output: string, exitCode: number}}
 */
export async function executeTask(task, config) {
  // Ensure MCP server is registered with kiro
  try {
    ensureMcpServer(config);
  } catch (err) {
    log('warn', `Failed to register MCP server: ${err.message}`);
  }

  // Use pre-built prompt from workflow logic, or fall back
  const prompt = task._prompt || `## Task: ${task.title}\n\n${task.description || ''}\n\nProvide a summary when done.`;

  const args = [
    'chat',
    '--no-interactive',
    '--trust-all-tools',
    prompt,
  ];

  log('info', `Launching kiro-cli for task ${task.id}`, {
    promptLength: prompt.length,
  });

  const result = await runKiro(config.kiroBinary, args, config.workDir, config);
  return result;
}

/**
 * Register the mpt-mcp-server with kiro-cli (idempotent).
 * Passes daemon URL and agent ID via MCP server env.
 */
function ensureMcpServer(config) {
  try {
    execFileSync(config.kiroBinary, [
      'mcp', 'add', MCP_SERVER_NAME,
      '--command', 'node',
      '--args', config.mcpServerPath,
    ], {
      timeout: 10000,
      stdio: 'pipe',
      env: {
        ...process.env,
        MPT_DAEMON_URL: config.daemonUrl,
        MPT_AGENT_ID: config.agentId,
      },
    });
    log('debug', 'MCP server registered with kiro-cli');
  } catch (err) {
    log('debug', `MCP add failed (may already exist): ${err.message}`);
  }
}

/**
 * Spawn kiro-cli and capture output.
 */
function runKiro(binary, args, cwd, config) {
  return new Promise((resolve) => {
    const proc = spawn(binary, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        MPT_DAEMON_URL: config.daemonUrl,
        MPT_AGENT_ID: config.agentId,
      },
    });

    const stdout = [];
    const stderr = [];

    proc.stdout.on('data', (chunk) => stdout.push(chunk));
    proc.stderr.on('data', (chunk) => stderr.push(chunk));

    proc.stdin.end();

    proc.on('close', (code) => {
      const output = Buffer.concat(stdout).toString('utf-8');
      const errors = Buffer.concat(stderr).toString('utf-8');

      if (errors) {
        log('debug', 'Kiro stderr', { stderr: errors.slice(0, 500) });
      }

      if (code === 0) {
        resolve({ status: 'success', output, exitCode: code });
      } else {
        log('warn', `Kiro exited with code ${code}`);
        resolve({ status: 'error', output: output || errors, exitCode: code });
      }
    });

    proc.on('error', (err) => {
      log('error', `Failed to spawn kiro-cli: ${err.message}`);
      resolve({ status: 'error', output: `Spawn error: ${err.message}`, exitCode: -1 });
    });
  });
}
