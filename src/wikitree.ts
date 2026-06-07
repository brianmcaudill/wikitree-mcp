import * as wikitree from "wikitree-js";

/**
 * Shared WikiTree client concerns: app identity and optional authentication.
 *
 * Authentication is OPTIONAL. With no credentials the server reads public
 * WikiTree data. With WIKITREE_EMAIL / WIKITREE_PASSWORD set, it logs in once
 * so the caller can also see private/living profiles they have access to.
 */

const APP_ID = process.env.WIKITREE_APP_ID || "ActyraWikiTreeMCP";

let cachedAuth: wikitree.WikiTreeAuthentication | undefined;
let authAttempted = false;

/**
 * Returns the options object every wikitree-js call needs: `{ auth, appId }`.
 * `auth` is undefined when no credentials are configured or login failed.
 */
export async function getOptions(): Promise<{
  auth: wikitree.WikiTreeAuthentication | undefined;
  appId: string;
}> {
  return { auth: await getAuth(), appId: APP_ID };
}

async function getAuth(): Promise<wikitree.WikiTreeAuthentication | undefined> {
  if (cachedAuth) return cachedAuth;
  // Only attempt login once per process. A failed or absent login must not
  // re-hit the WikiTree login endpoint on every subsequent tool call.
  if (authAttempted) return undefined;
  authAttempted = true;

  const email = process.env.WIKITREE_EMAIL;
  const password = process.env.WIKITREE_PASSWORD;
  if (!email || !password) return undefined;

  try {
    cachedAuth = await wikitree.login(email, password);
    console.error(`[wikitree-mcp] Authenticated as ${email}`);
    return cachedAuth;
  } catch (err) {
    console.error(
      `[wikitree-mcp] Login failed; continuing with public access: ${
        (err as Error).message
      }`
    );
    return undefined;
  }
}
