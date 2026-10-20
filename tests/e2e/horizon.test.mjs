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

// ---- Claude ----
// The API is answered by the test: page routes win over the harness's
// network block, so nothing here leaves the machine.

const AI = { key: 'sk-ant-test-0000-1234', model: 'claude-opus-5-5', decide: true, parse: true };
const shadowText = (page, sel, text) =>
  page.waitForFunction(([s, t]) => document.querySelector('#horizonView').shadowRoot.querySelector(s).textContent === t, [sel, text]);

async function mockClaude(page, answer) {
  const calls = [];
  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    const req = route.request();
    const body = JSON.parse(req.postData());
    calls.push({ headers: req.headers(), body });
    const out = await answer(body, calls.length);
    if (out.status) return route.fulfill({ status: out.status, contentType: 'application/json', body: JSON.stringify({ type: 'error', error: { message: 'nope' } }) });
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        stop_reason: 'end_turn',
        content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(out) }],
      }),
    });
  });
  return calls;
}

test('Claude can choose and word the line; the rules keep the countdown, the button and the alerts', async (t) => {
  const app = await openAt(t, {
    'homepage.horizon.ai': AI,
    'homepage.scratch': '- [ ] 14:40 water the plants\n- [ ] 15:00 flight to Denver ~20m',
  });
  const { page } = app;
  const calls = await mockClaude(page, () => ({
    pick: 'item:15:00 flight to Denver ~20m',
    line: 'Leave for your Denver flight in {countdown}.',
    why: 'a flight won’t wait',
    urgency: 0.97,
  }));

  await page.keyboard.press('h');
  await shadowText(page, '#hzMsg', 'Leave for your Denver flight in 8 minutes.');
  assert.equal(await page.locator('#horizonView #hzWhy').textContent(), 'a flight won’t wait · Claude');
  assert.equal(await tier(page), 'flare');
  // the toolbar, the tone and the alerts stay on the rules' own pick
  assert.match(await page.getAttribute('#horizonBtn', 'data-tip'), /^water the plants in 8 minutes\./);

  assert.equal(calls.length, 1);
  const { headers, body } = calls[0];
  assert.equal(headers['x-api-key'], AI.key);
  assert.equal(headers['anthropic-version'], '2023-06-01');
  assert.equal(headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  assert.equal(body.model, 'claude-opus-5-5');
  assert.equal(body.fallbacks, 'default');
  assert.equal(body.output_config.effort, 'low');
  assert.equal(body.output_config.format.type, 'json_schema');
  // something flares, so "none" is not on offer
  assert.deepEqual(body.output_config.format.schema.properties.pick.enum, ['item:14:40 water the plants', 'item:15:00 flight to Denver ~20m']);
  const sent = JSON.parse(body.messages[0].content);
  assert.equal(sent.candidates[1].countdown, '8 minutes');

  // The button belongs to Claude's pick.
  await page.keyboard.press('Enter');
  assert.equal(await app.stored('homepage.scratch'), '- [ ] 14:40 water the plants\n- [x] 15:00 flight to Denver ~20m');

  // Nothing changed for the candidates after that answer... until the check-off: one new call.
  await page.waitForTimeout(1500);
  assert.equal(calls.length, 2, 'asks again once the candidates change, not every tick');
});

test('Claude may call it quiet only while nothing is steady or flaring', async (t) => {
  const app = await openAt(t, { 'homepage.horizon.ai': AI, 'homepage.scratch': '- [ ] buy milk' });
  const { page } = app;
  const calls = await mockClaude(page, () => ({ pick: 'none', line: 'Nothing pressing. Enjoy the afternoon.', why: 'just milk, later', urgency: 0.1 }));
  await page.keyboard.press('h');
  await shadowText(page, '#hzMsg', 'Nothing pressing. Enjoy the afternoon.');
  assert.ok(calls[0].body.output_config.format.schema.properties.pick.enum.includes('none'));
  assert.equal(await tier(page), 'quiet');
  assert.ok(await page.locator('#horizonView #hzAct').isHidden());
});

test('when Claude can\'t be reached the rules carry on, and the sheet says why', async (t) => {
  const app = await openAt(t, { 'homepage.horizon.ai': AI, 'homepage.scratch': '- [ ] 14:40 Call the dentist' });
  const { page } = app;
  const calls = await mockClaude(page, () => ({ status: 401 }));
  await page.keyboard.press('h');
  await shadowText(page, '#hzAiStatus', 'Anthropic rejected the API key. Check it and save it again.');
  assert.equal(await line(page), 'Call the dentist in 8 minutes.');
  await page.waitForTimeout(1500);
  assert.equal(calls.length, 1, 'no retry on every tick');

  await page.locator('#horizonView #hzAiBtn').click();
  assert.ok(await page.locator('#horizonView #hzAi').isVisible());
  assert.equal(await page.getAttribute('#horizonView #hzKey', 'placeholder'), 'Saved: ••••1234');
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('#horizonView #hzAi').isHidden(), 'Esc closes the sheet first');
  assert.equal(await isOpen(page), true);
  // The browser logs the fake 401 itself; that one line is this test's doing.
  app.errors = app.errors.filter((e) => !/status of 401 \(Unauthorized\) \(https:\/\/api\.anthropic\.com\//.test(e));
});

test('A adds an item: Claude reads a loose note into the scratchpad syntax', async (t) => {
  const app = await openAt(t, { 'homepage.horizon.ai': { ...AI, decide: false }, 'homepage.scratch': '- [ ] buy milk' });
  const { page } = app;
  const calls = await mockClaude(page, () => ({ lines: ['tomorrow 1pm call mom'] }));
  // A pressed straight after H: the opening focus mustn't pull the typing away
  await page.keyboard.press('h');
  await page.keyboard.press('a');
  await page.waitForTimeout(150);
  await page.keyboard.type('remind me to call mom tomorrow after lunch');
  await page.keyboard.press('Enter');
  await shadowText(page, '#hzWhy', 'Added: call mom — Tomorrow 1:00 PM');
  assert.equal(await app.stored('homepage.scratch'), '- [ ] buy milk\n- [ ] tomorrow 1pm call mom');
  assert.equal(calls.length, 1, 'only the note was sent: choosing the line is off');
  assert.match(calls[0].body.messages[0].content, /Note: remind me to call mom tomorrow after lunch$/);
  assert.ok(calls[0].body.output_config.format.schema.properties.lines);
  assert.ok(await page.locator('#horizonView #hzAdd').isHidden());
});

test('without a key, an added item goes in as written', async (t) => {
  const app = await openAt(t, {});
  const { page } = app;
  await page.keyboard.press('h');
  await page.waitForFunction(() => document.body.classList.contains('horizon-open'));
  await page.locator('#horizonView #hzAddBtn').click();
  await page.locator('#horizonView #hzAddText').fill('fri 3pm dentist ~20m');
  await page.keyboard.press('Enter');
  await shadowText(page, '#hzWhy', 'Added: dentist — Fri 3:00 PM');
  assert.equal(await app.stored('homepage.scratch'), '- [ ] fri 3pm dentist ~20m');
});

test('the API key is saved in this browser only, never in a backup', async (t) => {
  const app = await openAt(t, {});
  const { page } = app;
  await page.keyboard.press('h');
  await page.waitForFunction(() => document.body.classList.contains('horizon-open'));
  await page.locator('#horizonView #hzAiBtn').click();
  await page.locator('#horizonView #hzKey').fill('sk-ant-secret-9876');
  await page.locator('#horizonView #hzModel').selectOption('claude-haiku-5-5');
  assert.equal(await page.inputValue('#horizonView #hzKey'), 'sk-ant-secret-9876', 'a model change keeps the key being typed');
  await page.locator('#horizonView #hzKeySave').click();
  assert.equal(await page.inputValue('#horizonView #hzKey'), '');
  assert.equal(await page.getAttribute('#horizonView #hzKey', 'placeholder'), 'Saved: ••••9876');
  assert.deepEqual(await app.stored('homepage.horizon.ai'), { key: 'sk-ant-secret-9876', model: 'claude-haiku-5-5', decide: true, parse: true });
  const exported = await page.evaluate(() => JSON.stringify(window.SimpleHomeHorizon.exportData()));
  assert.ok(!exported.includes('sk-ant'), exported);
  assert.deepEqual(JSON.parse(exported).claude, { model: 'claude-haiku-5-5', decide: true, parse: true });
});

test('a 400 over server-side fallbacks is retried once without them', async (t) => {
  const app = await openAt(t, { 'homepage.horizon.ai': AI, 'homepage.scratch': '- [ ] 14:40 Call the dentist' });
  const { page } = app;
  const calls = await mockClaude(page, (body) => (body.fallbacks
    ? { status: 400 }
    : { pick: 'item:14:40 Call the dentist', line: 'Call the dentist in {countdown}.', why: 'it’s nearly time', urgency: 0.9 }));
  await page.keyboard.press('h');
  await shadowText(page, '#hzWhy', 'it’s nearly time · Claude');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].headers['anthropic-beta'], undefined);
  app.errors = app.errors.filter((e) => !/status of 400 \(Bad Request\) \(https:\/\/api\.anthropic\.com\//.test(e));
});

// ---- Calendar ----

const ICS = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN',
  'BEGIN:VEVENT', 'UID:review', 'SUMMARY:Design review', 'LOCATION:Room 4',
  'DTSTART:20261019T144000Z', 'DTEND:20261019T153000Z',
  'X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij',
  // a reminder's own fields mustn't leak into the event
  'BEGIN:VALARM', 'ACTION:DISPLAY', 'SUMMARY:Reminder', 'LOCATION:nowhere', 'TRIGGER:-PT10M', 'END:VALARM', 'END:VEVENT',
  // weekdays at 9 in New York (1 PM UTC in October); Wednesday's is off, Thursday's moved to 10
  'BEGIN:VEVENT', 'UID:standup', 'SUMMARY:Standup',
  'DTSTART;TZID=America/New_York:20260105T090000', 'DTEND;TZID=America/New_York:20260105T091500',
  'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'EXDATE;TZID=America/New_York:20261021T090000', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:standup', 'SUMMARY:Standup', 'RECURRENCE-ID;TZID=America/New_York:20261022T090000',
  'DTSTART;TZID=America/New_York:20261022T100000', 'DTEND;TZID=America/New_York:20261022T101500', 'END:VEVENT',
  // the fourth Saturday of each month
  'BEGIN:VEVENT', 'UID:books', 'SUMMARY:Book club', 'DTSTART:20260124T180000Z', 'DURATION:PT2H',
  'RRULE:FREQ=MONTHLY;BYDAY=4SA', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:bday', 'SUMMARY:Mom\'s birthday', 'DTSTART;VALUE=DATE:20261019', 'DTEND;VALUE=DATE:20261020', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:gone', 'SUMMARY:Cancelled sync', 'STATUS:CANCELLED', 'DTSTART:20261019T160000Z', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:old', 'SUMMARY:Old thing', 'DTSTART:20200101T100000Z', 'END:VEVENT',
  // floating time, folded across two lines, with an escaped comma
  'BEGIN:VEVENT', 'UID:dentist', 'SUMMARY:Dentist\\, Dr', ' . Lee', 'DTSTART:20261023T150000', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:hourly', 'SUMMARY:Ping', 'DTSTART:20261001T100000Z', 'RRULE:FREQ=HOURLY', 'END:VEVENT',
  'END:VCALENDAR', '',
].join('\r\n');

async function importIcs(page, name = 'work.ics', text = ICS) {
  await page.locator('#horizonView #hzCalBtn').click();
  await page.locator('#horizonView #hzCalFile').setInputFiles({ name, mimeType: 'text/calendar', buffer: Buffer.from(text) });
}

test('an imported calendar counts down on the line, fills Ahead and Settled, and offers Join', async (t) => {
  const app = await openAt(t, {});
  const { page } = app;
  await page.keyboard.press('h');
  await page.waitForFunction(() => document.body.classList.contains('horizon-open'));
  await importIcs(page);
  await shadowText(page, '#hzCalStatus',
    'work: 7 events, leaving out 1 that are over. 1 repeats in a way Horizon can\'t follow, so it shows only once.');
  assert.deepEqual(await page.locator('#horizonView .cal-row .name').allTextContents(), ['work']);
  await page.keyboard.press('Escape');

  assert.equal(await line(page), 'Design review in 8 minutes.');
  assert.equal(await page.locator('#horizonView #hzWhy').textContent(), 'at 2:40 PM · Room 4');
  assert.equal(await tier(page), 'flare');

  await page.keyboard.press('ArrowUp');
  assert.deepEqual(await page.locator('#horizonView #hzAhead .item').allTextContents(), [
    '2:40 PMDesign review · Room 4',
    'todayMom\'s birthday',
    'Tomorrow 1:00 PMStandup',
    'Thu 2:00 PMStandup', // moved an hour; Wednesday's is off
    'Fri 1:00 PMStandup',
    'Fri 3:00 PMDentist, Dr. Lee',
    'Sat 6:00 PMBook club',
    'Oct 26 1:00 PMStandup',
  ]);
  await page.keyboard.press('ArrowDown');
  assert.deepEqual(await page.locator('#horizonView #hzSettled .item').allTextContents(), ['1:00 PMStandup', '✓Nothing overdue']);
  await page.keyboard.press('Escape');

  // A meeting link becomes the button.
  assert.equal(await page.locator('#horizonView #hzAct').textContent(), 'Join');
  await page.locator('#horizonView #hzAct').click();
  assert.deepEqual(await app.nextOpened(), { url: 'https://meet.google.com/abc-defg-hij', target: '_blank', features: 'noopener' });

  // An event is never overdue: now, then under way, then settled.
  await page.clock.setFixedTime(new Date('2026-10-19T14:42:00Z'));
  await shadowText(page, '#hzMsg', 'Design review — now.');
  assert.equal(await page.locator('#horizonView #hzWhy').textContent(), '2:40 PM–3:30 PM · Room 4');
  await page.clock.setFixedTime(new Date('2026-10-19T14:50:00Z'));
  await shadowText(page, '#hzMsg', 'Design review until 3:30 PM.');
  await page.clock.setFixedTime(new Date('2026-10-19T15:31:00Z'));
  await shadowText(page, '#hzMsg', 'Today: Mom\'s birthday.');
});

test('calendars persist, re-importing a file replaces it, and they can be removed', async (t) => {
  const app = await openAt(t, {});
  const { page } = app;
  await page.keyboard.press('h');
  await page.waitForFunction(() => document.body.classList.contains('horizon-open'));
  await importIcs(page);
  await shadowText(page, '#hzCalStatus', 'work: 7 events, leaving out 1 that are over. 1 repeats in a way Horizon can\'t follow, so it shows only once.');
  await importIcs(page, 'work.ics', ICS.replace('Design review', 'Design crit'));
  await importIcs(page, 'notes.txt', 'just some notes');
  await shadowText(page, '#hzCalStatus', 'notes.txt isn\'t a calendar (.ics) file.');
  assert.deepEqual(await page.locator('#horizonView .cal-row .name').allTextContents(), ['work']);

  await app.reload();
  await page.keyboard.press('h');
  await shadowText(page, '#hzMsg', 'Design crit in 8 minutes.');
  await page.locator('#horizonView #hzCalBtn').click();
  await page.locator('#horizonView .cal-row .link').click();
  await shadowText(page, '#hzCalStatus', 'Removed work.');
  assert.deepEqual(await app.stored('homepage.horizon.calendars'), []);
  await page.keyboard.press('Escape');
  await shadowText(page, '#hzMsg', 'All clear.');
});

test('repeats keep their own time zone across daylight-saving changes on either side', async (t) => {
  // Berlin leaves summer time on 25 October, New York on 1 November: for that
  // week a 9 AM New York standup is at 2 PM in Berlin, then 3 PM again.
  const app = await browser.open(t, { goto: false, context: { timezoneId: 'Europe/Berlin' } });
  await app.page.clock.setFixedTime(new Date('2026-10-30T10:00:00Z')); // Friday, 11 AM in Berlin
  await app.load();
  const { page } = app;
  await page.keyboard.press('h');
  await page.waitForFunction(() => document.body.classList.contains('horizon-open'));
  await importIcs(page, 'team.ics', [
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:s', 'SUMMARY:Standup',
    'DTSTART;TZID=America/New_York:20260105T090000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:b', 'SUMMARY:Day off', 'DTSTART;VALUE=DATE:20261030', 'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n'));
  await shadowText(page, '#hzCalStatus', 'team: 2 events.');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowUp');
  assert.deepEqual(await page.locator('#horizonView #hzAhead .item').allTextContents(), [
    '2:00 PMStandup',
    'todayDay off',
    'Mon 3:00 PMStandup',
    'Tue 3:00 PMStandup',
    'Wed 3:00 PMStandup',
    'Thu 3:00 PMStandup',
    'Nov 6 3:00 PMStandup',
  ]);
});
