/**
 * save_memory.mjs — Tool to persist a memory entry for the team.
 */

export function saveMemory(store) {
  return {
    definition: {
      name: 'save_memory',
      description:
        'Save a piece of knowledge or context to the team memory. Use for decisions, conventions, research findings, or anything worth remembering.',
      inputSchema: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The content to remember',
          },
          category: {
            type: 'string',
            description:
              'Category for the memory (e.g. "coding", "research", "doc-writing", "decision")',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional tags for easier retrieval',
          },
        },
        required: ['content'],
      },
    },
    handler(args) {
      const record = store.addMemory({
        content: args.content,
        category: args.category,
        tags: args.tags,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ saved: true, id: record.id, category: record.category }),
          },
        ],
      };
    },
  };
}
