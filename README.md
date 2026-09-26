# mpt-mcp-server

An MCP (Model Context Protocol) server that exposes [my-pizza-team](https://github.com/timzen/my-pizza-team) daemon tools. Compatible with **any MCP-capable harness** — Claude Code, Cursor, Kiro, MeshClaw, Pi (via MCP config), and others.

## Tools

### Planning & Management (leader)

| Tool | Description |
|------|-------------|
| `create_story` | Create a new story (unit of plannable work with tasks) |
| `edit_story` | Update an existing story's details, status, or dependencies |
| `add_task` | Add a task to a story for teammates to execute |
| `team_status` | Get a summary of stories, tasks, and members |
| `queue_request` | Queue an async request for the assistant to process |

### Task Execution (teammate)

| Tool | Description |
|------|-------------|
| `get_next_work` | Poll daemon for next task with teammate-allowed transitions |
| `claim_task` | Claim a task and start working (daemon transitions to working state) |
| `release_task` | Release a task after work (daemon advances to next state) |
| `post_comment` | Post a comment on a task (status updates, questions) |
| `upload_attachment` | Upload a file artifact to a task |
| `report_token_usage` | Report token usage (input/output tokens) for a task |

### Memory (leader + teammate)

| Tool | Description |
|------|-------------|
| `save_memory` | Persist knowledge, decisions, or conventions to team memory |
| `search_memory` | Search team memory by keyword, with optional category filter |

### Agent Lifecycle (leader)

| Tool | Description |
|------|-------------|
| `spawn_agent` | Request that a leader spawn a new teammate (creates a spawn request) |
| `get_spawn_requests` | Poll for pending spawn requests (leader fulfills these) |
| `ack_spawn_request` | Acknowledge a spawn request has been fulfilled |
| `dismiss_agent` | Signal an agent to stop gracefully (via daemon heartbeat) |
| `list_agents` | List all registered agents and their status |

### Tmux Utilities (optional, all roles)

| Tool | Description |
|------|-------------|
| `tmux_spawn_window` | Spawn a command in a new tmux window |
| `tmux_list_windows` | List all windows in the tmux session |
| `tmux_kill_window` | Kill a tmux window by name |

Tmux tools are optional utilities — leaders that use tmux for agent management
can use these.

## Setup

```bash
npm install
```

## Usage

### As an MCP server (stdio transport)

```bash
node src/index.mjs
```

### In a harness MCP config

```json
{
  "mpt": {
    "command": "node",
    "args": ["/path/to/mpt-mcp-server/src/index.mjs"],
    "env": {
      "MPT_DAEMON_URL": "http://localhost:7437",
      "MPT_ROLE": "leader",
      "MPT_AGENT_ID": "my-agent"
    }
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MPT_DAEMON_URL` | — | **Required.** mpt daemon HTTP endpoint |
| `MPT_ROLE` | `leader` | Role: `leader`, `teammate`, or `assistant` |
| `MPT_AGENT_ID` | `mpt-agent-<pid>` | Unique agent identifier |
| `MPT_TMUX_SESSION` | `mpt-team` | tmux session name (for tmux tools) |

## Role-Based Tool Filtering

The `MPT_ROLE` env var controls which tools are exposed:

| Tool | leader | teammate | assistant |
|------|--------|----------|-----------|
| `create_story` | ✅ | ❌ | ✅ |
| `edit_story` | ✅ | ❌ | ✅ |
| `add_task` | ✅ | ❌ | ✅ |
| `team_status` | ✅ | ❌ | ❌ |
| `queue_request` | ✅ | ❌ | ✅ |
| `save_memory` | ✅ | ✅ | ✅ |
| `search_memory` | ✅ | ✅ | ✅ |
| `get_next_work` | ✅ | ✅ | ❌ |
| `claim_task` | ✅ | ✅ | ❌ |
| `release_task` | ✅ | ✅ | ❌ |
| `post_comment` | ✅ | ✅ | ❌ |
| `upload_attachment` | ❌ | ✅ | ❌ |
| `report_token_usage` | ❌ | ✅ | ❌ |
| `spawn_agent` | ✅ | ✅ | ❌ |
| `get_spawn_requests` | ✅ | ❌ | ❌ |
| `ack_spawn_request` | ✅ | ❌ | ❌ |
| `dismiss_agent` | ✅ | ❌ | ❌ |
| `list_agents` | ✅ | ❌ | ❌ |
| `tmux_*` | ✅ | ✅ | ✅ |

## Architecture

```
src/
├── index.mjs              # MCP server entry (stdio transport)
├── daemon-client.mjs      # HTTP client for mpt daemon API
├── tmux.mjs               # tmux session/window helpers (used by tmux tools)
└── tools/
    ├── registry.mjs       # Tool registry with role-based filtering
    ├── create_story.mjs   # POST /api/stories
    ├── edit_story.mjs     # PUT /api/stories/:id
    ├── add_task.mjs       # POST /api/stories/:id/tasks
    ├── team_status.mjs    # GET /api/status
    ├── queue_request.mjs  # POST /api/assistant/messages (assistant chat)
    ├── save_memory.mjs    # POST /api/assistant/notes
    ├── search_memory.mjs  # GET /api/assistant/notes/search
    ├── get_next_work.mjs  # GET /api/agents/next-work
    ├── claim_task.mjs     # POST /api/agents/claim/:id
    ├── release_task.mjs   # POST /api/agents/release/:id
    ├── post_comment.mjs   # POST /api/agents/comments/:id
    ├── upload_attachment.mjs  # POST /api/tasks/:id/attachments
    ├── report_token_usage.mjs # POST /api/tasks/:id/token-usage
    ├── spawn_agent.mjs    # POST /api/spawn-requests
    ├── get_spawn_requests.mjs # GET /api/spawn-requests
    ├── ack_spawn_request.mjs  # POST /api/spawn-requests/:id/ack
    ├── dismiss_agent.mjs  # POST /api/agents/:id/dismiss
    ├── list_agents.mjs    # GET /api/status (members)
    ├── tmux_spawn_window.mjs  # Local tmux utility
    ├── tmux_list_windows.mjs  # Local tmux utility
    └── tmux_kill_window.mjs   # Local tmux utility
```

## Harness Integration Patterns

### Self-driving

The harness has its own loop/scheduling and calls MCP tools directly:
- **Pi** → pi-pizza-team extension (native teammate loop)
- **MeshClaw** → PizzaTeamMC skills + cron (native subagent spawning)

### External script

For harnesses with no native loop, a shell script can drive the lifecycle:
```bash
while true; do
  TASK=$(call_mcp get_next_work)
  [ -z "$TASK" ] && sleep 5 && continue
  call_mcp claim_task "$TASK"
  # ... run harness ...
  call_mcp release_task "$TASK" "$RESULT"
done
```

## License

MIT
