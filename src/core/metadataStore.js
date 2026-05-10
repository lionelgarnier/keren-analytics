import fs from "fs";
import path from "path";
import { config } from "../config.js";

const storePath = path.resolve("data", "store.json");

const MAX_STATE_TRANSITIONS = config.maxStateTransitions || 200;

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

/**
 * Atomically save the store by writing to a temporary file first,
 * then renaming to avoid partial-write corruption on concurrent access.
 * Tmp filename includes the pid so concurrent writers (e.g. parallel
 * `node --test` workers) don't race on the same tmp path and trip
 * ENOENT when one process renames the tmp out from under another.
 */
function saveStore(store) {
  const tmpPath = `${storePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2));
  fs.renameSync(tmpPath, storePath);
}

function defaultTenant() {
  return {
    selectedResource: null,
    mapping: null,
    schemaProfile: null,
    readinessReport: null,
    stateTransitions: [],
    dashboardConfig: null,
    discoveryCache: null,
    lastAccessedAt: new Date().toISOString(),
  };
}

export function getTenant(tenantId) {
  const store = loadStore();
  if (!store.tenants[tenantId]) {
    store.tenants[tenantId] = defaultTenant();
    saveStore(store);
  } else {
    // Update last accessed timestamp
    store.tenants[tenantId].lastAccessedAt = new Date().toISOString();
    saveStore(store);
  }
  return store.tenants[tenantId];
}

export function updateTenant(tenantId, patch) {
  const store = loadStore();
  const current = store.tenants[tenantId] || defaultTenant();
  store.tenants[tenantId] = { ...current, ...patch, lastAccessedAt: new Date().toISOString() };
  saveStore(store);
  return store.tenants[tenantId];
}

export function logStateTransition(tenantId, transition) {
  const store = loadStore();
  const current = store.tenants[tenantId] || defaultTenant();
  current.stateTransitions = current.stateTransitions || [];
  current.stateTransitions.push({
    ...transition,
    timestamp: new Date().toISOString(),
  });
  // Enforce retention: keep only the most recent N transitions
  if (current.stateTransitions.length > MAX_STATE_TRANSITIONS) {
    current.stateTransitions = current.stateTransitions.slice(-MAX_STATE_TRANSITIONS);
  }
  current.lastAccessedAt = new Date().toISOString();
  store.tenants[tenantId] = current;
  saveStore(store);
}
