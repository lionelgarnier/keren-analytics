import fs from "fs";
import path from "path";

const kqlDir = path.resolve("kql");
const templateCache = new Map();

export function loadKqlTemplate(name) {
  if (templateCache.has(name)) {
    return templateCache.get(name);
  }
  const filePath = path.join(kqlDir, `${name}.kql`);
  const template = fs.readFileSync(filePath, "utf8");
  templateCache.set(name, template);
  return template;
}

export function renderTemplate(template, params, allowedValues = {}) {
  const placeholders = new Set();
  const pattern = /\{\{\s*([\w]+)\s*\}\}/g;
  let match = null;
  while ((match = pattern.exec(template)) !== null) {
    placeholders.add(match[1]);
  }
  for (const placeholder of placeholders) {
    if (!(placeholder in params)) {
      throw new Error(`Missing KQL param: ${placeholder}`);
    }
    const value = params[placeholder];
    if (typeof value !== "string") {
      throw new Error(`KQL param ${placeholder} must be a string`);
    }
    if (allowedValues[placeholder]) {
      const allowed = allowedValues[placeholder];
      if (!allowed.includes(value)) {
        throw new Error(`KQL param ${placeholder} is not allowed`);
      }
    }
  }
  let rendered = template;
  for (const placeholder of placeholders) {
    const value = params[placeholder];
    rendered = rendered.replace(new RegExp(`\\{\\{\\s*${placeholder}\\s*\\}\\}`, "g"), value);
  }
  return rendered;
}
