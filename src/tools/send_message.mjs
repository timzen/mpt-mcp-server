/**
 * send_message.mjs — Tool to send a message to another team member or agent.
 */

export function sendMessage(store) {
  return {
    definition: {
      name: 'send_message',
      description:
        'Send a message to another team member or agent. Use for coordination, questions, or status updates.',
      inputSchema: {
        type: 'object',
        properties: {
          from: {
            type: 'string',
            description: 'Sender identifier (agent name or role)',
          },
          to: {
            type: 'string',
            description: 'Recipient identifier (agent name or role)',
          },
          content: {
            type: 'string',
            description: 'Message content',
          },
        },
        required: ['from', 'to', 'content'],
      },
    },
    handler(args) {
      const record = store.addMessage({
        from: args.from,
        to: args.to,
        content: args.content,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              sent: true,
              id: record.id,
              to: record.to,
            }),
          },
        ],
      };
    },
  };
}
