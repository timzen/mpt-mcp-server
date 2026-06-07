/**
 * team_status.mjs — Tool to get a formatted team status summary from the daemon.
 *
 * Delegates to GET /api/status. Returns stories, tasks by status,
 * registered members, and inbox state.
 */

export function teamStatus(daemonClient) {
  return {
    definition: {
      name: 'team_status',
      description:
        'Get a summary of the team status: stories, tasks by status, registered members, and inbox. Useful for the leader to understand current state before planning.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },

    async handler() {
      try {
        const response = await daemonClient.getStatus();
        return {
          content: [{ type: 'text', text: JSON.stringify(response) }],
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
