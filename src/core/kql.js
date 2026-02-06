import fs from "fs";
import path from "path";

const kqlDir = path.resolve("kql");
const templateCache = new Map();
const MAX_TEMPLATE_CACHE_SIZE = 50;

export function loadKqlTemplate(name) {
  if (templateCache.has(name)) {
    return templateCache.get(name);
  }
  const filePath = path.join(kqlDir, `${name}.kql`);
  const template = fs.readFileSync(filePath, "utf8");
  // Evict oldest entry if cache exceeds the bound
  if (templateCache.size >= MAX_TEMPLATE_CACHE_SIZE) {
    const firstKey = templateCache.keys().next().value;
    templateCache.delete(firstKey);
  }
  templateCache.set(name, template);
  return template;
}

/** Clear the template cache (useful for testing or hot-reload). */
export function clearTemplateCache() {
  templateCache.clear();
}

export function renderTemplate(template, params, allowedValues = {}) {
  const placeholders = new Set();
  const pattern = /\{\{\s*([\w]+)\s*\}\}/g;

  // Use matchAll for safe iteration (no risk of infinite loop with exec)
  for (const match of template.matchAll(pattern)) {
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
