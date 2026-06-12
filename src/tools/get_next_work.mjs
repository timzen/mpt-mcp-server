/**
 * get_next_work.mjs — Tool to poll the daemon for the next available task.
 *
 * Proxies to GET /api/agents/next-work on the daemon. Returns an unclaimed
 * task that has teammate-allowed transitions from its current state.
 * This replaces get_next_task for daemon-connected workflows.
 */

export function getNextWork(daemonClient) {
  return {
    definition: {
      name: 'get_next_work',
      description:
        'Poll the daemon for the next available task. Returns the task ID, story ID, and title. Returns null if no work is available. Use claim_task to claim and get full task details.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },

    async handler() {
      try {
        const response = await daemonClient.getNextWork();
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
