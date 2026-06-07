/**
 * transition_task.mjs — Tool to advance a claimed task to the next state.
 *
 * Proxies to POST /api/agents/transition/:taskId. Validates the transition
 * against workflow permissions. Returns whether the task was auto-released
 * (reached done state), next available transitions, and transition instructions.
 */

export function transitionTask(daemonClient) {
  return {
    definition: {
      name: 'transition_task',
      description:
        'Advance a claimed task to the specified target state. Returns success, whether the task was auto-released (done), transition instructions for the new state, and remaining available transitions.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The task ID to transition.',
          },
          targetState: {
            type: 'string',
            description: 'The target state to transition to (from availableTransitions).',
          },
          result: {
            type: 'string',
            description: 'Summary of work done in the current state (optional).',
          },
        },
        required: ['taskId', 'targetState'],
      },
    },

    async handler(args) {
      try {
        const response = await daemonClient.transitionTask(args.taskId, args.targetState, args.result);
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
