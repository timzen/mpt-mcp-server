#!/usr/bin/env node
/**
 * mpt-mcp-server — Entry point for the MCP server.
 *
 * Starts a stdio-based MCP server that exposes team collaboration tools.
 * Compatible with Claude Code, Cursor, and Kiro via their MCP config.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createToolRegistry } from './tools/registry.mjs';
import { createStore } from './store.mjs';

const SERVER_NAME = 'mpt-mcp-server';
const SERVER_VERSION = '0.1.0';

async function main() {
  const store = createStore();
  const toolRegistry = createToolRegistry(store);

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
