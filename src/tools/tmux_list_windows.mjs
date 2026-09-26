/**
 * tmux_list_windows.mjs — Optional tmux tool: list windows in a session.
 *
 * General-purpose tmux utility. Not tied to agent management.
 */

import { listWindows, isTmuxAvailable } from '../tmux.mjs';

export function tmuxListWindows() {
  const tmuxSession = process.env.MPT_TMUX_SESSION || 'mpt-team';

  return {
    definition: {
      name: 'tmux_list_windows',
      description:
        'List all tmux windows in the session. Optional utility for observing running processes.',
      inputSchema: {
        type: 'object',
        properties: {
          session: {
            type: 'string',
            description: `tmux session name (optional, defaults to "${tmuxSession}").`,
          },
        },
        required: [],
      },
    },

    async handler(args) {
      if (!isTmuxAvailable()) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'tmux is not available on this system' }) }],
          isError: true,
        };
      }

      const session = args.session || tmuxSession;
      const windows = listWindows(session);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ session, windows }),
        }],
      };
    },
  };
}
