// Every theme, picked the way a person picks it: from Settings. The list comes
// from the swatches themselves, so a new theme is covered the day it ships.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useBrowser, soak } from '../helpers.mjs';

const browser = useBrowser();

// Themes are independent, so each gets its own fresh profile and a few run at
// once; most of the cost is letting each animation actually run.
const LANES = 3;

test(
  'every theme applies from Settings, persists across reload and animates without errors',
  { concurrency: LANES, timeout: 180000 },
  async (t) => {
    const listing = await browser.open(t);
    const themes = await listing.page.$$eval('[data-swatch]', (buttons) => buttons.map((b) => b.dataset.swatch));
    assert.ok(themes.length >= 30, `expected the full theme set, found ${themes.length}`);
    assert.equal(new Set(themes).size, themes.length, 'swatch ids are unique');
    await listing.context.close();

    await Promise.all(
      themes.map((theme, i) =>
        t.test(theme, async (st) => {
          // Start from a different theme so applying this one is a real change.
          const app = await browser.open(st, { storage: { 'homepage.theme': themes[(i + 1) % themes.length] } });
          const { page } = app;

          await app.openSettings();
          await app.activate(`[data-swatch="${theme}"]`);

          const state = await page.evaluate(() => {
            const cs = getComputedStyle(document.documentElement);
            return {
              theme: document.documentElement.getAttribute('data-theme'),
              active: [...document.querySelectorAll('[data-swatch].active')].map((b) => b.dataset.swatch),
              stored: localStorage.getItem('homepage.theme'),
              bg: cs.getPropertyValue('--bg').trim(),
              metaColor: document.getElementById('themeColorMeta').getAttribute('content'),
              favicon: document.getElementById('favicon').getAttribute('href'),
              layers: document.getElementById('particles').childElementCount,
            };
          });
          assert.equal(state.theme, theme, 'data-theme follows the swatch');
          assert.deepEqual(state.active, [theme], 'exactly one swatch is marked active');
          assert.equal(state.stored, theme, 'the choice is saved');
          assert.ok(state.bg, 'the theme defines --bg');
          assert.equal(state.metaColor, state.bg, 'browser chrome colour follows the theme');
          assert.ok(state.favicon.includes(encodeURIComponent(state.bg)), 'the favicon is redrawn in the theme');
          assert.ok(state.layers > 0, 'the theme builds its background animation');

          await soak(page, 300);
          assert.deepEqual(app.errors, [], `${theme} raised errors while animating`);

          await app.reload();
          const after = await page.evaluate(() => ({
            theme: document.documentElement.getAttribute('data-theme'),
            active: [...document.querySelectorAll('[data-swatch].active')].map((b) => b.dataset.swatch),
            layers: document.getElementById('particles').childElementCount,
          }));
          assert.equal(after.theme, theme, 'the theme survives a reload');
          assert.deepEqual(after.active, [theme]);
          assert.ok(after.layers > 0, 'the animation is rebuilt on load');
          // The after hook fails the test on anything raised while booting from storage.
          await soak(page, 50);
        }),
      ),
    );
  },
);

test('custom accent colours apply live, are kept per theme, and reset', async (t) => {
  const app = await browser.open(t);
  const { page } = app;
  const accent = () =>
    page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());

  await app.openSettings();
  // Wait out the sheet's entrance once, then use the pointer like a person would.
  await page.waitForFunction(() => !document.getElementById('settingsPanel').classList.contains('entering'));
  await page.click('[data-swatch="aurora"]');
  const auroraDefault = await accent();

  await page.locator('#colorAccent').fill('#123456');
  assert.equal(await accent(), '#123456');
  assert.deepEqual((await app.stored('homepage.themeColors')).aurora, { accent: '#123456' });

  // Another theme keeps its own colours...
  await page.click('[data-swatch="frost"]');
  assert.notEqual(await accent(), '#123456');
  // ...and coming back restores the override, also after a reload.
  await page.click('[data-swatch="aurora"]');
  assert.equal(await accent(), '#123456');
  await app.reload();
  assert.equal(await accent(), '#123456');
  assert.equal(await page.inputValue('#colorAccent'), '#123456');

  await app.openSettings();
  await app.activate('#colorReset');
  assert.equal(await accent(), auroraDefault);
  assert.equal((await app.stored('homepage.themeColors')).aurora, undefined);
});
