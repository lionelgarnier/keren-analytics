import fs from "fs";
import path from "path";

const auditPath = path.resolve("data", "audit.log");

export function auditEvent(event) {
  const entry = {
    ...event,
    timestamp: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.appendFileSync(auditPath, `${JSON.stringify(entry)}\n`);
}
