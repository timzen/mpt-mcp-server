/**
 * queue_request.mjs — Tool to queue an async request for the assistant.
 *
 * Delegates to POST /api/assistant/messages — the assistant's live chat. The
 * message is queued like one typed in the web UI and picked up on the
 * assistant's next inbox poll (e.g. research or documentation that shouldn't
 * block the current workflow). See my-pizza-team/docs/ASSISTANT_CHAT_V2.md.
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
