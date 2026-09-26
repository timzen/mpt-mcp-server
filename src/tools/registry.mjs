/**
 * registry.mjs — Tool registry that defines and dispatches MCP tools.
 *
 * Each tool is defined with its schema (for ListTools) and a handler
 * function (for CallTool). All daemon-backed tools delegate to the
 * daemon client. Tmux tools are optional utilities that operate locally.
 *
 * Role-based filtering: The MPT_ROLE env var controls which tools are exposed:
 *   - leader: planning, status, spawn management, memory, comments
 *   - teammate: workflow execution, attachments, memory search, comments
 *   - assistant: planning, memory, queue
 *
 * Tmux tools are available to all roles (they're optional utilities).
 */

import { saveMemory } from './save_memory.mjs';
import { searchMemory } from './search_memory.mjs';
import { uploadAttachment } from './upload_attachment.mjs';
import { spawnAgent } from './spawn_agent.mjs';
import { getSpawnRequests } from './get_spawn_requests.mjs';
import { ackSpawnRequest } from './ack_spawn_request.mjs';
import { dismissAgent } from './dismiss_agent.mjs';
import { listAgents } from './list_agents.mjs';
import { getNextWork } from './get_next_work.mjs';
import { claimTask } from './claim_task.mjs';
import { releaseTask } from './release_task.mjs';
import { postComment } from './post_comment.mjs';
import { createStory } from './create_story.mjs';
import { editStory } from './edit_story.mjs';
import { addTask } from './add_task.mjs';
import { teamStatus } from './team_status.mjs';
import { queueRequest } from './queue_request.mjs';
import { reportTokenUsage } from './report_token_usage.mjs';
import { tmuxSpawnWindow } from './tmux_spawn_window.mjs';
import { tmuxListWindows } from './tmux_list_windows.mjs';
import { tmuxKillWindow } from './tmux_kill_window.mjs';

/**
 * Role-based tool access matrix.
 * true = tool is available for that role.
 */
const ROLE_ACCESS = {
  // ─── Planning & Management ─────────────────────────────────────
  create_story:        { leader: true,  teammate: false, assistant: true  },
  edit_story:          { leader: true,  teammate: false, assistant: true  },
  add_task:            { leader: true,  teammate: false, assistant: true  },
  team_status:         { leader: true,  teammate: false, assistant: false },
  queue_request:       { leader: true,  teammate: false, assistant: true  },

  // ─── Memory ────────────────────────────────────────────────────
  save_memory:         { leader: true,  teammate: true,  assistant: true  },
  search_memory:       { leader: true,  teammate: true,  assistant: true  },

  // ─── Task Execution ────────────────────────────────────────────
  upload_attachment:   { leader: false, teammate: true,  assistant: false },
  get_next_work:       { leader: true,  teammate: true,  assistant: false },
  claim_task:          { leader: true,  teammate: true,  assistant: false },
  release_task:        { leader: true,  teammate: true,  assistant: false },
  post_comment:        { leader: true,  teammate: true,  assistant: false },
  report_token_usage:  { leader: false, teammate: true,  assistant: false },

  // ─── Agent Lifecycle ───────────────────────────────────────────
  spawn_agent:         { leader: true,  teammate: true,  assistant: false },
  get_spawn_requests:  { leader: true,  teammate: false, assistant: false },
  ack_spawn_request:   { leader: true,  teammate: false, assistant: false },
  dismiss_agent:       { leader: true,  teammate: false, assistant: false },
  list_agents:         { leader: true,  teammate: false, assistant: false },

  // ─── Tmux Utilities (optional, available to all) ───────────────
  tmux_spawn_window:   { leader: true,  teammate: true,  assistant: true  },
  tmux_list_windows:   { leader: true,  teammate: true,  assistant: true  },
  tmux_kill_window:    { leader: true,  teammate: true,  assistant: true  },
};

/**
 * Creates a tool registry bound to the daemon client, filtered by role.
 * @param {object} daemonClient - Daemon HTTP client (required)
 * @param {object} [options]
 * @param {'leader'|'teammate'|'assistant'} [options.role='leader'] - Agent role for tool filtering
 */
export function createToolRegistry(daemonClient, options = {}) {
  const role = options.role || 'leader';

  // Build all tools
  const allTools = [
    // Daemon-backed tools
    saveMemory(daemonClient),
    searchMemory(daemonClient),
    uploadAttachment(daemonClient),
    createStory(daemonClient),
    editStory(daemonClient),
    addTask(daemonClient),
    teamStatus(daemonClient),
    queueRequest(daemonClient),
    spawnAgent(daemonClient),
    getSpawnRequests(daemonClient),
    ackSpawnRequest(daemonClient),
    dismissAgent(daemonClient),
    listAgents(daemonClient),
    getNextWork(daemonClient),
    claimTask(daemonClient),
    releaseTask(daemonClient),
    postComment(daemonClient),
    reportTokenUsage(daemonClient),
    // Local tmux utilities (no daemon client needed)
    tmuxSpawnWindow(),
    tmuxListWindows(),
    tmuxKillWindow(),
  ];

  // Filter by role
  const tools = allTools.filter((t) => {
    const access = ROLE_ACCESS[t.definition.name];
    // If not in the access matrix, allow for all roles (future-proof)
    if (!access) return true;
    return access[role] === true;
  });

  const toolMap = new Map(tools.map((t) => [t.definition.name, t]));

  return {
    /** The role this registry was created for */
    role,

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
