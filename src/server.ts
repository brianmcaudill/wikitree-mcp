import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as wikitree from "wikitree-js";
import { getOptions } from "./wikitree.js";

/**
 * Read-only MCP server over the WikiTree genealogy API.
 *
 * Every tool here is a thin, typed wrapper around the `wikitree-js` library —
 * the library holds the actual API knowledge; this file just exposes it to an
 * MCP host with tight schemas, read-only annotations, and recoverable errors.
 */

// ---- Shared schema fragments -------------------------------------------------

const bioFormat = z
  .enum(["wiki", "html", "both"])
  .optional()
  .describe(
    "Format for the biography text. Omit to leave the bio out of the response."
  );

const fields = z
  .array(z.string())
  .optional()
  .describe(
    "Specific WikiTree profile fields to return (e.g. 'Name', 'BirthDate', " +
      "'DeathDate', 'Father', 'Mother'). Omit for WikiTree's default field set."
  );

const resolveRedirect = z
  .boolean()
  .optional()
  .describe(
    "If true, follow merged/redirected profiles through to the current profile."
  );

const depth = z
  .number()
  .int()
  .min(1)
  .max(10)
  .default(3)
  .describe(
    "Number of generations to retrieve (1-10, default 3). Each generation " +
      "roughly doubles the result size, so prefer small values. WikiTree caps this at 10."
  );

// `fields` arrives as free text from the MCP caller; wikitree-js types it as a
// closed union of known field names. Narrow the cast to this one spot rather
// than loosening the whole call. The WikiTree API validates field names itself.
function asFields(fields?: string[]): wikitree.PersonField[] | undefined {
  return fields as wikitree.PersonField[] | undefined;
}

// All tools are GET-only reads against an external API.
const READ_ONLY = {
  readOnlyHint: true,
  openWorldHint: true,
  idempotentHint: true,
} as const;

// ---- Result helpers ----------------------------------------------------------

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

// ---- Server ------------------------------------------------------------------

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "wikitree-mcp", version: "1.0.0" },
    {
      instructions:
        "Read-only tools for the WikiTree genealogy database " +
        "(https://www.wikitree.com). People are identified by a WikiTree ID " +
        "'key' shaped LastNameAtBirth-Number, e.g. 'Skłodowska-2' or 'Smith-1'. " +
        "Use get_person for one profile, get_relatives for immediate family in " +
        "one call, and get_ancestors / get_descendants to walk the tree.",
    }
  );

  server.registerTool(
    "get_person",
    {
      title: "Get Person",
      description:
        "Fetch a single WikiTree profile by its ID key (e.g. 'Smith-1'). " +
        "Returns vital data and, if bioFormat is set, the biography. For a " +
        "person's parents/children/spouses/siblings in one call, use " +
        "get_relatives instead.",
      inputSchema: {
        key: z
          .string()
          .describe("WikiTree ID key, shaped LastNameAtBirth-Number (e.g. 'Smith-1')."),
        bioFormat,
        fields,
        resolveRedirect,
      },
      annotations: READ_ONLY,
    },
    async ({ key, bioFormat, fields, resolveRedirect }) => {
      try {
        const person = await wikitree.getPerson(
          key,
          { bioFormat, fields: asFields(fields), resolveRedirect },
          await getOptions()
        );
        return ok(person);
      } catch (e) {
        return fail(
          `Failed to get person '${key}': ${(e as Error).message}. ` +
            "Verify the ID format (LastNameAtBirth-Number)."
        );
      }
    }
  );

  server.registerTool(
    "get_ancestors",
    {
      title: "Get Ancestors",
      description:
        "Retrieve the ancestors of a person up to `depth` generations " +
        "(parents, grandparents, ...). For descendants instead, use " +
        "get_descendants.",
      inputSchema: {
        key: z.string().describe("WikiTree ID key of the starting person (e.g. 'Smith-1')."),
        depth,
        bioFormat,
        fields,
      },
      annotations: READ_ONLY,
    },
    async ({ key, depth, bioFormat, fields }) => {
      try {
        // The getAncestors API action is deprecated server-side. The modern
        // equivalent is getPeople with ancestors=<generations>.
        const ancestors = await wikitree.getPeople(
          [key],
          { ancestors: depth, bioFormat, fields: asFields(fields) },
          await getOptions()
        );
        return ok(ancestors);
      } catch (e) {
        return fail(`Failed to get ancestors of '${key}': ${(e as Error).message}.`);
      }
    }
  );

  server.registerTool(
    "get_descendants",
    {
      title: "Get Descendants",
      description:
        "Retrieve the descendants of a person up to `depth` generations " +
        "(children, grandchildren, ...). For ancestors instead, use " +
        "get_ancestors.",
      inputSchema: {
        key: z.string().describe("WikiTree ID key of the starting person (e.g. 'Smith-1')."),
        depth,
        bioFormat,
        fields,
      },
      annotations: READ_ONLY,
    },
    async ({ key, depth, bioFormat, fields }) => {
      try {
        // The getDescendants API action is deprecated server-side. The modern
        // equivalent is getPeople with descendants=<generations>.
        const descendants = await wikitree.getPeople(
          [key],
          { descendants: depth, bioFormat, fields: asFields(fields) },
          await getOptions()
        );
        return ok(descendants);
      } catch (e) {
        return fail(`Failed to get descendants of '${key}': ${(e as Error).message}.`);
      }
    }
  );

  server.registerTool(
    "get_relatives",
    {
      title: "Get Relatives",
      description:
        "Fetch immediate relatives (parents, children, spouses, and/or " +
        "siblings) for one or more people in a single call. Enable only the " +
        "relationship types you need. For ancestors/descendants beyond one " +
        "generation, use get_ancestors / get_descendants.",
      inputSchema: {
        keys: z
          .array(z.string())
          .min(1)
          .describe("One or more WikiTree ID keys (e.g. ['Smith-1', 'Jones-2'])."),
        getParents: z.boolean().optional().describe("Include each person's parents."),
        getChildren: z.boolean().optional().describe("Include each person's children."),
        getSpouses: z.boolean().optional().describe("Include each person's spouses."),
        getSiblings: z.boolean().optional().describe("Include each person's siblings."),
        bioFormat,
        fields,
      },
      annotations: READ_ONLY,
    },
    async ({ keys, getParents, getChildren, getSpouses, getSiblings, bioFormat, fields }) => {
      try {
        const relatives = await wikitree.getRelatives(
          keys,
          { getParents, getChildren, getSpouses, getSiblings, bioFormat, fields: asFields(fields) },
          await getOptions()
        );
        return ok(relatives);
      } catch (e) {
        return fail(`Failed to get relatives for [${keys.join(", ")}]: ${(e as Error).message}.`);
      }
    }
  );

  server.registerTool(
    "search_person",
    {
      title: "Search People",
      description:
        "Search WikiTree for people matching any combination of name, dates, " +
        "places, and parents' names. Returns a 'matches' array (each with a " +
        "Name key and the requested fields) plus a total count; page large " +
        "result sets with start/limit. Provide at least one search criterion. " +
        "Then use get_person with a match's Name key for the full profile.",
      inputSchema: {
        firstName: z.string().optional().describe("First (given) name."),
        lastName: z.string().optional().describe("Last name at birth."),
        birthDate: z
          .string()
          .optional()
          .describe("Birth date as YYYY-MM-DD (year-only is fine, e.g. 1850-00-00)."),
        deathDate: z.string().optional().describe("Death date as YYYY-MM-DD."),
        birthLocation: z
          .string()
          .optional()
          .describe("Birth place, any granularity (e.g. 'Kentucky' or 'Letcher, Kentucky')."),
        deathLocation: z.string().optional().describe("Death place."),
        gender: z.enum(["Male", "Female"]).optional().describe("Gender."),
        fatherFirstName: z.string().optional().describe("Father's first name."),
        fatherLastName: z.string().optional().describe("Father's last name."),
        motherFirstName: z.string().optional().describe("Mother's first name."),
        motherLastName: z.string().optional().describe("Mother's last name."),
        fields: z
          .array(z.string())
          .optional()
          .describe(
            "Profile fields to return for each match (e.g. 'Name', 'BirthDate'). " +
              "Omit for a sensible default set including the Name key."
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(10)
          .describe("Max matches to return (1-100, default 10)."),
        start: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe("Offset into the result set, for paging (default 0)."),
      },
      annotations: READ_ONLY,
    },
    async (args) => {
      // Default field set so matches are usable immediately — without `fields`,
      // searchPerson returns only profile IDs. `Name` is the key get_person needs.
      const DEFAULT_FIELDS =
        "Id,Name,FirstName,LastNameAtBirth,LastNameCurrent,BirthDate,DeathDate,BirthLocation,DeathLocation";

      // Map our camelCase params to WikiTree's API parameter names, dropping
      // anything the caller didn't set.
      const request: Record<string, unknown> = { action: "searchPerson" };
      const mapped: Record<string, unknown> = {
        FirstName: args.firstName,
        LastName: args.lastName,
        BirthDate: args.birthDate,
        DeathDate: args.deathDate,
        BirthLocation: args.birthLocation,
        DeathLocation: args.deathLocation,
        Gender: args.gender,
        fatherFirstName: args.fatherFirstName,
        fatherLastName: args.fatherLastName,
        motherFirstName: args.motherFirstName,
        motherLastName: args.motherLastName,
        limit: args.limit,
        start: args.start,
      };
      for (const [key, value] of Object.entries(mapped)) {
        if (value !== undefined) request[key] = value;
      }
      request.fields = args.fields?.length ? args.fields.join(",") : DEFAULT_FIELDS;

      try {
        // searchPerson is not in wikitree-js's typed action union; cast through
        // the same escape hatch call_api uses. Read-only GET action.
        const result = await wikitree.wikiTreeGet(
          request as unknown as Parameters<typeof wikitree.wikiTreeGet>[0],
          await getOptions()
        );
        return ok(result);
      } catch (e) {
        return fail(
          `Search failed: ${(e as Error).message}. Provide at least one search ` +
            "criterion (name, date, place, or parent name)."
        );
      }
    }
  );

  server.registerTool(
    "call_api",
    {
      title: "Call WikiTree API",
      description:
        "Escape hatch: call any WikiTree API action directly when no dedicated " +
        "tool covers it (e.g. 'searchPerson', 'getProfile', 'getBio'). Valid " +
        "actions and their parameters are documented at " +
        "https://github.com/wikitree/wikitree-api. Read-only GET actions only.",
      inputSchema: {
        action: z
          .string()
          .describe(
            "WikiTree API action name, e.g. 'searchPerson'. See " +
              "https://github.com/wikitree/wikitree-api for the full list."
          ),
        params: z
          .record(z.string(), z.any())
          .optional()
          .describe("Parameters for the action, as documented for that action."),
      },
      annotations: READ_ONLY,
    },
    async ({ action, params }) => {
      try {
        // Escape hatch: wikitree-js types `action` as a closed union, but the
        // WikiTree API exposes more read actions (e.g. searchPerson). Cast the
        // request so arbitrary documented actions pass through; the API
        // validates the action name and rejects unknown ones at runtime.
        const result = await wikitree.wikiTreeGet(
          { action, ...(params ?? {}) } as Parameters<typeof wikitree.wikiTreeGet>[0],
          await getOptions()
        );
        return ok(result);
      } catch (e) {
        return fail(
          `WikiTree action '${action}' failed: ${(e as Error).message}. ` +
            "Check the action name and parameters at https://github.com/wikitree/wikitree-api."
        );
      }
    }
  );

  return server;
}
