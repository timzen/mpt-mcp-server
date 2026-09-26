# Architecture

## Overview

mpt-mcp-server is a stdio-based MCP server that wraps the my-pizza-team daemon's HTTP API as MCP tools. Any harness that supports MCP can use it to participate in an mpt team.

It uses the official `@modelcontextprotocol/sdk` for protocol handling. All state lives in the my-pizza-team daemon — there is no local store.

## Module Map

```
src/
├── index.mjs              # Entry point: validates env, creates client + registry, connects stdio
├── daemon-client.mjs      # HTTP client for the mpt daemon API
├── tmux.mjs               # tmux session/window helpers (used by optional tmux tools)
└── tools/
    ├── registry.mjs       # Tool registry with role-based filtering
    │
    │  ─── Planning & Management ───
    ├── create_story.mjs   # POST /api/stories
    ├── edit_story.mjs     # PUT /api/stories/:id
    ├── add_task.mjs       # POST /api/stories/:id/tasks
    ├── team_status.mjs    # GET /api/status
    ├── queue_request.mjs  # POST /api/assistant/messages (assistant chat)
    │
    │  ─── Memory ───
    ├── save_memory.mjs    # POST /api/assistant/notes
    ├── search_memory.mjs  # GET /api/assistant/notes/search
    │
    │  ─── Task Execution ───
    ├── get_next_work.mjs  # GET /api/agents/next-work
    ├── claim_task.mjs     # POST /api/agents/claim/:id
    ├── release_task.mjs   # POST /api/agents/release/:id
    ├── post_comment.mjs   # POST /api/agents/comments/:id
    ├── upload_attachment.mjs   # POST /api/tasks/:id/attachments
    ├── report_token_usage.mjs  # POST /api/tasks/:id/token-usage
    │
    │  ─── Agent Lifecycle ───
    ├── spawn_agent.mjs        # POST /api/spawn-requests
    ├── get_spawn_requests.mjs # GET /api/spawn-requests
    ├── ack_spawn_request.mjs  # POST /api/spawn-requests/:id/ack
    ├── dismiss_agent.mjs      # POST /api/agents/:id/dismiss
    ├── list_agents.mjs        # GET /api/status (members)
    │
    │  ─── Tmux Utilities (optional) ───
    ├── tmux_spawn_window.mjs  # Local: create tmux window
    ├── tmux_list_windows.mjs  # Local: list tmux windows
    └── tmux_kill_window.mjs   # Local: kill tmux window
```

## Data Flow

```
Harness (MeshClaw, Claude Code, Kiro, Pi, etc.)
  ↓ stdio (JSON-RPC)
MCP SDK Server (src/index.mjs)
  ↓ ListToolsRequest → registry.listTools() (filtered by role)
  ↓ CallToolRequest  → registry.callTool(name, args)
Tool handler (src/tools/*.mjs)
  ↓ HTTP request to daemon via daemonClient
  ↓ returns {content: [{type: 'text', text: JSON}]}
MCP SDK Server
  ↓ stdio response
Harness
```

## Spawn Request Protocol

The spawn system decouples "requesting a teammate" from "fulfilling the request":

```
1. Anyone calls spawn_agent → POST /api/spawn-requests
   (daemon creates a pending request with a generated name)

2. Leader polls get_spawn_requests → GET /api/spawn-requests?hostId=X
   (leader sees pending requests for its host)

3. Leader spawns an agent using its own native mechanism
   (MeshClaw: spawn_run, Pi: tmux window, etc.)

4. Leader calls ack_spawn_request → POST /api/spawn-requests/:id/ack
   (daemon marks request as fulfilled)
```

## Role-Based Filtering

The `MPT_ROLE` env var determines which tools are exposed. The registry
filters tools at creation time — unavailable tools return "Unknown tool" errors.

See README.md for the full access matrix.

## Design Decisions

- **Stdio transport**: Simplest integration for all MCP clients. No HTTP server, no ports.
- **Daemon-first**: All state in the daemon. `MPT_DAEMON_URL` required at startup.
- **Tool factory pattern**: Each tool is `(daemonClient) → {definition, handler}`. Testable, decoupled.
- **JSON responses**: All handlers return JSON-stringified text content.
- **No loops or polling**: The harness drives its own lifecycle. This server is passive.
- **No harness knowledge**: Tools don't know or care what's calling them.
- **Tmux as optional utility**: Tmux tools are available but not required. Leaders with their own spawning (MeshClaw, Pi) can ignore them.
- **Spawn request decoupling**: `spawn_agent` creates a request; fulfillment is separate. This lets any leader implementation handle spawning its own way.
