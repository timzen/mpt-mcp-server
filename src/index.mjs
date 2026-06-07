#!/usr/bin/env node
/**
 * mpt-mcp-server — Entry point for the MCP server.
 *
 * Starts a stdio-based MCP server that exposes team collaboration tools.
 * Compatible with Claude Code, Cursor, and Kiro via their MCP config.
 *
 * Requires MPT_DAEMON_URL to be set — all state lives in the daemon.
 * There is no standalone/in-memory mode.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createToolRegistry } from './tools/registry.mjs';
import { createDaemonClient } from './daemon-client.mjs';

const SERVER_NAME = 'mpt-mcp-server';
const SERVER_VERSION = '0.3.0';

async function main() {
  // MPT_DAEMON_URL is required — fail fast if not set
  const daemonUrl = process.env.MPT_DAEMON_URL;
  if (!daemonUrl) {
    console.error('MPT_DAEMON_URL is required. Start the my-pizza-team daemon first.');
    process.exit(1);
  }

  const agentId = process.env.MPT_AGENT_ID || `mpt-agent-${process.pid}`;
  const role = process.env.MPT_ROLE || 'leader';
  const daemonClient = createDaemonClient({ daemonUrl, agentId });

  const toolRegistry = createToolRegistry(daemonClient, { role });

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolRegistry.listTools(),
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return toolRegistry.callTool(name, args ?? {});
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal error starting mpt-mcp-server:', err);
  process.exit(1);
});
