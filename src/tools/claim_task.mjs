/**
 * claim_task.mjs — Tool to claim a task from the daemon.
 *
 * Proxies to POST /api/agents/claim/:taskId. The daemon assigns ownership
 * and transitions the task to the first valid teammate working state.
 * Returns task details, context, comments, and transition instructions.
 */

export function claimTask(daemonClient) {
  return {
    definition: {
      name: 'claim_task',
      description:
        'Claim a task and start working on it. The daemon assigns you ownership and transitions to the working state. Returns task details, context, and instructions for the current phase.',
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
      const response = await daemonClient.claimTask(args.taskId);
      return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
    },
  };
}
