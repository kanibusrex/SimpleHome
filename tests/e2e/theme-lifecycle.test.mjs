// Switching themes must tear the old background down completely: its canvas
// and nodes, its intervals, its animation-frame loop and any listeners it hung
// on window or document. A leak here costs battery on a page that stays open
// all day, and it compounds every time someone browses the theme grid.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useBrowser, nextFrames } from '../helpers.mjs';

const browser = useBrowser();

// Counts what is live, using only the browser's own APIs: intervals not yet
// cleared, animation frames requested but neither run nor cancelled, and
// listeners currently attached to window and document.
function instrument() {
  const intervals = new Set();
  const setI = window.setInterval;
  const clearI = window.clearInterval;
  window.setInterval = function (...args) {
    const id = setI.apply(this, args);
    intervals.add(id);
    return id;
  };
  window.clearInterval = function (id) {
    intervals.delete(id);
    return clearI.call(this, id);
  };

  const frames = new Set();
  const raf = window.requestAnimationFrame;
  const caf = window.cancelAnimationFrame;
  window.requestAnimationFrame = function (cb) {
    const id = raf.call(this, (ts) => {
      frames.delete(id);
      cb(ts);
    });
    frames.add(id);
    return id;
  };
  window.cancelAnimationFrame = function (id) {
    frames.delete(id);
    return caf.call(this, id);
  };

  let listeners = 0;
  const live = new WeakMap();
  const keyOf = (type, opts) => type + ':' + !!(typeof opts === 'boolean' ? opts : opts && opts.capture);
  for (const target of [window, document]) {
    const add = target.addEventListener;
    const remove = target.removeEventListener;
    target.addEventListener = function (type, fn, opts) {
      if (fn) {
        const keys = live.get(fn) || new Set();
        live.set(fn, keys);
        const key = (target === window ? 'w:' : 'd:') + keyOf(type, opts);
        if (!keys.has(key)) {
          keys.add(key);
          listeners++;
        }
      }
      return add.call(this, type, fn, opts);
    };
    target.removeEventListener = function (type, fn, opts) {
      const keys = fn && live.get(fn);
      if (keys && keys.delete((target === window ? 'w:' : 'd:') + keyOf(type, opts))) listeners--;
      return remove.call(this, type, fn, opts);
    };
  }

  window.__footprint = () => {
    const layer = document.getElementById('particles');
    return {
      layerChildren: layer.childElementCount,
      layerNodes: layer.getElementsByTagName('*').length,
      canvases: document.getElementsByTagName('canvas').length,
      bodyNodes: document.body.getElementsByTagName('*').length,
      intervals: intervals.size,
      pendingFrames: frames.size,
      listeners,
    };
  };
}

// Picks a theme the way the swatch does and measures in the same task, before
// any of the new theme's timers have had a chance to run, so the numbers are
// exactly that theme's footprint plus anything left over from earlier ones.
function switchAndMeasure(theme) {
  document.querySelector(`[data-swatch="${theme}"]`).click();
  return window.__footprint();
}

// Leaks compound - every switch can add another loop - so each switch is
// checked as it happens and the first sign of one fails the test at once,
// rather than after seventy switches have ground the page to a halt.
test(
  "switching through every theme twice leaves no growth beyond one theme's worth",
  { timeout: 120000 },
  async (t) => {
    const app = await browser.open(t, { initScripts: [instrument] });
    const { page } = app;
    await app.openSettings();
    const themes = await page.$$eval('[data-swatch]', (b) => b.map((x) => x.dataset.swatch));

    const first = {};
    for (const theme of themes) {
      const f = (first[theme] = await page.evaluate(switchAndMeasure, theme));
      // One theme at a time: never more than one animation-frame loop.
      assert.ok(f.pendingFrames <= 1, `after switching to ${theme}, ${f.pendingFrames} frame loops are running`);
      await nextFrames(page, 2); // let the theme's own loops and timers start
    }

    for (const theme of themes) {
      const again = await page.evaluate(switchAndMeasure, theme);
      assert.deepEqual(again, first[theme], `${theme}'s footprint grew the second time round`);
      await nextFrames(page, 2);
    }

    // What is still running at the end is exactly what the last theme runs alone.
    const last = themes[themes.length - 1];
    const running = ({ canvases, intervals, pendingFrames, listeners }) => ({
      canvases,
      intervals,
      pendingFrames,
      listeners,
    });
    assert.deepEqual(running(await page.evaluate(() => window.__footprint())), running(first[last]));
  },
);

// The README: "Background animations pause when the tab is hidden, so a
// backgrounded home page costs nothing." Visibility is simulated by overriding
// document.hidden and firing visibilitychange, which is what the page listens to.
function hide() {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
  return window.__footprint();
}
function show() {
  delete document.hidden;
  delete document.visibilityState;
  document.dispatchEvent(new Event('visibilitychange'));
  return window.__footprint();
}

test(
  'a hidden tab stops the clock and every background timer and frame loop, and resumes on return',
  { timeout: 120000 },
  async (t) => {
    const app = await browser.open(t, { initScripts: [instrument] });
    const { page } = app;
    const themes = await page.$$eval('[data-swatch]', (b) => b.map((x) => x.dataset.swatch));
    const visibleIdle = await page.evaluate(() => window.__footprint());

    const hidden = {};
    for (const theme of themes) {
      const fresh = await page.evaluate(switchAndMeasure, theme);
      await nextFrames(page, 2);
      hidden[theme] = await page.evaluate(hide);
      assert.equal(hidden[theme].pendingFrames, 0, `${theme} still has a frame loop queued while hidden`);
      const back = await page.evaluate(show);
      const running = ({ canvases, intervals, pendingFrames, listeners, layerChildren }) => ({
        canvases,
        intervals,
        pendingFrames,
        listeners,
        layerChildren,
      });
      assert.deepEqual(running(back), running(fresh), `${theme} comes back exactly as it was built`);
    }

    // Hidden, no theme leaves anything behind: whatever still runs is the same
    // for all of them, and it is less than a visible page runs (the clock stops).
    const floor = Math.min(...themes.map((th) => hidden[th].intervals));
    const stillBusy = themes
      .filter((th) => hidden[th].intervals > floor)
      .map((th) => `${th}: ${hidden[th].intervals - floor} interval(s) still running`);
    assert.deepEqual(stillBusy, [], 'background work kept running in a hidden tab');
    assert.ok(floor < visibleIdle.intervals, 'the clock interval stops while hidden');
  },
);
