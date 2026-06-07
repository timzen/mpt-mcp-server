/**
 * poll.mjs — Retained for backwards compatibility.
 *
 * The Kiro runner now uses daemon-client.mjs directly for polling via
 * the agent protocol (GET /api/agents/next-work). This re-export is
 * kept in case external code references it.
 */

export { pollForTask } from '../claude/poll.mjs';
