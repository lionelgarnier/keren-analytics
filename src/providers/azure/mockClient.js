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
      // Always return the Log Analytics table shape ({ tables: [...] }) that the
      // real client produces — the dashboard reads every result through
      // toRows(), which needs `.tables`. A previous `{ _raw: ... }` branch for 7
      // queries (peakHours, urlParams, campaignBreakdown, …) produced a shape
      // nothing consumes, so those cards rendered empty in mock mode AND the
      // public demo despite mockData generating real rows. Mock parity means
      // matching the real client's return SHAPE, not just its method names.
      return buildTable(getMockRows(queryName, timeRangeKey));
    },
  };
}
