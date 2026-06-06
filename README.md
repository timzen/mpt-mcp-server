# mpt-mcp-server

An MCP (Model Context Protocol) server that exposes team collaboration tools for multi-agent workflows. Compatible with **Claude Code**, **Cursor**, and **Kiro** via their MCP configuration.

## Tools

| Tool | Description |
|------|-------------|
| `save_memory` | Persist knowledge, decisions, or conventions to team memory |
| `search_memory` | Search team memory by keyword, with optional category filter |
| `upload_attachment` | Upload a file artifact (diff, report, etc.), optionally tied to a task |
| `report_complete` | Mark a task as complete with a summary |
| `send_message` | Send a message to another agent or team member |
| `get_next_task` | Retrieve the next pending task, optionally filtered by assignee |

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
node src/runner/runner.mjs
```

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MPT_DAEMON_URL` | `http://localhost:3100` | Daemon HTTP endpoint |
| `MPT_AGENT_ID` | `claude-agent-1` | This agent's identifier |
| `MPT_POLL_INTERVAL` | `5` | Seconds between polls when idle |
| `MPT_WORK_DIR` | Current directory | Working directory for claude sessions |
| `MPT_MCP_SERVER` | Auto-detected | Path to mpt-mcp-server entry point |
| `MPT_CLAUDE_BIN` | `claude` | Path to claude CLI binary (claude runner) |
| `MPT_CODEX_BIN` | `codex` | Path to codex CLI binary (codex runner) |
| `MPT_AGENTS_MD` | `./AGENTS.md` | Path to AGENTS.md for task context (codex runner) |
| `MPT_MAX_RETRIES` | `3` | Max retries for reporting results |
| `MPT_LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |

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
│   ├── store.mjs             # In-memory data store
│   ├── tools/
│   │   ├── registry.mjs      # Tool registry (list + dispatch)
│   │   ├── save_memory.mjs   # save_memory tool
│   │   ├── search_memory.mjs # search_memory tool
│   │   ├── upload_attachment.mjs
│   │   ├── report_complete.mjs
│   │   ├── send_message.mjs
│   │   └── get_next_task.mjs
│   ├── runner/
│   │   ├── runner.mjs        # Claude Code runner — poll/execute/report
│   │   ├── config.mjs        # Configuration from env vars
│   │   ├── poll.mjs          # Polls daemon for next task
│   │   ├── execute.mjs       # Launches claude CLI with MCP config
│   │   ├── report.mjs        # Reports results back to daemon
│   │   └── logger.mjs        # Structured JSON logger
│   └── runners/
│       └── codex-runner.sh   # Codex runner — shell-based poll/execute/report
└── tests/
    ├── tools.test.mjs        # MCP tool integration tests
    ├── runner.test.mjs       # Claude runner component tests
    └── codex-runner.test.sh  # Codex runner tests
```

## Testing

```bash
npm test
```

## Requirements

- Node.js >= 20.0.0
- `@modelcontextprotocol/sdk` (installed via npm)
