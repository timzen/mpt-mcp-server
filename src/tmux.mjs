/**
 * tmux.mjs — tmux session and window management helpers.
 *
 * Provides the mechanics for spawning harnesses into tmux windows
 * so that users can hop in and observe/interact with running agents.
 *
 * All functions are synchronous (execSync) since tmux commands are
 * fast and we want immediate feedback.
 */

import { execSync } from 'node:child_process';

// ─── Shell Safety ────────────────────────────────────────────────────

/**
 * Sanitize a string for safe use in shell/tmux commands.
 * Only allows alphanumeric, dots, underscores, tildes, slashes, colons, at-signs, and hyphens.
 */
export function shellSafe(s) {
  return s.replace(/[^a-zA-Z0-9._~/:@-]/g, '');
}

// ─── Session Management ──────────────────────────────────────────────

/**
 * Ensure a tmux session exists. Creates it if missing.
 * @param {string} session - Session name
 * @returns {boolean} True if the session was just created
 */
export function ensureSession(session) {
  const safe = shellSafe(session);
  try {
    execSync(`tmux has-session -t "${safe}" 2>/dev/null`, { stdio: 'pipe' });
    return false;
  } catch {
    execSync(`tmux new-session -d -s "${safe}"`, { stdio: 'pipe' });
    return true;
  }
}

/**
 * Check if tmux is available on the system.
 * @returns {boolean}
 */
export function isTmuxAvailable() {
  try {
    execSync('which tmux', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ─── Window Management ───────────────────────────────────────────────

/**
 * Spawn a command in a new tmux window.
 * @param {object} options
 * @param {string} options.session - tmux session name
 * @param {string} options.name    - Window name (agent identifier)
 * @param {string} options.command - Full command string to execute
 * @param {string} options.cwd     - Working directory for the window
 */
export function spawnWindow({ session, name, command, cwd }) {
  const safeSession = shellSafe(session);
  const safeName = shellSafe(name);
  const safeCwd = shellSafe(cwd);

  const justCreated = ensureSession(session);

  if (justCreated) {
    // Rename the default window created with the session
    try {
      execSync(`tmux rename-window -t "${safeSession}" "${safeName}"`, { stdio: 'pipe' });
    } catch {
      execSync(`tmux new-window -n "${safeName}" -t "${safeSession}"`, { stdio: 'pipe' });
    }
  } else {
    execSync(`tmux new-window -n "${safeName}" -t "${safeSession}"`, { stdio: 'pipe' });
  }

  // Send the command to the window
  execSync(
    `tmux send-keys -t "${safeSession}:${safeName}" 'cd ${safeCwd} && ${command}' Enter`,
    { stdio: 'pipe' }
  );
}

/**
 * Dismiss an agent by sending Ctrl+C, waiting briefly, then closing the window.
 * @param {string} session - tmux session name
 * @param {string} name    - Window name
 */
export function dismissWindow(session, name) {
  const safeSession = shellSafe(session);
  const safeName = shellSafe(name);

  // Send Ctrl+C to interrupt
  execSync(`tmux send-keys -t "${safeSession}:${safeName}" C-c`, { stdio: 'pipe' });

  // Give it a moment, then kill the window
  setTimeout(() => {
    try {
      execSync(`tmux kill-window -t "${safeSession}:${safeName}"`, { stdio: 'pipe' });
    } catch {
      // Window may already be gone
    }
  }, 1500);
}

/**
 * List all window names in a tmux session.
 * @param {string} session - tmux session name
 * @returns {string[]} Array of window names
 */
export function listWindows(session) {
  const safeSession = shellSafe(session);
  try {
    const output = execSync(
      `tmux list-windows -t "${safeSession}" -F "#{window_name}"`,
      { stdio: 'pipe' }
    ).toString();
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Select (hop to) a tmux window.
 * @param {string} session - tmux session name
 * @param {string} name    - Window name
 */
export function hopToWindow(session, name) {
  const safeSession = shellSafe(session);
  const safeName = shellSafe(name);
  execSync(`tmux select-window -t "${safeSession}:${safeName}"`, { stdio: 'pipe' });
}
