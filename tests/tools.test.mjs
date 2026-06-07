/**
 * tools.test.mjs — Tests for all MCP tools via the registry.
 *
 * Uses a mock daemon client to test tool behavior without a real daemon.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createToolRegistry } from '../src/tools/registry.mjs';

/**
 * Creates a mock daemon client that records calls and returns canned responses.
 */
function createMockDaemonClient(overrides = {}) {
  const calls = [];

  return {
    calls,
    get url() { return 'http://localhost:7437'; },
    get id() { return 'test-agent'; },
    get hostId() { return 'test-host'; },

    async saveNote(title, content, categories) {
      calls.push({ method: 'saveNote', args: { title, content, categories } });
      return { id: 'note-1', title, content, categories };
    },

    async searchNotes(query, category, limit) {
      calls.push({ method: 'searchNotes', args: { query, category, limit } });
      return overrides.searchNotesResult || { results: [], count: 0 };
    },

    async uploadAttachment(taskId, filename, content) {
      calls.push({ method: 'uploadAttachment', args: { taskId, filename, content } });
      return { id: 'att-1', name: filename };
    },

    async postComment(taskId, body) {
      calls.push({ method: 'postComment', args: { taskId, body } });
      return { id: 'comment-1', taskId, body };
    },

    async getNextWork() {
      calls.push({ method: 'getNextWork' });
      return overrides.nextWorkResult || { task: null };
    },

    async claimTask(taskId) {
      calls.push({ method: 'claimTask', args: { taskId } });
      return { success: true, availableTransitions: ['in_progress'] };
    },

    async transitionTask(taskId, targetState, result) {
      calls.push({ method: 'transitionTask', args: { taskId, targetState, result } });
      return { success: true, released: targetState === 'done' };
    },

    async releaseTask(taskId) {
      calls.push({ method: 'releaseTask', args: { taskId } });
      return { success: true };
    },

    async createStory(story) {
      calls.push({ method: 'createStory', args: story });
      return { id: story.id, ...story };
    },

    async updateStory(storyId, updates) {
      calls.push({ method: 'updateStory', args: { storyId, updates } });
      return { id: storyId, ...updates };
    },

    async createTask(storyId, title, description) {
      calls.push({ method: 'createTask', args: { storyId, title, description } });
      return { id: 'task-new-1', storyId, title, description };
    },

    async getStatus() {
      calls.push({ method: 'getStatus' });
      return overrides.statusResult || { stories: [], tasks: [], members: [], inbox: [] };
    },

    async enqueueAssistantRequest(prompt) {
      calls.push({ method: 'enqueueAssistantRequest', args: { prompt } });
      return { id: 'req-1', prompt };
    },

    async reportTokenUsage(taskId, usage) {
      calls.push({ method: 'reportTokenUsage', args: { taskId, ...usage } });
      return { id: 'usage-1', taskId };
    },

    async dismissAgent(targetAgentId) {
      calls.push({ method: 'dismissAgent', args: { targetAgentId } });
      return { dismissed: true };
    },
  };
}

function setup(overrides = {}) {
  const client = createMockDaemonClient(overrides);
  const registry = createToolRegistry(client);
  return { client, registry };
}

function setupWithRole(role, overrides = {}) {
  const client = createMockDaemonClient(overrides);
  const registry = createToolRegistry(client, { role });
  return { client, registry };
}

function parseResult(result) {
  return JSON.parse(result.content[0].text);
}

describe('save_memory', () => {
  test('saves a note via daemon and returns result', async () => {
    const { client, registry } = setup();
    const result = await registry.callTool('save_memory', {
      title: 'Convention: kebab-case',
      content: 'Use kebab-case for file names',
      categories: ['coding', 'convention'],
    });
    const data = parseResult(result);
    assert.equal(data.saved, true);
    assert.equal(data.id, 'note-1');
    assert.equal(data.title, 'Convention: kebab-case');
    assert.deepEqual(data.categories, ['coding', 'convention']);
    assert.equal(client.calls[0].method, 'saveNote');
  });

  test('defaults categories to ["general"]', async () => {
    const { client, registry } = setup();
    await registry.callTool('save_memory', {
      title: 'Some note',
      content: 'Some content',
    });
    assert.deepEqual(client.calls[0].args.categories, ['general']);
  });
});

describe('search_memory', () => {
  test('searches notes via daemon', async () => {
    const searchResult = { results: [{ title: 'Test', content: 'found' }], count: 1 };
    const { client, registry } = setup({ searchNotesResult: searchResult });
    const result = await registry.callTool('search_memory', { query: 'test' });
    const data = parseResult(result);
    assert.equal(data.count, 1);
    assert.equal(client.calls[0].method, 'searchNotes');
    assert.equal(client.calls[0].args.query, 'test');
  });

  test('passes category and limit to daemon', async () => {
    const { client, registry } = setup();
    await registry.callTool('search_memory', {
      query: 'test',
      category: 'coding',
      limit: 3,
    });
    assert.equal(client.calls[0].args.category, 'coding');
    assert.equal(client.calls[0].args.limit, 3);
  });
});

describe('upload_attachment', () => {
  test('uploads via daemon and returns result', async () => {
    const { client, registry } = setupWithRole('teammate');
    const result = await registry.callTool('upload_attachment', {
      taskId: 'task-1',
      filename: 'patch.diff',
      content: '--- a/file\n+++ b/file',
    });
    const data = parseResult(result);
    assert.equal(data.uploaded, true);
    assert.equal(data.filename, 'patch.diff');
    assert.equal(data.taskId, 'task-1');
    assert.equal(client.calls[0].method, 'uploadAttachment');
  });

  test('posts comment alongside when message provided', async () => {
    const { client, registry } = setupWithRole('teammate');
    await registry.callTool('upload_attachment', {
      taskId: 'task-1',
      filename: 'report.md',
      content: '# Report',
      message: 'Here is the report',
    });
    assert.equal(client.calls.length, 2);
    assert.equal(client.calls[1].method, 'postComment');
    assert.equal(client.calls[1].args.body, 'Here is the report');
  });
});

describe('get_next_work', () => {
  test('returns task from daemon', async () => {
    const nextWorkResult = { task: { id: 'task-1', title: 'Do thing' } };
    const { registry } = setupWithRole('teammate', { nextWorkResult });
    const result = await registry.callTool('get_next_work', {});
    const data = parseResult(result);
    assert.equal(data.task.id, 'task-1');
  });

  test('returns null when no work', async () => {
    const { registry } = setupWithRole('teammate');
    const result = await registry.callTool('get_next_work', {});
    const data = parseResult(result);
    assert.equal(data.task, null);
  });
});

describe('claim_task', () => {
  test('claims task via daemon', async () => {
    const { client, registry } = setupWithRole('teammate');
    const result = await registry.callTool('claim_task', { taskId: 'task-1' });
    const data = parseResult(result);
    assert.equal(data.success, true);
    assert.equal(client.calls[0].args.taskId, 'task-1');
  });
});

describe('transition_task', () => {
  test('transitions task via daemon', async () => {
    const { client, registry } = setupWithRole('teammate');
    const result = await registry.callTool('transition_task', {
      taskId: 'task-1',
      targetState: 'done',
      result: 'All finished',
    });
    const data = parseResult(result);
    assert.equal(data.success, true);
    assert.equal(data.released, true);
    assert.equal(client.calls[0].args.targetState, 'done');
  });
});

describe('release_task', () => {
  test('releases task via daemon', async () => {
    const { client, registry } = setupWithRole('teammate');
    const result = await registry.callTool('release_task', { taskId: 'task-1' });
    const data = parseResult(result);
    assert.equal(data.success, true);
    assert.equal(client.calls[0].args.taskId, 'task-1');
  });
});

describe('post_comment', () => {
  test('posts comment via daemon', async () => {
    const { client, registry } = setup();
    const result = await registry.callTool('post_comment', {
      taskId: 'task-1',
      body: 'Working on it',
    });
    const data = parseResult(result);
    assert.equal(data.id, 'comment-1');
    assert.equal(client.calls[0].args.body, 'Working on it');
  });
});

describe('registry error handling', () => {
  test('returns error for unknown tool', async () => {
    const { registry } = setup();
    const result = await registry.callTool('nonexistent', {});
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('Unknown tool'));
  });
});

describe('create_story', () => {
  test('creates story via daemon', async () => {
    const { client, registry } = setup();
    const result = await registry.callTool('create_story', {
      id: 'auth-refactor',
      title: 'Refactor Auth Module',
      description: 'Extract auth into a separate service',
      dependsOn: ['db-migration'],
      dir: '/src/auth',
      workflow: 'dev-review-deploy',
    });
    const data = parseResult(result);
    assert.equal(data.created, true);
    assert.equal(data.id, 'auth-refactor');
    assert.equal(client.calls[0].method, 'createStory');
    assert.equal(client.calls[0].args.id, 'auth-refactor');
    assert.deepEqual(client.calls[0].args.dependsOn, ['db-migration']);
  });

  test('omits optional fields when not provided', async () => {
    const { client, registry } = setup();
    await registry.callTool('create_story', {
      id: 'simple',
      title: 'Simple Story',
      description: 'No extras',
    });
    const args = client.calls[0].args;
    assert.equal(args.dependsOn, undefined);
    assert.equal(args.dir, undefined);
    assert.equal(args.workflow, undefined);
  });
});

describe('edit_story', () => {
  test('updates story via daemon', async () => {
    const { client, registry } = setup();
    const result = await registry.callTool('edit_story', {
      storyId: 'auth-refactor',
      title: 'Updated Title',
      status: 'in_progress',
    });
    const data = parseResult(result);
    assert.equal(data.updated, true);
    assert.equal(client.calls[0].method, 'updateStory');
    assert.equal(client.calls[0].args.storyId, 'auth-refactor');
    assert.equal(client.calls[0].args.updates.title, 'Updated Title');
    assert.equal(client.calls[0].args.updates.status, 'in_progress');
  });
});

describe('add_task', () => {
  test('creates task in story via daemon', async () => {
    const { client, registry } = setup();
    const result = await registry.callTool('add_task', {
      storyId: 'auth-refactor',
      title: 'Write unit tests',
      description: 'Add tests for the auth service',
    });
    const data = parseResult(result);
    assert.equal(data.created, true);
    assert.equal(data.id, 'task-new-1');
    assert.equal(client.calls[0].method, 'createTask');
    assert.equal(client.calls[0].args.storyId, 'auth-refactor');
    assert.equal(client.calls[0].args.title, 'Write unit tests');
  });
});

describe('team_status', () => {
  test('returns status from daemon', async () => {
    const statusResult = { stories: [{ id: 's1' }], tasks: [], members: ['agent-1'], inbox: [] };
    const { client, registry } = setup({ statusResult });
    const result = await registry.callTool('team_status', {});
    const data = parseResult(result);
    assert.equal(data.stories.length, 1);
    assert.deepEqual(data.members, ['agent-1']);
    assert.equal(client.calls[0].method, 'getStatus');
  });
});

describe('queue_request', () => {
  test('queues request via daemon', async () => {
    const { client, registry } = setup();
    const result = await registry.callTool('queue_request', {
      prompt: 'Research best practices for auth tokens',
    });
    const data = parseResult(result);
    assert.equal(data.queued, true);
    assert.equal(data.id, 'req-1');
    assert.equal(client.calls[0].method, 'enqueueAssistantRequest');
    assert.equal(client.calls[0].args.prompt, 'Research best practices for auth tokens');
  });
});

describe('role-based filtering', () => {
  test('leader has planning and management tools', () => {
    const { registry } = setupWithRole('leader');
    const names = registry.listTools().map((t) => t.name);
    assert.ok(names.includes('create_story'));
    assert.ok(names.includes('edit_story'));
    assert.ok(names.includes('add_task'));
    assert.ok(names.includes('team_status'));
    assert.ok(names.includes('spawn_agent'));
    assert.ok(names.includes('dismiss_agent'));
    assert.ok(names.includes('list_agents'));
    assert.ok(names.includes('save_memory'));
    assert.ok(names.includes('search_memory'));
    assert.ok(names.includes('post_comment'));
  });

  test('leader does NOT have workflow execution tools', () => {
    const { registry } = setupWithRole('leader');
    const names = registry.listTools().map((t) => t.name);
    assert.ok(!names.includes('get_next_work'));
    assert.ok(!names.includes('claim_task'));
    assert.ok(!names.includes('transition_task'));
    assert.ok(!names.includes('release_task'));
    assert.ok(!names.includes('upload_attachment'));
  });

  test('teammate has workflow tools', () => {
    const { registry } = setupWithRole('teammate');
    const names = registry.listTools().map((t) => t.name);
    assert.ok(names.includes('get_next_work'));
    assert.ok(names.includes('claim_task'));
    assert.ok(names.includes('transition_task'));
    assert.ok(names.includes('release_task'));
    assert.ok(names.includes('upload_attachment'));
    assert.ok(names.includes('post_comment'));
    assert.ok(names.includes('search_memory'));
  });

  test('teammate does NOT have planning or management tools', () => {
    const { registry } = setupWithRole('teammate');
    const names = registry.listTools().map((t) => t.name);
    assert.ok(!names.includes('create_story'));
    assert.ok(!names.includes('edit_story'));
    assert.ok(!names.includes('add_task'));
    assert.ok(!names.includes('team_status'));
    assert.ok(!names.includes('spawn_agent'));
    assert.ok(!names.includes('dismiss_agent'));
    assert.ok(!names.includes('save_memory'));
  });

  test('assistant has planning and memory tools', () => {
    const { registry } = setupWithRole('assistant');
    const names = registry.listTools().map((t) => t.name);
    assert.ok(names.includes('create_story'));
    assert.ok(names.includes('edit_story'));
    assert.ok(names.includes('add_task'));
    assert.ok(names.includes('queue_request'));
    assert.ok(names.includes('save_memory'));
    assert.ok(names.includes('search_memory'));
  });

  test('assistant does NOT have workflow or management tools', () => {
    const { registry } = setupWithRole('assistant');
    const names = registry.listTools().map((t) => t.name);
    assert.ok(!names.includes('get_next_work'));
    assert.ok(!names.includes('claim_task'));
    assert.ok(!names.includes('spawn_agent'));
    assert.ok(!names.includes('post_comment'));
    assert.ok(!names.includes('upload_attachment'));
    assert.ok(!names.includes('team_status'));
  });

  test('default role is leader', () => {
    const { registry } = setup();
    assert.equal(registry.role, 'leader');
  });

  test('filtered tools reject calls to unavailable tools', async () => {
    const { registry } = setupWithRole('teammate');
    const result = await registry.callTool('create_story', { id: 'x', title: 'X', description: 'X' });
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('Unknown tool'));
  });
});

describe('report_token_usage', () => {
  test('reports usage via daemon (teammate role)', async () => {
    const { client, registry } = setupWithRole('teammate');
    const result = await registry.callTool('report_token_usage', {
      taskId: 'task-1',
      inputTokens: 1500,
      outputTokens: 300,
      model: 'claude-sonnet-4-20250514',
    });
    const data = parseResult(result);
    assert.equal(data.reported, true);
    assert.equal(client.calls[0].method, 'reportTokenUsage');
    assert.equal(client.calls[0].args.taskId, 'task-1');
    assert.equal(client.calls[0].args.inputTokens, 1500);
    assert.equal(client.calls[0].args.outputTokens, 300);
    assert.equal(client.calls[0].args.model, 'claude-sonnet-4-20250514');
  });

  test('not available to leader role', () => {
    const { registry } = setupWithRole('leader');
    const names = registry.listTools().map((t) => t.name);
    assert.ok(!names.includes('report_token_usage'));
  });
});
