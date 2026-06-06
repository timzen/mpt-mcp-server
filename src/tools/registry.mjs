/**
 * registry.mjs — Tool registry that defines and dispatches MCP tools.
 *
 * Each tool is defined with its schema (for ListTools) and a handler
 * function (for CallTool). The registry wires tools to the store.
 */

import { saveMemory } from './save_memory.mjs';
import { searchMemory } from './search_memory.mjs';
import { uploadAttachment } from './upload_attachment.mjs';
import { reportComplete } from './report_complete.mjs';
import { sendMessage } from './send_message.mjs';
import { getNextTask } from './get_next_task.mjs';

/**
 * Creates a tool registry bound to the given store.
 */
export function createToolRegistry(store) {
  const tools = [
    saveMemory(store),
    searchMemory(store),
    uploadAttachment(store),
    reportComplete(store),
    sendMessage(store),
    getNextTask(store),
  ];

  const toolMap = new Map(tools.map((t) => [t.definition.name, t]));

  return {
    listTools() {
      return tools.map((t) => t.definition);
    },

    async callTool(name, args) {
      const tool = toolMap.get(name);
      if (!tool) {
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }
      try {
        return await tool.handler(args);
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    },
  };
}
