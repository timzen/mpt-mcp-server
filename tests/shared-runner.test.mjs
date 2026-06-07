/**
 * shared-runner.test.mjs — Tests for the shared runner loop utilities and adapters.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('shared/config', () => {
  test('loads shared defaults', async () => {
    const saved = { ...process.env };
    delete process.env.MPT_DAEMON_URL;
    delete process.env.MPT_AGENT_ID;
    delete process.env.MPT_POLL_INTERVAL;
    delete process.env.MPT_WORK_DIR;
    delete process.env.MPT_MCP_SERVER;
    delete process.env.MPT_ROLE;

    const { loadSharedConfig } = await import('../src/runners/shared/config.mjs');
    const config = loadSharedConfig();

    assert.equal(config.daemonUrl, 'http://localhost:7437');
    assert.ok(config.agentId.startsWith('agent-'));
    assert.equal(config.pollInterval, 5);
    assert.ok(config.workDir);
    assert.ok(config.mcpServerPath.endsWith('index.mjs'));
    assert.equal(config.maxRetries, 3);
    assert.equal(config.role, 'teammate');

    Object.assign(process.env, saved);
  });
});

describe('shared/loop utilities', () => {
  test('buildWorkflowPrompt includes task info', async () => {
    const { buildWorkflowPrompt } = await import('../src/runners/shared/loop.mjs');
    const task = {
      id: 'task-42',
      title: 'Fix the widget',
      storyId: 'story-1',
      description: 'The widget is broken',
      comments: [{ from: 'lead', body: 'Please prioritize this' }],
    };

    const prompt = buildWorkflowPrompt(task, 'Implement the fix');
    assert.ok(prompt.includes('## Phase Instructions'));
    assert.ok(prompt.includes('Implement the fix'));
    assert.ok(prompt.includes('Fix the widget'));
    assert.ok(prompt.includes('task-42'));
    assert.ok(prompt.includes('story-1'));
    assert.ok(prompt.includes('The widget is broken'));
    assert.ok(prompt.includes('Please prioritize this'));
    assert.ok(prompt.includes('NEEDS_INPUT:'));
  });

  test('buildWorkflowPrompt works without instructions', async () => {
    const { buildWorkflowPrompt } = await import('../src/runners/shared/loop.mjs');
    const task = { id: 'task-1', title: 'Simple task' };
    const prompt = buildWorkflowPrompt(task, null);
    assert.ok(!prompt.includes('Phase Instructions'));
    assert.ok(prompt.includes('Simple task'));
  });

  test('extractSummary finds summary heading', async () => {
    const { extractSummary } = await import('../src/runners/shared/loop.mjs');
    const output = 'Some work\n## Summary\nDid the thing\nIt worked\n---\nTrailing';
    const summary = extractSummary(output);
    assert.ok(summary.includes('Did the thing'));
  });

  test('extractSummary falls back to last lines', async () => {
    const { extractSummary } = await import('../src/runners/shared/loop.mjs');
    const output = 'line 1\nline 2\nline 3';
    const summary = extractSummary(output);
    assert.ok(summary.includes('line 3'));
  });

  test('extractSummary handles null', async () => {
    const { extractSummary } = await import('../src/runners/shared/loop.mjs');
    assert.equal(extractSummary(null), 'No output captured');
  });
});

describe('shared/loop parseTokenUsage', () => {
  test('parses token usage from claude output', async () => {
    const { parseTokenUsage } = await import('../src/runners/shared/loop.mjs');
    const output = 'Some work\nInput tokens: 1,234\nOutput tokens: 567\nDone.';
    const usage = parseTokenUsage(output);
    assert.equal(usage.inputTokens, 1234);
    assert.equal(usage.outputTokens, 567);
  });

  test('parses model from output', async () => {
    const { parseTokenUsage } = await import('../src/runners/shared/loop.mjs');
    const output = 'Model: claude-sonnet-4-20250514\nInput tokens: 100\nOutput tokens: 50';
    const usage = parseTokenUsage(output);
    assert.equal(usage.model, 'claude-sonnet-4-20250514');
  });

  test('returns null when no usage info', async () => {
    const { parseTokenUsage } = await import('../src/runners/shared/loop.mjs');
    assert.equal(parseTokenUsage('Just some output'), null);
    assert.equal(parseTokenUsage(null), null);
  });
});

describe('claude adapter', () => {
  test('has correct properties', async () => {
    const { createAdapter } = await import('../src/runners/claude/adapter.mjs');
    const adapter = createAdapter();
    assert.equal(adapter.name, 'Claude');
    assert.equal(adapter.supportsMcp, true);
    assert.ok(adapter.execute);
    assert.ok(adapter.loadConfig);
  });

  test('loadConfig returns claude defaults', async () => {
    delete process.env.MPT_AGENT_ID;
    delete process.env.MPT_CLAUDE_BIN;
    const { createAdapter } = await import('../src/runners/claude/adapter.mjs');
    const config = createAdapter().loadConfig();
    assert.equal(config.agentId, 'claude-agent-1');
    assert.equal(config.claudeBinary, 'claude');
  });

  test('execute handles missing binary', async () => {
    const { createAdapter } = await import('../src/runners/claude/adapter.mjs');
    const adapter = createAdapter();
    const config = adapter.loadConfig();
    config.claudeBinary = 'nonexistent-claude-xyz';
    config.workDir = '/tmp';
    const result = await adapter.execute('test prompt', config);
    assert.equal(result.exitCode, -1);
    assert.ok(result.output.includes('Spawn error'));
  });
});

describe('kiro adapter', () => {
  test('has correct properties', async () => {
    const { createAdapter } = await import('../src/runners/kiro/adapter.mjs');
    const adapter = createAdapter();
    assert.equal(adapter.name, 'Kiro');
    assert.equal(adapter.supportsMcp, true);
    assert.ok(adapter.execute);
    assert.ok(adapter.loadConfig);
  });

  test('loadConfig returns kiro defaults', async () => {
    delete process.env.MPT_AGENT_ID;
    delete process.env.MPT_KIRO_BIN;
    const { createAdapter } = await import('../src/runners/kiro/adapter.mjs');
    const config = createAdapter().loadConfig();
    assert.equal(config.agentId, 'kiro-agent-1');
    assert.equal(config.kiroBinary, 'kiro-cli');
  });

  test('execute handles missing binary', async () => {
    const { createAdapter } = await import('../src/runners/kiro/adapter.mjs');
    const adapter = createAdapter();
    const config = adapter.loadConfig();
    config.kiroBinary = 'nonexistent-kiro-xyz';
    config.workDir = '/tmp';
    const result = await adapter.execute('test prompt', config);
    assert.equal(result.exitCode, -1);
    assert.ok(result.output.includes('Spawn error'));
  });
});

describe('codex adapter', () => {
  test('has correct properties', async () => {
    const { createAdapter } = await import('../src/runners/codex/adapter.mjs');
    const adapter = createAdapter();
    assert.equal(adapter.name, 'Codex');
    assert.equal(adapter.supportsMcp, false);
    assert.ok(adapter.execute);
    assert.ok(adapter.loadConfig);
  });

  test('loadConfig returns codex defaults', async () => {
    delete process.env.MPT_AGENT_ID;
    delete process.env.MPT_CODEX_BIN;
    const { createAdapter } = await import('../src/runners/codex/adapter.mjs');
    const config = createAdapter().loadConfig();
    assert.equal(config.agentId, 'codex-agent-1');
    assert.equal(config.codexBinary, 'codex');
    assert.equal(config.daemonUrl, 'http://localhost:7437');
  });

  test('execute handles missing binary', async () => {
    const { createAdapter } = await import('../src/runners/codex/adapter.mjs');
    const adapter = createAdapter();
    const config = adapter.loadConfig();
    config.codexBinary = 'nonexistent-codex-xyz';
    config.workDir = '/tmp';
    const result = await adapter.execute('test prompt', config);
    assert.equal(result.exitCode, -1);
    assert.ok(result.output.includes('Spawn error'));
  });
});
