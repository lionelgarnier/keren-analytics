import fs from "fs";
import path from "path";

const storePath = path.resolve("data", "store.json");

const defaultStore = {
  tenants: {},
};

function ensureStore() {
  if (!fs.existsSync(storePath)) {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(defaultStore, null, 2));
  }
}

function loadStore() {
  ensureStore();
  const raw = fs.readFileSync(storePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    return { ...defaultStore };
  }
}

function saveStore(store) {
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

export function getTenant(tenantId) {
  const store = loadStore();
  if (!store.tenants[tenantId]) {
    store.tenants[tenantId] = {
      selectedResource: null,
      mapping: null,
      schemaProfile: null,
      readinessReport: null,
      stateTransitions: [],
      dashboardConfig: null,
      discoveryCache: null,
    };
    saveStore(store);
  }
  return store.tenants[tenantId];
}

export function updateTenant(tenantId, patch) {
  const store = loadStore();
  const current = store.tenants[tenantId] || {
    selectedResource: null,
    mapping: null,
    schemaProfile: null,
    readinessReport: null,
    stateTransitions: [],
    dashboardConfig: null,
    discoveryCache: null,
  };
  store.tenants[tenantId] = { ...current, ...patch };
  saveStore(store);
  return store.tenants[tenantId];
}

export function logStateTransition(tenantId, transition) {
  const store = loadStore();
  const current = store.tenants[tenantId] || {
    selectedResource: null,
    mapping: null,
    schemaProfile: null,
    readinessReport: null,
    stateTransitions: [],
    dashboardConfig: null,
    discoveryCache: null,
  };
  current.stateTransitions = current.stateTransitions || [];
  current.stateTransitions.push({
    ...transition,
    timestamp: new Date().toISOString(),
  });
  store.tenants[tenantId] = current;
  saveStore(store);
}
