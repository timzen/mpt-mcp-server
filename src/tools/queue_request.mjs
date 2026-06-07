/**
 * queue_request.mjs — Tool to queue an async request for the assistant.
 *
 * Delegates to POST /api/assistant/queue. The assistant processes
 * queued requests asynchronously (e.g., research, documentation tasks
 * that don't block the current workflow).
 */

export function queueRequest(daemonClient) {
  return {
    definition: {
      name: 'queue_request',
      description:
        'Queue a request for the assistant to process asynchronously. Use for research, documentation, or other tasks that can happen in the background.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'The request/prompt for the assistant to process',
          },
        },
        required: ['prompt'],
      },
    },

    async handler(args) {
      try {
        const response = await daemonClient.enqueueAssistantRequest(args.prompt);
        return {
          content: [{ type: 'text', text: JSON.stringify({ queued: true, ...response }) }],
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
