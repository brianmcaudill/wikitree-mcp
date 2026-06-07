// End-to-end smoke test. Launches the built server over stdio and exercises
// every tool against the live (public) WikiTree API. Re-runnable: `npm test`.
//
// Requires `npm run build` first (it runs ./dist). Makes real network calls to
// WikiTree using public data only (no credentials needed). Exits non-zero on
// the first failure so it can gate a commit/CI.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const PERSON = "Skłodowska-2"; // Marie Curie — stable public profile

let failures = 0;
function check(name, cond, detail) {
  const status = cond ? "PASS" : "FAIL";
  if (!cond) failures++;
  console.log(`[${status}] ${name}${detail ? " — " + detail : ""}`);
}

function textOf(res) {
  return res.content?.find((c) => c.type === "text")?.text ?? "";
}

const transport = new StdioClientTransport({ command: "node", args: ["dist/index.js"] });
const client = new Client({ name: "wikitree-mcp-smoke", version: "1.0.0" });
await client.connect(transport);

try {
  // 1. Tool registration + read-only annotations
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  const expected = ["call_api", "get_ancestors", "get_descendants", "get_person", "get_relatives"];
  check("listTools returns all 5 tools", JSON.stringify(names) === JSON.stringify(expected), names.join(", "));
  check("every tool is read-only", tools.every((t) => t.annotations?.readOnlyHint === true));

  // 2. get_person
  let r = await client.callTool({ name: "get_person", arguments: { key: PERSON, fields: ["Name", "BirthDate"] } });
  check("get_person ok", r.isError !== true && textOf(r).includes("1867"), "expects birth year 1867");

  // 3. get_ancestors (depth 1 = parents)
  r = await client.callTool({ name: "get_ancestors", arguments: { key: PERSON, depth: 1 } });
  check("get_ancestors ok", r.isError !== true && textOf(r).length > 0);

  // 4. get_descendants (depth 1 = children)
  r = await client.callTool({ name: "get_descendants", arguments: { key: PERSON, depth: 1 } });
  check("get_descendants ok", r.isError !== true && textOf(r).length > 0);

  // 5. get_relatives (parents)
  r = await client.callTool({ name: "get_relatives", arguments: { keys: [PERSON], getParents: true } });
  check("get_relatives ok", r.isError !== true && textOf(r).length > 0);

  // 6. call_api — the cast-typed escape hatch; the path tsc cannot vouch for
  r = await client.callTool({ name: "call_api", arguments: { action: "getPerson", params: { key: PERSON } } });
  check("call_api ok", r.isError !== true && textOf(r).includes(PERSON), "raw getPerson via passthrough");
} finally {
  await client.close();
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
