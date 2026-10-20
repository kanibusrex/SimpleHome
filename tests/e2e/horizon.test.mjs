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
  assert.deepEqual(ahead, ['2:40 PMCall the dentist', '4:00 PMdesign review', 'todaybuy 3 eggs']);
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
  assert.ok(await page.locator('#horizonView #hzAct').isHidden(), 'or to do');
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
  assert.deepEqual(await app.stored('homepage.horizon.learned'), { dismissed: { open: 1 }, acted: {} });

  await page.keyboard.press('ArrowDown');
  const note = page.locator('#horizonView .learned');
  assert.match(await note.textContent(), /Quieter about open items \(1× not now\)/);
  await page.click('#horizonView .learned .link');
  assert.deepEqual(await app.stored('homepage.horizon.learned'), { dismissed: {}, acted: {} });
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

test('items can carry a day, a repeat and a time to leave', async (t) => {
  // Monday 19 October 2026, 2:32 PM.
  const app = await openAt(t, {
    'homepage.scratch': [
      '- [ ] tomorrow 9am standup',
      '- [ ] fri pay rent',
      '- [ ] oct 30 dentist',
      '- [ ] 10/28 2:30pm flu shot',
      '- [ ] sun cream',
      '- [ ] weekdays 5pm gym',
      '- [ ] saturdays farmers market',
      '- [ ] 3pm call Sam ~20m',
      '- [ ] oct 17 renew passport',
    ].join('\n'),
  });
  const { page } = app;
  await page.keyboard.press('h');
  await page.waitForFunction(() => document.body.classList.contains('horizon-open'));
  // 3 PM less 20 minutes to get there is 2:40: eight minutes to leave.
  assert.equal(await line(page), 'call Sam at 3:00 PM — leave in 8 minutes.');
  assert.equal(await tier(page), 'flare');

  await page.keyboard.press('ArrowUp');
  const ahead = await page.locator('#horizonView #hzAhead .item').allTextContents();
  assert.deepEqual(ahead, [
    'Satrenew passport', // missed: Saturday's, still unchecked
    '3:00 PMcall Sam · leave 2:40 PM',
    '5:00 PMgym · weekdays',
    'todaysun cream', // "sun" on its own is a word, not Sunday
    'Tomorrow 9:00 AMstandup',
    'Fripay rent',
    'Satfarmers market · Sats',
    'Oct 28 2:30 PMflu shot',
    'Oct 30dentist',
  ]);
});

test('Enter does what the line asks: checking an item off in the scratchpad', async (t) => {
  const app = await openAt(t, { 'homepage.scratch': '- [ ] 14:40 Call the dentist\n- [ ] book flights' });
  const { page } = app;
  await page.keyboard.press('h');
  await page.waitForFunction(() => document.body.classList.contains('horizon-open'));
  assert.equal(await page.locator('#horizonView #hzAct').textContent(), 'Done');
  await page.waitForFunction(() => document.querySelector('#horizonView').shadowRoot.activeElement?.id === 'hzAct');

  await page.keyboard.press('Enter');
  assert.equal(await line(page), 'One thing open: book flights.');
  assert.equal(await page.locator('#horizonView #hzWhy').textContent(), 'Checked off: Call the dentist');
  assert.equal(await app.stored('homepage.scratch'), '- [x] 14:40 Call the dentist\n- [ ] book flights');
  assert.equal(await page.inputValue('#scratchText'), '- [x] 14:40 Call the dentist\n- [ ] book flights', 'the open scratchpad agrees');
  assert.deepEqual(await app.stored('homepage.horizon.learned'), { dismissed: {}, acted: { due: 1 } });

  await page.keyboard.press('ArrowDown');
  assert.match(await page.locator('#horizonView .learned').textContent(), /Louder about upcoming times \(1× done\)/);
});

test('on a streak line, Enter starts a focus session in Drift', async (t) => {
  const day = (n) => ({ id: 's' + n, start: Date.parse('2026-10-19T10:00:00Z') - n * 864e5, planned: 25, mins: 25, place: 'rain', note: '', done: true });
  const app = await openAt(t, { 'homepage.focus.sessions': [day(1)] }, '2026-10-19T21:30:00Z');
  const { page } = app;
  await page.keyboard.press('h');
  await page.waitForFunction(() => document.body.classList.contains('horizon-open'));
  assert.equal(await page.locator('#horizonView #hzAct').textContent(), 'Start focus');
  await page.locator('#horizonView #hzAct').click();
  await page.waitForFunction(() => document.body.classList.contains('focus-open'));
  assert.equal(await isOpen(page), false);
});

test('repeating items come back unchecked on a new day; one-offs stay done', async (t) => {
  const app = await openAt(t, {
    'homepage.horizon.day': '"2026-10-18"',
    'homepage.scratch': '- [x] daily 8am vitamins\n- [x] call mom',
  });
  assert.equal(await app.stored('homepage.scratch'), '- [ ] daily 8am vitamins\n- [x] call mom');
  assert.equal(await app.page.inputValue('#scratchText'), '- [ ] daily 8am vitamins\n- [x] call mom');
  assert.equal(await app.stored('homepage.horizon.day'), '2026-10-19');
});

test('alerts: one browser notification per stage, only while the tab is away', async (t) => {
  const app = await browser.open(t, {
    goto: false,
    storage: { 'homepage.scratch': '- [ ] 14:50 standup' },
    context: { timezoneId: 'UTC' },
    initScripts: [() => {
      window.__notes = [];
      window.__away = false;
      class FakeNotification {
        constructor(title, opts) { window.__notes.push({ title, ...opts }); }
        close() {}
        static requestPermission() { FakeNotification.permission = 'granted'; return Promise.resolve('granted'); }
      }
      FakeNotification.permission = 'default';
      window.Notification = FakeNotification;
      document.hasFocus = () => !window.__away;
    }],
  });
  const { page } = app;
  await page.clock.setFixedTime(new Date('2026-10-19T14:32:00Z'));
  await app.load();

  await page.keyboard.press('h');
  await page.waitForFunction(() => document.body.classList.contains('horizon-open'));
  await page.locator('#horizonView #hzNotify').click();
  await page.waitForFunction(() => document.querySelector('#horizonView').shadowRoot.querySelector('#hzNotify').getAttribute('aria-pressed') === 'true');
  assert.equal(await app.stored('homepage.horizon.notify'), true);
  await page.keyboard.press('Escape');

  // 18 minutes out is only steady: no alert. 14 minutes out flares.
  const poke = () => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.evaluate(() => { window.__away = true; });
  await poke();
  assert.deepEqual(await page.evaluate(() => window.__notes), []);
  await page.clock.setFixedTime(new Date('2026-10-19T14:36:00Z'));
  await poke();
  await poke();
  const notes = await page.evaluate(() => window.__notes);
  assert.equal(notes.length, 1, 'once, not on every tick');
  assert.equal(notes[0].title, 'Horizon');
  assert.equal(notes[0].body, 'standup in 14 minutes.');

  // In front of you, the line is enough: the next stage is marked but not sent.
  await page.evaluate(() => { window.__away = false; });
  await page.clock.setFixedTime(new Date('2026-10-19T14:51:00Z'));
  await poke();
  assert.equal((await page.evaluate(() => window.__notes)).length, 1);
});

test('a scratchpad edit from another tab reaches Horizon and is not written back over', async (t) => {
  const app = await openAt(t, { 'homepage.scratch': '- [ ] book flights' });
  const { page } = app;
  // what another tab's save looks like from here
  await page.evaluate(() => {
    const v = '- [ ] book flights\n- [ ] 14:40 Call the dentist';
    localStorage.setItem('homepage.scratch', v);
    window.dispatchEvent(new StorageEvent('storage', { key: 'homepage.scratch', newValue: v }));
  });
  assert.equal(await page.inputValue('#scratchText'), '- [ ] book flights\n- [ ] 14:40 Call the dentist');
  await page.keyboard.press('h');
  await page.waitForFunction(() => document.body.classList.contains('horizon-open'));
  assert.equal(await line(page), 'Call the dentist in 8 minutes.');
  await page.keyboard.press('Enter');
  assert.equal(await app.stored('homepage.scratch'), '- [ ] book flights\n- [x] 14:40 Call the dentist');
});
