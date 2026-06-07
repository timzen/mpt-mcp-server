/**
 * post_comment.mjs — Tool to post a comment on a task.
 *
 * Proxies to POST /api/agents/comments/:taskId. Used for status updates,
 * work summaries, questions, or signaling completion of a phase.
 * Comments are visible to the lead and any future agent on the task.
 *
 * Supports optional attachments metadata (matching pi-pizza-team's
 * comment+attachment posting pattern).
 */

export function postComment(daemonClient) {
  return {
    definition: {
      name: 'post_comment',
      description:
        'Post a comment on a task. Use for status updates, work summaries, or asking the lead a question. Comments are visible to the lead and other agents. Can include attachment metadata.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The task ID to comment on.',
          },
          body: {
            type: 'string',
            description: 'The comment text (supports markdown).',
          },
          attachments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Attachment filename' },
                size: { type: 'number', description: 'File size in bytes' },
                type: { type: 'string', description: 'MIME type' },
              },
              required: ['name'],
            },
            description: 'Optional attachment metadata to include with the comment.',
          },
        },
        required: ['taskId', 'body'],
      },
    },

    async handler(args) {
      try {
        const response = await daemonClient.postComment(
          args.taskId,
          args.body,
          args.attachments
        );
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
