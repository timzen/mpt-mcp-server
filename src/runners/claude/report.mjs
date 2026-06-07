/**
 * report.mjs — Legacy report module (DEPRECATED).
 *
 * Retained for backwards compatibility with existing tests.
 * New code should use the shared runner loop which transitions
 * tasks via daemon-client.mjs directly.
 */

import { log } from '../shared/logger.mjs';

/**
 * Report a task result to the daemon.
 * @param {object} task - The task that was executed
 * @param {object} result - Execution result {status, output, exitCode}
 * @param {object} config - Runner configuration
 */
export async function reportResult(task, result, config) {
  const url = `${config.daemonUrl}/api/tasks/${task.id}/complete`;

  const body = {
    agentId: config.agentId,
    taskId: task.id,
    status: result.status,
    summary: extractSummary(result.output),
    output: result.output,
    exitCode: result.exitCode,
    completedAt: new Date().toISOString(),
  };

  let retries = 0;
  while (retries < config.maxRetries) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        log('info', `Reported completion for task ${task.id}`);
        return;
      }

      log('warn', `Daemon returned ${response.status} on report`);
    } catch (err) {
      log('warn', `Report attempt ${retries + 1} failed: ${err.message}`);
    }

    retries++;
    if (retries < config.maxRetries) {
      await new Promise((r) => setTimeout(r, 2000 * retries));
    }
  }

  log('error', `Failed to report result for task ${task.id} after ${config.maxRetries} retries`);
}

/**
 * Extract a brief summary from claude's output.
 * Takes the last meaningful paragraph or truncates.
 */
function extractSummary(output) {
  if (!output) return 'No output captured';

  // Try to find a summary section
  const summaryMatch = output.match(/##?\s*Summary\s*\n([\s\S]*?)(?:\n##|\n---|\Z)/i);
  if (summaryMatch) {
    return summaryMatch[1].trim().slice(0, 1000);
  }

  // Otherwise take the last non-empty lines (up to 1000 chars)
  const lines = output.trim().split('\n').filter((l) => l.trim());
  const tail = lines.slice(-10).join('\n');
  return tail.slice(0, 1000);
}
