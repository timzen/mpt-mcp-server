/**
 * claim_task.mjs — Tool to claim ownership of a task from the daemon.
 *
 * Proxies to POST /api/agents/claim/:taskId. Claims the task without
 * changing its state — the agent should then call transition_task to
 * advance to the first working state.
 */

export function claimTask(daemonClient) {
  return {
    definition: {
      name: 'claim_task',
      description:
        'Claim ownership of a task (no state change). After claiming, call transition_task to advance to the first working state. Returns available transitions.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The task ID to claim.',
          },
        },
        required: ['taskId'],
      },
    },

    async handler(args) {
      try {
        const response = await daemonClient.claimTask(args.taskId);
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
