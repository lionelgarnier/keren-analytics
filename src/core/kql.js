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

// KQL functions/operators that can read external or other-scope data — or chain
// a query — even when used as a nested expression (no leading pipe). The free
// mapping-expression editor must never allow these; the allowlist below would
// already block most via characters, this catches the keyword-only ones.
const BLOCKED_KQL_KEYWORDS =
  /\b(externaldata|toscalar|materialize|datatable|cluster|workspace|database|http_request|evaluate|range|print|union|join|search|find|invoke|consume)\b/i;

// Characters allowed OUTSIDE string literals in a mapping expression. Covers
// every built-in/AI expression we generate (identifiers, function calls,
// customDimensions[...] access, dotted columns, numeric args) and nothing that
// chains operators (`|`), ends a statement (`;`), opens a comment (`/`), or
// smuggles a second clause (`&`, `=`, `<`, `>`, `{`, `}`, `@`, …).
const ALLOWED_OUTSIDE_STRINGS = /[^A-Za-z0-9_ \t.,()[\]]/;

/**
 * Validate a user-supplied (or AI-proposed) KQL mapping expression before it is
 * persisted/substituted into a template. Strategy: strip string literals first
 * — so legitimate regex alternation like `extract("(?:GET|POST)…")` isn't
 * mistaken for a pipe — then enforce a tight character allowlist on the rest
 * plus a keyword denylist. Defence-in-depth: the query still runs scoped to the
 * caller's own resource/token.
 *
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateKqlExpr(expr) {
  if (typeof expr !== "string") return { ok: false, reason: "expr must be a string" };
  const trimmed = expr.trim();
  if (!trimmed) return { ok: false, reason: "expr is empty" };
  if (trimmed.length > 500) return { ok: false, reason: "expr is too long" };

  // Remove "...", '...' and @"..."/@'...' verbatim string literals (honouring
  // backslash escapes), replacing each with a space so tokens inside them are
  // ignored by the operator checks below.
  const stripped = trimmed
    .replace(/@?"(?:[^"\\]|\\.)*"/g, " ")
    .replace(/@?'(?:[^'\\]|\\.)*'/g, " ");

  // A leftover quote means an unbalanced/unterminated string — reject.
  if (/["'`]/.test(stripped)) return { ok: false, reason: "unbalanced string literal" };
  if (ALLOWED_OUTSIDE_STRINGS.test(stripped)) {
    return { ok: false, reason: "disallowed character outside a string literal" };
  }
  if (BLOCKED_KQL_KEYWORDS.test(stripped)) {
    return { ok: false, reason: "disallowed KQL keyword" };
  }
  return { ok: true };
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
      // "any" bypasses whitelist — value is sanitized below instead
      if (allowed !== "any" && !allowed.includes(value)) {
        throw new Error(`KQL param ${placeholder} is not allowed`);
      }
      // Sanitize user-supplied values: strip characters that could break KQL
      if (allowed === "any") {
        if (/[;|&\r\n]/.test(value)) {
          throw new Error(`KQL param ${placeholder} contains disallowed characters`);
        }
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
