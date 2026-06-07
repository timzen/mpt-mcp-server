/**
 * list_agents.mjs — Tool to list all active teammate agents.
 *
 * Shows both local tmux window state and daemon-registered agents.
 * Daemon agents may include members on other hosts.
 */

import { listWindows, isTmuxAvailable } from '../tmux.mjs';

export function listAgents(daemonClient) {
  const tmuxSession = process.env.MPT_TMUX_SESSION || 'mpt-team';

  return {
    definition: {
      name: 'list_agents',
      description:
        'List all active teammate agents. Shows local tmux windows and daemon-registered members (may include agents on other hosts).',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },

    async handler() {
      // List live tmux windows (local agents)
      let liveWindows = [];
      if (isTmuxAvailable()) {
        liveWindows = listWindows(tmuxSession);
      }

      // Query daemon for registered members
      let daemonMembers = [];
      try {
        const status = await daemonClient.getStatus();
        daemonMembers = status.members || [];
      } catch {
        // Daemon may be unreachable — show local state only
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            session: tmuxSession,
            tmuxWindows: liveWindows,
            daemonMembers,
          }),
        }],
      };
    },
  };
}
