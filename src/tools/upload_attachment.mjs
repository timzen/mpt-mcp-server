/**
 * upload_attachment.mjs — Tool to upload a file attachment to a task.
 */

export function uploadAttachment(store) {
  return {
    definition: {
      name: 'upload_attachment',
      description:
        'Upload a file as an attachment, optionally associated with a task. Use for diffs, reports, or other artifacts.',
      inputSchema: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description: 'Filename with extension (e.g. "changes.diff")',
          },
          content: {
            type: 'string',
            description: 'File content as text',
          },
          taskId: {
            type: 'string',
            description: 'Task ID to attach to (optional)',
          },
          message: {
            type: 'string',
            description: 'Optional message to post alongside the attachment',
          },
        },
        required: ['filename', 'content'],
      },
    },
    handler(args) {
      const record = store.addAttachment({
        filename: args.filename,
        content: args.content,
        taskId: args.taskId,
        message: args.message,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              uploaded: true,
              id: record.id,
              filename: record.filename,
            }),
          },
        ],
      };
    },
  };
}
