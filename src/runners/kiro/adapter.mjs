/**
 * adapter.mjs — Kiro CLI harness adapter for the shared runner loop.
 *
 * Launches `kiro-cli chat` in a visible tmux window as a persistent agent.
 * Instead of one-shot invocations, kiro stays alive and the runner sends
 * follow-up prompts via tmux send-keys to drive it through tasks.
 *
 * The kiro agent uses MCP tools (get_next_work, claim_task, release_task)
 * to coordinate with the daemon — the runner just nudges it.
 *
 * Set MPT_KIRO_HEADLESS=1 for hidden one-shot subprocess mode.
 */

import { spawn, execSync, execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { log } from '../shared/logger.mjs';
import { loadSharedConfig } from '../shared/config.mjs';
import { spawnWindow, dismissWindow, shellSafe, ensureSession, listWindows } from '../../tmux.mjs';

const MCP_SERVER_NAME = 'mpt';

/**
 * Create a Kiro adapter for the shared runner loop.
 * @returns {object} Adapter with execute(), name, supportsMcp, loadConfig()
 */
export function createAdapter() {
  let windowSpawned = false;

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
     * Default: launches kiro-cli in a persistent tmux window.
     * First call spawns the window with an initial prompt.
     * Subsequent calls send follow-up prompts via tmux send-keys.
     *
     * Set MPT_KIRO_HEADLESS=1 for hidden one-shot subprocess mode.
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

      return runInTmux(prompt, config, windowSpawned, () => { windowSpawned = true; });
    },
  };
}

/**
 * Run kiro-cli in a persistent visible tmux window.
 *
 * First invocation: spawns kiro-cli interactively with the task prompt.
 * Subsequent invocations: sends follow-up prompt via tmux send-keys.
 *
 * Waits for kiro to finish the current task by polling the daemon for
 * task status changes rather than waiting for the window to close.
 */
async function runInTmux(prompt, config, alreadySpawned, markSpawned) {
  const { tmuxSession, agentId, kiroBinary, workDir, daemonUrl } = config;
  const windowName = shellSafe(agentId);

  if (!alreadySpawned) {
    // First task: spawn kiro-cli interactively with initial prompt
    log('info', `Spawning kiro-cli in tmux window '${windowName}'`);

    // Write prompt to temp file
    const promptDir = join(workDir, '.mpt-tmp');
    mkdirSync(promptDir, { recursive: true });
    const promptFile = join(promptDir, 'current-prompt.txt');
    writeFileSync(promptFile, prompt);

    // Build command: interactive kiro with initial message
    const cmd = [
      `MPT_DAEMON_URL=${shellSafe(daemonUrl)}`,
      `MPT_AGENT_ID=${shellSafe(agentId)}`,
      kiroBinary,
      'chat',
      '--trust-all-tools',
      `"$(cat ${shellSafe(promptFile)})"`,
    ].join(' ');

    spawnWindow({
      session: tmuxSession,
      name: windowName,
      command: cmd,
      cwd: workDir,
    });

    markSpawned();
  } else {
    // Subsequent tasks: send follow-up prompt to existing window
    log('info', `Sending follow-up task to kiro window '${windowName}'`);

    const safeSession = shellSafe(tmuxSession);

    // Check window still exists
    const windows = listWindows(tmuxSession);
    if (!windows.includes(windowName)) {
      log('warn', `Window '${windowName}' gone — respawning`);
      markSpawned(); // reset
      return runInTmux(prompt, config, false, markSpawned);
    }

    // Write prompt to file and send a command to pipe it in
    const promptDir = join(workDir, '.mpt-tmp');
    mkdirSync(promptDir, { recursive: true });
    const promptFile = join(promptDir, 'current-prompt.txt');
    writeFileSync(promptFile, prompt);

    // Send the prompt as a follow-up message in the kiro chat
    // Use a condensed instruction since kiro is already running
    const followUp = `Use get_next_work to check for available tasks. If there's a task, claim it with claim_task, do the work, then release it with release_task. Here's the context for the next task:\\n\\n$(cat ${shellSafe(promptFile)})`;

    execSync(
      `tmux send-keys -t "${safeSession}:${shellSafe(windowName)}" "${escapeForTmux(followUp)}" Enter`,
      { stdio: 'pipe' }
    );
  }

  // Wait for the task to complete (poll daemon for status change)
  const startTime = Date.now();
  const MAX_WAIT_MS = 30 * 60 * 1000; // 30 min max per task

  // Give kiro time to start working
  await sleep(10000);

  // Poll until the window closes OR we detect the task moved out of in_progress
  const safeSession = shellSafe(tmuxSession);
  while (Date.now() - startTime < MAX_WAIT_MS) {
    await sleep(5000);

    // Check if window still exists
    const windows = listWindows(tmuxSession);
    if (!windows.includes(windowName)) {
      log('info', `Window '${windowName}' closed — agent exited`);
      break;
    }

    // We can't easily detect task completion from here — the runner
    // already tracks this via the claim/release cycle. Just wait for
    // the runner to detect the release via daemon polling.
    // Break out after the initial work period and let the runner check.
    break;
  }

  // Return — the runner will check if the task was released
  return { output: 'Task sent to kiro agent (visible in tmux)', exitCode: 0 };
}

/**
 * Run kiro-cli as a hidden one-shot subprocess.
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

/**
 * Escape a string for use in tmux send-keys.
 */
function escapeForTmux(s) {
  return s.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
