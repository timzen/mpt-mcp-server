/**
 * harnesses.mjs — Default harness definitions.
 *
 * Each harness type defines the command template, capabilities, and
 * environment for spawning an agent. These can be overridden in
 * the project config file (mpt.config.json).
 *
 * Template variables:
 *   {{workDir}}       - Working directory for the session
 *   {{mcpConfigPath}} - Path to generated MCP config file
 *   {{mcpServerPath}} - Path to the mpt-mcp-server entry point
 *   {{prompt}}        - The task prompt text
 *   {{taskId}}        - The task identifier
 *   {{agentId}}       - The agent identifier
 *   {{agentsmd}}      - Path to AGENTS.md
 */

/** @type {Record<string, HarnessDefinition>} */
export const DEFAULT_HARNESSES = {
  pi: {
    name: 'pi',
    description: 'Pi coding agent — supports MCP, persistent sessions, full tool access',
    command: 'pi',
    args: [
      '--print',
      '--mcp-config', '{{mcpConfigPath}}',
      '{{prompt}}',
    ],
    capabilities: {
      mcp: true,
      midTaskComm: true,
      fileEdit: true,
      shell: true,
      streaming: true,
    },
    env: {},
    workDir: '{{workDir}}',
  },

  'claude-code': {
    name: 'claude-code',
    description: 'Claude Code CLI — supports MCP, non-interactive print mode',
    command: 'claude',
    args: [
      '--print',
      '--output-format', 'text',
      '--mcp-config', '{{mcpConfigPath}}',
      '--dangerously-skip-permissions',
      '--append-system-prompt', 'You are agent "{{agentId}}" working on task "{{taskId}}". Use MCP tools (save_memory, search_memory, upload_attachment, report_complete, send_message, get_next_task) for coordination. Call report_complete when done.',
      '{{prompt}}',
    ],
    capabilities: {
      mcp: true,
      midTaskComm: true,
      fileEdit: true,
      shell: true,
      streaming: false,
    },
    env: {},
    workDir: '{{workDir}}',
  },

  codex: {
    name: 'codex',
    description: 'OpenAI Codex CLI — auto-edit mode, file-based context, fire-and-forget',
    command: 'codex',
    args: [
      '--auto-edit',
      '--quiet',
      '{{prompt}}',
    ],
    capabilities: {
      mcp: false,
      midTaskComm: false,
      fileEdit: true,
      shell: true,
      streaming: false,
    },
    env: {},
    workDir: '{{workDir}}',
  },
};

/**
 * @typedef {object} HarnessCapabilities
 * @property {boolean} mcp        - Supports MCP tool calls
 * @property {boolean} midTaskComm - Can communicate mid-task (vs fire-and-forget)
 * @property {boolean} fileEdit   - Can edit files directly
 * @property {boolean} shell      - Can execute shell commands
 * @property {boolean} streaming  - Supports streaming output
 */

/**
 * @typedef {object} HarnessDefinition
 * @property {string} name         - Harness identifier
 * @property {string} description  - Human-readable description
 * @property {string} command      - Binary/command to execute
 * @property {string[]} args       - Argument template array
 * @property {HarnessCapabilities} capabilities
 * @property {Record<string, string>} env - Additional environment variables
 * @property {string} workDir      - Working directory template
 */
