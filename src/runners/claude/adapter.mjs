/**
 * adapter.mjs — Claude Code harness adapter for the shared runner loop.
 *
 * Wraps the `claude` CLI in --print mode with MCP config support.
 * This is the only Claude-specific code — everything else is in shared/.
 */

import { spawn } from 'node:child_process';
import { log } from '../shared/logger.mjs';
import { loadSharedConfig } from '../shared/config.mjs';

/**
 * Create a Claude Code adapter for the shared runner loop.
 * @returns {object} Adapter with execute(), name, supportsMcp, loadConfig()
 */
export function createAdapter() {
  return {
    name: 'Claude',
    supportsMcp: true,

    /**
     * Load Claude-specific config merged with shared config.
     */
    loadConfig() {
      const shared = loadSharedConfig();
      return {
        ...shared,
        agentId: process.env.MPT_AGENT_ID || 'claude-agent-1',
        claudeBinary: process.env.MPT_CLAUDE_BIN || 'claude',
      };
    },

    /**
     * Execute a prompt via claude CLI.
     * @param {string} prompt - The full prompt to send
     * @param {object} config - Config with mcpConfigPath, workDir, agentId, etc.
     * @returns {Promise<{output: string, exitCode: number}>}
     */
    async execute(prompt, config) {
      const args = [
        '--print',
        '--output-format', 'text',
        '--dangerously-skip-permissions',
      ];

      if (config.mcpConfigPath) {
        args.push('--mcp-config', config.mcpConfigPath);
      }

      args.push(
        '--append-system-prompt',
        `You are agent "${config.agentId}". You have MCP tools for team coordination. Focus on the task and provide a clear summary when done.`,
        prompt
      );

      log('info', `Launching claude for task`, { promptLength: prompt.length });

      return runProcess(config.claudeBinary, args, config.workDir, config);
    },
  };
}

/**
 * Spawn a CLI process and capture output.
 */
function runProcess(binary, args, cwd, config) {
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

      if (code !== 0) {
        log('warn', `Claude exited with code ${code}`);
      }

      resolve({ output: output || errors, exitCode: code ?? 1 });
    });

    proc.on('error', (err) => {
      log('error', `Failed to spawn claude: ${err.message}`);
      resolve({ output: `Spawn error: ${err.message}`, exitCode: -1 });
    });
  });
}
