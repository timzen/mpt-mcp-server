# Design

## Philosophy

mpt-mcp-server is a thin MCP wrapper around the my-pizza-team daemon's HTTP API. It exposes daemon capabilities as MCP tools so any harness can participate in an mpt team.

## Principles

1. **Thin wrapper** — Each tool is a 1:1 proxy to a daemon HTTP endpoint. No business logic in this layer.

2. **Harness-agnostic** — Tools don't know or care what's calling them. Works with any MCP client.

3. **Daemon is the source of truth** — All state lives in the daemon. No local state. `MPT_DAEMON_URL` is required; fails fast if not set.

4. **Passive** — No loops, no polling, no scheduling. The harness drives its own lifecycle using whatever native mechanism it has.

5. **Composable** — Tools are independent. A leader can use planning tools without using tmux tools. A teammate can work without ever calling spawn tools.

## Rationale

### Why no runners?

Each harness has its own execution model. Pi has extensions. MeshClaw has cron/spawn_run. Kiro has persistent sessions. An external runner that puppeteers a harness:
- Duplicates lifecycle management the harness already provides
- Fights the harness's native session management
- Creates fragile process orchestration (detecting "done", crash recovery, etc.)

The better model: give the harness MCP tools + a skill/prompt that teaches the protocol, and let it self-drive.

### Why decouple spawn requesting from spawn fulfillment?

`spawn_agent` creates a *request*. A leader *fulfills* it. This separation means:
- Any agent can request a teammate (not just the leader)
- The leader decides *how* to spawn (its own mechanism, not prescribed)
- Multiple leaders on different hosts can fulfill requests for their own host
- The daemon is the coordination point, not this MCP server

### Why optional tmux tools?

Some leaders (Pi, simple scripts) use tmux for agent management. Others (MeshClaw) have their own spawning. Tmux tools are available but not coupled to agent lifecycle — they're just utilities.

### Why factory functions for tools?

Each tool module exports `(daemonClient) → {definition, handler}`. This:
- Makes dependencies explicit
- Keeps tools independently testable (inject a mock)
- Allows the registry to filter by role at creation time

### Why role-based filtering?

Different agents need different capabilities. A teammate shouldn't see `create_story` (confusing). A leader should see everything relevant. Filtering at the tool level (rather than in prompts) keeps context clean.

## Relationship to Other Integrations

| Integration | Model | Lifecycle Owner |
|-------------|-------|-----------------|
| pi-pizza-team | Pi extension (native) | Pi's extension framework |
| PizzaTeamMC | MeshClaw skills + this MCP server | MeshClaw's gateway (cron, spawn_run) |
| Direct MCP | Any harness + this MCP server | Harness-specific (scripts, prompts, etc.) |

All are first-class clients of the same daemon. A team can mix harnesses freely — they share tasks, comments, memory, and the spawn request queue.
