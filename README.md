# wikitree-mcp

A read-only [MCP](https://modelcontextprotocol.io) server for the
[WikiTree](https://www.wikitree.com) genealogy API. It exposes WikiTree profile
lookups, ancestor/descendant walks, and a raw API escape hatch as MCP tools that
Claude (or any MCP host) can call.

> **Attribution.** This project is derived from
> [PeWu/wikitree-mcp](https://github.com/PeWu/wikitree-mcp) by Przemek Więch,
> used under the Apache License 2.0. It was rewritten on the MCP TypeScript SDK
> high-level API, made stdio-only, and given typed schemas and read-only tool
> annotations. See [`NOTICE`](./NOTICE) for the full attribution and list of
> changes.

## Tools

All tools are **read-only** (annotated `readOnlyHint`, so MCP hosts may
auto-approve them). People are identified by a WikiTree ID *key* shaped
`LastNameAtBirth-Number`, e.g. `Skłodowska-2` or `Smith-1`.

| Tool | Purpose |
|---|---|
| `get_person` | Fetch one profile by key (vitals + optional biography). |
| `get_ancestors` | Walk up `depth` generations (parents, grandparents, …). |
| `get_descendants` | Walk down `depth` generations (children, grandchildren, …). |
| `get_relatives` | Immediate parents/children/spouses/siblings for one or more keys, in one call. |
| `call_api` | Escape hatch for any documented WikiTree read action (e.g. `searchPerson`). See the [WikiTree API docs](https://github.com/wikitree/wikitree-api). |

## Setup

```bash
npm install        # also builds via the prepare script
npm run build      # compile TypeScript -> dist/
```

## Use with Claude Code

Register the built server as a stdio MCP server:

```bash
claude mcp add wikitree -- node H:/_actyra-overflow/wikitree-mcp-server/dist/index.js
```

…or add it to your MCP config manually:

```json
{
  "mcpServers": {
    "wikitree": {
      "command": "node",
      "args": ["H:/_actyra-overflow/wikitree-mcp-server/dist/index.js"]
    }
  }
}
```

It works the same way in any MCP host that launches stdio servers (Gemini CLI,
Claude Desktop, etc.).

## Authentication (optional)

Without credentials the server reads **public** WikiTree data only. To also
reach private/living profiles your account can see, copy `.env.example` to
`.env` and fill in:

```
WIKITREE_EMAIL=you@example.com
WIKITREE_PASSWORD=your-password
```

The server logs in once at first use and falls back to public access if
credentials are missing or login fails. Never commit `.env`.

## Architecture

- **`src/index.ts`** — entry point; connects the server over a stdio transport.
  stdout carries JSON-RPC framing, so all logging goes to stderr.
- **`src/server.ts`** — defines the five tools with `McpServer.registerTool`,
  zod input schemas, and read-only annotations. Each handler is a thin wrapper
  over `wikitree-js`.
- **`src/wikitree.ts`** — optional, lazily-cached WikiTree authentication and
  the shared `{ auth, appId }` options.

Only stdio is implemented. Add a Streamable HTTP transport later if you ever
need remote or multi-client access.

## License

[Apache-2.0](./LICENSE). Genealogy data © WikiTree; WikiTree is a trademark of
Interesting.com, Inc. This project is not affiliated with WikiTree.
