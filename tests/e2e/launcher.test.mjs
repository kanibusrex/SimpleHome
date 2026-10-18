// The launcher: one search box that filters shortcuts, completes hosts, routes
// command prefixes, does arithmetic and falls back to a web search.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useBrowser } from '../helpers.mjs';

const browser = useBrowser();

const SHORTCUTS = [
  { name: 'GitHub', url: 'https://github.com' },
  { name: 'Gmail', url: 'https://mail.google.com' },
  { name: 'Hotmail', url: 'https://outlook.live.com' },
  { name: 'Mailchimp', url: 'https://mailchimp.com' },
  { name: 'Mail', url: 'https://mail.example.org' },
  { name: 'YouTube', url: 'https://youtube.com' },
];
const storage = { 'homepage.shortcuts': SHORTCUTS };

const GOOGLE = 'https://www.google.com/search?q=';
const DUCKDUCKGO = 'https://duckduckgo.com/?q=';

test('typing filters shortcuts by name and host, exact before prefix before substring', async (t) => {
  const app = await browser.open(t, { storage });

  await app.search('mail');
  assert.deepEqual(await app.results(), [
    { text: 'Mail', sub: '', kind: 'Shortcut', selected: true }, // exact name
    { text: 'Mailchimp', sub: '', kind: 'Shortcut', selected: false }, // name prefix
    { text: 'Gmail', sub: '', kind: 'Shortcut', selected: false }, // host prefix (mail.google.com)
    { text: 'Hotmail', sub: '', kind: 'Shortcut', selected: false }, // name substring
    { text: 'mail', sub: '', kind: 'Search', selected: false },
  ]);

  // Hosts match too: nothing is named "live", but outlook.live.com is.
  await app.search('live');
  assert.deepEqual(
    (await app.results()).map((r) => r.text),
    ['Hotmail', 'live'],
  );

  // The grid itself is never filtered.
  assert.equal((await app.tileLabels()).length, SHORTCUTS.length);

  // Clearing the box closes the results.
  await app.page.keyboard.press('Escape');
  assert.equal(await app.page.inputValue('#searchInput'), '');
  assert.ok(await app.page.locator('#results').isHidden());
});

test('arrow keys move through the results and Enter opens the selection in a new tab', async (t) => {
  const app = await browser.open(t, { storage });
  const { page } = app;
  const selected = async () => (await app.results()).findIndex((r) => r.selected);

  await app.search('mail');
  assert.equal(await selected(), 0);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  assert.equal(await selected(), 2);
  await page.keyboard.press('ArrowUp');
  assert.equal(await selected(), 1);
  // Up from the top wraps to the bottom (the web search row).
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  assert.equal(await selected(), 4);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  assert.equal(await selected(), 1, 'and down from the bottom wraps to the top');

  await page.keyboard.press('Enter');
  assert.deepEqual(await app.nextOpened(), { url: 'https://mailchimp.com', target: '_blank', features: 'noopener' });
  assert.equal(page.url().startsWith('file:'), true, 'the home page itself stays put');

  // Opening it is remembered for autocomplete.
  const visits = await app.stored('homepage.visits');
  assert.equal(visits.length, 1);
  assert.equal(visits[0].url, 'https://mailchimp.com');
  assert.equal(visits[0].count, 1);
});

test('with nothing matching, Enter runs a web search with the query encoded', async (t) => {
  const app = await browser.open(t, { storage });
  const { page } = app;

  await app.search('a&b #c');
  const rows = await app.results();
  assert.deepEqual(
    rows.map((r) => r.kind),
    ['Search'],
  );
  await page.keyboard.press('Enter');
  assert.equal((await app.nextOpened()).url, GOOGLE + 'a%26b%20%23c');

  // The engine is selectable and remembered.
  await page.selectOption('#engineSelect', DUCKDUCKGO);
  await app.reload();
  assert.equal(await page.inputValue('#engineSelect'), DUCKDUCKGO);
  await app.search('100% "real" ?x=1');
  await page.keyboard.press('Enter');
  assert.equal((await app.nextOpened()).url, DUCKDUCKGO + encodeURIComponent('100% "real" ?x=1'));
});

test('something that looks like an address gets an Open row', async (t) => {
  const app = await browser.open(t, { storage });
  await app.search('example.com/docs?a=1');
  const rows = await app.results();
  assert.deepEqual(
    rows.map((r) => [r.kind, r.text]),
    [
      ['Open', 'example.com/docs?a=1'],
      ['Search', 'example.com/docs?a=1'],
    ],
  );
  await app.page.keyboard.press('Enter');
  assert.equal((await app.nextOpened()).url, 'https://example.com/docs?a=1');
});

test('command prefixes send the query to that site', async (t) => {
  const app = await browser.open(t, { storage });
  const { page } = app;
  const cases = [
    ['gh react', 'https://github.com/search?q=react', 'on GitHub'],
    ['y live sets', 'https://www.youtube.com/results?search_query=live%20sets', 'on YouTube'],
    ['w New York', 'https://en.wikipedia.org/w/index.php?search=New%20York', 'on Wikipedia'],
    ['GH Hooks', 'https://github.com/search?q=Hooks', 'on GitHub'],
  ];
  for (const [query, url, sub] of cases) {
    const before = (await app.opened()).length;
    await app.search(query);
    const [first] = await app.results();
    assert.equal(first.kind, 'Go', query);
    assert.equal(first.sub, sub, query);
    await page.keyboard.press('Enter');
    assert.equal((await app.nextOpened(before)).url, url, query);
  }

  // An unknown prefix is just a search.
  await app.search('zz react');
  assert.deepEqual(
    (await app.results()).map((r) => r.kind),
    ['Search'],
  );
});

test('a partial prefix suggests the matching commands', async (t) => {
  const app = await browser.open(t, { storage });
  const { page } = app;
  await app.search('m');
  const hints = (await app.results()).filter((r) => r.kind === 'Command').map((r) => r.text);
  assert.deepEqual(hints, ['Search Maps', 'Search MDN']);

  // Picking one fills in the prefix, ready for the term.
  await page.locator('#results .result', { hasText: 'Search MDN' }).click();
  assert.equal(await page.inputValue('#searchInput'), 'mdn ');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'searchInput');
});

test('inline completion finishes a known host; Enter goes there', async (t) => {
  const app = await browser.open(t, { storage });
  const { page } = app;

  await app.typeInSearch('gith');
  const state = await page.$eval('#searchInput', (el) => [
    el.value,
    el.value.slice(el.selectionStart, el.selectionEnd),
  ]);
  assert.deepEqual(state, ['github.com', 'ub.com'], 'the rest of the host is filled in and selected');

  // Typing on replaces the suggestion rather than appending to it.
  await page.keyboard.type('x');
  assert.equal(await page.inputValue('#searchInput'), 'githx');

  await app.typeInSearch('gith');
  await page.keyboard.press('Enter');
  assert.equal((await app.nextOpened()).url, 'https://github.com');
});

test('the calculator answers arithmetic and unit conversions inline', async (t) => {
  const app = await browser.open(t, { storage });
  const cases = [
    ['2+3*4', '14'],
    ['(18 + 4) * 2', '44'],
    ['20% of 85', '17'],
    ['9^2 - 1', '80'],
    ['2^3^2', '512'],
    ['-3 + 1', '-2'],
    ['1/4', '0.25'],
    ['7 % 3', '1'],
    ['0.1 + 0.2', '0.3'],
    ['10 km to mi', '6.21 mi'],
    ['5 kg in lbs', '11.02 lb'],
    ['100 f to c', '37.78 c'],
    ['1 cup to ml', '236.59 ml'],
  ];
  for (const [query, answer] of cases) {
    await app.search(query);
    const [first] = await app.results();
    assert.deepEqual([first.kind, first.text, first.sub], ['Copy', answer, query], query);
  }
});

test('Enter on a result copies it to the clipboard instead of navigating', async (t) => {
  const app = await browser.open(t, { storage });
  const { page } = app;
  await app.context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await app.search('2+3*4');
  await page.keyboard.press('Enter');
  await page.locator('#toast.show').waitFor();
  assert.equal(await page.textContent('#toastMsg'), 'Copied 14');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '14');
  assert.deepEqual(await app.opened(), [], 'nothing was opened');
});

test('phone numbers, dates and bare numbers are not treated as maths', async (t) => {
  const app = await browser.open(t, { storage });
  for (const query of ['555-1234', '2026-08-08', '1-800-555-0199', '42', '1/0', '10 km to kg']) {
    await app.search(query);
    const kinds = (await app.results()).map((r) => r.kind);
    assert.ok(!kinds.includes('Copy'), `${query} was treated as maths: ${kinds}`);
    assert.equal(kinds[kinds.length - 1], 'Search', query);
  }
});
