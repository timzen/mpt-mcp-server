/**
 * tmux_kill_window.mjs — Optional tmux tool: kill a tmux window.
 *
 * General-purpose tmux utility. Sends Ctrl+C then kills the window.
 */

import { dismissWindow, isTmuxAvailable } from '../tmux.mjs';

export function tmuxKillWindow() {
  const tmuxSession = process.env.MPT_TMUX_SESSION || 'mpt-team';

  return {
    definition: {
      name: 'tmux_kill_window',
      description:
        'Kill a tmux window by name. Sends Ctrl+C to interrupt, then closes the window. Optional utility for stopping processes.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Window name to kill.',
          },
          session: {
            type: 'string',
            description: `tmux session name (optional, defaults to "${tmuxSession}").`,
          },
        },
        required: ['name'],
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

      try {
        dismissWindow(session, args.name);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ killed: true, session, window: args.name }),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    },
  };
}
