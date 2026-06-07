/**
 * save_memory.mjs — Tool to persist a memory note via the daemon.
 *
 * Delegates to POST /api/assistant/notes with the schema expected by
 * the daemon: title, content, categories[].
 */

export function saveMemory(daemonClient) {
  return {
    definition: {
      name: 'save_memory',
      description:
        'Save a piece of knowledge or context to the team memory. Use for decisions, conventions, research findings, or anything worth remembering.',
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Short title for the memory note',
          },
          content: {
            type: 'string',
            description: 'The content to remember',
          },
          categories: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Categories for the memory (e.g. ["coding", "convention"])',
          },
        },
        required: ['title', 'content'],
      },
    },

    async handler(args) {
      try {
        const response = await daemonClient.saveNote(
          args.title,
          args.content,
          args.categories || ['general']
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ saved: true, ...response }),
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
