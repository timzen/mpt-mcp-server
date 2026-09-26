/**
 * ack_spawn_request.mjs — Tool to acknowledge a fulfilled spawn request.
 *
 * Proxies to POST /api/spawn-requests/:id/ack on the daemon. Leaders call
 * this after successfully spawning a teammate to mark the request as done.
 */

export function ackSpawnRequest(daemonClient) {
  return {
    definition: {
      name: 'ack_spawn_request',
      description:
        'Acknowledge that a spawn request has been fulfilled. Call this after successfully spawning a teammate agent to mark the request as complete.',
      inputSchema: {
        type: 'object',
        properties: {
          requestId: {
            type: 'string',
            description: 'The spawn request ID to acknowledge.',
          },
        },
        required: ['requestId'],
      },
    },

    async handler(args) {
      try {
        const response = await daemonClient.ackSpawnRequest(args.requestId);
        return {
          content: [{ type: 'text', text: JSON.stringify({ acknowledged: true, ...response }) }],
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
