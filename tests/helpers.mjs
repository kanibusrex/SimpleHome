// Shared harness for SimpleHome's end-to-end suite.
//
// Each test file calls useBrowser() once: that launches a single Chromium for
// the file and hands out a fresh, isolated browser context per test. Every
// page opened through it is
//
//   hermetic  - every request that isn't file: is aborted, so the suite never
//               touches the network (Google Fonts and the favicon service fail
//               fast and the page falls back exactly as it does offline);
//   strict    - an uncaught exception, a console error, or a dialog the test
//               didn't announce fails the test that caused it;
//   observable - window.open is recorded instead of opening a tab, so "opens
//               in a new tab" can be asserted without spawning real pages.
//
// Only node:test, node:assert and the playwright library are used.

import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
// SIMPLEHOME_PAGE=path/to/page.html points the suite at another copy of the
// page, e.g. the extension's generated extension/newtab.html.
export const PAGE_FILE = process.env.SIMPLEHOME_PAGE
  ? path.resolve(process.env.SIMPLEHOME_PAGE)
  : path.join(ROOT, 'index.html');
export const PAGE_URL = pathToFileURL(PAGE_FILE).href;

// What a fresh profile shows: the page's built-in shortcuts.
export const DEFAULT_SHORTCUTS = ['GitHub', 'YouTube', 'Gmail', 'Reddit'];

// A file: URL that exists only inside the harness: the route handler serves it
// as an empty page. See openApp() for why every tab visits it first.
const BLANK_URL = new URL('__harness_blank__.html', PAGE_URL).href;
// Query flag marking the one navigation that seeds storage. The init script
// strips it before any page script runs, so reloads never re-seed.
const SEED_FLAG = '__harness_seed';

/**
 * Launches one Chromium for the calling test file and closes it afterwards.
 * Returns { open(t, options) } which opens SimpleHome in a fresh context.
 */
export function useBrowser() {
  let browser = null;
  before(async () => {
    browser = await chromium.launch();
  });
  after(async () => {
    if (browser) await browser.close();
  });
  return {
    open(t, options) {
      assert.ok(browser, 'useBrowser(): browser not launched yet');
      return openApp(browser, t, options);
    },
  };
}

/**
 * Opens the page in a brand-new browser context, closed again (and checked
 * for errors) when test `t` ends.
 *
 * options.storage   localStorage entries to seed before the first load
 *                   (strings are stored as-is, anything else as JSON). Reloads
 *                   keep whatever the page itself saved since.
 * options.context   extra browser.newContext() options (timezoneId...).
 * options.goto      false to set everything up without loading the page, e.g.
 *                   to install a fake clock first; call app.load() after.
 * options.initScripts  further functions to run before page scripts.
 */
export async function openApp(browser, t, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ...options.context,
  });

  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url === BLANK_URL) {
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>harness</title>' });
    }
    return url.startsWith('file:') ? route.continue() : route.abort();
  });

  // Runs before any page script, on every document in this context.
  await context.addInitScript(
    ({ flag, storage }) => {
      const params = new URLSearchParams(location.search);
      if (params.has(flag)) {
        params.delete(flag);
        const query = params.toString();
        history.replaceState(history.state, '', location.pathname + (query ? '?' + query : '') + location.hash);
        localStorage.clear();
        for (const [key, value] of Object.entries(storage || {})) {
          localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        }
      }
      // Record new-tab navigations rather than opening real tabs.
      window.__opened = [];
      window.open = function (url, target, features) {
        window.__opened.push({ url: String(url), target: target, features: features });
        return null;
      };
    },
    { flag: SEED_FLAG, storage: options.storage || null },
  );

  for (const script of options.initScripts || []) await context.addInitScript(script);

  // Every action and wait in this suite normally settles in well under a
  // second; fail a stuck one in 15s rather than Playwright's default 30s.
  context.setDefaultTimeout(15000);

  const page = await context.newPage();
  const app = new App(page, context);

  t.after(async () => {
    await context.close().catch(() => {});
    app.assertNoErrors();
  });

  // Chromium can drop localStorage writes made by an init script in a tab's
  // very first file: document - an immediate reload then finds the profile
  // empty (seen in roughly 1 run in 5 under parallel load). Once the tab has
  // shown any file: document the writes are reliable, so park it on a blank
  // one before seeding. The page's own writes were never affected.
  await page.goto(BLANK_URL);

  if (options.goto !== false) await app.load();
  return app;
}

export class App {
  constructor(page, context) {
    this.page = page;
    this.context = context;
    this.errors = [];
    this.dialogs = [];
    this.dialogAnswers = [];
    this.seeded = false;

    page.on('pageerror', (err) => {
      this.errors.push(`pageerror: ${err.stack || err.message}`);
    });
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      if (isAbortedRequestNoise(msg)) return;
      const where = msg.location() && msg.location().url ? ` (${msg.location().url})` : '';
      this.errors.push(`console.error: ${msg.text()}${where}`);
    });
    page.on('dialog', async (dialog) => {
      const record = { type: dialog.type(), message: dialog.message() };
      this.dialogs.push(record);
      const answer = this.dialogAnswers.shift();
      if (!answer) {
        this.errors.push(`unexpected ${record.type} dialog: ${record.message}`);
        await dialog.dismiss();
      } else if (answer.accept) {
        await dialog.accept(answer.text);
      } else {
        await dialog.dismiss();
      }
    });
  }

  /** Loads the page; the first load in a tab applies options.storage. */
  async load() {
    const url = this.seeded ? PAGE_URL : `${PAGE_URL}?${SEED_FLAG}`;
    this.seeded = true;
    await this.page.goto(url);
    await this.ready();
  }

  async reload() {
    await this.page.reload();
    await this.ready();
  }

  // The main script runs synchronously at the end of <body>, so by "load" the
  // clock has ticked and the grid is built; this guards against that changing.
  async ready() {
    await this.page.waitForFunction(() => {
      const h = document.getElementById('clockH');
      return h && h.textContent !== '--' && document.querySelector('#shortcutsGrid .add-tile');
    });
  }

  /** Queue the answer for the next alert/confirm/prompt the page raises. */
  expectDialog({ accept = true, text } = {}) {
    this.dialogAnswers.push({ accept, text });
  }

  /** All of localStorage as a plain object of strings. */
  storage() {
    return this.page.evaluate(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        out[key] = localStorage.getItem(key);
      }
      return out;
    });
  }

  /** One localStorage value, JSON-parsed when it parses. */
  async stored(key) {
    const raw = await this.page.evaluate((k) => localStorage.getItem(k), key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  /** Every window.open() call the page has made since it loaded. */
  opened() {
    return this.page.evaluate(() => window.__opened);
  }

  /**
   * Waits for window.open() call number `index` (0-based; pass the count seen
   * so far to wait for the next one) and returns it.
   */
  async nextOpened(index = 0) {
    await this.page.waitForFunction((n) => window.__opened.length > n, index);
    return (await this.opened())[index];
  }

  tileLabels() {
    return this.page.locator('#shortcutsGrid .tile:not(.add-tile) .tile-label').allTextContents();
  }

  /** Rows of the launcher, top to bottom: [{ text, sub, kind, selected }] */
  results() {
    return this.page.$$eval('#results .result', (rows) =>
      rows.map((row) => ({
        text: row.querySelector('.result-text').firstChild.textContent,
        sub: (row.querySelector('.result-host') || {}).textContent || '',
        kind: row.querySelector('.result-kind').textContent,
        selected: row.classList.contains('selected'),
      })),
    );
  }

  /**
   * Types into the launcher one key at a time, as a person would, then
   * dismisses any inline completion (Delete, as in an address bar) so the
   * results reflect exactly `text`. Use typeInSearch() to keep the completion.
   */
  async search(text) {
    await this.typeInSearch(text);
    const suggested = await this.page.$eval('#searchInput', (el) => el.selectionStart < el.selectionEnd);
    if (suggested) await this.page.keyboard.press('Delete');
  }

  async typeInSearch(text) {
    const input = this.page.locator('#searchInput');
    await input.focus();
    await input.fill('');
    await this.page.keyboard.type(text);
  }

  /**
   * Activates a control from the keyboard (focus, then Enter), as a keyboard
   * user would. Unlike a pointer click this needn't wait for the control to
   * stop moving, so it is the fast path inside sheets that are still gliding in.
   */
  async activate(selector) {
    await this.page.focus(selector);
    await this.page.keyboard.press('Enter');
  }

  async openSettings() {
    await this.activate('#settingsBtn');
    await this.page.locator('#settingsPanel').waitFor({ state: 'visible' });
  }

  assertNoErrors() {
    assert.deepEqual(this.errors, [], 'the page reported errors');
  }
}

// route.abort() surfaces as "Failed to load resource: net::ERR_FAILED" against
// the aborted URL. That, for a non-file URL, is the only console error the
// harness itself causes; anything else is the page's problem.
function isAbortedRequestNoise(msg) {
  const url = (msg.location() && msg.location().url) || '';
  return /^Failed to load resource: net::ERR_FAILED$/.test(msg.text()) && url !== '' && !url.startsWith('file:');
}

// How long a frame-based wait may take before the page counts as stalled. A
// runaway animation loop starves requestAnimationFrame; that should fail the
// test, not hang it.
const FRAME_STALL_MS = 15000;

function withDeadline(promise, ms, message) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Lets the page run for at least `ms` of real time and at least two rendered
 * frames, so animation loops get to execute their per-frame code.
 */
export function soak(page, ms = 300) {
  const run = page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        const start = performance.now();
        let frames = 0;
        const step = () => {
          frames++;
          if (frames >= 2 && performance.now() - start >= duration) resolve(frames);
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    ms,
  );
  return withDeadline(run, ms + FRAME_STALL_MS, `the page stopped rendering frames (soak of ${ms}ms)`);
}

/** Waits for the page to render `count` more frames. */
export function nextFrames(page, count = 2) {
  const run = page.evaluate(
    (n) =>
      new Promise((resolve) => {
        const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step));
        requestAnimationFrame(step);
      }),
    count,
  );
  return withDeadline(run, FRAME_STALL_MS, `the page stopped rendering frames (waiting for ${count})`);
}

/**
 * Retries an assertion until it passes or the timeout expires, then rethrows
 * the last failure. For state the page reaches asynchronously (debounced
 * saves, animated group switches) where there is no single event to await.
 */
export async function eventually(assertion, { timeout = 5000 } = {}) {
  const deadline = Date.now() + timeout;
  const backoff = [0, 20, 50, 100];
  for (let attempt = 0; ; attempt++) {
    try {
      return await assertion();
    } catch (err) {
      if (Date.now() >= deadline) throw err;
      const wait = backoff[Math.min(attempt, backoff.length - 1)];
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}
