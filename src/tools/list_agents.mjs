/**
 * list_agents.mjs — Tool to list all registered agents.
 *
 * Proxies to GET /api/agents on the daemon. Returns all agents
 * regardless of host or harness type.
 */

export function listAgents(daemonClient) {
  return {
    definition: {
      name: 'list_agents',
      description:
        'List all registered agents and their current status (idle, working, etc.).',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },

    async handler() {
      try {
        const status = await daemonClient.getStatus();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ agents: status.members || [] }),
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
