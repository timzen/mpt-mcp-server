/**
 * execute.mjs — Legacy execute module (DEPRECATED).
 *
 * Retained for backwards compatibility with existing tests.
 * New code should use the Claude adapter (adapter.mjs) which is
 * invoked by the shared runner loop.
 */

import { spawn } from 'node:child_process';
import { writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { log } from '../shared/logger.mjs';

/**
 * Execute a task phase using the claude CLI.
 * @param {object} task - Task object (with _prompt field for pre-built prompt)
 * @param {object} config - Runner configuration
 * @returns {{status: string, output: string, exitCode: number}}
 */
export async function executeTask(task, config) {
  const mcpConfigPath = await writeTempMcpConfig(config);

  try {
    // Use pre-built prompt from workflow logic, or fall back to building one
    const prompt = task._prompt || buildFallbackPrompt(task);

    const args = [
      '--print',
      '--output-format', 'text',
      '--mcp-config', mcpConfigPath,
      '--dangerously-skip-permissions',
      '--append-system-prompt', buildSystemContext(task, config),
      prompt,
    ];

    log('info', `Launching claude for task ${task.id}`, {
      promptLength: prompt.length,
    });

    const result = await runClaude(config.claudeBinary, args, config.workDir, config);
    return result;
  } finally {
    await unlink(mcpConfigPath).catch(() => {});
  }
}

/**
 * Build system context appended to claude's system prompt.
 */
function buildSystemContext(task, config) {
  return [
    `You are agent "${config.agentId}" working on task "${task.id}".`,
    'You have MCP tools: save_memory, search_memory, upload_attachment, post_comment, get_next_work, claim_task, release_task.',
    'Focus on completing the work described in the prompt. Provide a clear summary when done.',
  ].join(' ');
}

/**
 * Fallback prompt builder (for backwards compat if _prompt is not set).
 */
function buildFallbackPrompt(task) {
  const parts = [`## Task: ${task.title}`];
  if (task.id) parts.push(`**Task ID: ${task.id}**`);
  if (task.description) parts.push('', task.description);
  if (task.context) parts.push('', '### Context', task.context);
  parts.push('', '---', 'When complete, provide a summary of what you accomplished.');
  return parts.join('\n');
}

/**
 * Write MCP config to a temp file.
 * Includes env vars so the MCP server connects to the same daemon.
 */
async function writeTempMcpConfig(config) {
  const mcpConfig = {
    mcpServers: {
      mpt: {
        command: 'node',
        args: [config.mcpServerPath],
        env: {
          MPT_DAEMON_URL: config.daemonUrl,
          MPT_AGENT_ID: config.agentId,
        },
      },
    },
  };

  const dir = await mkdtemp(join(tmpdir(), 'mpt-runner-'));
  const path = join(dir, 'mcp.json');
  await writeFile(path, JSON.stringify(mcpConfig, null, 2));
  return path;
}

/**
 * Spawn the claude CLI and capture output.
 */
function runClaude(binary, args, cwd, config) {
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
        log('debug', 'Claude stderr', { stderr: errors.slice(0, 500) });
      }

      if (code === 0) {
        resolve({ status: 'success', output, exitCode: code });
      } else {
        log('warn', `Claude exited with code ${code}`);
        resolve({ status: 'error', output: output || errors, exitCode: code });
      }
    });

    proc.on('error', (err) => {
      log('error', `Failed to spawn claude: ${err.message}`);
      resolve({ status: 'error', output: `Spawn error: ${err.message}`, exitCode: -1 });
    });
  });
}
