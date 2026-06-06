/**
 * report_complete.mjs — Tool to report a task as complete.
 */

export function reportComplete(store) {
  return {
    definition: {
      name: 'report_complete',
      description:
        'Report a task as complete with a summary of what was accomplished.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The ID of the task being completed',
          },
          summary: {
            type: 'string',
            description: 'Brief summary of what was accomplished',
          },
        },
        required: ['taskId', 'summary'],
      },
    },
    handler(args) {
      const record = store.reportComplete(args.taskId, args.summary);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              completed: true,
              taskId: record.taskId,
              completedAt: record.completedAt,
            }),
          },
        ],
      };
    },
  };
}
