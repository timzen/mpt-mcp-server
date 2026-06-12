/**
 * release_task.mjs — Tool to release a task after completing work.
 *
 * Proxies to POST /api/agents/release/:taskId. The daemon advances the
 * task to the next state, stores the result, and releases ownership.
 * Returns the new status and whether the task is fully complete.
 */

export function releaseTask(daemonClient) {
  return {
    definition: {
      name: 'release_task',
      description:
        'Release a task after completing your work. The daemon advances it to the next workflow state and releases your ownership. Optionally pass a result summary.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The task ID to release.',
          },
          result: {
            type: 'string',
            description: 'Summary of the work completed (optional).',
          },
        },
        required: ['taskId'],
      },
    },
    async handler(args) {
      const response = await daemonClient.releaseTask(args.taskId, args.result);
      return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
    },
  };
}
