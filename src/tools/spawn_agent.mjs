/**
 * spawn_agent.mjs — Tool to request that a leader spawn a new teammate.
 *
 * Proxies to POST /api/spawn-requests on the daemon. Creates a spawn
 * request that a leader (MeshClaw, Pi, or any harness acting as leader)
 * will pick up and fulfill using its own native spawning mechanism.
 *
 * This tool does NOT spawn anything directly — it only creates the request.
 * The leader polls for spawn requests and decides how to fulfill them.
 */

export function spawnAgent(daemonClient) {
  return {
    definition: {
      name: 'spawn_agent',
      description:
        'Request that the leader spawn a new teammate agent. Creates a spawn request in the daemon queue. The leader picks this up and fulfills it using its native spawning mechanism. Returns the request ID and generated agent name.',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: {
            type: 'string',
            description: 'Suggested working directory for the new agent (optional).',
          },
          storyId: {
            type: 'string',
            description: 'Story context for the new agent (optional).',
          },
          reason: {
            type: 'string',
            description: 'Why this agent is needed (optional, helps the leader prioritize).',
          },
        },
        required: [],
      },
    },

    async handler(args) {
      try {
        const response = await daemonClient.createSpawnRequest({
          cwd: args.cwd,
          storyId: args.storyId,
          reason: args.reason,
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              requested: true,
              id: response.id,
              name: response.name,
              status: response.status,
              hint: 'A leader will pick this up and spawn the agent.',
            }),
          }],
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
