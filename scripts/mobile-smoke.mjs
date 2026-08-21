#!/usr/bin/env node
/**
 * Mobile smoke test — guards the phone layout against silent regressions.
 *
 * The dashboard is desktop-first and its mobile rules live in media queries
 * that nothing else exercises, so a stray width or a re-anchored overlay only
 * shows up on a real device. This drives an emulated iPhone through every
 * route and asserts the four things the mobile audit found broken.
 *
 * Usage:  node scripts/mobile-smoke.mjs           (expects a server on :3000)
 *         BASE_URL=http://localhost:4000 node scripts/mobile-smoke.mjs
 */
import { chromium, devices } from "playwright";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const VIEWPORT = { width: 390, height: 844 };

const failures = [];
function fail(route, message) {
  failures.push(`${route}: ${message}`);
  console.error(`  FAIL ${message}`);
}
function pass(message) {
  console.log(`  ok   ${message}`);
}

/** Elements whose box escapes the viewport horizontally, widest first. */
const OVERFLOW_PROBE = () => {
  const doc = document.documentElement;
  const offenders = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.right > innerWidth + 1 || r.left < -1) {
      let sel = el.tagName.toLowerCase();
      if (el.id) sel += `#${el.id}`;
      else if (el.classList.length) sel += `.${[...el.classList].slice(0, 2).join(".")}`;
      offenders.push({ sel, width: Math.round(r.width), right: Math.round(r.right) });
    }
  }
  const seen = new Set();
  return {
    overflow: doc.scrollWidth - innerWidth,
    viewportWidth: innerWidth,
    offenders: offenders
      .sort((a, b) => b.width - a.width)
      .filter((o) => !seen.has(o.sel) && seen.add(o.sel))
      .slice(0, 5),
  };
};

/** Visible text carrying a keyboard glyph — dead UI on a touch device. */
const GLYPH_PROBE = () => {
  const hits = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walk.nextNode())) {
    const text = node.textContent.trim();
    if (!text || !/[⌘↵]|↑↓/.test(text)) continue;
    const el = node.parentElement;
    if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    hits.push(text.slice(0, 30));
  }
  return hits;
};

/** Fields below 16px make iOS zoom in on focus and never zoom back out. */
const FONT_PROBE = () => {
  const small = [];
  for (const el of document.querySelectorAll("input:not([type=hidden]), select, textarea")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const size = parseFloat(cs.fontSize);
    if (size < 16) small.push(`${el.id || el.tagName.toLowerCase()} @ ${size}px`);
  }
  return small;
};

async function checkRoute(page, route, label = route) {
  console.log(`\n[${label}]`);
  const { overflow, offenders, viewportWidth } = await page.evaluate(OVERFLOW_PROBE);

  // Chromium widens the layout viewport to fit overflowing content, which
  // hides the overflow from a naive scrollWidth check — catch that too.
  if (viewportWidth > VIEWPORT.width) {
    fail(label, `layout viewport widened to ${viewportWidth}px (content forces it): ${JSON.stringify(offenders)}`);
  } else if (overflow > 1) {
    fail(label, `page scrolls sideways by ${overflow}px: ${JSON.stringify(offenders)}`);
  } else {
    pass("no horizontal page scroll");
  }

  const glyphs = await page.evaluate(GLYPH_PROBE);
  if (glyphs.length) fail(label, `keyboard glyphs visible on touch: ${JSON.stringify(glyphs)}`);
  else pass("no keyboard-only chrome");

  const smallFields = await page.evaluate(FONT_PROBE);
  if (smallFields.length) fail(label, `fields below 16px (iOS zooms on focus): ${JSON.stringify(smallFields)}`);
  else pass("form fields at 16px or larger");
}

async function checkOverlay(page, name, open, selector) {
  for (const scrollY of [0, 600]) {
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    await page.waitForTimeout(200);
    await open();
    await page.waitForTimeout(350);
    const box = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        inViewport: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
        rect: `${Math.round(r.width)}x${Math.round(r.height)} at ${Math.round(r.x)},${Math.round(r.y)}`,
      };
    }, selector);

    if (!box) fail("overlays", `${name} did not open (scrollY=${scrollY})`);
    else if (!box.inViewport) fail("overlays", `${name} outside the viewport at scrollY=${scrollY}: ${box.rect}`);
    else pass(`${name} fully visible at scrollY=${scrollY}`);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }

  const pinned = await page.evaluate(() => getComputedStyle(document.body).position === "fixed");
  if (pinned) fail("overlays", `${name} left the page scroll-locked after closing`);
  else pass(`${name} releases the scroll lock`);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  ...devices["iPhone 14"],
  viewport: VIEWPORT,
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();

const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));

try {
  console.log(`Mobile smoke test against ${BASE_URL} at ${VIEWPORT.width}x${VIEWPORT.height}`);

  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await checkRoute(page, "/", "landing");

  // Mock-mode login, then the service hub.
  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: "domcontentloaded" });
  await page.goto(`${BASE_URL}/services`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".d2-rescard", { timeout: 15000 }).catch(() => {});
  await checkRoute(page, "/services", "hub");

  // The preview dashboard renders every panel without needing a configured
  // resource, so it is the widest surface to check.
  await page.goto(`${BASE_URL}/preview`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".dash-kpi-a", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  for (const tab of ["marketing", "technical", "backend", "readiness"]) {
    await page.evaluate((t) => document.querySelector(`.dash-subtab[data-tab="${t}"]`)?.click(), tab);
    await page.waitForTimeout(1500);
    await checkRoute(page, "/preview", `dashboard:${tab}`);
  }

  // Overlay entry points are hidden on touch by design, so drive the app's
  // own open functions rather than clicking chrome that should not be there.
  console.log("\n[overlays]");
  await page.evaluate((t) => document.querySelector(`.dash-subtab[data-tab="${t}"]`)?.click(), "marketing");
  await page.waitForTimeout(1200);
  await checkOverlay(page, "drill drawer", () => page.evaluate(() => document.querySelector(".dash-kpi-a")?.click()), ".dash-drill");
  await checkOverlay(page, "command palette", () => page.evaluate(() => window.openCmdk()), ".dash-cmdk");

  // The wizard's scan runs before the findings step appears.
  await page.goto(`${BASE_URL}/setup`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#scanningContinue:not([disabled]), #findingsContinue", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  await checkRoute(page, "/setup", "wizard");

  // The mapping table is collapsed behind a disclosure that only opens by
  // itself for low-confidence mappings.
  await page.goto(`${BASE_URL}/setup?mode=manual`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#validateTable", { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => {
    const d = document.getElementById("mappingDisclosure");
    if (d) d.open = true;
  });
  await page.waitForTimeout(800);
  await checkRoute(page, "/setup?mode=manual", "mapping editor");

  console.log("\n[console]");
  if (pageErrors.length) fail("console", `uncaught page errors: ${JSON.stringify(pageErrors.slice(0, 5))}`);
  else pass("no uncaught page errors");
} finally {
  await browser.close();
}

console.log("");
if (failures.length) {
  console.error(`Mobile smoke test failed (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("Mobile smoke test passed.");
