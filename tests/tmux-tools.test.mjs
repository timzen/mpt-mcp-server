/**
 * tmux-tools.test.mjs — Tests for spawn_agent, dismiss_agent, and list_agents tools.
 *
 * These tests exercise the tool handlers with a mock daemon client.
 * tmux operations are tested via error paths (tmux typically unavailable in CI).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

function createMockDaemonClient() {
  return {
    get url() { return 'http://localhost:7437'; },
    get id() { return 'test-agent'; },
    get hostId() { return 'test-host'; },
    async getStatus() { return { members: ['agent-1', 'agent-2'] }; },
    async dismissAgent() { return { dismissed: true }; },
  };
}

describe('list_agents tool', () => {
  let tool;

  beforeEach(async () => {
    const client = createMockDaemonClient();
    const { listAgents } = await import('../src/tools/list_agents.mjs');
    tool = listAgents(client);
  });

  it('returns session info and tmux windows', async () => {
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.session, 'mpt-team');
    assert.ok(Array.isArray(data.tmuxWindows));
    assert.ok(Array.isArray(data.daemonMembers));
  });
});

describe('dismiss_agent tool', () => {
  let tool;

  beforeEach(async () => {
    const client = createMockDaemonClient();
    const { dismissAgent } = await import('../src/tools/dismiss_agent.mjs');
    tool = dismissAgent(client);
  });

  it('has correct definition', () => {
    assert.equal(tool.definition.name, 'dismiss_agent');
    assert.deepEqual(tool.definition.inputSchema.required, ['name']);
  });
});

describe('spawn_agent tool', () => {
  let tool;

  beforeEach(async () => {
    const client = createMockDaemonClient();
    const { spawnAgent } = await import('../src/tools/spawn_agent.mjs');
    tool = spawnAgent(client);
  });

  it('has correct definition', () => {
    assert.equal(tool.definition.name, 'spawn_agent');
    assert.ok(tool.definition.description.includes('tmux'));
    assert.deepEqual(tool.definition.inputSchema.required, []);
  });

  it('accepts optional harness parameter', () => {
    assert.ok(tool.definition.inputSchema.properties.harness);
  });

  it('rejects unknown harness', () => {
    const result = tool.handler({
      harness: 'nonexistent-harness-xyz',
    });
    const data = JSON.parse(result.content[0].text);
    assert.ok(data.error);
    assert.ok(data.error.includes('Unknown harness'));
  });
});
