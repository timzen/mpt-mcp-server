# Architecture

## Overview

mpt-mcp-server is a stdio-based MCP server that exposes team collaboration tools. It uses the official `@modelcontextprotocol/sdk` for protocol handling and a simple in-memory store for state.

## Module Map

```
src/index.mjs          → Entry point. Creates store, registry, MCP server. Connects stdio transport.
src/store.mjs          → In-memory data store with collections for memories, attachments, messages, tasks, completions.
src/tools/registry.mjs → Aggregates all tools, provides listTools() and callTool() interface.
src/tools/*.mjs        → Individual tool modules. Each exports a factory function that takes the store and returns {definition, handler}.
```

## Data Flow

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

## Design Decisions

- **Stdio transport**: Simplest integration path for all three target clients (Claude Code, Cursor, Kiro). No HTTP server, no ports to manage.
- **In-memory store**: Keeps the initial implementation simple. Can be swapped for file-based or DB-backed persistence later without changing the tool interface.
- **Tool factory pattern**: Each tool is a function that receives the store and returns `{definition, handler}`. This keeps tools testable and decoupled.
- **JSON responses**: All tool handlers return JSON-stringified text content. Consistent, parseable, and compatible with MCP protocol expectations.

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
