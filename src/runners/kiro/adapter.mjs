/**
 * adapter.mjs — Kiro CLI harness adapter for the shared runner loop.
 *
 * Wraps `kiro-cli chat --no-interactive --trust-all-tools` with MCP support.
 * This is the only Kiro-specific code — everything else is in shared/.
 */

import { spawn, execFileSync } from 'node:child_process';
import { log } from '../shared/logger.mjs';
import { loadSharedConfig } from '../shared/config.mjs';

const MCP_SERVER_NAME = 'mpt';

/**
 * Create a Kiro adapter for the shared runner loop.
 * @returns {object} Adapter with execute(), name, supportsMcp, loadConfig()
 */
export function createAdapter() {
  return {
    name: 'Kiro',
    supportsMcp: true,

    /**
     * Load Kiro-specific config merged with shared config.
     */
    loadConfig() {
      const shared = loadSharedConfig();
      return {
        ...shared,
        agentId: process.env.MPT_AGENT_ID || 'kiro-agent-1',
        kiroBinary: process.env.MPT_KIRO_BIN || 'kiro-cli',
      };
    },

    /**
     * Execute a prompt via kiro-cli.
     * @param {string} prompt - The full prompt to send
     * @param {object} config - Config with mcpConfigPath, workDir, agentId, etc.
     * @returns {Promise<{output: string, exitCode: number}>}
     */
    async execute(prompt, config) {
      // Ensure MCP server is registered with kiro
      try {
        ensureMcpServer(config);
      } catch (err) {
        log('warn', `Failed to register MCP server with kiro: ${err.message}`);
      }

      const args = [
        'chat',
        '--no-interactive',
        '--trust-all-tools',
        prompt,
      ];

      log('info', `Launching kiro-cli for task`, { promptLength: prompt.length });

      return runProcess(config.kiroBinary, args, config.workDir, config);
    },
  };
}

/**
 * Register the mpt-mcp-server with kiro-cli (idempotent).
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
        log('debug', 'Kiro stderr', { stderr: errors.slice(0, 500) });
      }

      if (code !== 0) {
        log('warn', `Kiro exited with code ${code}`);
      }

      resolve({ output: output || errors, exitCode: code ?? 1 });
    });

    proc.on('error', (err) => {
      log('error', `Failed to spawn kiro-cli: ${err.message}`);
      resolve({ output: `Spawn error: ${err.message}`, exitCode: -1 });
    });
  });
}
