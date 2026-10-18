// The page as a whole: it loads cleanly, the clock tells the right time, and
// it reaches no further onto the network than the README says it does.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useBrowser, DEFAULT_SHORTCUTS } from '../helpers.mjs';

const browser = useBrowser();

test('loads with zero errors and the default home screen', async (t) => {
  const app = await browser.open(t);
  const { page } = app;

  assert.equal(await page.title(), 'Home');
  assert.equal(await page.getAttribute('html', 'data-theme'), 'ember');
  assert.deepEqual(await app.tileLabels(), DEFAULT_SHORTCUTS);
  assert.ok(await page.locator('#shortcutsGrid .add-tile').isVisible(), 'the + tile is there');
  assert.ok(await page.locator('#searchInput').isVisible());
  assert.ok(await page.locator('#results').isHidden(), 'no results until you type');
  assert.ok(await page.locator('#settingsPanel').isHidden());
  assert.ok(await page.locator('#scratchPanel').isHidden());
  assert.ok(await page.locator('#modalOverlay').isHidden());
  assert.equal(await page.getAttribute('#focusView', 'aria-hidden'), 'true');

  // Everything the page keeps lives under the documented homepage.* prefix.
  const keys = Object.keys(await app.storage());
  assert.ok(keys.length > 0 && keys.every((k) => k.startsWith('homepage.')), `unexpected keys: ${keys}`);
});

test('the clock shows the current local time and keeps ticking', async (t) => {
  const timeZone = 'America/New_York';
  const app = await browser.open(t, { context: { timezoneId: timeZone } });
  const { page } = app;

  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true });
  const expectedAt = (date) => {
    const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
    return `${parts.hour}:${parts.minute} ${parts.dayPeriod}`;
  };

  const before = new Date();
  const shown = await page.evaluate(() => {
    const text = (id) => document.getElementById(id).textContent;
    return `${text('clockH')}:${text('clockM')} ${text('clockMer')}`;
  });
  const after = new Date();
  assert.ok(
    [expectedAt(before), expectedAt(after)].includes(shown),
    `clock reads ${shown}, expected ${expectedAt(before)}`,
  );

  // Live: the seconds change without anyone touching the page.
  const secs = await page.textContent('#clockS');
  await page.waitForFunction((s) => document.getElementById('clockS').textContent !== s, secs, { timeout: 3000 });
});

test('the clock, greeting and date strip agree with a fixed moment', async (t) => {
  // 13:05:09 UTC is 2:05:09 PM in London in summer (BST, UTC+1).
  const app = await browser.open(t, { goto: false, context: { timezoneId: 'Europe/London' } });
  await app.page.clock.setFixedTime(new Date('2026-08-08T13:05:09Z'));
  await app.load();
  const { page } = app;

  const read = (id) => page.textContent('#' + id);
  assert.equal(await read('clockH'), '2');
  assert.equal(await read('clockM'), '05');
  assert.equal(await read('clockS'), '09');
  assert.equal(await read('clockMer'), 'PM');
  assert.equal(await page.textContent('.clock-ghost'), '8:88', 'single-digit hour shows the 8:88 ghost');
  assert.equal(await read('greeting'), 'Good afternoon');
  assert.equal(await read('date'), 'Saturday, August 8');
  assert.equal(await read('metaIso'), '2026-08-08');
  assert.equal(await read('metaWeek'), '32');
  assert.equal(await read('metaDoy'), '220');
  assert.equal(await read('metaTz'), 'UTC+01:00');
});

test('midnight reads 12 AM with a two-digit ghost, and the night greeting', async (t) => {
  // 15:07:03 UTC on 31 Dec is 00:07:03 on 1 Jan in Tokyo (UTC+9).
  const app = await browser.open(t, { goto: false, context: { timezoneId: 'Asia/Tokyo' } });
  await app.page.clock.setFixedTime(new Date('2025-12-31T15:07:03Z'));
  await app.load();
  const { page } = app;

  assert.equal(await page.textContent('#clockH'), '12');
  assert.equal(await page.textContent('#clockM'), '07');
  assert.equal(await page.textContent('#clockMer'), 'AM');
  assert.equal(await page.textContent('.clock-ghost'), '88:88');
  assert.equal(await page.textContent('#greeting'), 'Good night');
  assert.equal(await page.textContent('#metaIso'), '2026-01-01');
  assert.equal(await page.textContent('#metaWeek'), '01');
  assert.equal(await page.textContent('#metaDoy'), '1');
  assert.equal(await page.textContent('#metaTz'), 'UTC+09:00');
});

test('/ jumps to search from anywhere on the page', async (t) => {
  const app = await browser.open(t);
  await app.page.keyboard.press('/');
  assert.equal(await app.page.evaluate(() => document.activeElement.id), 'searchInput');
});

test(
  'the favicon service is the only third-party request, as the README promises',
  {
    todo:
      'index.html also loads Google Fonts (fonts.googleapis.com, then fonts.gstatic.com), so every page ' +
      'load sends the visitor\'s IP to Google even with the favicon line removed - contradicting "no tracking" ' +
      'and the README\'s "makes no third-party request at all"',
  },
  async (t) => {
    const app = await browser.open(t, { goto: false });
    const requested = [];
    app.page.on('request', (req) => {
      if (!req.url().startsWith('file:') && !req.url().startsWith('data:')) requested.push(req.url());
    });
    await app.load();

    const offenders = requested.filter((url) => !url.startsWith('https://www.google.com/s2/favicons?'));
    assert.deepEqual(offenders, []);
  },
);
