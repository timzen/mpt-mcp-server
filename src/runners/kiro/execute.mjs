/**
 * execute.mjs — Executes a task by launching the kiro-cli.
 *
 * Builds the prompt from the task, registers MCP server with kiro,
 * launches kiro-cli in non-interactive mode, and captures output.
 *
 * Kiro CLI MCP integration:
 *   - `kiro-cli mcp add` registers a server persistently
 *   - `kiro-cli chat --no-interactive --trust-all-tools` runs non-interactively
 *   - We add the MCP server before execution and clean up after
 */

import { spawn, execFileSync } from 'node:child_process';
import { log } from './logger.mjs';

const MCP_SERVER_NAME = 'mpt';

/**
 * Execute a task using the kiro-cli.
 * @param {object} task - Task from the daemon
 * @param {object} config - Runner configuration
 * @returns {{status: string, output: string, exitCode: number}}
 */
export async function executeTask(task, config) {
  // Register the MCP server with kiro (idempotent — add replaces if exists)
  try {
    ensureMcpServer(config);
  } catch (err) {
    log('warn', `Failed to register MCP server: ${err.message}`);
    // Continue anyway — kiro might already have it configured
  }

  try {
    const prompt = buildPrompt(task);

    const args = [
      'chat',
      '--no-interactive',
      '--trust-all-tools',
      prompt,
    ];

    log('info', `Launching kiro-cli for task ${task.id}`, {
      promptLength: prompt.length,
    });

    const result = await runKiro(config.kiroBinary, args, config.workDir);
    return result;
  } finally {
    // Optionally remove MCP server after task (leave it for now — idempotent add is fine)
  }
}

/**
 * Register the mpt-mcp-server with kiro-cli.
 * Uses `kiro-cli mcp add` which is idempotent (replaces if exists).
 */
function ensureMcpServer(config) {
  const serverConfig = JSON.stringify({
    command: 'node',
    args: [config.mcpServerPath],
  });

  try {
    execFileSync(config.kiroBinary, [
      'mcp', 'add', MCP_SERVER_NAME, '--command', 'node', '--args', config.mcpServerPath,
    ], {
      timeout: 10000,
      stdio: 'pipe',
    });
    log('debug', 'MCP server registered with kiro-cli');
  } catch (err) {
    // If `mcp add` doesn't support those flags, try JSON approach
    log('debug', `MCP add via flags failed, trying alternate: ${err.message}`);
  }
}

/**
 * Build the task prompt for kiro.
 */
function buildPrompt(task) {
  const parts = [`## Task: ${task.title}`];

  if (task.id) {
    parts.push(`**Task ID: ${task.id}**`);
  }

  if (task.description) {
    parts.push('', task.description);
  }

  if (task.context) {
    parts.push('', '### Context', task.context);
  }

  if (task.acceptanceCriteria) {
    parts.push('', '### Acceptance Criteria');
    if (Array.isArray(task.acceptanceCriteria)) {
      task.acceptanceCriteria.forEach((c) => parts.push(`- ${c}`));
    } else {
      parts.push(task.acceptanceCriteria);
    }
  }

  parts.push(
    '',
    '---',
    'You have access to team tools via MCP (mpt server): save_memory, search_memory, upload_attachment, report_complete, send_message, get_next_task.',
    `When you finish the task, call report_complete with taskId: "${task.id}" and a brief summary.`
  );

  return parts.join('\n');
}

/**
 * Spawn kiro-cli and capture output.
 * @returns {{status: string, output: string, exitCode: number}}
 */
function runKiro(binary, args, cwd) {
  return new Promise((resolve) => {
    const proc = spawn(binary, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
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
        resolve({
          status: 'error',
          output: output || errors,
          exitCode: code,
        });
      }
    });

    proc.on('error', (err) => {
      log('error', `Failed to spawn kiro-cli: ${err.message}`);
      resolve({
        status: 'error',
        output: `Spawn error: ${err.message}`,
        exitCode: -1,
      });
    });
  });
}
