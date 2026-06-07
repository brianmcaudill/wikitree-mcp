#!/usr/bin/env node
import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

/**
 * Entry point. This server speaks MCP over stdio only — the transport an MCP
 * host (Claude Code, Gemini CLI, Claude Desktop) uses when it launches the
 * server as a child process. Add a Streamable HTTP transport later only if you
 * need remote/multi-client access.
 *
 * IMPORTANT: stdout is reserved for the JSON-RPC framing. All logging goes to
 * stderr (console.error) so it never corrupts the protocol stream.
 */
async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[wikitree-mcp] Server running on stdio");
}

main().catch((err) => {
  console.error("[wikitree-mcp] Fatal:", err);
  process.exit(1);
});
