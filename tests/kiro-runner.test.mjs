/**
 * kiro-runner.test.mjs — Tests for the Kiro task runner components.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('kiro config', () => {
  test('loads defaults', async () => {
    const saved = { ...process.env };
    delete process.env.MPT_DAEMON_URL;
    delete process.env.MPT_AGENT_ID;
    delete process.env.MPT_POLL_INTERVAL;
    delete process.env.MPT_WORK_DIR;
    delete process.env.MPT_MCP_SERVER;
    delete process.env.MPT_KIRO_BIN;

    const { loadConfig } = await import('../src/runners/kiro/config.mjs');
    const config = loadConfig();

    assert.equal(config.daemonUrl, 'http://localhost:3100');
    assert.equal(config.agentId, 'kiro-agent-1');
    assert.equal(config.pollInterval, 5);
    assert.ok(config.workDir);
    assert.ok(config.mcpServerPath.endsWith('index.mjs'));
    assert.equal(config.maxRetries, 3);
    assert.equal(config.kiroBinary, 'kiro-cli');

    Object.assign(process.env, saved);
  });

  test('reads from env vars', async () => {
    process.env.MPT_DAEMON_URL = 'http://custom:7777';
    process.env.MPT_AGENT_ID = 'my-kiro';
    process.env.MPT_KIRO_BIN = '/usr/local/bin/kiro-cli';

    const { loadConfig } = await import('../src/runners/kiro/config.mjs');
    const config = loadConfig();

    assert.equal(config.daemonUrl, 'http://custom:7777');
    assert.equal(config.agentId, 'my-kiro');
    assert.equal(config.kiroBinary, '/usr/local/bin/kiro-cli');

    delete process.env.MPT_DAEMON_URL;
    delete process.env.MPT_AGENT_ID;
    delete process.env.MPT_KIRO_BIN;
  });
});

describe('kiro poll (re-export)', () => {
  test('returns null when daemon is unreachable', async () => {
    const { pollForTask } = await import('../src/runners/kiro/poll.mjs');
    const config = {
      daemonUrl: 'http://localhost:19999',
      agentId: 'kiro-test',
    };

    const task = await pollForTask(config);
    assert.equal(task, null);
  });
});

describe('kiro report (re-export)', () => {
  test('handles unreachable daemon gracefully', async () => {
    const { reportResult } = await import('../src/runners/kiro/report.mjs');
    const config = {
      daemonUrl: 'http://localhost:19999',
      agentId: 'kiro-test',
      maxRetries: 1,
    };
    const task = { id: 'task-kiro-1' };
    const result = { status: 'success', output: 'Done', exitCode: 0 };

    // Should not throw
    await reportResult(task, result, config);
  });
});

describe('kiro execute', () => {
  test('handles missing kiro-cli binary gracefully', async () => {
    const { executeTask } = await import('../src/runners/kiro/execute.mjs');
    const config = {
      kiroBinary: 'nonexistent-kiro-binary-xyz',
      mcpServerPath: '/tmp/nonexistent.mjs',
      workDir: '/tmp',
      agentId: 'kiro-test',
    };
    const task = {
      id: 'task-kiro-2',
      title: 'Test kiro task',
      description: 'Do something with kiro',
    };

    const result = await executeTask(task, config);
    assert.equal(result.status, 'error');
    assert.equal(result.exitCode, -1);
    assert.ok(result.output.includes('Spawn error'));
  });
});

describe('kiro harness definition', () => {
  test('kiro harness is in DEFAULT_HARNESSES', async () => {
    const { DEFAULT_HARNESSES } = await import('../src/config/harnesses.mjs');
    const kiro = DEFAULT_HARNESSES.kiro;

    assert.ok(kiro);
    assert.equal(kiro.name, 'kiro');
    assert.equal(kiro.command, 'kiro-cli');
    assert.equal(kiro.capabilities.mcp, true);
    assert.equal(kiro.capabilities.midTaskComm, true);
    assert.ok(kiro.args.includes('chat'));
    assert.ok(kiro.args.includes('--no-interactive'));
    assert.ok(kiro.args.includes('--trust-all-tools'));
  });

  test('spawn --list includes kiro', async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const exec = promisify(execFile);
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const SPAWN_CMD = resolve(__dirname, '..', 'src', 'cli', 'spawn.mjs');

    const { stdout } = await exec('node', [SPAWN_CMD, '--list']);
    assert.ok(stdout.includes('kiro'));
    assert.ok(stdout.includes('kiro-cli'));
  });
});
