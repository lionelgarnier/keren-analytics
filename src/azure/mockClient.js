import { buildTable, getMockRows, mockResources } from "./mockData.js";

export function createMockClient() {
  const useMultiple = process.env.MOCK_RESOURCES === "multiple";
  return {
    async discoverResources() {
      return useMultiple ? mockResources : [mockResources[0]];
    },
    async checkAccess() {
      return { ok: true };
    },
    async queryWorkspace({ queryName, timeRangeKey }) {
      const rows = getMockRows(queryName, timeRangeKey);
      return buildTable(rows);
    },
  };
}
