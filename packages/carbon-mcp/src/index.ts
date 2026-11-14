#!/usr/bin/env node
// carbon-mcp: a Model Context Protocol server (stdio) for a running Carbon.
import { connect } from "@getcarbon/sdk";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readConfig } from "./config.js";
import { createServer } from "./server.js";

// The settings are read on first use, so a missing token reaches the assistant as a sentence it
// can pass on instead of a server that silently failed to start.
const server = createServer(async () => connect({ ...readConfig(process.argv.slice(2), process.env), name: "MCP" }));

try {
  await server.connect(new StdioServerTransport());
} catch (error) {
  // stdout belongs to the protocol, so problems go to stderr.
  console.error(`carbon-mcp couldn't start: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
