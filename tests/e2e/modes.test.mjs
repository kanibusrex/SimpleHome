// Page-wide modes and the keys that drive them: zen mode, Escape, and the
// Drift focus timer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useBrowser, soak } from '../helpers.mjs';

const browser = useBrowser();

const isZen = (page) => page.evaluate(() => document.body.classList.contains('zen'));
const activeId = (page) => page.evaluate(() => document.activeElement && document.activeElement.id);

test('Z toggles zen mode, which is remembered across reloads; Esc brings everything back', async (t) => {
  const app = await browser.open(t);
  const { page } = app;

  await page.keyboard.press('z');
  assert.equal(await isZen(page), true);
  assert.ok(await page.locator('.shortcuts-wrap').isHidden(), 'the tiles step aside');
  assert.ok(await page.locator('#clock').isVisible(), 'the clock stays');
  assert.ok(await page.locator('#searchInput').isVisible(), 'and so does search');
  assert.equal(await page.getAttribute('#zenBtn', 'aria-label'), 'Exit zen mode (Z)');
  assert.equal(await app.stored('homepage.zen'), 1);

  await app.reload();
  assert.equal(await isZen(page), true, 'still zen after a reload');

  // Typing a z into search is just a z.
  await page.focus('#searchInput');
  await page.keyboard.type('zz');
  assert.equal(await isZen(page), true);
  assert.equal(await page.inputValue('#searchInput'), 'zz');
  await page.keyboard.press('Escape'); // clears the search
  await page.keyboard.press('Escape'); // leaves the search box
  assert.equal(await isZen(page), true, 'Esc in search deals with search first');

  await page.keyboard.press('Escape');
  assert.equal(await isZen(page), false);
  assert.ok(await page.locator('.shortcuts-wrap').isVisible());
  assert.equal(await app.stored('homepage.zen'), 0);

  await page.click('#zenBtn');
  assert.equal(await isZen(page), true, 'the toolbar button toggles it too');
});

test('Escape closes whatever is open: the dialog, then the sheets, then search', async (t) => {
  const app = await browser.open(t);
  const { page } = app;

  await app.openSettings();
  await page.keyboard.press('Escape');
  await page.locator('#settingsPanel').waitFor({ state: 'hidden' });
  assert.ok((await page.locator('#panelScrim.visible').count()) === 0, 'the dimmed backdrop goes too');

  await page.keyboard.press('Shift+S');
  await page.locator('#scratchPanel').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await page.locator('#scratchPanel').waitFor({ state: 'hidden' });

  await page.click('#editBtn');
  await page.click('#shortcutsGrid .add-tile');
  await page.locator('#modalOverlay').waitFor({ state: 'visible' });
  await page.keyboard.type('half-typed');
  await page.keyboard.press('Escape');
  await page.locator('#modalOverlay').waitFor({ state: 'hidden' });
  assert.equal((await app.tileLabels()).length, 4, 'nothing was added');
  assert.equal(await page.evaluate(() => document.body.classList.contains('editing')), true, 'still editing');

  await page.focus('#searchInput');
  await page.keyboard.type('half a thought');
  await page.locator('#results').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  assert.equal(await page.inputValue('#searchInput'), '', 'the first Esc clears the query');
  assert.ok(await page.locator('#results').isHidden());
  assert.equal(await activeId(page), 'searchInput');
  await page.keyboard.press('Escape');
  assert.notEqual(await activeId(page), 'searchInput', 'the second leaves the box');

  // The dimmed page behind a sheet closes it when tapped.
  await app.openSettings();
  await page.mouse.click(40, 400);
  await page.locator('#settingsPanel').waitFor({ state: 'hidden' });
});

test('F opens the focus timer and Esc goes back to the shortcuts', async (t) => {
  const app = await browser.open(t);
  const { page } = app;
  const isOpen = () => page.evaluate(() => document.body.classList.contains('focus-open'));

  await page.keyboard.press('f');
  await page.waitForFunction(() => document.getElementById('focusView').classList.contains('open'));
  assert.equal(await page.getAttribute('#focusView', 'aria-hidden'), 'false');
  assert.equal(await isOpen(), true);
  // Focus moves into the timer, onto its Start button.
  await page.waitForFunction(() => {
    const host = document.getElementById('focusView');
    return (
      document.activeElement === host && host.shadowRoot.activeElement && host.shadowRoot.activeElement.id === 'primary'
    );
  });
  assert.equal(await page.locator('#focusView #primary').textContent(), 'Start');

  // The page's own shortcuts are off while the timer has the keyboard.
  await page.keyboard.press('z');
  assert.equal(await isZen(page), false);

  await soak(page, 300); // the scene animates without errors

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.body.classList.contains('focus-open'));
  assert.equal(await page.getAttribute('#focusView', 'aria-hidden'), 'true');
  assert.equal(await activeId(page), 'focusBtn', 'focus returns to the toolbar button');

  // F typed into search, or with a sheet open, is not a shortcut.
  await page.focus('#searchInput');
  await page.keyboard.type('f');
  assert.equal(await isOpen(), false);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await app.openSettings();
  await page.keyboard.press('f');
  assert.equal(await isOpen(), false);
  await page.keyboard.press('Escape');

  // The toolbar button opens it as well.
  await page.click('#focusBtn');
  await page.waitForFunction(() => document.body.classList.contains('focus-open'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.body.classList.contains('focus-open'));
});

test('a running focus session keeps counting down after leaving the timer', async (t) => {
  const app = await browser.open(t);
  const { page } = app;

  await page.keyboard.press('f');
  await page.waitForFunction(() => document.body.classList.contains('focus-open'));
  await page.keyboard.press('Space');
  await page.waitForFunction(() => /^\d\d:\d\d · Home$/.test(document.title));
  assert.equal(await page.locator('#focusView #primary').textContent(), 'Pause');

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.body.classList.contains('focus-open'));
  // The toolbar button shows the time left and keeps ticking.
  const label = await page.textContent('#focusBtn .tb-label');
  assert.match(label, /^\d\d:\d\d$/);
  await page.waitForFunction((l) => document.querySelector('#focusBtn .tb-label').textContent !== l, label, {
    timeout: 3000,
  });
  assert.match(await page.title(), /^\d\d:\d\d · Home$/);

  // Back in, Space pauses; ending the session restores the title.
  await page.keyboard.press('f');
  await page.waitForFunction(() => document.body.classList.contains('focus-open'));
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#focusView #primary').textContent(), 'Resume');
  await page.locator('#focusView #endBtn').click();
  await page.waitForFunction(() => document.title === 'Home');
});
