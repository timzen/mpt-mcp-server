/**
 * create_story.mjs — Tool to create a new story via the daemon.
 *
 * Delegates to POST /api/stories. Used by the leader to plan work
 * by breaking it into stories with optional dependencies and workflows.
 */

export function createStory(daemonClient) {
  return {
    definition: {
      name: 'create_story',
      description:
        'Create a new story (unit of plannable work). Stories contain tasks and can depend on other stories. Used by the leader to plan and structure work.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Unique story identifier (slug-style, e.g. "auth-refactor")',
          },
          title: {
            type: 'string',
            description: 'Human-readable title for the story',
          },
          description: {
            type: 'string',
            description: 'Detailed description of what this story accomplishes',
          },
          dependsOn: {
            type: 'array',
            items: { type: 'string' },
            description: 'IDs of stories this depends on (optional)',
          },
          dir: {
            type: 'string',
            description: 'Working directory for tasks in this story (optional)',
          },
          workflow: {
            type: 'string',
            description: 'Workflow name to use for tasks in this story (optional)',
          },
        },
        required: ['id', 'title', 'description'],
      },
    },

    async handler(args) {
      try {
        const story = {
          id: args.id,
          title: args.title,
          description: args.description,
        };
        if (args.dependsOn) story.dependsOn = args.dependsOn;
        if (args.dir) story.dir = args.dir;
        if (args.workflow) story.workflow = args.workflow;

        const response = await daemonClient.createStory(story);
        return {
          content: [{ type: 'text', text: JSON.stringify({ created: true, ...response }) }],
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
