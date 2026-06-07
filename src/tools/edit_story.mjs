/**
 * edit_story.mjs — Tool to update an existing story via the daemon.
 *
 * Delegates to PUT /api/stories/:storyId. Used by the leader to
 * modify story details, status, dependencies, or workflow.
 */

export function editStory(daemonClient) {
  return {
    definition: {
      name: 'edit_story',
      description:
        'Update an existing story. Can change title, description, status, dependencies, directory, or workflow.',
      inputSchema: {
        type: 'object',
        properties: {
          storyId: {
            type: 'string',
            description: 'The story ID to update',
          },
          title: {
            type: 'string',
            description: 'New title (optional)',
          },
          description: {
            type: 'string',
            description: 'New description (optional)',
          },
          status: {
            type: 'string',
            description: 'New status (optional)',
          },
          dependsOn: {
            type: 'array',
            items: { type: 'string' },
            description: 'Updated dependency list (optional)',
          },
          dir: {
            type: 'string',
            description: 'Updated working directory (optional)',
          },
          workflow: {
            type: 'string',
            description: 'Updated workflow name (optional)',
          },
        },
        required: ['storyId'],
      },
    },

    async handler(args) {
      try {
        const { storyId, ...updates } = args;
        const response = await daemonClient.updateStory(storyId, updates);
        return {
          content: [{ type: 'text', text: JSON.stringify({ updated: true, ...response }) }],
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
