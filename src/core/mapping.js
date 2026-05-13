import crypto from "crypto";

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
    canonicalUserAgent: {
      source: "client_Browser/client_OS/client_Type",
      expr: "client_Browser",
      matchType: "builtin",
    },
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
  const fields = ["canonicalUserId", "canonicalSessionId", "canonicalPagePath", "canonicalReferrer"];
  let changed = false;
  for (const field of fields) {
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

  const version = crypto
    .createHash("sha256")
    .update(JSON.stringify(merged))
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

  if (mapping) {
    if (mapping.canonicalUserId?.expr && !userIdExpr.includes(mapping.canonicalUserId.expr)) {
      userIdExpr.push(mapping.canonicalUserId.expr);
    }
    if (mapping.canonicalSessionId?.expr && !sessionIdExpr.includes(mapping.canonicalSessionId.expr)) {
      sessionIdExpr.push(mapping.canonicalSessionId.expr);
    }
    if (mapping.canonicalPagePath?.expr && !pagePathExpr.includes(mapping.canonicalPagePath.expr)) {
      pagePathExpr.push(mapping.canonicalPagePath.expr);
    }
    if (mapping.canonicalReferrer?.expr && !referrerExpr.includes(mapping.canonicalReferrer.expr)) {
      referrerExpr.push(mapping.canonicalReferrer.expr);
    }
  }

  return { userIdExpr, sessionIdExpr, pagePathExpr, referrerExpr };
}

export function urlFieldAvailable(readinessReport) {
  return readinessReport?.availableSignals?.urlField !== false;
}
