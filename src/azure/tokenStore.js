/**
 * Request-scoped Azure access token storage using AsyncLocalStorage.
 *
 * When the OAuth middleware sets a token for the current request, every
 * downstream call to `getCurrentToken()` — including deep inside the
 * orchestrator and dashboard builder — sees that token without any
 * explicit parameter threading.
 *
 * Falls back to null so callers can use alternative sources (.env).
 */
import { AsyncLocalStorage } from "node:async_hooks";

const tokenStorage = new AsyncLocalStorage();

/**
 * Run a callback with the given access token scoped to the async context.
 * All code executed within `fn` (including awaited promises) will see
 * this token via `getCurrentToken()`.
 */
export function runWithToken(token, fn) {
  return tokenStorage.run(token, fn);
}

/**
 * Return the access token for the current async context, or null.
 */
export function getCurrentToken() {
  return tokenStorage.getStore() || null;
}
