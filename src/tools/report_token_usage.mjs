/**
 * report_token_usage.mjs — Tool to report token usage for a task.
 *
 * Delegates to POST /api/tasks/:taskId/token-usage. Used by harnesses
 * that track their own usage to self-report costs per task.
 */

export function reportTokenUsage(daemonClient) {
  return {
    definition: {
      name: 'report_token_usage',
      description:
        'Report token usage for a task. Use after completing work to track costs. Harnesses that track their own usage can self-report via this tool.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The task ID to report usage for',
          },
          inputTokens: {
            type: 'number',
            description: 'Number of input tokens consumed',
          },
          outputTokens: {
            type: 'number',
            description: 'Number of output tokens generated',
          },
          model: {
            type: 'string',
            description: 'Model identifier (e.g. "claude-sonnet-4-20250514")',
          },
        },
        required: ['taskId', 'inputTokens', 'outputTokens'],
      },
    },

    async handler(args) {
      try {
        const response = await daemonClient.reportTokenUsage(args.taskId, {
          inputTokens: args.inputTokens,
          outputTokens: args.outputTokens,
          model: args.model,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify({ reported: true, ...response }) }],
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
