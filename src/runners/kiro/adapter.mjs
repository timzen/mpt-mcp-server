/**
 * adapter.mjs — Kiro CLI harness adapter for the shared runner loop.
 *
 * Launches `kiro-cli chat` in a visible tmux window so users can watch
 * the agent work. The runner orchestrates (poll/claim/release) while
 * kiro-cli runs interactively in its own pane.
 *
 * Set MPT_KIRO_HEADLESS=1 to use hidden subprocess mode instead.
 */

import { spawn, execSync, execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { log } from '../shared/logger.mjs';
import { loadSharedConfig } from '../shared/config.mjs';
import { spawnWindow, dismissWindow, shellSafe, ensureSession } from '../../tmux.mjs';

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
        tmuxSession: process.env.MPT_TMUX_SESSION || 'mpt-demo',
        headless: process.env.MPT_KIRO_HEADLESS === '1',
      };
    },

    /**
     * Execute a prompt via kiro-cli.
     *
     * Default: launches kiro-cli in a visible tmux window.
     * Set MPT_KIRO_HEADLESS=1 for hidden subprocess mode.
     *
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

      if (config.headless) {
        return runHeadless(prompt, config);
      }

      return runInTmux(prompt, config);
    },
  };
}

/**
 * Run kiro-cli in a visible tmux window and wait for it to finish.
 */
async function runInTmux(prompt, config) {
  const { tmuxSession, agentId, kiroBinary, workDir, daemonUrl } = config;
  const windowName = shellSafe(agentId);

  // Write prompt to a temp file (too long for send-keys)
  const promptDir = join(workDir, '.mpt-tmp');
  mkdirSync(promptDir, { recursive: true });
  const promptFile = join(promptDir, 'current-prompt.txt');
  writeFileSync(promptFile, prompt);

  // Build the kiro-cli command
  const cmd = [
    `MPT_DAEMON_URL=${shellSafe(daemonUrl)}`,
    `MPT_AGENT_ID=${shellSafe(agentId)}`,
    kiroBinary,
    'chat',
    '--no-interactive',
    '--trust-all-tools',
    `"$(cat ${shellSafe(promptFile)})"`,
  ].join(' ');

  log('info', `Launching kiro-cli in tmux window '${windowName}'`, { promptLength: prompt.length });

  // Spawn kiro in a tmux window
  spawnWindow({
    session: tmuxSession,
    name: windowName,
    command: cmd,
    cwd: workDir,
  });

  // Poll until the window closes (kiro-cli exits when done in --no-interactive mode)
  const safeSession = shellSafe(tmuxSession);
  const safeWindow = shellSafe(windowName);
  const startTime = Date.now();
  const MAX_WAIT_MS = 30 * 60 * 1000; // 30 min max per task

  while (Date.now() - startTime < MAX_WAIT_MS) {
    await sleep(3000);

    // Check if window still exists
    try {
      execSync(`tmux list-windows -t "${safeSession}" -F "#{window_name}" | grep -q "^${safeWindow}$"`, { stdio: 'pipe' });
    } catch {
      // Window is gone — kiro finished
      log('info', `Kiro window '${windowName}' closed — task complete`);
      break;
    }
  }

  if (Date.now() - startTime >= MAX_WAIT_MS) {
    log('warn', `Kiro window '${windowName}' timed out after 30m — killing`);
    try { dismissWindow(tmuxSession, windowName); } catch { /* ok */ }
  }

  // Try to read any output kiro left behind (kiro-cli may write to a log)
  // For now, return a generic completion message since output was visible in tmux
  return { output: 'Task completed (output visible in tmux window)', exitCode: 0 };
}

/**
 * Run kiro-cli as a hidden subprocess (original behavior).
 */
function runHeadless(prompt, config) {
  const args = [
    'chat',
    '--no-interactive',
    '--trust-all-tools',
    prompt,
  ];

  log('info', `Launching kiro-cli (headless) for task`, { promptLength: prompt.length });

  return new Promise((resolve) => {
    const proc = spawn(config.kiroBinary, args, {
      cwd: config.workDir,
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
