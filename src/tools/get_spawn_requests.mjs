/**
 * get_spawn_requests.mjs — Tool to poll for pending spawn requests.
 *
 * Proxies to GET /api/spawn-requests on the daemon. Leaders use this
 * to discover new teammate spawn requests they should fulfill using
 * their native spawning mechanism.
 */

export function getSpawnRequests(daemonClient) {
  return {
    definition: {
      name: 'get_spawn_requests',
      description:
        'Poll for pending spawn requests. Returns a list of unfulfilled requests for new teammate agents. Leaders should poll this and fulfill requests using their native spawning mechanism, then call ack_spawn_request.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },

    async handler() {
      try {
        const response = await daemonClient.getSpawnRequests();
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
