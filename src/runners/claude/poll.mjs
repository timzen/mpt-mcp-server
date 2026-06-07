/**
 * poll.mjs — Legacy poll module (DEPRECATED).
 *
 * Retained for backwards compatibility with existing tests.
 * New code should use the shared runner loop which polls via
 * daemon-client.mjs directly.
 */

import { log } from '../shared/logger.mjs';

/**
 * Poll the daemon for the next task assigned to this agent.
 * @param {object} config - Runner configuration
 * @returns {object|null} Task object or null if none available
 */
export async function pollForTask(config) {
  const url = `${config.daemonUrl}/api/tasks/next?assignee=${encodeURIComponent(config.agentId)}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 204 || response.status === 404) {
      // No task available
      return null;
    }

    if (!response.ok) {
      log('warn', `Daemon returned ${response.status}: ${response.statusText}`);
      return null;
    }

    const task = await response.json();

    // Validate minimal task shape
    if (!task || !task.id || !task.title) {
      log('warn', 'Daemon returned invalid task shape', task);
      return null;
    }

    return task;
  } catch (err) {
    if (err.name === 'TimeoutError') {
      log('warn', 'Daemon poll timed out');
    } else if (err.cause?.code === 'ECONNREFUSED') {
      log('debug', 'Daemon not reachable (ECONNREFUSED)');
    } else {
      log('warn', `Poll error: ${err.message}`);
    }
    return null;
  }
}
