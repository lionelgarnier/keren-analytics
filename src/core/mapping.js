import crypto from "crypto";
import { validateKqlExpr } from "./kql.js";
import { CANONICAL_FIELDS } from "./canonicalFields.js";

export const mappingExpressions = {
  userId: {
    authenticated: "user_AuthenticatedId",
    anonymous: "user_Id",
    custom: 'tostring(customDimensions["userId"])',
  },
  sessionId: {
    session: "session_Id",
    operation: "operation_Id",
    custom: 'tostring(customDimensions["sessionId"])',
  },
  pagePath: {
    urlPath: 'tostring(parse_url(url).Path)',
    namePath: 'extract("(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|RSC GET|RSC POST)\\\\s+([^?\\\\s]+)", 1, name)',
    custom: 'tostring(customDimensions["page"])',
  },
  referrer: {
    refUri: 'tostring(customDimensions["refUri"])',
    referrer: 'tostring(customDimensions["referrer"])',
    headerReferer: 'tostring(customDimensions["http.request.header.referer"])',
  },
  // Device / browser / OS dimensions — substituted into tech-browser/os/device
  // and session-timelines. Default to the App Insights standard columns; the
  // user can remap to a custom dimension via the manual mapping editor.
  browser: { builtin: "client_Browser" },
  os: { builtin: "client_OS" },
  device: { builtin: "client_Type" },
};

// Alias table for custom dimension key resolution. Each canonical field has
// an `exact` list (case-insensitive) and a `pattern` regex. Layer 1 of the
// three-layer resolution chain described in docs/backlog/ai-environment-analysis.md.
export const ALIASES = {
  userId: {
    exact: [
      "userId", "user_id", "uid", "userid", "userHash",
      "user_hash", "visitorId", "visitor_id", "authenticatedUser",
      "authenticated_user", "accountId", "account_id", "memberId",
      "member_id", "profileId", "profile_id", "sub", "subject",
    ],
    pattern: /^(user|visitor|member|account|profile|customer)[_-]?(id|hash|key|ref)$/i,
  },
  sessionId: {
    exact: [
      "sessionId", "session_id", "sid", "sessionKey",
      "session_key", "visitId", "visit_id", "browsing_session",
    ],
    pattern: /^(session|visit|browsing)[_-]?(id|key|token|ref)$/i,
  },
  pagePath: {
    exact: [
      "page", "pagePath", "page_path", "pageName", "page_name",
      "pageRoute", "page_route", "route", "path", "urlPath",
      "url_path", "screen", "screenName", "screen_name", "view",
    ],
    pattern: /^(page|screen|route|view)[_-]?(path|name|route|url)$/i,
  },
  referrer: {
    exact: [
      "refUri", "referrer", "ref_uri", "referrerUrl", "referrer_url",
      "referer", "httpReferer", "http_referer", "source", "trafficSource",
      "traffic_source", "utm_source", "campaign_source",
    ],
    pattern: /^(ref|referr?er|traffic|campaign)[_-]?(uri|url|source)$/i,
  },
  browser: {
    exact: [
      "browser", "client_browser", "userBrowser", "user_browser",
      "ua_browser", "browserName", "browser_name",
    ],
    pattern: /^(client[_-]?)?(ua[_-]?)?browser([_-]?name)?$/i,
  },
  os: {
    exact: [
      "os", "client_os", "operatingSystem", "operating_system",
      "platform", "ua_os", "osName", "os_name",
    ],
    pattern: /^(client[_-]?)?(ua[_-]?)?(os|operating[_-]?system|platform)([_-]?name)?$/i,
  },
  device: {
    exact: [
      "device", "deviceType", "device_type", "client_type",
      "formFactor", "form_factor", "deviceClass", "device_class",
    ],
    pattern: /^(client[_-]?type|device([_-]?(type|class))?|form[_-]?factor)$/i,
  },
};

// Custom dimension keys flow into KQL string literals. Restrict to a safe set
// to avoid injection through telemetry-supplied identifiers.
const SAFE_CUSTOM_KEY = /^[A-Za-z0-9_.-]{1,128}$/;

function isSafeCustomKey(key) {
  return typeof key === "string" && SAFE_CUSTOM_KEY.test(key);
}

function customDimensionExpr(key) {
  return `tostring(customDimensions["${key}"])`;
}

// Collect every safe custom dimension key with the tables it appears in,
// preserving insertion order for deterministic resolution.
function indexCustomKeys(customKeysByTable) {
  const keyToTables = new Map();
  if (!customKeysByTable) return keyToTables;
  for (const [tableName, keys] of Object.entries(customKeysByTable)) {
    if (!Array.isArray(keys)) continue;
    for (const key of keys) {
      if (!isSafeCustomKey(key)) continue;
      if (!keyToTables.has(key)) keyToTables.set(key, []);
      const tables = keyToTables.get(key);
      if (!tables.includes(tableName)) tables.push(tableName);
    }
  }
  return keyToTables;
}

function findCustomDimensionMatch(customKeysByTable, canonicalField) {
  const aliases = ALIASES[canonicalField];
  if (!aliases) return null;

  const keyToTables = indexCustomKeys(customKeysByTable);
  if (keyToTables.size === 0) return null;

  const exactSet = new Set(aliases.exact.map((a) => a.toLowerCase()));

  // Pass 1: exact (case-insensitive) alias match. Prefer keys present in
  // multiple tables for cross-table consistency.
  let exactCandidate = null;
  for (const [key, tables] of keyToTables) {
    if (!exactSet.has(key.toLowerCase())) continue;
    if (!exactCandidate || tables.length > exactCandidate.tables.length) {
      exactCandidate = { key, tables };
    }
  }
  if (exactCandidate) {
    return {
      matchedKey: exactCandidate.key,
      matchType: "alias",
      tablesSeen: exactCandidate.tables.slice(),
    };
  }

  // Pass 2: regex pattern match, again favoring cross-table consistency.
  let patternCandidate = null;
  for (const [key, tables] of keyToTables) {
    if (!aliases.pattern.test(key)) continue;
    if (!patternCandidate || tables.length > patternCandidate.tables.length) {
      patternCandidate = { key, tables };
    }
  }
  if (patternCandidate) {
    return {
      matchedKey: patternCandidate.key,
      matchType: "pattern",
      tablesSeen: patternCandidate.tables.slice(),
    };
  }

  return null;
}

function customDimensionMapping(match) {
  return {
    source: `customDimensions.${match.matchedKey}`,
    expr: customDimensionExpr(match.matchedKey),
    matchType: match.matchType,
    matchedKey: match.matchedKey,
    tablesSeen: match.tablesSeen,
    confidence: match.tablesSeen.length >= 2 ? "high" : "medium",
  };
}

export function buildMapping({ schemaProfile, readinessReport }) {
  const probeCounts = readinessReport?.probeCounts || {};
  const tables = schemaProfile?.tables || {};
  const customKeys = schemaProfile?.customDimensionsKeys || {};

  // ── userId ────────────────────────────────────────────────
  let canonicalUserId = null;
  if ((probeCounts.userAuthCount || 0) > 0) {
    canonicalUserId = {
      source: "user_AuthenticatedId",
      expr: mappingExpressions.userId.authenticated,
      matchType: "builtin",
    };
  } else if ((probeCounts.userAnonCount || 0) > 0) {
    canonicalUserId = {
      source: "user_Id",
      expr: mappingExpressions.userId.anonymous,
      matchType: "builtin",
    };
  } else {
    const m = findCustomDimensionMatch(customKeys, "userId");
    if (m) canonicalUserId = customDimensionMapping(m);
  }

  // ── sessionId ─────────────────────────────────────────────
  let canonicalSessionId = null;
  if ((probeCounts.sessionCount || 0) > 0 || (probeCounts.requestSessionCount || 0) > 0) {
    canonicalSessionId = {
      source: "session_Id",
      expr: mappingExpressions.sessionId.session,
      matchType: "builtin",
    };
  } else {
    const m = findCustomDimensionMatch(customKeys, "sessionId");
    if (m) {
      canonicalSessionId = customDimensionMapping(m);
    } else if (tables.requests) {
      canonicalSessionId = {
        source: "operation_Id",
        expr: mappingExpressions.sessionId.operation,
        matchType: "builtin",
      };
    }
  }

  // ── pagePath ──────────────────────────────────────────────
  const urlPopulated = readinessReport?.availableSignals?.urlField !== false;
  const namePopulated = readinessReport?.availableSignals?.nameField === true;
  const useNameForPath = !urlPopulated && namePopulated;

  let canonicalPagePath = null;
  let pageTable = null;
  if (tables.pageViews || readinessReport?.availableSignals?.pageViews) {
    pageTable = "pageViews";
    canonicalPagePath = {
      source: useNameForPath ? "pageViews.name" : "pageViews.url",
      expr: useNameForPath ? mappingExpressions.pagePath.namePath : mappingExpressions.pagePath.urlPath,
      matchType: "builtin",
    };
  } else if (tables.requests || readinessReport?.availableSignals?.requests) {
    pageTable = "requests";
    canonicalPagePath = {
      source: useNameForPath ? "requests.name" : "requests.url",
      expr: useNameForPath ? mappingExpressions.pagePath.namePath : mappingExpressions.pagePath.urlPath,
      matchType: "builtin",
    };
  } else {
    const m = findCustomDimensionMatch(customKeys, "pagePath");
    if (m) canonicalPagePath = customDimensionMapping(m);
  }

  // ── referrer ──────────────────────────────────────────────
  const hasHeaderReferer = readinessReport?.availableSignals?.headerReferer === true;

  let canonicalReferrer = null;
  if (tables.pageViews || readinessReport?.availableSignals?.pageViews) {
    canonicalReferrer = {
      source: "customDimensions.refUri",
      expr: mappingExpressions.referrer.refUri,
      matchType: "builtin",
    };
  } else if (hasHeaderReferer) {
    canonicalReferrer = {
      source: "customDimensions.http.request.header.referer",
      expr: mappingExpressions.referrer.headerReferer,
      matchType: "builtin",
    };
  } else {
    const m = findCustomDimensionMatch(customKeys, "referrer");
    if (m) canonicalReferrer = customDimensionMapping(m);
  }

  const baseMapping = {
    canonicalTimestamp: { source: "timestamp", expr: "timestamp", matchType: "builtin" },
    canonicalUserId,
    canonicalSessionId,
    canonicalPagePath,
    canonicalReferrer,
    // Device / browser / OS each map to a standard App Insights column by
    // default; the manual mapping editor can remap any of them to a custom
    // dimension (e.g. server-side apps that log device info themselves).
    canonicalBrowser: { source: "client_Browser", expr: "client_Browser", matchType: "builtin" },
    canonicalOs: { source: "client_OS", expr: "client_OS", matchType: "builtin" },
    canonicalDevice: { source: "client_Type", expr: "client_Type", matchType: "builtin" },
    pageTable,
  };

  const version = crypto
    .createHash("sha256")
    .update(JSON.stringify(baseMapping))
    .digest("hex")
    .slice(0, 12);

  return { ...baseMapping, version, computedAt: new Date().toISOString() };
}

/**
 * Apply a user validation (Track F4) on top of a deterministic mapping.
 * Overrides from `validation.overrides` take precedence; the version hash
 * is recomputed so the cache key in `core/cache.js` invalidates downstream
 * dashboards.
 *
 * Resolution chain (high-to-low priority):
 *   1. validation overrides (this function) — populated by either:
 *        - `decision=override` (explicit user edits in the wizard), or
 *        - `decision=accept_all` (snapshot of the effective AI+deterministic
 *          mapping the user saw and accepted). The snapshot is taken in
 *          /api/setup/validate so the dashboard always uses what was shown.
 *   2. deterministic alias / built-in (already in `buildMapping`)
 */
export function mergeWithValidation(mapping, validation) {
  if (!mapping || !validation) return mapping;
  if (!validation.overrides) return mapping;

  const merged = { ...mapping };
  let changed = false;
  for (const field of CANONICAL_FIELDS) {
    const override = validation.overrides[field];
    if (!override || !override.expr || !override.source) continue;
    merged[field] = {
      source: override.source,
      expr: override.expr,
      matchType: "user-override",
      validatedAt: validation.validatedAt,
    };
    changed = true;
  }
  if (!changed) return mapping;

  // Hash the mapping WITHOUT version/computedAt. `merged` inherits the fresh
  // `computedAt` (new Date()) from buildMapping on every render, so hashing it
  // whole made `version` change each load — which changed the cache key and
  // silently re-ran ~24 Log Analytics queries per dashboard load for any tenant
  // with overrides (the common accept_all path). The version must be a pure
  // function of the mapping content, not of when it was computed.
  const { version: _prevVersion, computedAt: _prevComputedAt, ...hashInput } = merged;
  const version = crypto
    .createHash("sha256")
    .update(JSON.stringify(hashInput))
    .digest("hex")
    .slice(0, 12);
  return { ...merged, version, computedAt: new Date().toISOString() };
}

// Whitelist of expressions allowed in KQL params. When `mapping` is provided,
// extends the static defaults with the mapping's resolved exprs so that
// alias/pattern-derived custom-dimension expressions pass the renderer's check.
export function allowedKqlExpressions(mapping) {
  const userIdExpr = Object.values(mappingExpressions.userId);
  const sessionIdExpr = Object.values(mappingExpressions.sessionId);
  const pagePathExpr = Object.values(mappingExpressions.pagePath);
  const referrerExpr = Object.values(mappingExpressions.referrer);
  const browserExpr = Object.values(mappingExpressions.browser);
  const osExpr = Object.values(mappingExpressions.os);
  const deviceExpr = Object.values(mappingExpressions.device);

  if (mapping) {
    // Defence-in-depth: a persisted/restored override expr is re-validated
    // here — on EVERY render, since this runs per buildOverviewDashboard — so
    // a malicious expr that reached the DB (or a Blob-restored one that was
    // never re-checked) is never self-whitelisted into the renderer. If it
    // fails, it isn't added to the bucket and renderTemplate rejects it.
    const extend = (bucket, field) => {
      const expr = mapping[field]?.expr;
      if (expr && validateKqlExpr(expr).ok && !bucket.includes(expr)) bucket.push(expr);
    };
    extend(userIdExpr, "canonicalUserId");
    extend(sessionIdExpr, "canonicalSessionId");
    extend(pagePathExpr, "canonicalPagePath");
    extend(referrerExpr, "canonicalReferrer");
    extend(browserExpr, "canonicalBrowser");
    extend(osExpr, "canonicalOs");
    extend(deviceExpr, "canonicalDevice");
  }

  return { userIdExpr, sessionIdExpr, pagePathExpr, referrerExpr, browserExpr, osExpr, deviceExpr };
}

export function urlFieldAvailable(readinessReport) {
  return readinessReport?.availableSignals?.urlField !== false;
}
