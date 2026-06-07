/**
 * search_memory.mjs — Tool to search the team's shared memory via the daemon.
 *
 * Delegates to GET /api/assistant/notes/search on the daemon.
 */

export function searchMemory(daemonClient) {
  return {
    definition: {
      name: 'search_memory',
      description:
        'Search the team memory by keyword. Can filter by category. Returns matching entries.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query (keywords)',
          },
          category: {
            type: 'string',
            description: 'Category to search within (optional)',
          },
          limit: {
            type: 'number',
            description: 'Max results to return (default: 5)',
          },
        },
        required: ['query'],
      },
    },

    async handler(args) {
      try {
        const response = await daemonClient.searchNotes(
          args.query,
          args.category || undefined,
          args.limit || 5
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response),
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
