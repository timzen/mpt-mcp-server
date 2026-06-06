/**
 * get_next_task.mjs — Tool to retrieve the next pending task for an agent.
 */

export function getNextTask(store) {
  return {
    definition: {
      name: 'get_next_task',
      description:
        'Get the next pending task, optionally filtered by assignee. Returns null if no tasks are available.',
      inputSchema: {
        type: 'object',
        properties: {
          assignee: {
            type: 'string',
            description: 'Filter tasks by assignee (optional)',
          },
        },
        required: [],
      },
    },
    handler(args) {
      const task = store.getNextTask(args.assignee || null);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ task }),
          },
        ],
      };
    },
  };
}
