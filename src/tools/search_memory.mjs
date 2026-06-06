/**
 * search_memory.mjs — Tool to search the team's shared memory.
 */

export function searchMemory(store) {
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
    handler(args) {
      const results = store.searchMemory(
        args.query,
        args.category || null,
        args.limit || 5
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ results, count: results.length }),
          },
        ],
      };
    },
  };
}
