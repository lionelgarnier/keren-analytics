/**
 * The canonical mapping field set — the single source of truth.
 *
 * These field names were previously redeclared in ~5 places (server.js twice,
 * mapping.js, fieldPalette.js, setup.js) with no cross-check. The dangerous
 * pair was `ALLOWED_OVERRIDE_FIELDS` (what the API accepts) vs the list
 * `mergeWithValidation` iterates (what the render actually applies): if they
 * drifted, an override would be accepted and persisted but silently ignored at
 * render. Deriving both from here makes that drift impossible.
 */

// Full set of user-remappable canonical fields (identity + device/browser/OS).
export const CANONICAL_FIELDS = [
  "canonicalUserId",
  "canonicalSessionId",
  "canonicalPagePath",
  "canonicalReferrer",
  "canonicalBrowser",
  "canonicalOs",
  "canonicalDevice",
];

// Identity-only subset: the fields the AI proposes and the scan-step preview
// reports coverage for. A deliberate subset of CANONICAL_FIELDS, not a
// competing definition.
export const CANONICAL_IDENTITY_FIELDS = [
  "canonicalUserId",
  "canonicalSessionId",
  "canonicalPagePath",
  "canonicalReferrer",
];
