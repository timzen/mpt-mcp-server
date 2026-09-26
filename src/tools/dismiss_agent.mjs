/**
 * dismiss_agent.mjs — Tool to dismiss a running teammate agent.
 *
 * Proxies to POST /api/agents/:id/dismiss on the daemon. The agent
 * will self-terminate gracefully on its next heartbeat cycle.
 *
 * This tool does NOT directly kill processes — it signals the daemon,
 * which sets a "dismissed" flag that the agent checks via heartbeat.
 */

export function dismissAgent(daemonClient) {
  return {
    definition: {
      name: 'dismiss_agent',
      description:
        'Dismiss a running teammate agent by name. The daemon signals the agent to stop gracefully on its next heartbeat. Does not force-kill — the agent self-terminates.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name/ID of the agent to dismiss.',
          },
        },
        required: ['name'],
      },
    },

    async handler(args) {
      try {
        await daemonClient.dismissAgent(args.name);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ dismissed: true, name: args.name }),
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
