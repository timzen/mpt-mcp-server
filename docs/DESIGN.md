# Design

## Philosophy

mpt-mcp-server provides the minimal viable coordination layer for multi-agent teams. It's a shared "backplane" that agents connect to via MCP, enabling them to share knowledge, pass messages, and manage work items.

## Principles

1. **Simple over clever** — Stdio transport, in-memory store, plain JSON. No unnecessary abstraction layers.

2. **Tool-first** — Every capability is exposed as an MCP tool with a clear schema. No resources or prompts (yet) — just tools that agents can call.

3. **Stateless handlers** — Tool handlers are pure functions of (args → store → response). No hidden state, no side effects beyond the store.

4. **Test without the server** — The registry and store can be tested directly without spinning up the MCP protocol layer. Fast, reliable tests.

5. **Client-agnostic** — Works with any MCP client. No assumptions about Claude Code, Cursor, or Kiro internals — just standard MCP protocol over stdio.

## Rationale

### Why in-memory?

For the initial version, persistence isn't the hard problem — protocol integration is. An in-memory store lets us iterate on the tool interface without worrying about schema migrations or file corruption. Persistence can be added as a separate concern.

### Why one store, not per-tool state?

A shared store enables cross-tool queries (e.g., `get_next_task` can check completions). It also makes testing straightforward — inject one store, exercise multiple tools, assert on shared state.

### Why factory functions for tools?

Each tool module exports a factory `(store) → {definition, handler}`. This pattern:
- Makes dependencies explicit (just the store)
- Keeps tools independently testable
- Allows future tools to depend on additional services without changing the registry

### Why a separate runner process?

Claude Code doesn't have a built-in task loop. The runner provides the persistent loop that:
- Polls a daemon for work (decoupled from any specific task queue)
- Spawns claude in `--print` mode (non-interactive, clean output)
- Reports results back with retries
- Handles graceful shutdown via SIGINT/SIGTERM

This separation means the MCP server and the runner can evolve independently. The MCP server is the "toolbox" available during execution; the runner is the "scheduler" that drives the loop.

### Why `--print` mode?

`--print` gives us a single-shot, non-interactive execution with capturable stdout. This is simpler and more reliable than trying to drive an interactive session, and it's what the claude CLI was designed for in automation contexts.

### Why temp MCP config files?

The runner writes a temp `mcp.json` per invocation and passes it via `--mcp-config`. This avoids polluting the user's global or project MCP config, and ensures each session gets a clean configuration.
