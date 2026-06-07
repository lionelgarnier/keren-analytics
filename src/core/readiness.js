function confidenceFromVolume(totalEvents) {
  if (totalEvents >= 1000) return 0.9;
  if (totalEvents >= 200) return 0.75;
  if (totalEvents >= 50) return 0.6;
  if (totalEvents >= 10) return 0.4;
  return 0.2;
}

function buildRecommendedActions(signals) {
  const actions = [];
  if (!signals.pageViews) {
    actions.push({
      id: "enable-pageviews",
      title: "Enable frontend page view tracking",
      message: "Install the App Insights web SDK to capture page views.",
    });
  }
  if (!signals.requests) {
    actions.push({
      id: "enable-requests",
      title: "Enable backend request telemetry",
      message: "Ensure Application Insights is enabled for your backend.",
    });
  }
  if (!signals.userId && !signals.userIdDegraded) {
    actions.push({
      id: "set-userid",
      title: "Attach authenticated user IDs",
      message: "Set user_AuthenticatedId to unlock unique visitors.",
    });
  }
  if (signals.userIdDegraded) {
    actions.push({
      id: "fix-userid-degraded",
      title: "Fix authenticated user ID tracking",
      message:
        "user_AuthenticatedId is nearly empty — unique visitor counts rely on anonymous IDs and are likely over-estimated. Wire your auth flow to setAuthenticatedUserContext().",
    });
  }
  if (!signals.sessionId) {
    actions.push({
      id: "set-sessionid",
      title: "Enable session tracking",
      message: "Ensure session_Id is recorded in telemetry.",
    });
  }
  if (!signals.userAgent) {
    actions.push({
      id: "enable-useragent",
      title: "Capture user agent details",
      message: "Enable client_Browser and client_OS signals.",
    });
  }
  if (!signals.geo) {
    actions.push({
      id: "enable-geo",
      title: "Enable geo enrichment",
      message:
        "client_CountryOrRegion is empty — ensure real client IPs reach Application Insights (check X-Forwarded-For if behind a proxy/CDN).",
    });
  }
  if (!signals.browserTimings) {
    actions.push({
      id: "enable-browser-timings",
      title: "Capture browser timings",
      message: "Enable browser timings to see frontend performance.",
    });
  }
  if (!signals.dependencies) {
    actions.push({
      id: "enable-dependencies",
      title: "Track outbound dependencies",
      message:
        "No dependency telemetry — enable App Insights auto-collection (or the SDK's dependency tracking) to see SQL, HTTP and queue latency / failures.",
    });
  }
  if (!signals.exceptions) {
    actions.push({
      id: "enable-exceptions",
      title: "Capture server exceptions",
      message:
        "No exception telemetry — wire trackException() (or the auto-collection module) so backend errors surface here instead of staying buried in logs.",
    });
  }
  return actions.slice(0, 5);
}

export function buildReadinessReport({ probeResult, window }) {
  const totalEvents = (probeResult.pageViewsCount || 0) + (probeResult.requestsCount || 0);
  const urlPopulated = (probeResult.urlPopulatedCount || 0) > 0;
  const namePopulated = (probeResult.namePopulatedCount || 0) > 0;
  const headerReferer = (probeResult.headerRefererCount || 0) > 0;
  const userAuthCount = probeResult.userAuthCount || 0;
  const userAnonCount = probeResult.userAnonCount || 0;

  const hasAnyUserId = userAuthCount + userAnonCount > 0;
  const authRatio = totalEvents > 0 ? userAuthCount / totalEvents : 0;
  const userIdDegraded = hasAnyUserId && authRatio < 0.1;

  const signals = {
    pageViews: (probeResult.pageViewsCount || 0) > 0,
    requests: (probeResult.requestsCount || 0) > 0,
    userId: hasAnyUserId && !userIdDegraded,
    userIdDegraded,
    sessionId: (probeResult.sessionCount || 0) + (probeResult.requestSessionCount || 0) > 0,
    userAgent: (probeResult.browserCount || 0) + (probeResult.osCount || 0) + (probeResult.deviceCount || 0) > 0,
    geo: (probeResult.geoCount || 0) > 0,
    browserTimings: (probeResult.browserTimingsCount || 0) > 0,
    dependencies: (probeResult.dependenciesCount || 0) > 0,
    exceptions: (probeResult.exceptionsCount || 0) > 0,
    multiService: (probeResult.roleCount || 0) > 1,
    urlField: urlPopulated,
    nameField: namePopulated,
    headerReferer,
  };

  let overallStatus = "OK";
  if (totalEvents === 0) {
    overallStatus = "EMPTY";
  } else {
    const hasCoreTraffic = signals.pageViews || signals.requests;
    const hasIdentity = signals.sessionId || signals.userId;
    const hasTech = signals.userAgent;
    if (!hasCoreTraffic) {
      overallStatus = "EMPTY";
    } else if (!hasIdentity || !hasTech) {
      overallStatus = "PARTIAL";
    }
  }

  return {
    overallStatus,
    availableSignals: signals,
    recommendedActions: buildRecommendedActions(signals),
    confidence: confidenceFromVolume(totalEvents),
    latestTimestamp: probeResult.latestTimestamp || null,
    probeCounts: {
      pageViewsCount: probeResult.pageViewsCount || 0,
      requestsCount: probeResult.requestsCount || 0,
      userAuthCount: probeResult.userAuthCount || 0,
      userAnonCount: probeResult.userAnonCount || 0,
      sessionCount: probeResult.sessionCount || 0,
      requestSessionCount: probeResult.requestSessionCount || 0,
      browserCount: probeResult.browserCount || 0,
      osCount: probeResult.osCount || 0,
      deviceCount: probeResult.deviceCount || 0,
      geoCount: probeResult.geoCount || 0,
      browserTimingsCount: probeResult.browserTimingsCount || 0,
      dependenciesCount: probeResult.dependenciesCount || 0,
      exceptionsCount: probeResult.exceptionsCount || 0,
      roleCount: probeResult.roleCount || 0,
      urlPopulatedCount: probeResult.urlPopulatedCount || 0,
      namePopulatedCount: probeResult.namePopulatedCount || 0,
      headerRefererCount: probeResult.headerRefererCount || 0,
    },
    probeWindow: window,
  };
}
