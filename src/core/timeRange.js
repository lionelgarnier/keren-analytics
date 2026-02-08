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
