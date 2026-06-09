/**
 * spawn_agent.mjs — Tool to spawn a teammate runner into a tmux window.
 *
 * When called, creates a new tmux window in the configured session and
 * launches the appropriate runner for the specified harness. The runner
 * is a persistent loop that polls the daemon for work, spawns the harness
 * per task/phase, and handles workflow transitions.
 *
 * This enables the "leader" harness to spawn teammates that users can
 * hop into to observe or course-correct.
 *
 * Each spawned runner gets its own MCP server instance (stdio is 1:1),
 * configured via env vars (MPT_DAEMON_URL, MPT_AGENT_ID, etc.).
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnWindow, isTmuxAvailable, listWindows, shellSafe } from '../tmux.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNNERS_DIR = resolve(__dirname, '..', 'runners');

// ─── Runner command mapping ──────────────────────────────────────────

/**
 * Get the runner command for a harness type.
 * Each harness has a corresponding runner that handles the poll→execute→transition loop.
 */
function getRunnerCommand(harness, { agentId, daemonUrl, workDir, taskId, storyId }) {
  let env = `MPT_DAEMON_URL=${shellSafe(daemonUrl)} MPT_AGENT_ID=${shellSafe(agentId)} MPT_WORK_DIR=${shellSafe(workDir)} MPT_ROLE=teammate`;
  if (taskId) env += ` MPT_TASK_ID=${shellSafe(taskId)}`;
  if (storyId) env += ` MPT_STORY_ID=${shellSafe(storyId)}`;

  switch (harness) {
    case 'claude-code':
      return `${env} node ${resolve(RUNNERS_DIR, 'claude', 'runner.mjs')}`;
    case 'kiro':
      return `${env} node ${resolve(RUNNERS_DIR, 'kiro', 'runner.mjs')}`;
    case 'codex':
      return `${env} node ${resolve(RUNNERS_DIR, 'codex', 'runner.mjs')}`;
    case 'pi':
      // Pi has its own extension (pi-pizza-team) for teammate mode.
      // Spawn pi with worker flags.
      return `${env} pi --ppt-worker --ppt-daemon=${shellSafe(daemonUrl)} --ppt-name=${shellSafe(agentId)}`;
    default:
      return null;
  }
}

// ─── Tool factory ────────────────────────────────────────────────────

export function spawnAgent(daemonClient) {
  const tmuxSession = process.env.MPT_TMUX_SESSION || 'mpt-team';
  const daemonUrl = daemonClient.url;

  return {
    definition: {
      name: 'spawn_agent',
      description:
        'Spawn a new teammate agent in a tmux window. The agent runs a persistent loop that polls the daemon for work, executes tasks via the specified harness, and handles workflow transitions. Users can hop into the tmux window to observe or course-correct.',
      inputSchema: {
        type: 'object',
        properties: {
          harness: {
            type: 'string',
            description: 'Harness type: "claude-code", "kiro", "pi", or "codex". Defaults to "claude-code".',
          },
          name: {
            type: 'string',
            description: 'Agent name (used as tmux window name). Auto-generated if omitted.',
          },
          cwd: {
            type: 'string',
            description: 'Working directory for the agent. Defaults to current directory.',
          },
          taskId: {
            type: 'string',
            description: 'Pre-assign the agent to a specific task (optional).',
          },
          storyId: {
            type: 'string',
            description: 'Story context for the agent (optional, passed as env).',
          },
        },
        required: [],
      },
    },

    async handler(args) {
      // Validate tmux availability
      if (!isTmuxAvailable()) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'tmux is not available on this system' }) }],
          isError: true,
        };
      }

      const harnessName = args.harness || 'claude-code';
      const workDir = resolve(args.cwd || process.cwd());

      // Get agent name: use provided name, or ask daemon to generate one
      let agentName = args.name;
      let spawnRequestId = null;

      if (!agentName) {
        try {
          const spawnRes = await daemonClient.createSpawnRequest({ cwd: workDir, storyId: args.storyId });
          agentName = spawnRes.name;
          spawnRequestId = spawnRes.id;
        } catch {
          // Fallback: generate from existing tmux windows if daemon is unreachable
          const existingWindows = new Set(listWindows(tmuxSession));
          agentName = `agent-${Date.now()}`;
        }
      }

      // Build the runner command
      const runnerCmd = getRunnerCommand(harnessName, {
        agentId: agentName,
        daemonUrl,
        workDir,
        taskId: args.taskId,
        storyId: args.storyId,
      });

      if (!runnerCmd) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Unknown harness: "${harnessName}". Use: claude-code, kiro, pi, or codex.` }) }],
          isError: true,
        };
      }

      // Spawn into tmux
      try {
        spawnWindow({
          session: tmuxSession,
          name: agentName,
          command: runnerCmd,
          cwd: workDir,
        });
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Failed to spawn tmux window: ${err.message}` }) }],
          isError: true,
        };
      }

      // Acknowledge the spawn request if we created one
      if (spawnRequestId) {
        try {
          await daemonClient.ackSpawnRequest(spawnRequestId);
        } catch {
          // Non-fatal: spawn succeeded even if ack fails
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            spawned: true,
            name: agentName,
            harness: harnessName,
            session: tmuxSession,
            window: agentName,
            daemonUrl,
            hint: `Teammate is polling for work. Hop in: tmux select-window -t "${tmuxSession}:${agentName}"`,
          }),
        }],
      };
    },
  };
}
