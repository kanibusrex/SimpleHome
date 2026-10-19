// Horizon, the ambient view: what it picks for the line, how it ranks and
// quietens signals, and the keys that drive it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useBrowser } from '../helpers.mjs';

const browser = useBrowser();

const isOpen = (page) => page.evaluate(() => document.body.classList.contains('horizon-open'));
const line = (page) => page.locator('#horizonView #hzMsg').textContent();
const tier = (page) => page.locator('#horizonView #hz').getAttribute('data-tier');

// 14:32 UTC on a Monday afternoon.
async function openAt(t, storage, when = '2026-10-19T14:32:00Z') {
  const app = await browser.open(t, { goto: false, storage, context: { timezoneId: 'UTC' } });
  await app.page.clock.setFixedTime(new Date(when));
  await app.load();
  return app;
}

test('H opens Horizon on the most pressing thing in the scratchpad; Esc goes home', async (t) => {
  const app = await openAt(t, {
    'homepage.scratch': '- [ ] buy 3 eggs\n- [ ] 4pm design review\n- [ ] 14:40 Call the dentist\n- [x] 9:00 gym',
  });
  const { page } = app;

  // Before it opens, the toolbar button already carries the line.
  assert.equal(await page.getAttribute('#horizonBtn', 'data-tier'), 'flare');
  assert.match(await page.getAttribute('#horizonBtn', 'data-tip'), /^Call the dentist in 8 minutes\. · H$/);

  await page.keyboard.press('h');
  await page.waitForFunction(() => document.body.classList.contains('horizon-open'));
  assert.equal(await page.getAttribute('#horizonView', 'aria-hidden'), 'false');
  assert.equal(await line(page), 'Call the dentist in 8 minutes.');
  assert.equal(await tier(page), 'flare');

  // Ahead lists what's coming, in time order; "3 eggs" is not a time.
  await page.keyboard.press('ArrowUp');
  const ahead = await page.locator('#horizonView #hzAhead .item').allTextContents();
  assert.deepEqual(ahead, ['2:40 PMCall the dentist', '4:00 PMdesign review', 'openbuy 3 eggs']);
  // Settled holds what's checked off.
  await page.keyboard.press('ArrowDown');
  const settled = await page.locator('#horizonView #hzSettled .item').allTextContents();
  assert.deepEqual(settled, ['9:00 AMgym', '✓Nothing overdue']);

  // The page's own shortcuts are off while Horizon has the keyboard.
  await page.keyboard.press('z');
  assert.equal(await page.evaluate(() => document.body.classList.contains('zen')), false);
  await page.keyboard.press('f');
  assert.equal(await page.evaluate(() => document.body.classList.contains('focus-open')), false);

  await page.keyboard.press('Escape'); // closes the list first
  assert.equal(await isOpen(page), true);
  await page.keyboard.press('Escape');
  assert.equal(await isOpen(page), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'horizonBtn');

  // H typed into search is just an h.
  await page.focus('#searchInput');
  await page.keyboard.type('h');
  assert.equal(await isOpen(page), false);
});

test('with nothing to say, the line stays quiet', async (t) => {
  const app = await openAt(t, {});
  const { page } = app;
  await page.click('#horizonBtn');
  await page.waitForFunction(() => document.body.classList.contains('horizon-open'));
  assert.equal(await line(page), 'All clear.');
  assert.equal(await tier(page), 'quiet');
  assert.ok(await page.locator('#horizonView #hzDismiss').isHidden(), 'nothing to dismiss');
  await page.click('#horizonView #hzBack');
  assert.equal(await isOpen(page), false);
});

test('"Not now" snoozes the line and learns to quieten that kind of signal', async (t) => {
  const app = await openAt(t, { 'homepage.scratch': '- [ ] reply to Sam\n- [ ] book flights' });
  const { page } = app;
  await page.keyboard.press('h');
  await page.waitForFunction(() => document.body.classList.contains('horizon-open'));
  assert.equal(await line(page), '2 things open. Next: reply to Sam.');
  assert.equal(await tier(page), 'ember');

  await page.keyboard.press('d');
  await page.waitForFunction(() => document.querySelector('#horizonView').shadowRoot.querySelector('#hzMsg').textContent === 'All clear.');
  assert.deepEqual(await app.stored('homepage.horizon.learned'), { open: 1 });

  await page.keyboard.press('ArrowDown');
  const note = page.locator('#horizonView .learned');
  assert.match(await note.textContent(), /Quieter about open items \(1× not now\)/);
  await page.click('#horizonView .learned .link');
  assert.deepEqual(await app.stored('homepage.horizon.learned'), {});
  assert.equal(await page.locator('#horizonView .learned').count(), 0);
});

test('an unbroken focus streak is flagged in the evening, before it lapses', async (t) => {
  const day = (n) => ({ id: 's' + n, start: Date.parse('2026-10-19T10:00:00Z') - n * 864e5, planned: 25, mins: 25, place: 'rain', note: '', done: true });
  const app = await openAt(t, { 'homepage.focus.sessions': [day(1), day(2), day(3)] }, '2026-10-19T21:30:00Z');
  const { page } = app;
  await page.keyboard.press('h');
  await page.waitForFunction(() => document.body.classList.contains('horizon-open'));
  assert.equal(await line(page), 'Your 3-day focus streak ends at midnight.');
  assert.equal(await tier(page), 'steady');
});
