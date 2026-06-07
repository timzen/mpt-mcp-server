# Design

## Philosophy

mpt-mcp-server provides the minimal viable coordination layer for multi-agent teams. It’s the harness-agnostic alternative to pi-pizza-team: same daemon, same agent protocol, but delivered as a standalone MCP tool layer rather than a Pi extension. Any harness that supports MCP can participate.

It’s a shared “backplane” that agents connect to via MCP, enabling them to share knowledge, coordinate tasks, and manage work items through the my-pizza-team daemon.

## Principles

1. **Simple over clever** — Stdio transport, daemon-backed state, plain JSON. No unnecessary abstraction layers.

2. **Tool-first** — Every capability is exposed as an MCP tool with a clear schema. No resources or prompts (yet) — just tools that agents can call.

3. **Daemon is the source of truth** — All state lives in the my-pizza-team daemon. Tools delegate to daemon API calls. No local state that could go stale or be invisible to teammates.

4. **Test without the server** — The registry can be tested directly with a mock daemon client, without spinning up the MCP protocol layer or a real daemon. Fast, reliable tests.

5. **Client-agnostic** — Works with any MCP client. No assumptions about Claude Code, Cursor, or Kiro internals — just standard MCP protocol over stdio.

## Rationale

### Why daemon-first (no in-memory store)?

The in-memory store was removed because it created a false sense of functionality — tools appeared to work but data was lost on restart and invisible to the rest of the team. The daemon is always the source of truth. `MPT_DAEMON_URL` is required at startup; if it's not set, the server fails fast with a clear error message. This makes failures obvious rather than silent.

### Why not per-tool local state?

All state goes through the daemon API. This ensures cross-agent visibility (any agent can see any other agent's comments, memory notes, etc.) and survives process restarts. Testing uses a mock daemon client injected at the registry level.

### Why factory functions for tools?

Each tool module exports a factory `(daemonClient) → {definition, handler}`. This pattern:
- Makes dependencies explicit (just the daemon client)
- Keeps tools independently testable (inject a mock client)
- Allows future tools to depend on additional services without changing the registry

### Why a separate runner process?

Claude Code doesn't have a built-in task loop. The runner provides the persistent loop that:
- Polls a daemon for work (decoupled from any specific task queue)
- Spawns claude in `--print` mode (non-interactive, clean output)
- Reports results back with retries
- Handles graceful shutdown via SIGINT/SIGTERM

This separation means the MCP server and the runner can evolve independently. The MCP server is the "toolbox" available during execution; the runner is the "scheduler" that drives the loop.

### Why a shared runner loop with adapters?

The runner loop logic (poll, claim, transition, heartbeat, NEEDS_INPUT, dismissal) is identical across all harnesses. Only the actual CLI invocation differs. By extracting a shared loop that accepts a thin adapter, we:
- Eliminate copy-paste between runners (Claude and Kiro were 95% identical)
- Get automatic parity: new features (like NEEDS_INPUT detection) land once and work everywhere
- Make adding new harnesses trivial (~40 lines for an adapter)
- Allow the Codex runner to use the correct agent protocol (it was using a legacy API)

### Why `--print` mode?

`--print` gives us a single-shot, non-interactive execution with capturable stdout. This is simpler and more reliable than trying to drive an interactive session, and it's what the claude CLI was designed for in automation contexts.

### Why temp MCP config files?

The runner writes a temp `mcp.json` per invocation and passes it via `--mcp-config`. This avoids polluting the user's global or project MCP config, and ensures each session gets a clean configuration.

### Why tmux for team orchestration?

The core value proposition of mpt's leader/teammate model is **user observability and intervention**. tmux windows give each agent a real terminal that:
- Users can hop into at any time (`tmux select-window`)
- Shows live output so you can see what the agent is doing
- Accepts user input for course-correction or pairing
- Persists even if the user disconnects (tmux sessions survive)

This is fundamentally different from headless `child_process.spawn()` where output is piped and users can't interact. The tradeoff is requiring tmux on the host, which is acceptable for the developer audience.

### Why each teammate gets its own MCP server?

MCP uses stdio transport (stdin/stdout JSON-RPC), which is inherently 1:1 — one client per server process. Rather than fighting this with a shared HTTP transport, we embrace it: each agent spawns its own `mpt-mcp-server` instance. The daemon remains the shared state layer for cross-agent coordination (tasks, messages, memory).

## Relationship to pi-pizza-team

mpt-mcp-server and pi-pizza-team are two integration paths to the **same daemon** (my-pizza-team):

| | pi-pizza-team | mpt-mcp-server |
|--|---------------|----------------|
| Integration model | Pi Extension API | Standalone MCP server |
| Transport | Pi’s internal tool system | stdio JSON-RPC (MCP protocol) |
| Harness support | Pi only | Claude Code, Cursor, Kiro, Codex, any MCP client |
| TUI widgets | ✅ (toast notifications, status bar) | ❌ (no TUI) |
| Permission system | ✅ (Pi’s dynamic permissions) | ❌ (harnesses use `--dangerously-skip-permissions` or equivalent) |
| `pi.sendUserMessage` | ✅ (mid-task message injection) | ❌ (runners use CLI invocations) |
| Daemon protocol | Agent protocol (next-work/claim/transition/release) | Same |
| Workflow model | Multi-transition ownership | Same |
| State storage | Daemon | Same daemon |
| Role filtering | Leader/Teammate/Assistant | Same |

Both are first-class clients of the daemon. A team can mix Pi agents and mpt agents freely — they share the same task queue, stories, comments, and memory notes. The differences are purely in the integration surface, not the capabilities.
