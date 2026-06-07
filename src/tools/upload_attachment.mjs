/**
 * upload_attachment.mjs — Tool to upload a file attachment to a task via the daemon.
 *
 * Delegates to POST /api/tasks/:taskId/attachments. taskId is required —
 * no orphan attachments. Optionally posts a comment alongside the upload
 * (matching pi-pizza-team behavior).
 */

export function uploadAttachment(daemonClient) {
  return {
    definition: {
      name: 'upload_attachment',
      description:
        'Upload a file as an attachment to a task. Optionally posts a comment alongside. Use for diffs, reports, or other artifacts.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'Task ID to attach to (required)',
          },
          filename: {
            type: 'string',
            description: 'Filename with extension (e.g. "changes.diff")',
          },
          content: {
            type: 'string',
            description: 'File content as text',
          },
          message: {
            type: 'string',
            description: 'Optional comment to post alongside the attachment',
          },
        },
        required: ['taskId', 'filename', 'content'],
      },
    },

    async handler(args) {
      try {
        const response = await daemonClient.uploadAttachment(
          args.taskId,
          args.filename,
          args.content
        );

        // Post a comment alongside if message provided
        if (args.message) {
          await daemonClient.postComment(args.taskId, args.message);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                uploaded: true,
                filename: args.filename,
                taskId: args.taskId,
                ...response,
              }),
            },
          ],
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
