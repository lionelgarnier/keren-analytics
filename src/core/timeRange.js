export function resolveTimeRange(rangeKey, customStart, customEnd) {
  const now = new Date();
  if (rangeKey === "custom" && customStart && customEnd) {
    const start = new Date(customStart);
    const end = new Date(customEnd);
    // End of day for the end date
    end.setUTCHours(23, 59, 59, 999);
    return { key: "custom", start, end };
  }
  if (rangeKey === "today") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { key: "today", start, end: now };
  }
  if (rangeKey === "yesterday") {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return { key: "yesterday", start, end };
  }
  if (rangeKey === "30d") {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { key: "30d", start, end: now };
  }
  if (rangeKey === "prev7d") {
    const end = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { key: "prev7d", start, end };
  }
  if (rangeKey === "prev30d") {
    const end = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { key: "prev30d", start, end };
  }
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { key: "7d", start, end: now };
}

export function toKqlDatetime(value) {
  const iso = value.toISOString();
  return `datetime("${iso}")`;
}

/**
 * Maps a "current" time range to its immediately-preceding equivalent
 * window for period-over-period comparison (B4). Only the launch-supported
 * ranges (today / 7d / 30d) get a comparison; anything else returns null
 * and the caller renders the comparison chip as neutral / hidden.
 *
 * Examples:
 *   today  → yesterday
 *   7d     → prev7d (the 7 days before the current 7d window)
 *   30d    → prev30d
 *
 * Returns the resolved `{ key, start, end }` shape, or `null` when the
 * input range key has no defined predecessor.
 */
export function previousTimeRange(timeRange) {
  if (!timeRange || !timeRange.key) return null;
  const PREV_KEY = { today: "yesterday", "7d": "prev7d", "30d": "prev30d" };
  const prevKey = PREV_KEY[timeRange.key];
  if (!prevKey) return null;
  return resolveTimeRange(prevKey);
}

const COMPARISON_LABELS = {
  today: "vs yesterday",
  "7d": "vs last week",
  "30d": "vs last month",
};

/**
 * Human-readable caption for the period-over-period delta chip ("vs last
 * week", etc.). Returns null for ranges that don't define a comparison
 * window so the UI can hide the caption gracefully.
 */
export function comparisonLabel(rangeKey) {
  return COMPARISON_LABELS[rangeKey] || null;
}
