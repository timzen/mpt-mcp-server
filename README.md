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

### Start the server (stdio transport)

```bash
npm start
# or
node src/index.mjs
```

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
│   └── tools/
│       ├── registry.mjs      # Tool registry (list + dispatch)
│       ├── save_memory.mjs   # save_memory tool
│       ├── search_memory.mjs # search_memory tool
│       ├── upload_attachment.mjs
│       ├── report_complete.mjs
│       ├── send_message.mjs
│       └── get_next_task.mjs
└── tests/
    └── tools.test.mjs        # Tool integration tests
```

## Testing

```bash
npm test
```

## Requirements

- Node.js >= 20.0.0
- `@modelcontextprotocol/sdk` (installed via npm)
