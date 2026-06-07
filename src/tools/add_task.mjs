/**
 * add_task.mjs — Tool to add a task to a story via the daemon.
 *
 * Delegates to POST /api/stories/:storyId/tasks. Used by the leader
 * to break stories into executable tasks for teammates.
 */

export function addTask(daemonClient) {
  return {
    definition: {
      name: 'add_task',
      description:
        'Add a task to a story. Tasks are the units of work that teammates pick up and execute.',
      inputSchema: {
        type: 'object',
        properties: {
          storyId: {
            type: 'string',
            description: 'The story ID to add the task to',
          },
          title: {
            type: 'string',
            description: 'Short title for the task',
          },
          description: {
            type: 'string',
            description: 'Detailed description of what the task requires',
          },
        },
        required: ['storyId', 'title', 'description'],
      },
    },

    async handler(args) {
      try {
        const response = await daemonClient.createTask(args.storyId, args.title, args.description);
        return {
          content: [{ type: 'text', text: JSON.stringify({ created: true, ...response }) }],
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
