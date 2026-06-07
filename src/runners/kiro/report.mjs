/**
 * report.mjs — Retained for backwards compatibility.
 *
 * The Kiro runner now uses daemon-client.mjs directly for reporting via
 * the agent protocol (POST /api/agents/transition). This re-export is
 * kept in case external code references it.
 */

export { reportResult } from '../claude/report.mjs';
