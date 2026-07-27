// Flat config (ESLint 9). Intentionally light: catch real mistakes (undeclared
// globals, unreachable code, obvious bugs) without imposing a style regime —
// Prettier owns formatting. Vanilla JS front-end + Node ESM back-end.
import js from "@eslint/js";

export default [
  {
    ignores: [
      "node_modules/**",
      "public/vendor/**",
      "public/llms.txt",
      "coverage/**",
      "data/**",
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
    },
    rules: {
      // Allow intentionally-unused args when prefixed with _ (error middleware,
      // stubbed callbacks).
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
  {
    // Back-end: Node globals.
    files: ["src/**/*.js", "scripts/**/*.mjs", "tests/**/*.js", "*.config.js"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        fetch: "readonly",
        AbortController: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
  },
  {
    // Front-end: browser globals. These files are classic scripts, not modules.
    files: ["public/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        location: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        EventSource: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        FormData: "readonly",
        Chart: "readonly",
        L: "readonly",
        navigator: "readonly",
        history: "readonly",
        requestAnimationFrame: "readonly",
        getComputedStyle: "readonly",
        CustomEvent: "readonly",
        Event: "readonly",
        Blob: "readonly",
        TextDecoder: "readonly",
        TextEncoder: "readonly",
        IntersectionObserver: "readonly",
        alert: "readonly",
        escapeHtml: "writable",
      },
    },
  },
];
