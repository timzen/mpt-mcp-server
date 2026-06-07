/**
 * release_task.mjs — Tool to release a task back to the pool.
 *
 * Proxies to POST /api/agents/release/:taskId. Called when the agent
 * reaches a state where only lead-restricted transitions remain.
 * The lead can then act, and the task may reappear for the agent later.
 */

export function releaseTask(daemonClient) {
  return {
    definition: {
      name: 'release_task',
      description:
        'Release a claimed task back to the pool. Use this when you reach a state where only lead-restricted transitions remain, or when you cannot continue.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The task ID to release.',
          },
        },
        required: ['taskId'],
      },
    },

    async handler(args) {
      try {
        const response = await daemonClient.releaseTask(args.taskId);
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
