# mpt-mcp-server

An MCP (Model Context Protocol) server that exposes team collaboration tools for multi-agent workflows. Compatible with **Claude Code**, **Cursor**, **Kiro**, and **Codex** via their MCP configuration.

This is the **harness-agnostic alternative to [pi-pizza-team](https://github.com/earendil-works/pi-pizza-team)**. Where pi-pizza-team integrates directly into Pi's extension system (TUI widgets, permission hooks, `pi.sendUserMessage`), mpt-mcp-server provides the same daemon-backed team coordination as a standalone MCP tool layer that any harness can use. Same daemon, same agent protocol, same workflow model — just without the Pi-specific integration points.

## Tools

| Tool | Description |
|------|-------------|
| `save_memory` | Persist knowledge, decisions, or conventions to team memory (via daemon) |
| `search_memory` | Search team memory by keyword, with optional category filter (via daemon) |
| `upload_attachment` | Upload a file artifact to a task (requires `taskId`) |
| `create_story` | Create a new story (unit of plannable work with tasks) |
| `edit_story` | Update an existing story's details, status, or dependencies |
| `add_task` | Add a task to a story for teammates to execute |
| `team_status` | Get a summary of stories, tasks, members, and inbox |
| `queue_request` | Queue an async request for the assistant to process |
| `spawn_agent` | Spawn a teammate agent in a tmux window (leader can observe/interact) |
| `dismiss_agent` | Stop a running teammate and close its tmux window |
| `list_agents` | List all active teammate agents and their tmux status |
| `get_next_work` | Poll daemon for next task with teammate-allowed transitions |
| `claim_task` | Claim a task and start working (daemon transitions to working state) |
| `release_task` | Release a task after work (daemon advances to next state) |
| `post_comment` | Post a comment on a task (status updates, questions) |
| `report_token_usage` | Report token usage (input/output tokens) for a task |

## Setup

```bash
npm install
```

## Usage

### Start the MCP server (stdio transport)

```bash
npm start
# or
node src/index.mjs
```

### Start the Task Runner

The task runner is a persistent loop that polls a daemon for tasks, executes them via the `claude` CLI, and reports results back.

```bash
npm run runner
# or
node src/runners/claude/runner.mjs
```

### Start the Task Runner (Kiro)

The Kiro runner uses `kiro-cli chat --no-interactive` with MCP support.

```bash
npm run runner:kiro
# or
node src/runners/kiro/runner.mjs
```

### Start the Task Runner (Codex)

The Codex runner uses the same shared loop as Claude/Kiro but without MCP tools (codex doesn't support MCP).

```bash
npm run runner:codex
# or
node src/runners/codex/runner.mjs
```

### Leader Mode (tmux-based team orchestration)

The recommended way to use mpt is as a **leader + teammates** setup. One harness (e.g., Pi or Claude Code) runs as the leader with the MCP server. It can spawn teammate agents into tmux windows that users can hop into to observe or course-correct.

```bash
# 1. Start a tmux session (or let mpt create one automatically)
tmux new-session -s mpt-team

# 2. Run your leader harness with the MCP server configured
#    The leader can now call spawn_agent to create teammates

# 3. Teammates appear as new tmux windows in the session
#    Hop to any window: tmux select-window -t mpt-team:<agent-name>
```

**How it works:**
- The leader's MCP server instance has `spawn_agent`, `dismiss_agent`, and `list_agents` tools
- `spawn_agent` creates a new tmux window, launches the harness with its own MCP config
- Each teammate gets its own MCP server instance (stdio is 1:1)
- Users can switch to any teammate's window to pair, observe, or intervene
- The daemon remains the shared state layer for task coordination

**Environment:**

| Variable | Default | Description |
|----------|---------|-------------|
| `MPT_TMUX_SESSION` | `mpt-team` | tmux session name for all agent windows |

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MPT_DAEMON_URL` | *(required)* | Daemon HTTP endpoint (my-pizza-team) |
| `MPT_AGENT_ID` | `mpt-agent-<pid>` | This agent's identifier |
| `MPT_ROLE` | `leader` | Role for tool filtering: `leader`, `teammate`, or `assistant` |
| `MPT_POLL_INTERVAL` | `5` | Seconds between polls when idle |
| `MPT_WORK_DIR` | Current directory | Working directory for claude sessions |
| `MPT_MCP_SERVER` | Auto-detected | Path to mpt-mcp-server entry point |
| `MPT_CLAUDE_BIN` | `claude` | Path to claude CLI binary (claude runner) |
| `MPT_KIRO_BIN` | `kiro-cli` | Path to kiro-cli binary (kiro runner) |
| `MPT_CODEX_BIN` | `codex` | Path to codex CLI binary (codex runner) |
| `MPT_MAX_RETRIES` | `3` | Max retries for reporting results |
| `MPT_LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |
| `MPT_TMUX_SESSION` | `mpt-team` | tmux session name for spawned agents |

### Spawn an Agent (`mpt spawn`)

Launch any configured harness with a prompt:

```bash
# Use default harness (claude-code)
node src/cli/spawn.mjs --prompt="Fix the bug in main.js"

# Specify harness
node src/cli/spawn.mjs --harness=pi --prompt="Refactor the auth module"
node src/cli/spawn.mjs --harness=codex --prompt="Add tests for utils"

# List available harnesses
node src/cli/spawn.mjs --list
```

### Project Config (`mpt.config.json`)

Optional config file in the project root for customizing harnesses:

```json
{
  "daemonUrl": "http://localhost:3100",
  "defaults": {
    "harness": "claude-code",
    "pollInterval": 5
  },
  "harnesses": {
    "claude-code": {
      "command": "/custom/path/to/claude",
      "env": { "CUSTOM_VAR": "value" }
    },
    "my-custom-agent": {
      "name": "my-custom-agent",
      "description": "My custom agent",
      "command": "my-agent",
      "args": ["--run", "{{prompt}}"],
      "capabilities": { "mcp": false, "midTaskComm": false, "fileEdit": true, "shell": true, "streaming": false },
      "env": {},
      "workDir": "{{workDir}}"
    }
  }
}
```

Template variables: `{{workDir}}`, `{{mcpConfigPath}}`, `{{mcpServerPath}}`, `{{prompt}}`, `{{taskId}}`, `{{agentId}}`, `{{agentsmd}}`

### Role-Based Tool Filtering

Each MCP server instance exposes tools based on `MPT_ROLE`:

| Tool | Leader | Teammate | Assistant |
|------|--------|----------|----------|
| `create_story` | ✅ | ❌ | ✅ |
| `edit_story` | ✅ | ❌ | ✅ |
| `add_task` | ✅ | ❌ | ✅ |
| `team_status` | ✅ | ❌ | ❌ |
| `queue_request` | ✅ | ❌ | ✅ |
| `save_memory` | ✅ | ❌ | ✅ |
| `search_memory` | ✅ | ✅ | ✅ |
| `upload_attachment` | ❌ | ✅ | ❌ |
| `get_next_work` | ❌ | ✅ | ❌ |
| `claim_task` | ❌ | ✅ | ❌ |
| `release_task` | ❌ | ✅ | ❌ |
| `post_comment` | ✅ | ✅ | ❌ |
| `report_token_usage` | ❌ | ✅ | ❌ |
| `spawn_agent` | ✅ | ❌ | ❌ |
| `dismiss_agent` | ✅ | ❌ | ❌ |
| `list_agents` | ✅ | ❌ | ❌ |

Spawned teammates automatically get `MPT_ROLE=teammate`. The leader's own MCP instance defaults to `MPT_ROLE=leader`.

### Configure in Claude Code

Add to your MCP config (`~/.config/claude/mcp.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "mpt": {
      "command": "node",
      "args": ["/path/to/mpt-mcp-server/src/index.mjs"]
    }
  }
}
```

### Configure in Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "mpt": {
      "command": "node",
      "args": ["/path/to/mpt-mcp-server/src/index.mjs"]
    }
  }
}
```

### Configure in Kiro

Add to your Kiro MCP settings with the same `command`/`args` pattern.

## Directory Structure

```
mpt-mcp-server/
├── README.md                 # This file
├── AGENTS.md                 # Instructions for AI agents
├── package.json              # Package manifest
├── docs/
│   ├── ARCHITECTURE.md       # Internal technical docs
│   └── DESIGN.md             # Design philosophy
├── src/
│   ├── index.mjs             # Entry point — starts stdio MCP server
│   ├── daemon-client.mjs     # HTTP client for daemon API
│   ├── tmux.mjs              # tmux session/window management helpers
│   ├── config/
│   │   ├── index.mjs         # Config public API
│   │   ├── harnesses.mjs     # Default harness definitions (pi, claude-code, codex)
│   │   └── loader.mjs        # Config file loader + merger
│   ├── cli/
│   │   └── spawn.mjs         # `mpt spawn --harness=X` command
│   ├── tools/
│   │   ├── registry.mjs      # Tool registry (list + dispatch)
│   │   ├── save_memory.mjs   # save_memory tool
│   │   ├── search_memory.mjs # search_memory tool
│   │   ├── upload_attachment.mjs
│   │   ├── create_story.mjs  # Create a story (leader)
│   │   ├── edit_story.mjs    # Update a story (leader)
│   │   ├── add_task.mjs      # Add task to story (leader)
│   │   ├── team_status.mjs   # Get team status summary
│   │   ├── queue_request.mjs # Queue async assistant request
│   │   ├── report_token_usage.mjs # Report token usage per task
│   │   ├── spawn_agent.mjs   # Spawn teammate in tmux window
│   │   ├── dismiss_agent.mjs # Stop teammate, close tmux window
│   │   ├── list_agents.mjs   # List active teammates
│   │   ├── get_next_work.mjs # Poll daemon for next task (workflow-aware)
│   │   ├── claim_task.mjs    # Claim task ownership
│   │   ├── release_task.mjs  # Release task back to pool
│   │   └── post_comment.mjs  # Post comment on a task
│   ├── runners/
│   │   ├── shared/
│   │   │   ├── loop.mjs      # Shared runner loop (register/poll/claim/transition/execute/release)
│   │   │   ├── config.mjs    # Common env var config loader
│   │   │   └── logger.mjs    # Structured JSON logger
│   │   ├── claude/
│   │   │   ├── runner.mjs    # Entry point (thin: imports shared loop + adapter)
│   │   │   └── adapter.mjs   # Claude-specific CLI wrapper (claude --print)
│   │   ├── kiro/
│   │   │   ├── runner.mjs    # Entry point (thin: imports shared loop + adapter)
│   │   │   └── adapter.mjs   # Kiro-specific CLI wrapper (kiro-cli chat)
│   │   └── codex/
│   │       ├── runner.mjs    # Entry point (thin: imports shared loop + adapter)
│   │       ├── adapter.mjs   # Codex-specific CLI wrapper (codex --auto-edit)
│   │       └── codex-runner.sh  # Legacy bash runner (deprecated)
└── tests/
    ├── tools.test.mjs        # MCP tool integration tests
    ├── tmux-tools.test.mjs   # tmux spawn/dismiss/list tool tests
    ├── shared-runner.test.mjs # Shared loop, adapters, and utilities
    ├── runner.test.mjs       # Claude runner component tests (legacy)
    ├── kiro-runner.test.mjs  # Kiro runner tests
    ├── codex-runner.test.sh  # Codex runner tests (legacy bash)
    ├── config.test.mjs       # Harness config tests
    ├── spawn.test.mjs        # Spawn CLI tests
    ├── integration.test.mjs  # Multi-harness integration tests
    └── helpers/
        ├── mock-daemon.mjs   # Mock HTTP daemon for tests
        └── mock-agents.mjs   # Simulated agent adapters
```

## Testing

```bash
npm test
```

## Requirements

- Node.js >= 20.0.0
- `@modelcontextprotocol/sdk` (installed via npm)
