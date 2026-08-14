/**
 * queue_request.mjs — Tool to send an async request into the team chat.
 *
 * Delegates to POST /api/assistant/messages — the team's live chat, answered by
 * the leader (my-pizza-team/docs/DESIGN.md "One Agent to Talk To"). The message is
 * queued like one typed in the web UI and picked up on the chat agent's next inbox
 * poll (e.g. research or documentation that shouldn't block the current workflow).
 *
 * Note this tool is meaningful *here* — an external harness handing work to the
 * team — but was removed from pi-pizza-team's own leader tools, where it would be
 * the chat agent messaging itself.
 */

export function queueRequest(daemonClient) {
  return {
    definition: {
      name: 'queue_request',
      description:
        'Send a request into the team chat for the leader to handle asynchronously. Use for research, documentation, or other tasks that can happen in the background.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'The request/prompt for the team chat to handle',
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
