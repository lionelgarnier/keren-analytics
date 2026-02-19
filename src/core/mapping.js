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

function pickCustomKey(customDimensionsKeys, key) {
  if (!customDimensionsKeys) return false;
  return Object.values(customDimensionsKeys).some((keys) => keys.includes(key));
}

export function buildMapping({ schemaProfile, readinessReport }) {
  const probeCounts = readinessReport?.probeCounts || {};
  const tables = schemaProfile?.tables || {};
  const customKeys = schemaProfile?.customDimensionsKeys || {};

  let canonicalUserId = null;
  if ((probeCounts.userAuthCount || 0) > 0) {
    canonicalUserId = {
      source: "user_AuthenticatedId",
      expr: mappingExpressions.userId.authenticated,
    };
  } else if ((probeCounts.userAnonCount || 0) > 0) {
    canonicalUserId = {
      source: "user_Id",
      expr: mappingExpressions.userId.anonymous,
    };
  } else if (pickCustomKey(customKeys, "userId")) {
    canonicalUserId = {
      source: "customDimensions.userId",
      expr: mappingExpressions.userId.custom,
    };
  }

  let canonicalSessionId = null;
  if ((probeCounts.sessionCount || 0) > 0 || (probeCounts.requestSessionCount || 0) > 0) {
    canonicalSessionId = {
      source: "session_Id",
      expr: mappingExpressions.sessionId.session,
    };
  } else if (pickCustomKey(customKeys, "sessionId")) {
    canonicalSessionId = {
      source: "customDimensions.sessionId",
      expr: mappingExpressions.sessionId.custom,
    };
  } else if (tables.requests) {
    canonicalSessionId = {
      source: "operation_Id",
      expr: mappingExpressions.sessionId.operation,
    };
  }

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
    };
  } else if (tables.requests || readinessReport?.availableSignals?.requests) {
    pageTable = "requests";
    canonicalPagePath = {
      source: useNameForPath ? "requests.name" : "requests.url",
      expr: useNameForPath ? mappingExpressions.pagePath.namePath : mappingExpressions.pagePath.urlPath,
    };
  } else if (pickCustomKey(customKeys, "page")) {
    canonicalPagePath = {
      source: "customDimensions.page",
      expr: mappingExpressions.pagePath.custom,
    };
  }

  const hasHeaderReferer = readinessReport?.availableSignals?.headerReferer === true;

  let canonicalReferrer = null;
  if (tables.pageViews || readinessReport?.availableSignals?.pageViews) {
    canonicalReferrer = {
      source: "customDimensions.refUri",
      expr: mappingExpressions.referrer.refUri,
    };
  } else if (hasHeaderReferer) {
    canonicalReferrer = {
      source: "customDimensions.http.request.header.referer",
      expr: mappingExpressions.referrer.headerReferer,
    };
  } else if (pickCustomKey(customKeys, "referrer")) {
    canonicalReferrer = {
      source: "customDimensions.referrer",
      expr: mappingExpressions.referrer.referrer,
    };
  }

  const baseMapping = {
    canonicalTimestamp: { source: "timestamp", expr: "timestamp" },
    canonicalUserId,
    canonicalSessionId,
    canonicalPagePath,
    canonicalReferrer,
    canonicalUserAgent: {
      source: "client_Browser/client_OS/client_Type",
      expr: "client_Browser",
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

export function allowedKqlExpressions() {
  return {
    userIdExpr: Object.values(mappingExpressions.userId),
    sessionIdExpr: Object.values(mappingExpressions.sessionId),
    pagePathExpr: Object.values(mappingExpressions.pagePath),
    referrerExpr: Object.values(mappingExpressions.referrer),
  };
}

export function urlFieldAvailable(readinessReport) {
  return readinessReport?.availableSignals?.urlField !== false;
}
