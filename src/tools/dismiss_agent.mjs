/**
 * dismiss_agent.mjs — Tool to stop a running teammate agent.
 *
 * Prefers signaling the daemon (POST /api/agents/:id/dismiss) to let
 * the agent self-terminate gracefully via heartbeat. Falls back to
 * sending Ctrl+C and killing the tmux window if the daemon dismiss
 * endpoint is unavailable.
 */

import { dismissWindow, isTmuxAvailable } from '../tmux.mjs';

export function dismissAgent(daemonClient) {
  const tmuxSession = process.env.MPT_TMUX_SESSION || 'mpt-team';

  return {
    definition: {
      name: 'dismiss_agent',
      description:
        'Stop a running teammate agent by name. Signals the daemon to dismiss the agent gracefully via heartbeat. Falls back to killing the tmux window directly.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the agent to dismiss (the tmux window name / agent ID).',
          },
        },
        required: ['name'],
      },
    },

    async handler(args) {
      const agentName = args.name;

      // Try daemon dismiss first (agent will self-terminate via heartbeat)
      let daemonDismissed = false;
      try {
        await daemonClient.dismissAgent(agentName);
        daemonDismissed = true;
      } catch {
        // Daemon endpoint may not exist yet — fall through to tmux kill
      }

      // If daemon dismiss worked, agent will stop on next heartbeat.
      // Also kill the tmux window as a fallback/cleanup.
      if (!daemonDismissed) {
        if (!isTmuxAvailable()) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'tmux is not available and daemon dismiss failed' }) }],
            isError: true,
          };
        }

        try {
          dismissWindow(tmuxSession, agentName);
        } catch (err) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: `Failed to dismiss "${agentName}": ${err.message}` }) }],
            isError: true,
          };
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            dismissed: true,
            name: agentName,
            method: daemonDismissed ? 'daemon' : 'tmux',
            session: tmuxSession,
          }),
        }],
      };
    },
  };
}
