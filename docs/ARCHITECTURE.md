# Architecture

## Overview

mpt-mcp-server is a stdio-based MCP server that exposes team collaboration tools. It uses the official `@modelcontextprotocol/sdk` for protocol handling and a simple in-memory store for state.

## Module Map

```
src/index.mjs              → Entry point. Creates store, registry, MCP server. Connects stdio transport.
src/store.mjs              → In-memory data store with collections for memories, attachments, messages, tasks, completions.
src/tools/registry.mjs     → Aggregates all tools, provides listTools() and callTool() interface.
src/tools/*.mjs            → Individual tool modules. Each exports a factory function that takes the store and returns {definition, handler}.
src/runners/claude/runner.mjs  → Main loop: poll → execute → report. Handles SIGINT/SIGTERM gracefully.
src/runners/claude/config.mjs  → Loads configuration from environment variables.
src/runners/claude/poll.mjs    → GET /api/tasks/next from daemon. Returns task or null.
src/runners/claude/execute.mjs → Builds prompt, writes temp MCP config, spawns claude --print, captures output.
src/runners/claude/report.mjs  → POST /api/tasks/:id/complete to daemon with retries.
src/runners/claude/logger.mjs  → Structured JSON logger to stderr.
src/runners/codex/codex-runner.sh → Shell-based runner for Codex. Polls daemon, writes TASK.md + AGENTS.md, launches codex --auto-edit, reports result. Fire-and-forget.
src/config/harnesses.mjs   → Default harness definitions: pi, claude-code, codex. Each defines command template, args, capabilities, env.
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
  ↓ reads/writes store
  ↓ returns {content: [{type: 'text', text: JSON}]}
MCP SDK Server
  ↓ stdio response
Client
```

### Task Runner

```
┌─────────────────────────────────────────────┐
│ runner.mjs (persistent loop)                │
│                                             │
│  ┌─────────┐    ┌───────────┐    ┌───────┐  │
│  │ poll.mjs│───▶│execute.mjs│───▶│report │  │
│  │  GET    │    │  claude   │    │ POST  │  │
│  │  daemon │    │  --print  │    │daemon │  │
│  └─────────┘    └───────────┘    └───────┘  │
│       ▲                              │      │
│       └──────── loop ────────────────┘      │
└─────────────────────────────────────────────┘
         │                     │
         ▼                     ▼
    Daemon API           claude CLI
  /api/tasks/next       (with --mcp-config
  /api/tasks/:id/        pointing to
    complete              mpt-mcp-server)
```

### Codex Runner (shell-based)

```
┌─────────────────────────────────────────────────┐
│ codex-runner.sh (persistent loop)               │
│                                                 │
│  ┌──────────┐   ┌────────────┐   ┌──────────┐  │
│  │ poll     │──▶│ write ctx  │──▶│ codex    │  │
│  │ curl GET │   │ TASK.md +  │   │--auto-edit│  │
│  │ daemon   │   │ AGENTS.md  │   │ (fire&   │  │
│  └──────────┘   └────────────┘   │  forget) │  │
│       ▲                          └─────┬────┘  │
│       │         ┌────────────┐         │       │
│       └─────────│ report     │◀────────┘       │
│                 │ curl POST  │                 │
│                 │ daemon     │                 │
│                 └────────────┘                 │
└─────────────────────────────────────────────────┘
```

Key difference from the Claude runner: Codex has no MCP support, so context
is provided via files (TASK.md, AGENTS.md) written to a temp work directory.
No mid-task communication — purely fire-and-forget.

## Design Decisions

- **Stdio transport**: Simplest integration path for all three target clients (Claude Code, Cursor, Kiro). No HTTP server, no ports to manage.
- **In-memory store**: Keeps the initial implementation simple. Can be swapped for file-based or DB-backed persistence later without changing the tool interface.
- **Tool factory pattern**: Each tool is a function that receives the store and returns `{definition, handler}`. This keeps tools testable and decoupled.
- **JSON responses**: All tool handlers return JSON-stringified text content. Consistent, parseable, and compatible with MCP protocol expectations.
- **Runner as separate process**: The runner is a standalone loop that orchestrates claude CLI invocations. It doesn't embed claude — it spawns it per-task with `--print` mode for clean output capture.
- **Temp MCP config per session**: Each claude invocation gets a fresh temp MCP config file, then it's cleaned up. No persistent config pollution.
- **Daemon API contract**: The runner assumes a REST daemon at `MPT_DAEMON_URL` with `GET /api/tasks/next?assignee=X` and `POST /api/tasks/:id/complete`. This is a minimal contract that any daemon can implement.
- **Harness configuration**: Each harness (pi, claude-code, codex) is defined as a command template with capabilities metadata. Config can be extended via `mpt.config.json` for custom harnesses or overrides.
- **Template-based spawn**: The `mpt spawn` command resolves `{{variable}}` placeholders in harness args, making harness definitions declarative and portable.

## Harness System

Each harness definition includes:
- `command` — Binary to execute
- `args` — Argument template array with `{{variable}}` placeholders
- `capabilities` — Feature flags (mcp, midTaskComm, fileEdit, shell, streaming)
- `env` — Additional environment variables
- `workDir` — Working directory template

Config merge strategy:
1. Load `DEFAULT_HARNESSES` (built-in pi, claude-code, codex)
2. If `mpt.config.json` exists, merge its `harnesses` section (overrides by name, new entries added)
3. Capabilities are merged field-by-field (so you can override just `mcp: false`)

## API (MCP Tools)

### save_memory
- **Required**: `content` (string)
- **Optional**: `category` (string), `tags` (string[])

### search_memory
- **Required**: `query` (string)
- **Optional**: `category` (string), `limit` (number)

### upload_attachment
- **Required**: `filename` (string), `content` (string)
- **Optional**: `taskId` (string), `message` (string)

### report_complete
- **Required**: `taskId` (string), `summary` (string)

### send_message
- **Required**: `from` (string), `to` (string), `content` (string)

### get_next_task
- **Optional**: `assignee` (string)
