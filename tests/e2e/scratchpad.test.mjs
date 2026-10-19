// The scratchpad: a notes sheet that saves as you type, with checklist lines.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useBrowser } from '../helpers.mjs';

const browser = useBrowser();

const noteSaved = (page) =>
  page.waitForFunction(() => document.getElementById('scratchStatus').textContent === 'Saved');

// Clicks just inside the left edge of the given line (0-based) of the note,
// i.e. on the "- [ ]" of a checklist line.
async function clickLineStart(page, line) {
  const at = await page.$eval(
    '#scratchText',
    (ta, n) => {
      const cs = getComputedStyle(ta);
      const lineHeight = parseFloat(cs.lineHeight);
      return {
        x: parseFloat(cs.paddingLeft) + 4,
        y: parseFloat(cs.paddingTop) + lineHeight * (n + 0.5) - ta.scrollTop,
      };
    },
    line,
  );
  await page.locator('#scratchText').click({ position: at });
}

test('Shift+S opens the scratchpad, which saves as you type and survives a reload', async (t) => {
  const app = await browser.open(t);
  const { page } = app;

  await page.keyboard.press('Shift+S');
  await page.locator('#scratchPanel').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.activeElement.id), 'scratchText', 'ready to type');
  assert.ok(await page.locator('#scratchBtn.active').isVisible(), 'the toolbar button lights up');

  await page.keyboard.type('Buy milk and eggs');
  assert.equal(await page.textContent('#scratchStatus'), 'Saving…');
  await noteSaved(page);
  assert.equal(await app.stored('homepage.scratch'), 'Buy milk and eggs');
  assert.equal(await page.textContent('#scratchCount'), '4 words');

  // Shift+S inside the note is just a capital S.
  await page.keyboard.press('Shift+S');
  assert.ok(await page.locator('#scratchPanel').isVisible());
  assert.equal(await page.inputValue('#scratchText'), 'Buy milk and eggsS');
  await noteSaved(page);

  await page.keyboard.press('Escape');
  await page.locator('#scratchPanel').waitFor({ state: 'hidden' });

  await app.reload();
  await page.click('#scratchBtn');
  await page.locator('#scratchPanel').waitFor({ state: 'visible' });
  assert.equal(await page.inputValue('#scratchText'), 'Buy milk and eggsS');
  assert.equal(await page.textContent('#scratchCount'), '4 words');

  await page.click('#scratchClose');
  await page.locator('#scratchPanel').waitFor({ state: 'hidden' });
});

test('checklist: the button starts an item and clicking its brackets ticks it', async (t) => {
  const app = await browser.open(t, { storage: { 'homepage.scratch': 'Groceries' } });
  const { page } = app;

  await page.keyboard.press('Shift+S');
  await page.locator('#scratchPanel').waitFor({ state: 'visible' });
  await page.keyboard.press('ControlOrMeta+End');
  await page.click('#scratchCheck');
  assert.equal(await page.inputValue('#scratchText'), 'Groceries\n- [ ] ', 'a new item starts on its own line');
  await page.keyboard.type('milk');

  await clickLineStart(page, 1);
  assert.equal(await page.inputValue('#scratchText'), 'Groceries\n- [x] milk');
  await noteSaved(page);
  assert.equal(await app.stored('homepage.scratch'), 'Groceries\n- [x] milk');

  await clickLineStart(page, 1);
  assert.equal(await page.inputValue('#scratchText'), 'Groceries\n- [ ] milk', 'and unticks it');

  // A click on an ordinary line only moves the cursor.
  await clickLineStart(page, 0);
  assert.equal(await page.inputValue('#scratchText'), 'Groceries\n- [ ] milk');
});

test('Clear asks before throwing a note away', async (t) => {
  const app = await browser.open(t, { storage: { 'homepage.scratch': 'keep me' } });
  const { page } = app;
  await page.click('#scratchBtn');
  await page.locator('#scratchPanel').waitFor({ state: 'visible' });

  app.expectDialog({ accept: false });
  await page.click('#scratchClear');
  assert.equal(await page.inputValue('#scratchText'), 'keep me');

  app.expectDialog({ accept: true });
  await page.click('#scratchClear');
  assert.equal(await page.inputValue('#scratchText'), '');
  assert.equal(await app.stored('homepage.scratch'), '');
  assert.equal(await page.textContent('#scratchCount'), '0 words');
});

test(
  'the last words typed are kept even if the tab closes straight away',
  async (t) => {
    const app = await browser.open(t);
    const { page } = app;
    await page.keyboard.press('Shift+S');
    await page.locator('#scratchPanel').waitFor({ state: 'visible' });
    await page.keyboard.type('remember this');
    await app.reload();
    assert.equal(await app.stored('homepage.scratch'), 'remember this');
  },
);

test(
  'an open sheet leaves the toolbar uncovered, so its lit button can close it again',
  async (t) => {
    const app = await browser.open(t);
    const { page } = app;
    await page.click('#scratchBtn');
    await page.waitForFunction(() => {
      const panel = document.getElementById('scratchPanel');
      return !panel.classList.contains('hidden') && !panel.classList.contains('entering');
    });
    const covered = await page.evaluate(() =>
      ['focusBtn', 'horizonBtn', 'scratchBtn', 'editBtn', 'settingsBtn', 'zenBtn'].filter((id) => {
        const r = document.getElementById(id).getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !hit || !hit.closest('#' + id);
      }),
    );
    assert.deepEqual(covered, [], 'toolbar buttons hidden under the open sheet');
  },
);
