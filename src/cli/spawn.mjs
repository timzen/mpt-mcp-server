#!/usr/bin/env node
/**
 * spawn.mjs — CLI command: `mpt spawn --harness=X`
 *
 * Spawns an agent using the configured harness command template.
 * Resolves template variables, generates MCP config if needed,
 * and executes the harness binary.
 *
 * Usage:
 *   mpt spawn --harness=claude-code --task-id=task-123 --agent-id=agent-1
 *   mpt spawn --harness=codex --work-dir=/path/to/project
 *   mpt spawn --harness=pi
 *   mpt spawn --list   (list available harnesses)
 */

import { spawn } from 'node:child_process';
import { writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadMptConfig, getHarness, listHarnesses } from '../config/index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_SERVER_PATH = resolve(__dirname, '..', 'index.mjs');

// ─── Argument Parsing ───────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    harness: null,
    taskId: null,
    agentId: null,
    workDir: process.cwd(),
    prompt: null,
    list: false,
    help: false,
    agentsmd: resolve(process.cwd(), 'AGENTS.md'),
  };

  for (const arg of argv) {
    if (arg === '--list') {
      args.list = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg.startsWith('--harness=')) {
      args.harness = arg.split('=')[1];
    } else if (arg.startsWith('--task-id=')) {
      args.taskId = arg.split('=')[1];
    } else if (arg.startsWith('--agent-id=')) {
      args.agentId = arg.split('=')[1];
    } else if (arg.startsWith('--work-dir=')) {
      args.workDir = arg.split('=')[1];
    } else if (arg.startsWith('--prompt=')) {
      args.prompt = arg.split('=').slice(1).join('=');
    } else if (arg.startsWith('--agents-md=')) {
      args.agentsmd = arg.split('=')[1];
    } else if (!arg.startsWith('--') && !args.prompt) {
      args.prompt = arg;
    }
  }

  return args;
}

// ─── Template Resolution ────────────────────────────────────────────────────

/**
 * Resolve template variables in a string.
 */
function resolveTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

/**
 * Resolve all template variables in a harness definition's args.
 */
function resolveHarnessArgs(harness, vars) {
  return harness.args.map((arg) => resolveTemplate(arg, vars));
}

// ─── MCP Config Generation ─────────────────────────────────────────────────

/**
 * Generate a temp MCP config file for harnesses that support MCP.
 * @returns {Promise<string|null>} Path to temp config, or null if not needed
 */
async function generateMcpConfig(harness) {
  if (!harness.capabilities.mcp) {
    return null;
  }

  const config = {
    mcpServers: {
      mpt: {
        command: 'node',
        args: [MCP_SERVER_PATH],
      },
    },
  };

  const dir = await mkdtemp(join(tmpdir(), 'mpt-spawn-'));
  const path = join(dir, 'mcp.json');
  await writeFile(path, JSON.stringify(config, null, 2));
  return path;
}

// ─── Spawn Execution ────────────────────────────────────────────────────────

/**
 * Spawn the harness process and return exit code.
 */
function spawnHarness(command, args, options) {
  return new Promise((resolvePromise) => {
    const proc = spawn(command, args, {
      cwd: options.workDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...options.env },
    });

    const stdout = [];
    const stderr = [];

    proc.stdout.on('data', (chunk) => {
      stdout.push(chunk);
      process.stdout.write(chunk);
    });
    proc.stderr.on('data', (chunk) => {
      stderr.push(chunk);
      process.stderr.write(chunk);
    });

    proc.stdin.end();

    proc.on('close', (code) => {
      resolvePromise({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdout).toString('utf-8'),
        stderr: Buffer.concat(stderr).toString('utf-8'),
      });
    });

    proc.on('error', (err) => {
      resolvePromise({
        exitCode: -1,
        stdout: '',
        stderr: `Spawn error: ${err.message}`,
      });
    });
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const cliArgs = parseArgs(process.argv.slice(2));

  if (cliArgs.help) {
    printUsage();
    process.exit(0);
  }

  const config = await loadMptConfig(cliArgs.workDir);

  if (cliArgs.list) {
    printHarnesses(config);
    process.exit(0);
  }

  const harnessName = cliArgs.harness || config.defaults.harness;
  const harness = getHarness(harnessName, config);

  if (!harness) {
    const available = listHarnesses(config).join(', ');
    console.error(`Error: Unknown harness "${harnessName}". Available: ${available}`);
    process.exit(1);
  }

  if (!cliArgs.prompt) {
    console.error('Error: No prompt provided. Use --prompt="..." or pass as positional argument.');
    process.exit(1);
  }

  // Generate MCP config if harness supports it
  const mcpConfigPath = await generateMcpConfig(harness);

  try {
    // Build template variables
    const vars = {
      workDir: resolve(cliArgs.workDir),
      mcpConfigPath: mcpConfigPath || '',
      mcpServerPath: MCP_SERVER_PATH,
      prompt: cliArgs.prompt,
      taskId: cliArgs.taskId || 'none',
      agentId: cliArgs.agentId || 'agent-1',
      agentsmd: cliArgs.agentsmd,
    };

    // Resolve the command template
    const command = resolveTemplate(harness.command, vars);
    const args = resolveHarnessArgs(harness, vars);
    const workDir = resolveTemplate(harness.workDir || '{{workDir}}', vars);
    const env = {};
    for (const [key, val] of Object.entries(harness.env || {})) {
      env[key] = resolveTemplate(val, vars);
    }

    console.error(`Spawning harness "${harnessName}": ${command} ${args.join(' ').slice(0, 100)}...`);

    const result = await spawnHarness(command, args, { workDir, env });

    process.exit(result.exitCode);
  } finally {
    // Clean up temp MCP config
    if (mcpConfigPath) {
      await unlink(mcpConfigPath).catch(() => {});
    }
  }
}

function printUsage() {
  console.log(`
mpt spawn — Spawn an agent using a configured harness

Usage:
  mpt spawn --harness=<name> --prompt="<task prompt>" [options]
  mpt spawn --list

Options:
  --harness=<name>     Harness to use (default: from config)
  --prompt=<text>      Task prompt (or positional argument)
  --task-id=<id>       Task identifier for context
  --agent-id=<id>      Agent identifier
  --work-dir=<path>    Working directory (default: cwd)
  --agents-md=<path>   Path to AGENTS.md
  --list               List available harnesses
  --help, -h           Show this help

Harnesses: pi, claude-code, codex (or custom via mpt.config.json)
`);
}

function printHarnesses(config) {
  console.log('Available harnesses:\n');
  for (const [name, def] of Object.entries(config.harnesses)) {
    const caps = Object.entries(def.capabilities)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(', ');
    console.log(`  ${name}`);
    console.log(`    ${def.description}`);
    console.log(`    command: ${def.command}`);
    console.log(`    capabilities: ${caps}`);
    console.log('');
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
