/**
 * config.test.mjs — Tests for harness configuration system.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DEFAULT_HARNESSES } from '../src/config/harnesses.mjs';
import { loadMptConfig, getHarness, listHarnesses } from '../src/config/loader.mjs';

describe('DEFAULT_HARNESSES', () => {
  test('defines pi harness', () => {
    const h = DEFAULT_HARNESSES.pi;
    assert.equal(h.name, 'pi');
    assert.equal(h.command, 'pi');
    assert.equal(h.capabilities.mcp, true);
    assert.equal(h.capabilities.midTaskComm, true);
  });

  test('defines claude-code harness', () => {
    const h = DEFAULT_HARNESSES['claude-code'];
    assert.equal(h.name, 'claude-code');
    assert.equal(h.command, 'claude');
    assert.equal(h.capabilities.mcp, true);
    assert.ok(h.args.includes('--print'));
  });

  test('defines codex harness', () => {
    const h = DEFAULT_HARNESSES.codex;
    assert.equal(h.name, 'codex');
    assert.equal(h.command, 'codex');
    assert.equal(h.capabilities.mcp, false);
    assert.equal(h.capabilities.midTaskComm, false);
    assert.ok(h.args.includes('--auto-edit'));
  });

  test('all harnesses have required fields', () => {
    for (const [name, h] of Object.entries(DEFAULT_HARNESSES)) {
      assert.ok(h.name, `${name} has name`);
      assert.ok(h.command, `${name} has command`);
      assert.ok(Array.isArray(h.args), `${name} has args array`);
      assert.ok(h.capabilities, `${name} has capabilities`);
      assert.ok(h.description, `${name} has description`);
    }
  });
});

describe('loadMptConfig', () => {
  test('loads defaults when no config file', async () => {
    const config = await loadMptConfig('/tmp/nonexistent-dir-12345');
    assert.ok(config.harnesses.pi);
    assert.ok(config.harnesses['claude-code']);
    assert.ok(config.harnesses.codex);
    assert.equal(config.defaults.harness, 'claude-code');
  });

  test('merges config file with defaults', async () => {
    const dir = join(tmpdir(), `mpt-test-${Date.now()}`);
    await mkdir(dir, { recursive: true });

    const configData = {
      daemonUrl: 'http://custom:9000',
      defaults: { harness: 'pi' },
      harnesses: {
        'claude-code': {
          command: '/usr/local/bin/claude',
          env: { CUSTOM_VAR: 'value' },
        },
        'custom-agent': {
          name: 'custom-agent',
          description: 'A custom agent',
          command: 'my-agent',
          args: ['--run', '{{prompt}}'],
          capabilities: { mcp: false, midTaskComm: false, fileEdit: true, shell: false, streaming: false },
          env: {},
          workDir: '{{workDir}}',
        },
      },
    };

    await writeFile(join(dir, 'mpt.config.json'), JSON.stringify(configData));

    const config = await loadMptConfig(dir);

    // Overridden daemon URL
    assert.equal(config.daemonUrl, 'http://custom:9000');

    // Default harness changed
    assert.equal(config.defaults.harness, 'pi');

    // Claude-code command overridden, but capabilities preserved
    assert.equal(config.harnesses['claude-code'].command, '/usr/local/bin/claude');
    assert.equal(config.harnesses['claude-code'].capabilities.mcp, true);
    assert.equal(config.harnesses['claude-code'].env.CUSTOM_VAR, 'value');

    // Custom harness added
    assert.ok(config.harnesses['custom-agent']);
    assert.equal(config.harnesses['custom-agent'].command, 'my-agent');

    // Pi still has defaults
    assert.equal(config.harnesses.pi.command, 'pi');

    await rm(dir, { recursive: true });
  });

  test('throws on malformed config file', async () => {
    const dir = join(tmpdir(), `mpt-test-bad-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'mpt.config.json'), 'not valid json{{{');

    await assert.rejects(
      () => loadMptConfig(dir),
      /Failed to parse mpt.config.json/
    );

    await rm(dir, { recursive: true });
  });
});

describe('getHarness', () => {
  test('returns harness by name', async () => {
    const config = await loadMptConfig('/tmp/nonexistent');
    const h = getHarness('pi', config);
    assert.equal(h.name, 'pi');
  });

  test('returns null for unknown harness', async () => {
    const config = await loadMptConfig('/tmp/nonexistent');
    const h = getHarness('nonexistent', config);
    assert.equal(h, null);
  });
});

describe('listHarnesses', () => {
  test('returns all harness names', async () => {
    const config = await loadMptConfig('/tmp/nonexistent');
    const names = listHarnesses(config);
    assert.ok(names.includes('pi'));
    assert.ok(names.includes('claude-code'));
    assert.ok(names.includes('codex'));
  });
});
