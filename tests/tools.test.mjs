/**
 * tools.test.mjs — Tests for all MCP tools via the registry.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/store.mjs';
import { createToolRegistry } from '../src/tools/registry.mjs';

function setup() {
  const store = createStore();
  const registry = createToolRegistry(store);
  return { store, registry };
}

function parseResult(result) {
  return JSON.parse(result.content[0].text);
}

describe('save_memory', () => {
  test('saves a memory and returns id', async () => {
    const { registry } = setup();
    const result = await registry.callTool('save_memory', {
      content: 'Use kebab-case for file names',
      category: 'coding',
      tags: ['convention'],
    });
    const data = parseResult(result);
    assert.equal(data.saved, true);
    assert.ok(data.id);
    assert.equal(data.category, 'coding');
  });

  test('defaults category to general', async () => {
    const { registry } = setup();
    const result = await registry.callTool('save_memory', {
      content: 'Some note',
    });
    const data = parseResult(result);
    assert.equal(data.category, 'general');
  });
});

describe('search_memory', () => {
  test('finds matching memories by content', async () => {
    const { registry } = setup();
    await registry.callTool('save_memory', {
      content: 'Always use strict mode',
      category: 'coding',
    });
    await registry.callTool('save_memory', {
      content: 'Team standup at 9am',
      category: 'process',
    });

    const result = await registry.callTool('search_memory', {
      query: 'strict',
    });
    const data = parseResult(result);
    assert.equal(data.count, 1);
    assert.ok(data.results[0].content.includes('strict mode'));
  });

  test('filters by category', async () => {
    const { registry } = setup();
    await registry.callTool('save_memory', {
      content: 'Use TypeScript',
      category: 'coding',
    });
    await registry.callTool('save_memory', {
      content: 'Use clear language',
      category: 'writing',
    });

    const result = await registry.callTool('search_memory', {
      query: 'use',
      category: 'coding',
    });
    const data = parseResult(result);
    assert.equal(data.count, 1);
    assert.equal(data.results[0].category, 'coding');
  });

  test('respects limit', async () => {
    const { registry } = setup();
    for (let i = 0; i < 10; i++) {
      await registry.callTool('save_memory', { content: `item ${i}` });
    }
    const result = await registry.callTool('search_memory', {
      query: 'item',
      limit: 3,
    });
    const data = parseResult(result);
    assert.equal(data.count, 3);
  });
});

describe('upload_attachment', () => {
  test('stores attachment and returns id', async () => {
    const { registry } = setup();
    const result = await registry.callTool('upload_attachment', {
      filename: 'patch.diff',
      content: '--- a/file\n+++ b/file\n@@ stuff',
      taskId: 'task-1',
      message: 'Here is the diff',
    });
    const data = parseResult(result);
    assert.equal(data.uploaded, true);
    assert.equal(data.filename, 'patch.diff');
    assert.ok(data.id);
  });
});

describe('send_message', () => {
  test('sends message and returns id', async () => {
    const { registry } = setup();
    const result = await registry.callTool('send_message', {
      from: 'agent-a',
      to: 'agent-b',
      content: 'Ready for review',
    });
    const data = parseResult(result);
    assert.equal(data.sent, true);
    assert.equal(data.to, 'agent-b');
    assert.ok(data.id);
  });
});

describe('get_next_task', () => {
  test('returns null when no tasks', async () => {
    const { registry } = setup();
    const result = await registry.callTool('get_next_task', {});
    const data = parseResult(result);
    assert.equal(data.task, null);
  });

  test('returns first pending task', async () => {
    const { store, registry } = setup();
    store.addTask({ title: 'First task', assignee: 'agent-a' });
    store.addTask({ title: 'Second task', assignee: 'agent-a' });

    const result = await registry.callTool('get_next_task', {
      assignee: 'agent-a',
    });
    const data = parseResult(result);
    assert.equal(data.task.title, 'First task');
  });

  test('skips completed tasks', async () => {
    const { store, registry } = setup();
    const t1 = store.addTask({ title: 'Done task' });
    store.addTask({ title: 'Pending task' });
    store.reportComplete(t1.id, 'finished');

    const result = await registry.callTool('get_next_task', {});
    const data = parseResult(result);
    assert.equal(data.task.title, 'Pending task');
  });
});

describe('report_complete', () => {
  test('marks task complete', async () => {
    const { store, registry } = setup();
    const task = store.addTask({ title: 'My task' });

    const result = await registry.callTool('report_complete', {
      taskId: task.id,
      summary: 'All done',
    });
    const data = parseResult(result);
    assert.equal(data.completed, true);
    assert.equal(data.taskId, task.id);
    assert.ok(data.completedAt);

    // Verify task status changed
    assert.equal(store._tasks[0].status, 'complete');
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
