/**
 * loader.mjs — Configuration loader.
 *
 * Loads project config from mpt.config.json (if present) and merges
 * with defaults. Harness definitions can be overridden or extended
 * in the config file.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DEFAULT_HARNESSES } from './harnesses.mjs';

const CONFIG_FILENAME = 'mpt.config.json';

/**
 * Load the full configuration, merging file config with defaults.
 * @param {string} [projectDir] - Project root to look for mpt.config.json
 * @returns {Promise<MptConfig>}
 */
export async function loadMptConfig(projectDir = process.cwd()) {
  const fileConfig = await loadConfigFile(projectDir);
  return mergeConfig(fileConfig);
}

/**
 * Load config file from disk, returning empty object if not found.
 */
async function loadConfigFile(projectDir) {
  const configPath = resolve(projectDir, CONFIG_FILENAME);
  try {
    const raw = await readFile(configPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {};
    }
    throw new Error(`Failed to parse ${CONFIG_FILENAME}: ${err.message}`);
  }
}

/**
 * Merge file config with defaults.
 * File config harnesses override defaults by name; unknown harnesses are added.
 */
function mergeConfig(fileConfig) {
  const harnesses = { ...DEFAULT_HARNESSES };

  if (fileConfig.harnesses) {
    for (const [name, override] of Object.entries(fileConfig.harnesses)) {
      if (harnesses[name]) {
        // Merge: override fields replace defaults, capabilities are merged
        harnesses[name] = {
          ...harnesses[name],
          ...override,
          capabilities: {
            ...harnesses[name].capabilities,
            ...(override.capabilities || {}),
          },
          env: {
            ...harnesses[name].env,
            ...(override.env || {}),
          },
        };
      } else {
        // New harness type
        harnesses[name] = override;
      }
    }
  }

  return {
    daemonUrl: fileConfig.daemonUrl || process.env.MPT_DAEMON_URL || 'http://localhost:3100',
    harnesses,
    defaults: {
      harness: fileConfig.defaults?.harness || 'claude-code',
      pollInterval: fileConfig.defaults?.pollInterval || 5,
      maxRetries: fileConfig.defaults?.maxRetries || 3,
      ...(fileConfig.defaults || {}),
    },
  };
}

/**
 * Get a specific harness definition by name.
 * @param {string} name - Harness name (e.g. "pi", "claude-code", "codex")
 * @param {MptConfig} config - Loaded configuration
 * @returns {HarnessDefinition|null}
 */
export function getHarness(name, config) {
  return config.harnesses[name] || null;
}

/**
 * List all available harness names.
 * @param {MptConfig} config
 * @returns {string[]}
 */
export function listHarnesses(config) {
  return Object.keys(config.harnesses);
}

/**
 * @typedef {object} MptConfig
 * @property {string} daemonUrl
 * @property {Record<string, import('./harnesses.mjs').HarnessDefinition>} harnesses
 * @property {object} defaults
 */
