/**
 * integration.test.mjs — Integration tests with multiple harnesses.
 *
 * Tests the full task lifecycle:
 * 1. Start mock daemon
 * 2. Create a story with tasks assigned to different agents
 * 3. Simulate agents polling, executing, and reporting
 * 4. Verify task distribution, completion, and cross-agent messaging
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startMockDaemon } from './helpers/mock-daemon.mjs';
import {
  createMockPiAgent,
  createMockCodexAgent,
  createMockClaudeAgent,
  createMockKiroAgent,
} from './helpers/mock-agents.mjs';

let daemon;

beforeEach(async () => {
  daemon = await startMockDaemon();
});

afterEach(async () => {
  await daemon.close();
});

// ─── Helper: simulate agent poll → execute → report cycle ───────────────────

async function agentCycle(agent, daemonUrl, agentId) {
  // 1. Poll for next task
  const pollRes = await fetch(
    `${daemonUrl}/api/tasks/next?assignee=${encodeURIComponent(agentId)}`
  );

  if (pollRes.status === 204) return null;

  const task = await pollRes.json();

  // 2. Execute task
  const result = await agent.executeTask(task);

  // 3. Report completion to daemon
  await fetch(`${daemonUrl}/api/tasks/${task.id}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId,
      taskId: task.id,
      status: result.status,
      summary: result.output,
      output: result.output,
      exitCode: result.exitCode,
      completedAt: new Date().toISOString(),
    }),
  });

  return { task, result };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Integration: Story creation and task distribution', () => {
  test('creates a story with tasks assigned to different agents', async () => {
    const res = await fetch(`${daemon.url}/api/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Build authentication module',
        tasks: [
          { title: 'Design auth schema', assignee: 'pi-agent-1' },
          { title: 'Implement login endpoint', assignee: 'claude-agent-1' },
          { title: 'Add auth tests', assignee: 'codex-agent-1' },
        ],
      }),
    });

    assert.equal(res.status, 201);
    const story = await res.json();

    assert.equal(story.title, 'Build authentication module');
    assert.equal(story.tasks.length, 3);
    assert.equal(story.tasks[0].assignee, 'pi-agent-1');
    assert.equal(story.tasks[1].assignee, 'claude-agent-1');
    assert.equal(story.tasks[2].assignee, 'codex-agent-1');

    // All tasks start pending
    for (const task of story.tasks) {
      assert.equal(task.status, 'pending');
    }
  });

  test('tasks are distributed to correct agents on poll', async () => {
    // Create story
    await fetch(`${daemon.url}/api/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Multi-agent story',
        tasks: [
          { title: 'Task for Pi', assignee: 'pi-agent-1' },
          { title: 'Task for Codex', assignee: 'codex-agent-1' },
          { title: 'Task for Claude', assignee: 'claude-agent-1' },
        ],
      }),
    });

    // Pi agent polls — gets its task
    const piPoll = await fetch(`${daemon.url}/api/tasks/next?assignee=pi-agent-1`);
    assert.equal(piPoll.status, 200);
    const piTask = await piPoll.json();
    assert.equal(piTask.title, 'Task for Pi');

    // Codex agent polls — gets its task
    const codexPoll = await fetch(`${daemon.url}/api/tasks/next?assignee=codex-agent-1`);
    assert.equal(codexPoll.status, 200);
    const codexTask = await codexPoll.json();
    assert.equal(codexTask.title, 'Task for Codex');

    // Claude agent polls — gets its task
    const claudePoll = await fetch(`${daemon.url}/api/tasks/next?assignee=claude-agent-1`);
    assert.equal(claudePoll.status, 200);
    const claudeTask = await claudePoll.json();
    assert.equal(claudeTask.title, 'Task for Claude');

    // All agents poll again — no more tasks
    const piPoll2 = await fetch(`${daemon.url}/api/tasks/next?assignee=pi-agent-1`);
    assert.equal(piPoll2.status, 204);
  });
});

describe('Integration: Full task lifecycle with Pi agent (MCP)', () => {
  test('Pi agent polls, executes with MCP tools, reports completion', async () => {
    const piAgent = createMockPiAgent({ agentId: 'pi-agent-1' });

    // Create story
    await fetch(`${daemon.url}/api/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Pi story',
        tasks: [{ title: 'Implement feature X', assignee: 'pi-agent-1' }],
      }),
    });

    // Run agent cycle
    const outcome = await agentCycle(piAgent, daemon.url, 'pi-agent-1');

    assert.ok(outcome);
    assert.equal(outcome.result.status, 'success');
    assert.ok(outcome.result.output.includes('Implement feature X'));

    // Verify daemon received completion
    assert.equal(daemon.state.completions.length, 1);
    assert.equal(daemon.state.completions[0].taskId, outcome.task.id);
    assert.equal(daemon.state.completions[0].status, 'success');

    // Verify task marked complete in daemon
    const task = daemon.state.tasks.find((t) => t.id === outcome.task.id);
    assert.equal(task.status, 'complete');

    // Verify Pi agent used MCP tools (local store)
    const store = piAgent.getStore();
    assert.ok(store._memories.length > 0, 'Pi agent saved memory');
    assert.ok(store._attachments.length > 0, 'Pi agent uploaded attachment');
    assert.ok(store._completions.length > 0, 'Pi agent called report_complete');
  });
});

describe('Integration: Full task lifecycle with Codex agent (no MCP)', () => {
  test('Codex agent polls, executes fire-and-forget, reports completion', async () => {
    const codexAgent = createMockCodexAgent({ agentId: 'codex-agent-1' });

    // Create story
    await fetch(`${daemon.url}/api/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Codex story',
        tasks: [{ title: 'Auto-fix linting issues', assignee: 'codex-agent-1' }],
      }),
    });

    // Run agent cycle
    const outcome = await agentCycle(codexAgent, daemon.url, 'codex-agent-1');

    assert.ok(outcome);
    assert.equal(outcome.result.status, 'success');
    assert.ok(outcome.result.output.includes('Auto-fix linting issues'));

    // Verify daemon received completion
    assert.equal(daemon.state.completions.length, 1);
    assert.equal(daemon.state.completions[0].status, 'success');

    // Codex has no local store — fire-and-forget
    assert.equal(codexAgent.capabilities.mcp, false);
  });
});

describe('Integration: Full task lifecycle with Claude Code agent', () => {
  test('Claude agent uses MCP tools and reports completion', async () => {
    const claudeAgent = createMockClaudeAgent({ agentId: 'claude-agent-1' });

    await fetch(`${daemon.url}/api/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Claude story',
        tasks: [{ title: 'Refactor auth module', assignee: 'claude-agent-1' }],
      }),
    });

    const outcome = await agentCycle(claudeAgent, daemon.url, 'claude-agent-1');

    assert.ok(outcome);
    assert.equal(outcome.result.status, 'success');

    // Verify Claude used MCP (local store)
    const store = claudeAgent.getStore();
    assert.ok(store._memories.length > 0, 'Claude saved decision to memory');
    assert.ok(store._completions.length > 0, 'Claude called report_complete');
  });
});

describe('Integration: Full task lifecycle with Kiro agent (MCP)', () => {
  test('Kiro agent polls, uses MCP tools, reports completion', async () => {
    const kiroAgent = createMockKiroAgent({ agentId: 'kiro-agent-1' });

    await fetch(`${daemon.url}/api/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Kiro story',
        tasks: [{ title: 'Build dashboard widget', assignee: 'kiro-agent-1' }],
      }),
    });

    const outcome = await agentCycle(kiroAgent, daemon.url, 'kiro-agent-1');

    assert.ok(outcome);
    assert.equal(outcome.result.status, 'success');
    assert.ok(outcome.result.output.includes('Build dashboard widget'));

    // Verify daemon received completion
    assert.equal(daemon.state.completions.length, 1);
    assert.equal(daemon.state.completions[0].status, 'success');

    // Verify Kiro used MCP (local store)
    const store = kiroAgent.getStore();
    assert.ok(store._memories.length > 0, 'Kiro saved memory');
    assert.ok(store._completions.length > 0, 'Kiro called report_complete');
  });
});

describe('Integration: Multi-agent collaboration on a story', () => {
  test('four agents complete all tasks in a story', async () => {
    const piAgent = createMockPiAgent({ agentId: 'pi-agent-1' });
    const claudeAgent = createMockClaudeAgent({ agentId: 'claude-agent-1' });
    const codexAgent = createMockCodexAgent({ agentId: 'codex-agent-1' });
    const kiroAgent = createMockKiroAgent({ agentId: 'kiro-agent-1' });

    // Create a story with 4 tasks for different agents
    const storyRes = await fetch(`${daemon.url}/api/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Build user dashboard',
        tasks: [
          { title: 'Design DB schema', assignee: 'pi-agent-1', description: 'Create tables' },
          { title: 'Build API routes', assignee: 'claude-agent-1', description: 'REST endpoints' },
          { title: 'Add unit tests', assignee: 'codex-agent-1', description: 'Test coverage' },
          { title: 'Build UI components', assignee: 'kiro-agent-1', description: 'React widgets' },
        ],
      }),
    });
    const story = await storyRes.json();
    assert.equal(story.tasks.length, 4);

    // All four agents execute concurrently
    const [piResult, claudeResult, codexResult, kiroResult] = await Promise.all([
      agentCycle(piAgent, daemon.url, 'pi-agent-1'),
      agentCycle(claudeAgent, daemon.url, 'claude-agent-1'),
      agentCycle(codexAgent, daemon.url, 'codex-agent-1'),
      agentCycle(kiroAgent, daemon.url, 'kiro-agent-1'),
    ]);

    // All succeeded
    assert.equal(piResult.result.status, 'success');
    assert.equal(claudeResult.result.status, 'success');
    assert.equal(codexResult.result.status, 'success');
    assert.equal(kiroResult.result.status, 'success');

    // All tasks completed in daemon
    assert.equal(daemon.state.completions.length, 4);
    const allComplete = daemon.state.tasks.every((t) => t.status === 'complete');
    assert.ok(allComplete, 'All tasks should be complete');

    // Each agent got the right task
    assert.equal(piResult.task.title, 'Design DB schema');
    assert.equal(claudeResult.task.title, 'Build API routes');
    assert.equal(codexResult.task.title, 'Add unit tests');
    assert.equal(kiroResult.task.title, 'Build UI components');
  });

  test('agents with different capabilities produce different artifacts', async () => {
    const piAgent = createMockPiAgent({ agentId: 'pi-agent-1' });
    const codexAgent = createMockCodexAgent({ agentId: 'codex-agent-1' });

    await fetch(`${daemon.url}/api/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Capability test',
        tasks: [
          { title: 'MCP task', assignee: 'pi-agent-1' },
          { title: 'No-MCP task', assignee: 'codex-agent-1' },
        ],
      }),
    });

    await agentCycle(piAgent, daemon.url, 'pi-agent-1');
    await agentCycle(codexAgent, daemon.url, 'codex-agent-1');

    // Pi agent produced MCP artifacts (memory, attachments, messages)
    const piStore = piAgent.getStore();
    assert.ok(piStore._memories.length > 0, 'Pi used save_memory');
    assert.ok(piStore._attachments.length > 0, 'Pi used upload_attachment');
    assert.ok(piStore._messages.length > 0, 'Pi used send_message');

    // Codex agent has no MCP — no local artifacts
    assert.equal(codexAgent.capabilities.mcp, false);
    assert.equal(codexAgent.capabilities.midTaskComm, false);
  });
});

describe('Integration: Cross-agent messaging via daemon', () => {
  test('agents can exchange messages through the daemon', async () => {
    // Agent 1 sends a message
    const sendRes = await fetch(`${daemon.url}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'pi-agent-1',
        to: 'claude-agent-1',
        content: 'Schema is ready, you can start on API routes',
      }),
    });
    assert.equal(sendRes.status, 201);

    // Agent 2 sends a reply
    await fetch(`${daemon.url}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'claude-agent-1',
        to: 'pi-agent-1',
        content: 'Got it, starting now',
      }),
    });

    // Verify messages in daemon
    const msgsRes = await fetch(`${daemon.url}/api/messages`);
    const msgs = await msgsRes.json();
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].from, 'pi-agent-1');
    assert.equal(msgs[0].to, 'claude-agent-1');
    assert.equal(msgs[1].from, 'claude-agent-1');
    assert.equal(msgs[1].to, 'pi-agent-1');
  });
});

describe('Integration: Task queue behavior', () => {
  test('polling returns 204 when no tasks available', async () => {
    const res = await fetch(`${daemon.url}/api/tasks/next?assignee=ghost-agent`);
    assert.equal(res.status, 204);
  });

  test('task not double-dispatched after poll', async () => {
    await fetch(`${daemon.url}/api/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Single task story',
        tasks: [{ title: 'Only one task', assignee: 'agent-1' }],
      }),
    });

    // First poll gets the task
    const res1 = await fetch(`${daemon.url}/api/tasks/next?assignee=agent-1`);
    assert.equal(res1.status, 200);

    // Second poll — task is now in-progress, not returned again
    const res2 = await fetch(`${daemon.url}/api/tasks/next?assignee=agent-1`);
    assert.equal(res2.status, 204);
  });

  test('multiple tasks dispatched in order', async () => {
    await fetch(`${daemon.url}/api/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Ordered story',
        tasks: [
          { title: 'First', assignee: 'agent-1' },
          { title: 'Second', assignee: 'agent-1' },
          { title: 'Third', assignee: 'agent-1' },
        ],
      }),
    });

    const res1 = await fetch(`${daemon.url}/api/tasks/next?assignee=agent-1`);
    const task1 = await res1.json();
    assert.equal(task1.title, 'First');

    const res2 = await fetch(`${daemon.url}/api/tasks/next?assignee=agent-1`);
    const task2 = await res2.json();
    assert.equal(task2.title, 'Second');

    const res3 = await fetch(`${daemon.url}/api/tasks/next?assignee=agent-1`);
    const task3 = await res3.json();
    assert.equal(task3.title, 'Third');

    // No more
    const res4 = await fetch(`${daemon.url}/api/tasks/next?assignee=agent-1`);
    assert.equal(res4.status, 204);
  });
});

describe('Integration: End-to-end with runner poll module', () => {
  test('pollForTask works against mock daemon', async () => {
    const { pollForTask } = await import('../src/runners/claude/poll.mjs');

    // Create a task
    await fetch(`${daemon.url}/api/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Runner test',
        tasks: [{ title: 'Poll test task', assignee: 'runner-agent' }],
      }),
    });

    // Use actual pollForTask with mock daemon
    const config = { daemonUrl: daemon.url, agentId: 'runner-agent' };
    const task = await pollForTask(config);

    assert.ok(task);
    assert.equal(task.title, 'Poll test task');
    assert.ok(task.id);
  });

  test('reportResult works against mock daemon', async () => {
    const { reportResult } = await import('../src/runners/claude/report.mjs');

    // Create a task first
    await fetch(`${daemon.url}/api/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Report test',
        tasks: [{ title: 'Report test task', assignee: 'runner-agent' }],
      }),
    });

    const pollRes = await fetch(`${daemon.url}/api/tasks/next?assignee=runner-agent`);
    const task = await pollRes.json();

    // Use actual reportResult
    const config = { daemonUrl: daemon.url, agentId: 'runner-agent', maxRetries: 2 };
    const result = { status: 'success', output: 'Done!', exitCode: 0 };
    await reportResult(task, result, config);

    // Verify it was recorded
    assert.equal(daemon.state.completions.length, 1);
    assert.equal(daemon.state.completions[0].taskId, task.id);
  });
});
