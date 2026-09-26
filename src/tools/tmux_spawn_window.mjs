/**
 * tmux_spawn_window.mjs — Optional tmux tool: spawn a command in a new window.
 *
 * This is a general-purpose utility for harnesses that want to manage
 * tmux windows. It is NOT tied to agent spawning — it's just a tmux
 * helper that skills can use however they see fit.
 */

import { spawnWindow, isTmuxAvailable, ensureSession } from '../tmux.mjs';

export function tmuxSpawnWindow() {
  const tmuxSession = process.env.MPT_TMUX_SESSION || 'mpt-team';

  return {
    definition: {
      name: 'tmux_spawn_window',
      description:
        'Spawn a command in a new tmux window. Optional utility for leaders that want to manage agent processes via tmux. Not required — leaders can use any spawning mechanism.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Window name (used as the tmux window title).',
          },
          command: {
            type: 'string',
            description: 'Shell command to run in the window.',
          },
          cwd: {
            type: 'string',
            description: 'Working directory for the command (optional, defaults to cwd).',
          },
          session: {
            type: 'string',
            description: `tmux session name (optional, defaults to "${tmuxSession}").`,
          },
        },
        required: ['name', 'command'],
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
      const cwd = args.cwd || process.cwd();

      try {
        spawnWindow({ session, name: args.name, command: args.command, cwd });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              spawned: true,
              session,
              window: args.name,
              command: args.command,
              cwd,
            }),
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
