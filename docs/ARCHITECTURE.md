# Architecture

## Overview

mpt-mcp-server is a stdio-based MCP server that exposes team collaboration tools for multi-agent workflows. It is the **harness-agnostic counterpart to pi-pizza-team** — same daemon, same agent protocol, same workflow model, but delivered as an MCP tool layer instead of a Pi extension. Any harness that supports MCP (Claude Code, Cursor, Kiro) or CLI invocation (Codex) can participate in the team.

It uses the official `@modelcontextprotocol/sdk` for protocol handling. All state lives in the my-pizza-team daemon — there is no in-memory store or standalone mode.

## Module Map

```
src/index.mjs              → Entry point. Validates MPT_DAEMON_URL (required), creates daemon client, registry, MCP server. Connects stdio transport.
src/daemon-client.mjs      → HTTP client for the my-pizza-team daemon API. Agent protocol: register, heartbeat, next-work, claim, transition, release, comments, notes, attachments.
src/tools/registry.mjs     → Aggregates all tools, provides listTools() and callTool() interface. Takes daemonClient + role. Filters tools based on MPT_ROLE (leader/teammate/assistant).
src/tools/*.mjs            → Individual tool modules. Each exports a factory function that takes the daemonClient and returns {definition, handler}.
src/tools/create_story.mjs → MCP tool: creates a story via POST /api/stories (leader).
src/tools/edit_story.mjs   → MCP tool: updates a story via PUT /api/stories/:storyId (leader).
src/tools/add_task.mjs     → MCP tool: adds a task to a story via POST /api/stories/:storyId/tasks (leader).
src/tools/team_status.mjs  → MCP tool: gets team status summary via GET /api/status (leader).
src/tools/queue_request.mjs → MCP tool: queues async assistant request via POST /api/assistant/queue.
src/tools/report_token_usage.mjs → MCP tool: reports token usage per task via POST /api/tasks/:taskId/token-usage.
src/runners/shared/loop.mjs    → Shared runner loop: register → poll → claim → transition → execute → transition → release. Heartbeat, NEEDS_INPUT, dismissal.
src/runners/shared/config.mjs  → Common env var loader (MPT_DAEMON_URL, MPT_AGENT_ID, MPT_POLL_INTERVAL, etc.).
src/runners/shared/logger.mjs  → Structured JSON logger to stderr. Respects MPT_LOG_LEVEL.
src/runners/claude/runner.mjs  → Thin entry point: imports shared loop + Claude adapter.
src/runners/claude/adapter.mjs → Claude adapter: wraps `claude --print --mcp-config`. supportsMcp: true.
src/runners/claude/config.mjs  → Claude-specific config (delegates to shared + adds claudeBinary).
src/runners/claude/execute.mjs → Legacy execute module (kept for backward compat, used by old tests).
src/runners/claude/report.mjs  → Legacy report module (POST /api/tasks/:id/complete, backward compat).
src/runners/claude/poll.mjs    → Legacy poll module (backward compat).
src/runners/kiro/runner.mjs    → Thin entry point: imports shared loop + Kiro adapter.
src/runners/kiro/adapter.mjs   → Kiro adapter: wraps `kiro-cli chat --no-interactive --trust-all-tools`. supportsMcp: true.
src/runners/kiro/config.mjs    → Kiro-specific config (delegates to shared + adds kiroBinary).
src/runners/kiro/execute.mjs   → Legacy execute module (kept for backward compat).
src/runners/codex/runner.mjs   → Thin entry point: imports shared loop + Codex adapter.
src/runners/codex/adapter.mjs  → Codex adapter: wraps `codex --auto-edit --quiet`. supportsMcp: false.
src/runners/codex/codex-runner.sh → Legacy bash runner (deprecated, uses wrong API and port).
src/tmux.mjs               → tmux session/window management. ensureSession, spawnWindow, dismissWindow, listWindows, hopToWindow.
src/tools/spawn_agent.mjs  → MCP tool: spawns a harness into a tmux window with its own MCP config.
src/tools/dismiss_agent.mjs → MCP tool: stops a teammate agent, closes its tmux window.
src/tools/list_agents.mjs  → MCP tool: lists active agents via tmux windows + daemon-registered members.
src/config/harnesses.mjs   → Default harness definitions: pi, claude-code, kiro, codex. Each defines command template, args, capabilities, env.
src/config/loader.mjs      → Loads mpt.config.json, merges with defaults. Exports loadMptConfig(), getHarness(), listHarnesses().
src/config/index.mjs       → Public API re-exports for the config module.
src/cli/spawn.mjs          → CLI command: `mpt spawn --harness=X --prompt=Y`. Resolves templates, generates MCP config, spawns harness.
```

## Data Flow

### MCP Server

```
Client (Claude/Cursor/Kiro)
  ↓ stdio (JSON-RPC)
MCP SDK Server
  ↓ ListToolsRequest → registry.listTools()
  ↓ CallToolRequest  → registry.callTool(name, args)
Tool handler
  ↓ calls daemon API via daemonClient
  ↓ returns {content: [{type: 'text', text: JSON}]}
MCP SDK Server
  ↓ stdio response
Client
```

### Task Runner (shared loop - all harnesses)

```
┌────────────────────────────────────────────────────────────────┐
│ shared/loop.mjs (same for Claude, Kiro, Codex)                │
│                                                                │
│  1. GET /api/agents/next-work → find unclaimed task            │
│  2. POST /api/agents/claim/:id → take ownership + start state  │
│  3. Build prompt from task + instructions + comments           │
│  4. Write MCP config (if adapter.supportsMcp)                  │
│  5. Call adapter.execute(prompt, config) → harness CLI         │
│  6. Check for NEEDS_INPUT: → post comment + release            │
│  7. POST /api/agents/release/:id → advance state + release     │
│  8. Loop back to step 1                                        │
│                                                                │
│  Heartbeat every 30s: POST /api/agents/heartbeat              │
│  Dismissal: heartbeat returns dismissed:true → stop loop      │
└────────────────────────────────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
    Daemon API                     Harness Adapter
  /api/agents/*                  (pluggable per harness)
  (my-pizza-team)                  │
                                   ├── Claude: claude --print --mcp-config
                                   ├── Kiro:   kiro-cli chat --no-interactive
                                   └── Codex:  codex --auto-edit --quiet
```

### Codex Runner (harness limitation)

Codex uses the same shared loop as Claude and Kiro but with `supportsMcp: false`.
No MCP tools are available during execution - context is provided entirely via
the prompt. The legacy bash runner (`codex-runner.sh`) is deprecated.

### Leader + Teammates (tmux-based)

```
┌──────────────────────────────────────────────────────────────┐
│ tmux session: "mpt-team"                                     │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │ [leader]        │  │ [swift-ripley]  │  │ [bold-kirk] │  │
│  │ Pi/Claude+MCP   │  │ Claude+MCP      │  │ Kiro+MCP    │  │
│  │                 │  │ (teammate)      │  │ (teammate)  │  │
│  │ spawn_agent ────┼──▶ spawned here    │  │ spawned here│  │
│  │ dismiss_agent   │  │                 │  │             │  │
│  │ list_agents     │  │                 │  │             │  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
│                                                              │
│  User can: tmux select-window -t mpt-team:<name>             │
│  to hop into any agent's window and pair/course-correct      │
└──────────────────────────────────────────────────────────────┘
         │                     │                    │
         ▼                     ▼                    ▼
    Each agent has          Daemon is the shared state layer
    its own MCP server      (tasks, comments, memory, attachments)
    instance (stdio 1:1)
```

The leader harness calls `spawn_agent` MCP tool → tmux.mjs creates a new window
→ harness command is sent via `tmux send-keys` → teammate runs with its own MCP.

## Design Decisions

- **Stdio transport**: Simplest integration path for all three target clients (Claude Code, Cursor, Kiro). No HTTP server, no ports to manage.
- **Daemon-first (no in-memory store)**: All state lives in the my-pizza-team daemon. `MPT_DAEMON_URL` is required at startup. This ensures data persists across restarts and is visible to the rest of the team.
- **Tool factory pattern**: Each tool is a function that receives the daemonClient and returns `{definition, handler}`. This keeps tools testable and decoupled.
- **JSON responses**: All tool handlers return JSON-stringified text content. Consistent, parseable, and compatible with MCP protocol expectations.
- **Runner as separate process**: The runner is a standalone loop that orchestrates harness CLI invocations. It doesn't embed the harness — it spawns it per-task-phase with `--print` mode for clean output capture.
- **Shared runner loop with adapter pattern**: All harnesses (Claude, Kiro, Codex) use the same shared loop (`runners/shared/loop.mjs`). Each harness provides only a thin adapter (~40 lines) with an `execute(prompt, config)` method. This eliminates code duplication and ensures all harnesses have parity (heartbeat, NEEDS_INPUT, dismissal, multi-phase).
- **Temp MCP config per session**: Each harness invocation gets a fresh temp MCP config file with daemon env vars, then it’s cleaned up. No persistent config pollution. Generated by the shared loop for adapters that declare `supportsMcp: true`.
- **Daemon API contract**: The runner uses the my-pizza-team daemon's agent protocol: `GET /api/agents/next-work`, `POST /api/agents/claim/:id`, `POST /api/agents/release/:id`, `POST /api/agents/heartbeat`. The daemon handles all workflow state transitions on claim and release.
- **Multi-transition ownership**: Teammates never hardcode workflow state names. They rely on `availableTransitions` from the daemon to know what moves are valid. When only lead-restricted transitions remain, the agent releases and waits.
- **Harness configuration**: Each harness (pi, claude-code, kiro, codex) is defined as a command template with capabilities metadata. Config can be extended via `mpt.config.json` for custom harnesses or overrides.
- **Template-based spawn**: The `mpt spawn` command resolves `{{variable}}` placeholders in harness args, making harness definitions declarative and portable.
- **tmux-based team orchestration**: The leader harness spawns teammates into tmux windows via MCP tools. This gives users visibility and the ability to hop into any agent's session to pair or course-correct. Each agent gets its own MCP server instance (stdio is 1:1), but shares state via the daemon.

## Harness System

Each harness definition includes:
- `command` - Binary to execute
- `args` - Argument template array with `{{variable}}` placeholders
- `capabilities` - Feature flags (mcp, midTaskComm, fileEdit, shell, streaming)
- `env` - Additional environment variables
- `workDir` - Working directory template

Config merge strategy:
1. Load `DEFAULT_HARNESSES` (built-in pi, claude-code, codex)
2. If `mpt.config.json` exists, merge its `harnesses` section (overrides by name, new entries added)
3. Capabilities are merged field-by-field (so you can override just `mcp: false`)

## API (MCP Tools)

### save_memory
- **Required**: `title` (string), `content` (string)
- **Optional**: `categories` (string[])
- Delegates to: `POST /api/assistant/notes`

### search_memory
- **Required**: `query` (string)
- **Optional**: `category` (string), `limit` (number)
- Delegates to: `GET /api/assistant/notes/search`

### upload_attachment
- **Required**: `taskId` (string), `filename` (string), `content` (string)
- **Optional**: `message` (string) - posts a comment alongside
- Delegates to: `POST /api/tasks/:taskId/attachments`

### create_story
- **Required**: `id` (string), `title` (string), `description` (string)
- **Optional**: `dependsOn` (string[]), `dir` (string), `workflow` (string)
- Delegates to: `POST /api/stories`

### edit_story
- **Required**: `storyId` (string)
- **Optional**: `title` (string), `description` (string), `status` (string), `dependsOn` (string[]), `dir` (string), `workflow` (string)
- Delegates to: `PUT /api/stories/:storyId`

### add_task
- **Required**: `storyId` (string), `title` (string), `description` (string)
- Delegates to: `POST /api/stories/:storyId/tasks`

### team_status
- No required parameters
- Delegates to: `GET /api/status`

### queue_request
- **Required**: `prompt` (string)
- Delegates to: `POST /api/assistant/queue`

### spawn_agent
- **Optional**: `harness` (string, default "claude-code"), `name` (string, auto-generated), `cwd` (string), `taskId` (string), `storyId` (string)

### dismiss_agent
- **Required**: `name` (string)

### list_agents
- No required parameters
- Shows local tmux windows + daemon-registered members

### get_next_work
- No required parameters
- Delegates to: `GET /api/agents/next-work`

### claim_task
- **Required**: `taskId` (string)
- Delegates to: `POST /api/agents/claim/:taskId`
- Daemon assigns ownership and transitions to working state

### release_task
- **Required**: `taskId` (string)
- **Optional**: `result` (string) — summary of work done
- Delegates to: `POST /api/agents/release/:taskId`
- Daemon advances to next state and releases ownership

### post_comment
- **Required**: `taskId` (string), `body` (string)
- **Optional**: `attachments` (array of `{name, size?, type?}`)
- Delegates to: `POST /api/agents/comments/:taskId`

### report_token_usage
- **Required**: `taskId` (string), `inputTokens` (number), `outputTokens` (number)
- **Optional**: `model` (string)
- Delegates to: `POST /api/tasks/:taskId/token-usage`
