/**
 * tmux-tools.test.mjs — Tests for agent lifecycle and tmux utility tools.
 *
 * Tests exercise tool handlers with a mock daemon client.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

function createMockDaemonClient() {
  return {
    get url() { return 'http://localhost:7437'; },
    get id() { return 'test-agent'; },
    get hostId() { return 'test-host'; },
    async getStatus() { return { members: [{ id: 'agent-1', status: 'idle' }, { id: 'agent-2', status: 'working' }] }; },
    async dismissAgent() { return { dismissed: true }; },
    async createSpawnRequest(opts) { return { id: 'spawn-123', name: 'swift-ripley', hostId: 'test-host', status: 'pending', createdAt: new Date().toISOString() }; },
    async getSpawnRequests() { return { requests: [{ id: 'spawn-123', name: 'swift-ripley', status: 'pending' }] }; },
    async ackSpawnRequest() { return { success: true }; },
  };
}

describe('list_agents tool', () => {
  let tool;

  beforeEach(async () => {
    const client = createMockDaemonClient();
    const { listAgents } = await import('../src/tools/list_agents.mjs');
    tool = listAgents(client);
  });

  it('returns agents from daemon', async () => {
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(data.agents));
    assert.equal(data.agents.length, 2);
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

  it('dismisses via daemon', async () => {
    const result = await tool.handler({ name: 'agent-1' });
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.dismissed, true);
    assert.equal(data.name, 'agent-1');
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
    assert.deepEqual(tool.definition.inputSchema.required, []);
  });

  it('creates a spawn request', async () => {
    const result = await tool.handler({ reason: 'need help with auth refactor' });
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.requested, true);
    assert.equal(data.id, 'spawn-123');
    assert.equal(data.name, 'swift-ripley');
  });
});

describe('get_spawn_requests tool', () => {
  let tool;

  beforeEach(async () => {
    const client = createMockDaemonClient();
    const { getSpawnRequests } = await import('../src/tools/get_spawn_requests.mjs');
    tool = getSpawnRequests(client);
  });

  it('returns pending requests', async () => {
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);
    assert.ok(data.requests);
    assert.equal(data.requests[0].id, 'spawn-123');
  });
});

describe('ack_spawn_request tool', () => {
  let tool;

  beforeEach(async () => {
    const client = createMockDaemonClient();
    const { ackSpawnRequest } = await import('../src/tools/ack_spawn_request.mjs');
    tool = ackSpawnRequest(client);
  });

  it('requires requestId', () => {
    assert.deepEqual(tool.definition.inputSchema.required, ['requestId']);
  });

  it('acknowledges a request', async () => {
    const result = await tool.handler({ requestId: 'spawn-123' });
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.acknowledged, true);
  });
});
