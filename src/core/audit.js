import fs from "fs";
import path from "path";

const auditPath = path.resolve("data", "audit.log");
let dirEnsured = false;

export function auditEvent(event) {
  const entry = {
    ...event,
    timestamp: new Date().toISOString(),
  };
  if (!dirEnsured) {
    fs.mkdirSync(path.dirname(auditPath), { recursive: true });
    dirEnsured = true;
  }
  // Use async write to avoid blocking the event loop under load
  fs.appendFile(auditPath, `${JSON.stringify(entry)}\n`, (err) => {
    if (err) {
      console.error("Failed to write audit log:", err.message);
    }
  });
}
