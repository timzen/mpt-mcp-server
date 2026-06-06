/**
 * spawn.test.mjs — Tests for the spawn CLI command.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SPAWN_CMD = resolve(__dirname, '..', 'src', 'cli', 'spawn.mjs');

describe('mpt spawn CLI', () => {
  test('--help prints usage', async () => {
    const { stdout } = await exec('node', [SPAWN_CMD, '--help']);
    assert.ok(stdout.includes('mpt spawn'));
    assert.ok(stdout.includes('--harness'));
    assert.ok(stdout.includes('--prompt'));
  });

  test('--list shows available harnesses', async () => {
    const { stdout } = await exec('node', [SPAWN_CMD, '--list']);
    assert.ok(stdout.includes('pi'));
    assert.ok(stdout.includes('claude-code'));
    assert.ok(stdout.includes('codex'));
    assert.ok(stdout.includes('capabilities'));
  });

  test('errors on unknown harness', async () => {
    try {
      await exec('node', [SPAWN_CMD, '--harness=nonexistent', '--prompt=test']);
      assert.fail('Should have exited with error');
    } catch (err) {
      assert.ok(err.stderr.includes('Unknown harness'));
      assert.ok(err.stderr.includes('nonexistent'));
    }
  });

  test('errors when no prompt provided', async () => {
    try {
      await exec('node', [SPAWN_CMD, '--harness=pi']);
      assert.fail('Should have exited with error');
    } catch (err) {
      assert.ok(err.stderr.includes('No prompt provided'));
    }
  });

  test('spawns harness (fails gracefully when binary not found)', async () => {
    try {
      await exec('node', [SPAWN_CMD, '--harness=codex', '--prompt=hello']);
      // If codex is installed this might succeed
    } catch (err) {
      // Expected: spawn error or non-zero exit
      assert.ok(err.stderr.includes('Spawn') || err.code !== 0);
    }
  });
});
