// Settings -> Backup: export everything to a JSON file and read it back into
// another browser. Uses the real download and the real file chooser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { useBrowser, DEFAULT_SHORTCUTS } from '../helpers.mjs';

const browser = useBrowser();

const DUCKDUCKGO = 'https://duckduckgo.com/?q=';

const PROFILE = {
  'homepage.shortcuts': [
    { name: 'Docs', url: 'https://docs.google.com', group: 'Work' },
    { name: 'Hacker News', url: 'https://news.ycombinator.com', group: '' },
    { name: 'Figma', url: 'https://figma.com', group: 'Work' },
  ],
  'homepage.groups': ['Work'],
  'homepage.theme': 'synthwave',
  'homepage.themeColors': { synthwave: { accent: '#00ffaa' } },
  'homepage.engine': DUCKDUCKGO,
  'homepage.scratch': '- [ ] ship the backup tests\nremember the milk',
  'homepage.visits': [
    {
      key: 'news.ycombinator.com',
      url: 'https://news.ycombinator.com',
      host: 'news.ycombinator.com',
      label: 'Hacker News',
      count: 3,
      last: 1760000000000,
    },
  ],
};

async function exportBackup(app) {
  await app.openSettings();
  const [download] = await Promise.all([app.page.waitForEvent('download'), app.activate('#exportBtn')]);
  const file = await download.path();
  return { download, file, data: JSON.parse(await readFile(file, 'utf8')) };
}

async function importBackup(app, files) {
  await app.openSettings();
  const [chooser] = await Promise.all([app.page.waitForEvent('filechooser'), app.activate('#importBtn')]);
  await chooser.setFiles(files);
}

const importedStatus = (page) =>
  page.waitForFunction(
    () =>
      document.getElementById('backupStatus').textContent !== '' &&
      /imported|couldn't be read/.test(document.getElementById('backupStatus').textContent),
  );

test('export writes a JSON backup with the documented keys', async (t) => {
  const app = await browser.open(t, { storage: PROFILE });
  const { download, data } = await exportBackup(app);

  assert.equal(download.suggestedFilename(), 'homepage-settings.json');
  assert.deepEqual(Object.keys(data).sort(), [
    'colors',
    'engine',
    'exportedAt',
    'focus',
    'groups',
    'scratch',
    'shortcuts',
    'theme',
    'version',
    'visits',
  ]);
  assert.equal(data.version, 1);
  assert.ok(!Number.isNaN(Date.parse(data.exportedAt)), 'exportedAt is a timestamp');
  assert.deepEqual(data.shortcuts, PROFILE['homepage.shortcuts']);
  assert.deepEqual(data.groups, ['Work']);
  assert.equal(data.theme, 'synthwave');
  assert.deepEqual(data.colors, PROFILE['homepage.themeColors']);
  assert.equal(data.engine, DUCKDUCKGO);
  assert.equal(data.scratch, PROFILE['homepage.scratch']);
  assert.deepEqual(data.visits, PROFILE['homepage.visits']);
  // Focus sessions and sound settings ride along.
  assert.equal(typeof data.focus, 'object');
  assert.ok(Array.isArray(data.focus.sessions));
  for (const key of ['levels', 'planned', 'place', 'master', 'bell', 'breaks'])
    assert.ok(key in data.focus, `focus.${key}`);

  assert.equal(await app.page.textContent('#backupStatus'), 'Exported homepage-settings.json');
});

test('importing that file into a fresh profile restores shortcuts, groups, theme, notes and more', async (t) => {
  const source = await browser.open(t, { storage: PROFILE });
  const { file } = await exportBackup(source);

  const app = await browser.open(t);
  const { page } = app;
  assert.deepEqual(await app.tileLabels(), DEFAULT_SHORTCUTS);

  app.expectDialog({ accept: true });
  await importBackup(app, file);
  await importedStatus(page);
  assert.equal(app.dialogs.at(-1).message, 'Replace your 4 shortcuts with 3 from this file?');
  assert.equal(await page.textContent('#backupStatus'), 'Settings imported.');

  const check = async () => {
    assert.deepEqual(await app.tileLabels(), ['Docs', 'Hacker News', 'Figma']);
    assert.equal(await page.getAttribute('html', 'data-theme'), 'synthwave');
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()),
      '#00ffaa',
    );
    assert.equal(await page.inputValue('#scratchText'), PROFILE['homepage.scratch']);
    assert.equal(await page.inputValue('#engineSelect'), DUCKDUCKGO);
    assert.equal(await page.textContent('#historyStatus'), '1 site remembered.');
    assert.deepEqual(
      await page.$$eval('#groupTabs .group-tab:not(.group-tab-add)', (tabs) =>
        tabs.map((tab) => tab.firstChild.textContent),
      ),
      ['All', 'Work'],
    );
  };
  await check();
  await app.reload();
  await check();
});

test('a file that is not a backup is refused and changes nothing', async (t) => {
  const app = await browser.open(t, { storage: PROFILE });
  const before = await app.storage();
  await importBackup(app, {
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ this is not json'),
  });
  await importedStatus(app.page);
  assert.equal(
    await app.page.textContent('#backupStatus'),
    "That file couldn't be read. Pick a homepage settings JSON file.",
  );
  assert.deepEqual(await app.storage(), before);
});

test(
  'declining the "replace your shortcuts?" question leaves everything as it was',
  async (t) => {
    const source = await browser.open(t, { storage: PROFILE });
    const { file } = await exportBackup(source);

    const mine = {
      'homepage.shortcuts': [{ name: 'Bank', url: 'https://bank.example', group: 'Home' }],
      'homepage.groups': ['Home'],
      'homepage.activeGroup': 'Home',
    };
    const app = await browser.open(t, { storage: mine });
    const before = await app.storage();
    app.expectDialog({ accept: false });
    await importBackup(app, file);
    await app.page.waitForFunction(() => document.getElementById('importFile').value === '');
    assert.equal(app.dialogs.length, 1);
    assert.deepEqual(await app.storage(), before);
  },
);

test(
  'imported shortcuts are limited to web addresses, as the Add dialog is',
  async (t) => {
    const app = await browser.open(t);
    const crafted = {
      version: 1,
      shortcuts: [
        { name: 'Bank', url: 'javascript:alert(localStorage.length)' },
        { name: 'Mail', url: 'data:text/html,<script>alert(1)</script>' },
        { name: 'Real', url: 'https://example.com' },
      ],
    };
    app.expectDialog({ accept: true });
    await importBackup(app, {
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(crafted)),
    });
    await importedStatus(app.page);
    const hrefs = await app.page.$$eval('#shortcutsGrid a.tile', (links) => links.map((a) => a.getAttribute('href')));
    const unsafe = hrefs.filter((href) => !/^https?:\/\//i.test(href));
    assert.deepEqual(unsafe, []);
  },
);
