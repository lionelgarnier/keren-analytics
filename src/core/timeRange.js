export function resolveTimeRange(rangeKey) {
  const now = new Date();
  if (rangeKey === "today") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { key: "today", start, end: now };
  }
  if (rangeKey === "30d") {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { key: "30d", start, end: now };
  }
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { key: "7d", start, end: now };
}

export function toKqlDatetime(value) {
  const iso = value.toISOString();
  return `datetime("${iso}")`;
}
