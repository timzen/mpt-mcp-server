/**
 * loop.mjs — Shared runner loop for all harness adapters.
 *
 * Owns the full agent lifecycle:
 *   register → poll → claim → transition → execute → transition → release → repeat
 *
 * Also handles:
 *   - Heartbeat management (every 30s)
 *   - SIGINT/SIGTERM graceful shutdown
 *   - Heartbeat dismissal (dismissed: true → stop loop)
 *   - NEEDS_INPUT detection and blocked-state transition
 *   - Prompt building (buildWorkflowPrompt)
 *   - Summary extraction from harness output
 *   - MCP config generation (for adapters that declare supportsMcp: true)
 *
 * Accepts a harness adapter object:
 *   adapter.execute(prompt, config) → Promise<{ output: string, exitCode: number }>
 *   adapter.name — Harness display name (e.g., "claude", "kiro", "codex")
 *   adapter.supportsMcp — Whether the harness uses MCP tools during execution
 *   adapter.loadConfig() — Returns harness-specific config merged with shared config
 *
 * @module runners/shared/loop
 */

import { writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDaemonClient } from '../../daemon-client.mjs';
import { log } from './logger.mjs';

const HEARTBEAT_INTERVAL_MS = 30000;

/**
 * Run the main agent loop with the given harness adapter.
 * @param {object} adapter - Harness adapter (execute, name, supportsMcp, loadConfig)
 */
export async function runLoop(adapter) {
  const config = adapter.loadConfig();
  const client = createDaemonClient({
    daemonUrl: config.daemonUrl,
    agentId: config.agentId,
  });

  log('info', `${adapter.name} runner started — agent="${config.agentId}" daemon="${config.daemonUrl}"`);
  log('info', `Poll interval: ${config.pollInterval}s | Work dir: ${config.workDir}`);

  // Register with daemon
  try {
    await client.register({ name: config.agentId, cwd: config.workDir });
    log('info', 'Registered with daemon');
  } catch (err) {
    log('warn', `Failed to register with daemon: ${err.message} — will keep trying via heartbeat`);
  }

  let running = true;
  let currentTaskId = null;

  // Graceful shutdown
  process.on('SIGINT', () => {
    log('info', 'Received SIGINT, shutting down...');
    running = false;
  });
  process.on('SIGTERM', () => {
    log('info', 'Received SIGTERM, shutting down...');
    running = false;
  });

  // Heartbeat loop (also checks for dismissal)
  const heartbeatTimer = setInterval(async () => {
    const status = currentTaskId ? 'working' : 'idle';
    const response = await client.heartbeat(status, currentTaskId || undefined);
    if (response.dismissed === true) {
      log('warn', 'Agent dismissed via heartbeat — shutting down');
      running = false;
    }
  }, HEARTBEAT_INTERVAL_MS);

  while (running) {
    try {
      // ─── Poll for work ─────────────────────────────────────────
      const response = await client.getNextWork();

      if (!response.task) {
        await sleep(config.pollInterval * 1000);
        continue;
      }

      const task = response.task;
      log('info', `Got task: ${task.id} — "${task.title}"`);

      // ─── Claim ─────────────────────────────────────────────────
      const claim = await client.claimTask(task.id);
      if (!claim.success) {
        log('info', `Failed to claim task ${task.id} (someone else got it)`);
        await sleep(1000);
        continue;
      }

      currentTaskId = task.id;
      let availableTransitions = claim.availableTransitions || task.availableTransitions || [];
      client.heartbeat('working', task.id);

      // ─── Transition to first working state ─────────────────────
      const firstTransition = availableTransitions[0];
      if (!firstTransition) {
        log('warn', `Task ${task.id} has no available transitions — releasing`);
        await client.releaseTask(task.id);
        currentTaskId = null;
        continue;
      }

      let transRes = await client.transitionTask(task.id, firstTransition.state);
      if (!transRes.success) {
        log('warn', `Failed to transition task ${task.id} to ${firstTransition.state} — releasing`);
        await client.releaseTask(task.id);
        currentTaskId = null;
        continue;
      }

      availableTransitions = transRes.availableTransitions || [];
      let instructions = transRes.instructions;

      // ─── Execute loop (may run multiple phases) ────────────────
      while (running) {
        const prompt = buildWorkflowPrompt(task, instructions);

        // Post status comment
        await client.postComment(task.id, '[status] Starting work on this phase.').catch(() => {});

        // Write MCP config if the adapter supports it
        let mcpConfigPath = null;
        if (adapter.supportsMcp) {
          mcpConfigPath = await writeTempMcpConfig(config);
        }

        // Execute via harness adapter
        const result = await adapter.execute(prompt, { ...config, mcpConfigPath });

        // Cleanup temp MCP config
        if (mcpConfigPath) {
          await unlink(mcpConfigPath).catch(() => {});
        }

        // Report token usage if present in output
        const tokenUsage = parseTokenUsage(result.output);
        if (tokenUsage) {
          await client.reportTokenUsage(task.id, tokenUsage).catch((err) => {
            log('debug', `Failed to report token usage: ${err.message}`);
          });
        }

        // ─── NEEDS_INPUT detection ────────────────────────────────
        if (result.output && result.output.includes('NEEDS_INPUT:')) {
          const question = extractNeedsInput(result.output);
          await client.postComment(task.id, `[needs_input] ${question}`).catch(() => {});
          log('info', `Task ${task.id}: agent needs input — releasing`);
          await client.releaseTask(task.id);
          break;
        }

        const summary = extractSummary(result.output);

        // Post completion comment
        await client.postComment(task.id, `[done] Phase complete. Summary:\n${summary}`).catch(() => {});

        // ─── Transition to next state ────────────────────────────
        const nextTransition = availableTransitions[0];
        if (!nextTransition) {
          log('info', `Task ${task.id}: no more transitions — releasing`);
          await client.releaseTask(task.id);
          break;
        }

        transRes = await client.transitionTask(task.id, nextTransition.state, summary);

        if (!transRes.success) {
          log('warn', `Failed to transition task ${task.id} — releasing`);
          await client.releaseTask(task.id);
          break;
        }

        // Auto-released (reached done state)?
        if (transRes.released) {
          log('info', `Task ${task.id} completed (reached done state)`);
          break;
        }

        availableTransitions = transRes.availableTransitions || [];
        instructions = transRes.instructions;

        // If no more transitions after this state, release
        if (availableTransitions.length === 0) {
          log('info', `Task ${task.id}: no more transitions from new state — releasing`);
          await client.releaseTask(task.id);
          break;
        }

        // If no instructions for next phase, auto-advance
        if (!instructions) {
          log('info', `Task ${task.id}: advancing without instructions`);
          continue;
        }

        // Otherwise loop back to execute with new instructions
        log('info', `Task ${task.id}: continuing to next phase`);
      }

      currentTaskId = null;
    } catch (err) {
      log('error', `Loop error: ${err.message}`);
      if (currentTaskId) {
        await client.releaseTask(currentTaskId).catch(() => {});
        currentTaskId = null;
      }
      await sleep(config.pollInterval * 2000);
    }
  }

  // Cleanup
  clearInterval(heartbeatTimer);
  await client.deregister().catch(() => {});
  log('info', `${adapter.name} runner stopped.`);
}

// ─── Prompt Building ─────────────────────────────────────────────────────────

/**
 * Build a prompt for the harness from task + workflow context.
 */
export function buildWorkflowPrompt(task, instructions) {
  const parts = [];

  // Transition instructions (what to do in this phase)
  if (instructions) {
    parts.push(`## Phase Instructions\n\n${instructions}\n\n---`);
  }

  // Lead comments (feedback/rework context)
  const leadComments = (task.comments || []).filter((c) => c.from === 'lead');
  if (leadComments.length > 0) {
    parts.push('## Comments from Team Lead\n');
    leadComments.forEach((c) => parts.push(`> ${c.body}`));
    parts.push('\n---');
  }

  // Task description
  parts.push(`## Task: ${task.title}`);
  parts.push(`**Task ID: ${task.id}** (Story: ${task.storyId || 'unknown'})`);

  if (task.description) {
    parts.push('', task.description);
  }

  // Context from previous work
  if (task.context) {
    parts.push('', '## Context from previous tasks', '', task.context);
  }

  parts.push(
    '',
    '---',
    `You are working on task ${task.id}. You have MCP tools available for team coordination.`,
    'When you finish your work, provide a clear summary of what you accomplished.',
    'If you get stuck and need human guidance, output "NEEDS_INPUT:" followed by your question.'
  );

  return parts.join('\n');
}

/**
 * Extract a brief summary from harness output.
 */
export function extractSummary(output) {
  if (!output) return 'No output captured';

  const summaryMatch = output.match(/##?\s*Summary\s*\n([\s\S]*?)(?:\n##|\n---|\Z)/i);
  if (summaryMatch) {
    return summaryMatch[1].trim().slice(0, 1000);
  }

  const lines = output.trim().split('\n').filter((l) => l.trim());
  const tail = lines.slice(-10).join('\n');
  return tail.slice(0, 1000);
}

/**
 * Extract the NEEDS_INPUT question from output.
 */
function extractNeedsInput(output) {
  const match = output.match(/NEEDS_INPUT:\s*([\s\S]*?)(?:\n---|\n##|$)/i);
  return match ? match[1].trim().slice(0, 500) : 'Agent needs input (no details provided)';
}

/**
 * Write MCP config to a temp file for harnesses that support it.
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
          MPT_ROLE: config.role || 'teammate',
        },
      },
    },
  };

  const dir = await mkdtemp(join(tmpdir(), 'mpt-runner-'));
  const path = join(dir, 'mcp.json');
  await writeFile(path, JSON.stringify(mcpConfig, null, 2));
  return path;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse token usage from harness output.
 * Claude's --output-format text includes usage stats like:
 *   Input tokens: 1234
 *   Output tokens: 567
 * @param {string} output
 * @returns {{inputTokens: number, outputTokens: number, model?: string}|null}
 */
export function parseTokenUsage(output) {
  if (!output) return null;

  const inputMatch = output.match(/input.?tokens\s*[:=]\s*(\d[\d,]*)/i);
  const outputMatch = output.match(/output.?tokens\s*[:=]\s*(\d[\d,]*)/i);

  if (!inputMatch && !outputMatch) return null;

  const usage = {};
  if (inputMatch) usage.inputTokens = parseInt(inputMatch[1].replace(/,/g, ''), 10);
  if (outputMatch) usage.outputTokens = parseInt(outputMatch[1].replace(/,/g, ''), 10);

  // Try to extract model
  const modelMatch = output.match(/model\s*[:=]\s*([\w.-]+)/i);
  if (modelMatch) usage.model = modelMatch[1];

  return (usage.inputTokens || usage.outputTokens) ? usage : null;
}
