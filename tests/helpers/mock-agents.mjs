/**
 * mock-agents.mjs — Simulated agent adapters for integration tests.
 *
 * Provides mock agent implementations that behave like real harnesses
 * (pi, claude-code, codex) but execute instantly with predictable results.
 * Each mock agent: polls for a task, "executes" it, reports completion.
 */

import { createStore } from '../../src/store.mjs';
import { createToolRegistry } from '../../src/tools/registry.mjs';

/**
 * Simulates a Pi agent with full MCP capabilities.
 * Uses the MCP tool registry directly (as Pi would via MCP protocol).
 */
export function createMockPiAgent(config) {
  const store = createStore();
  const registry = createToolRegistry(store);

  return {
    name: 'pi-agent',
    harness: 'pi',
    capabilities: { mcp: true, midTaskComm: true },

    /**
     * Simulate executing a task with MCP tool access.
     * The Pi agent can save memory, send messages, and report completion mid-task.
     */
    async executeTask(task) {
      // Simulate: search memory for context
      await registry.callTool('search_memory', { query: task.title });

      // Simulate: save a finding to memory
      await registry.callTool('save_memory', {
        content: `Working on: ${task.title}`,
        category: 'progress',
        tags: ['task', task.id],
      });

      // Simulate: send a status message mid-task
      await registry.callTool('send_message', {
        from: config.agentId,
        to: 'coordinator',
        content: `Started task ${task.id}: ${task.title}`,
      });

      // Simulate: do work (instant)
      const output = `Completed "${task.title}" — implemented the solution with tests.`;

      // Simulate: upload attachment
      await registry.callTool('upload_attachment', {
        filename: `${task.id}.diff`,
        content: `diff --git a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+new`,
        taskId: task.id,
        message: 'Changes for this task',
      });

      // Report completion via MCP
      await registry.callTool('report_complete', {
        taskId: task.id,
        summary: output,
      });

      return { status: 'success', output, exitCode: 0 };
    },

    /** Access the local tool registry for assertions */
    getRegistry() { return registry; },
    getStore() { return store; },
  };
}

/**
 * Simulates a Codex agent (fire-and-forget, no MCP).
 * No mid-task communication — just executes and returns.
 */
export function createMockCodexAgent(config) {
  return {
    name: 'codex-agent',
    harness: 'codex',
    capabilities: { mcp: false, midTaskComm: false },

    /**
     * Simulate executing a task without MCP.
     * Codex just does work and returns output — no tool calls.
     */
    async executeTask(task) {
      // Simulate: codex does the work in auto-edit mode
      const output = `Auto-edited files for "${task.title}". Changes applied.`;

      return { status: 'success', output, exitCode: 0 };
    },
  };
}

/**
 * Simulates a Kiro agent with MCP capabilities.
 * Similar to Claude Code but uses kiro-cli's MCP integration.
 */
export function createMockKiroAgent(config) {
  const store = createStore();
  const registry = createToolRegistry(store);

  return {
    name: 'kiro-agent',
    harness: 'kiro',
    capabilities: { mcp: true, midTaskComm: true },

    async executeTask(task) {
      // Kiro uses MCP tools during execution
      await registry.callTool('search_memory', { query: task.title });

      await registry.callTool('save_memory', {
        content: `Kiro working on: ${task.title}`,
        category: 'progress',
        tags: ['kiro', task.id],
      });

      const output = `Task "${task.title}" completed via Kiro CLI.`;

      await registry.callTool('report_complete', {
        taskId: task.id,
        summary: output,
      });

      return { status: 'success', output, exitCode: 0 };
    },

    getRegistry() { return registry; },
    getStore() { return store; },
  };
}

/**
 * Simulates a Claude Code agent with MCP but no streaming.
 */
export function createMockClaudeAgent(config) {
  const store = createStore();
  const registry = createToolRegistry(store);

  return {
    name: 'claude-agent',
    harness: 'claude-code',
    capabilities: { mcp: true, midTaskComm: true },

    async executeTask(task) {
      // Claude uses MCP tools during execution
      await registry.callTool('save_memory', {
        content: `Decision: ${task.title} approach chosen`,
        category: 'decision',
      });

      const output = `Task "${task.title}" completed via Claude Code.`;

      await registry.callTool('report_complete', {
        taskId: task.id,
        summary: output,
      });

      return { status: 'success', output, exitCode: 0 };
    },

    getRegistry() { return registry; },
    getStore() { return store; },
  };
}
