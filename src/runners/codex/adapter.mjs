/**
 * adapter.mjs — Codex CLI harness adapter for the shared runner loop.
 *
 * Wraps `codex --auto-edit --quiet`. Codex doesn't support MCP, so
 * no team tools are available during execution — only the prompt context.
 * This is documented as a harness limitation.
 */

import { spawn } from 'node:child_process';
import { log } from '../shared/logger.mjs';
import { loadSharedConfig } from '../shared/config.mjs';

/**
 * Create a Codex adapter for the shared runner loop.
 * @returns {object} Adapter with execute(), name, supportsMcp, loadConfig()
 */
export function createAdapter() {
  return {
    name: 'Codex',
    supportsMcp: false,

    /**
     * Load Codex-specific config merged with shared config.
     */
    loadConfig() {
      const shared = loadSharedConfig();
      return {
        ...shared,
        agentId: process.env.MPT_AGENT_ID || 'codex-agent-1',
        codexBinary: process.env.MPT_CODEX_BIN || 'codex',
      };
    },

    /**
     * Execute a prompt via codex CLI.
     * @param {string} prompt - The full prompt to send
     * @param {object} config - Config with workDir, agentId, etc. (no mcpConfigPath)
     * @returns {Promise<{output: string, exitCode: number}>}
     */
    async execute(prompt, config) {
      const args = [
        '--auto-edit',
        '--quiet',
        prompt,
      ];

      log('info', `Launching codex for task`, { promptLength: prompt.length });

      return runProcess(config.codexBinary, args, config.workDir, config);
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
        log('debug', 'Codex stderr', { stderr: errors.slice(0, 500) });
      }

      if (code !== 0) {
        log('warn', `Codex exited with code ${code}`);
      }

      resolve({ output: output || errors, exitCode: code ?? 1 });
    });

    proc.on('error', (err) => {
      log('error', `Failed to spawn codex: ${err.message}`);
      resolve({ output: `Spawn error: ${err.message}`, exitCode: -1 });
    });
  });
}
