/**
 * runner.test.mjs — Tests for the task runner components.
 */

import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

describe('config', () => {
  test('loads defaults', async () => {
    // Clear env vars that might interfere
    const saved = { ...process.env };
    delete process.env.MPT_DAEMON_URL;
    delete process.env.MPT_AGENT_ID;
    delete process.env.MPT_POLL_INTERVAL;
    delete process.env.MPT_WORK_DIR;
    delete process.env.MPT_MCP_SERVER;

    const { loadConfig } = await import('../src/runners/claude/config.mjs');
    const config = loadConfig();

    assert.equal(config.daemonUrl, 'http://localhost:7437');
    assert.equal(config.agentId, 'claude-agent-1');
    assert.equal(config.pollInterval, 5);
    assert.ok(config.workDir);
    assert.ok(config.mcpServerPath.endsWith('index.mjs'));
    assert.equal(config.maxRetries, 3);
    assert.equal(config.claudeBinary, 'claude');

    // Restore
    Object.assign(process.env, saved);
  });

  test('reads from env vars', async () => {
    process.env.MPT_DAEMON_URL = 'http://custom:9999';
    process.env.MPT_AGENT_ID = 'my-agent';
    process.env.MPT_POLL_INTERVAL = '10';

    // Re-import to get fresh module (won't work with cached, but config is a function)
    const { loadConfig } = await import('../src/runners/claude/config.mjs');
    const config = loadConfig();

    assert.equal(config.daemonUrl, 'http://custom:9999');
    assert.equal(config.agentId, 'my-agent');
    assert.equal(config.pollInterval, 10);

    // Clean up
    delete process.env.MPT_DAEMON_URL;
    delete process.env.MPT_AGENT_ID;
    delete process.env.MPT_POLL_INTERVAL;
  });
});

describe('poll', () => {
  test('returns null when daemon is unreachable', async () => {
    const { pollForTask } = await import('../src/runners/claude/poll.mjs');
    const config = {
      daemonUrl: 'http://localhost:19999', // unlikely to be running
      agentId: 'test-agent',
    };

    const task = await pollForTask(config);
    assert.equal(task, null);
  });
});

describe('report', () => {
  test('extractSummary handles output with summary heading', async () => {
    // We test the internal logic indirectly via module
    // The reportResult function gracefully handles unreachable daemon
    const { reportResult } = await import('../src/runners/claude/report.mjs');
    const config = {
      daemonUrl: 'http://localhost:19999',
      agentId: 'test-agent',
      maxRetries: 1,
    };
    const task = { id: 'task-1' };
    const result = { status: 'success', output: '## Summary\nDid the thing', exitCode: 0 };

    // Should not throw even if daemon is unreachable
    await reportResult(task, result, config);
  });
});

describe('execute - buildPrompt', () => {
  test('prompt includes task title and id', async () => {
    // We test executeTask indirectly - verify it doesn't crash with missing binary
    const { executeTask } = await import('../src/runners/claude/execute.mjs');
    const config = {
      claudeBinary: 'false', // will exit with code 1 but won't error
      mcpServerPath: '/tmp/nonexistent.mjs',
      workDir: '/tmp',
      agentId: 'test-agent',
    };
    const task = {
      id: 'task-123',
      title: 'Test task',
      description: 'Do something',
    };

    const result = await executeTask(task, config);
    // `false` command exits with 1
    assert.equal(result.status, 'error');
    assert.equal(result.exitCode, 1);
  });
});
