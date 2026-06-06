/**
 * execute.mjs — Executes a task by launching the claude CLI.
 *
 * Builds the prompt from the task, generates an MCP config,
 * launches claude in --print mode (non-interactive), and captures output.
 */

import { spawn } from 'node:child_process';
import { writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { log } from './logger.mjs';

/**
 * Execute a task using the claude CLI.
 * @param {object} task - Task from the daemon
 * @param {object} config - Runner configuration
 * @returns {{status: string, output: string, exitCode: number}}
 */
export async function executeTask(task, config) {
  // Build MCP config for this session
  const mcpConfig = buildMcpConfig(config);
  const mcpConfigPath = await writeTempMcpConfig(mcpConfig);

  try {
    // Build the prompt from the task
    const prompt = buildPrompt(task);

    // Build claude CLI arguments
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

    // Execute claude CLI
    const result = await runClaude(config.claudeBinary, args, config.workDir);

    return result;
  } finally {
    // Clean up temp MCP config
    await unlink(mcpConfigPath).catch(() => {});
  }
}

/**
 * Build the task prompt that will be sent to claude.
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
    'When complete, use the `report_complete` MCP tool to report your results.',
    `Pass taskId: "${task.id}" and a brief summary of what you accomplished.`
  );

  return parts.join('\n');
}

/**
 * Build system context appended to claude's system prompt.
 */
function buildSystemContext(task, config) {
  return [
    `You are agent "${config.agentId}" working on task "${task.id}".`,
    'You have access to team tools via MCP: save_memory, search_memory, upload_attachment, report_complete, send_message, get_next_task.',
    'When you finish the task, call report_complete with the taskId and a summary.',
  ].join(' ');
}

/**
 * Build MCP server configuration JSON.
 */
function buildMcpConfig(config) {
  return {
    mcpServers: {
      mpt: {
        command: 'node',
        args: [config.mcpServerPath],
      },
    },
  };
}

/**
 * Write MCP config to a temp file and return the path.
 */
async function writeTempMcpConfig(mcpConfig) {
  const dir = await mkdtemp(join(tmpdir(), 'mpt-runner-'));
  const path = join(dir, 'mcp.json');
  await writeFile(path, JSON.stringify(mcpConfig, null, 2));
  return path;
}

/**
 * Spawn the claude CLI and capture output.
 * @returns {{status: string, output: string, exitCode: number}}
 */
function runClaude(binary, args, cwd) {
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

    // Close stdin immediately (non-interactive)
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
        resolve({
          status: 'error',
          output: output || errors,
          exitCode: code,
        });
      }
    });

    proc.on('error', (err) => {
      log('error', `Failed to spawn claude: ${err.message}`);
      resolve({
        status: 'error',
        output: `Spawn error: ${err.message}`,
        exitCode: -1,
      });
    });
  });
}
