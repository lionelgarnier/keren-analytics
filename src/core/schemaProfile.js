export function buildSchemaProfile({ tablesResult, customDimensionsResult }) {
  const tables = {
    requests: false,
    pageViews: false,
    customEvents: false,
    dependencies: false,
    exceptions: false,
    traces: false,
    browserTimings: false,
  };

  for (const row of tablesResult || []) {
    if (row.tableName && row.count > 0 && row.tableName in tables) {
      tables[row.tableName] = true;
    }
  }

  const customDimensionsKeys = {};
  for (const row of customDimensionsResult || []) {
    if (!row.tableName || !row.key) continue;
    if (!customDimensionsKeys[row.tableName]) {
      customDimensionsKeys[row.tableName] = [];
    }
    if (!customDimensionsKeys[row.tableName].includes(row.key)) {
      customDimensionsKeys[row.tableName].push(row.key);
    }
  }

  return {
    tables,
    customDimensionsKeys,
    cardinalityWarnings: [],
  };
}
